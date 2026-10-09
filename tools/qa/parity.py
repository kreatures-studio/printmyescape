"""Paridad navegador vs CLI: mismos datos, mismo motor, PDF comparado página a página.

Genera el PDF de cada ejemplo en el navegador (demo/index.html, Chromium, por el recorrido real
de la demo) y con la CLI
(tools/compose.js, Node), los rasteriza con pdftoppm y compara los píxeles de cada página.
Resultado: páginas idénticas, diferencia máxima, y diferencia de texto (pdftotext).

Uso (desde la raíz del repo):
  PME_DEMO=demo/index.html PME_OUT=salida-paridad python3 tools/qa/parity.py
"""
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
DEMO = os.path.abspath(os.environ.get('PME_DEMO', os.path.join(ROOT, 'demo', 'index.html')))
OUT = os.path.abspath(os.environ.get('PME_OUT', os.path.join(ROOT, 'salida-paridad')))
DPI = os.environ.get('PME_DPI', '60')
os.makedirs(OUT, exist_ok=True)

CASES = [('es', 1), ('es', 2), ('es', 3), ('en', 1), ('en', 2), ('en', 3)]


def photo_map(values_keys):
    """FOTO_<sufijo> -> assets/retratos/retrato-<sufijo>.jpg (mismo criterio que build-demo.py)."""
    out = {}
    for fid in ['FOTO_CUMPLE'] + ['FOTO_%d' % i for i in range(1, 9)]:
        suffix = fid[len('FOTO_'):]
        out[fid] = 'assets/retratos/retrato-%s.jpg' % suffix
    return out


def browser_pdfs(p):
    """Genera en el navegador y guarda los PDF (descarga real del botón)."""
    b = p.chromium.launch(args=['--no-sandbox'])
    res = {}
    for lang, n in CASES:
        # Contexto nuevo por caso: si no, el borrador guardado reabre la demo a mitad de formulario
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on('dialog', lambda d: d.accept())
        pg.goto('file://' + DEMO)
        pg.wait_for_timeout(500)
        pg.click('#langSwitch button[data-lang="%s"]' % lang)
        pg.wait_for_timeout(100)
        # Recorrido real: botón "Rellenar ejemplo n" -> bienvenida -> pasos -> revisión -> PDF
        pg.locator('.ex-card button').nth(n - 1).click()
        pg.wait_for_timeout(300)
        for _ in range(80):
            if pg.evaluate('() => view') == 'review':
                break
            pg.click('#dnext' if pg.is_visible('#dnext') else '#next')
            pg.wait_for_timeout(120)
        assert pg.evaluate('() => view') == 'review', 'no llega a la revisión (%s %d)' % (lang, n)
        # Valores que ve el motor en el navegador (mismos que la CLI)
        values = pg.evaluate('() => JSON.parse(JSON.stringify(answers))')
        pg.click('#dnext'); pg.wait_for_timeout(200)
        pg.click('#bGen')
        pg.wait_for_function("() => document.getElementById('dl').style.display === 'flex'", timeout=180000)
        with pg.expect_download(timeout=60000) as di:
            pg.click('#pdflink')
        path = os.path.join(OUT, 'nav-%s-%d.pdf' % (lang, n))
        di.value.save_as(path)
        res[(lang, n)] = (path, values)
        pg.close()
        ctx.close()
    b.close()
    return res


def cli_pdf(lang, n, values):
    vf = os.path.join(OUT, 'valores-%s-%d.json' % (lang, n))
    pf = os.path.join(OUT, 'fotos-%s-%d.json' % (lang, n))
    with open(vf, 'w', encoding='utf-8') as f:
        json.dump(values, f, ensure_ascii=False)
    with open(pf, 'w', encoding='utf-8') as f:
        json.dump(photo_map(values.keys()), f)
    out = os.path.join(OUT, 'cli-%s-%d.pdf' % (lang, n))
    subprocess.run(['node', os.path.join(ROOT, 'tools', 'compose.js'),
                    '--tpl', 'templates/final3', '--bg', 'Final3-Clean.pdf', '--lang', lang,
                    '--values-file', vf, '--photos-file', pf, '--out', os.path.relpath(out, ROOT)],
                   cwd=ROOT, check=True, capture_output=True)
    return out


def rasterize(pdf, prefix):
    subprocess.run(['pdftoppm', '-r', DPI, '-png', pdf, prefix], check=True)
    return sorted(f for f in os.listdir(os.path.dirname(prefix))
                  if f.startswith(os.path.basename(prefix) + '-') and f.endswith('.png'))


def compare(a_pdf, b_pdf, tag):
    pa = os.path.join(OUT, 'r-' + tag + '-a')
    pb = os.path.join(OUT, 'r-' + tag + '-b')
    fa = rasterize(a_pdf, pa)
    fb = rasterize(b_pdf, pb)
    if len(fa) != len(fb):
        return {'paginas': (len(fa), len(fb)), 'identicas': 0, 'total': max(len(fa), len(fb)), 'max_dif': 255}
    same, max_dif = 0, 0
    for x, y in zip(fa, fb):
        ia = Image.open(os.path.join(OUT, x)).convert('RGB')
        ib = Image.open(os.path.join(OUT, y)).convert('RGB')
        if ia.size != ib.size:
            max_dif = 255
            continue
        d = ImageChops.difference(ia, ib)
        m = max(v for band in d.getextrema() for v in band)
        max_dif = max(max_dif, m)
        if m == 0:
            same += 1
    for f in fa + fb:
        os.remove(os.path.join(OUT, f))
    return {'paginas': (len(fa), len(fb)), 'identicas': same, 'total': len(fa), 'max_dif': max_dif}


def text_of(pdf):
    return subprocess.run(['pdftotext', '-raw', pdf, '-'], capture_output=True, text=True).stdout


if __name__ == '__main__':
    rows = []
    with sync_playwright() as p:
        nav = browser_pdfs(p)
    for lang, n in CASES:
        bpath, values = nav[(lang, n)]
        cpath = cli_pdf(lang, n, values)
        r = compare(bpath, cpath, '%s%d' % (lang, n))
        same_text = text_of(bpath) == text_of(cpath)
        rows.append((lang, n, r, same_text))
        print('%s ejemplo %d: páginas navegador/CLI=%s · idénticas=%d/%d · diferencia máx=%d · texto igual=%s'
              % (lang.upper(), n, r['paginas'], r['identicas'], r['total'], r['max_dif'], same_text), flush=True)
    total_pag = sum(r['total'] for _, _, r, _ in rows)
    total_ok = sum(r['identicas'] for _, _, r, _ in rows)
    print('\nPARIDAD: %d/%d páginas idénticas (%d PDF)' % (total_ok, total_pag, len(rows)))
    with open(os.path.join(OUT, 'paridad.json'), 'w', encoding='utf-8') as f:
        json.dump([{'lang': l, 'ejemplo': n, **r, 'texto_igual': t} for l, n, r, t in rows], f, ensure_ascii=False, indent=1)
    sys.exit(0 if total_ok == total_pag else 1)
