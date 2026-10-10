"""Prueba de tipos (T1.3 de PLAN-CREADOR.md): la demo, construida desde un juego con un campo de
cada tipo (text, long, number, choice, multi con «Otro», photo), se rellena con el navegador
real, se traduce a mitad del recorrido y genera el PDF en los dos idiomas.

Uso (desde la raíz del repo):  python3 tools/qa/tipos-demo.py
Requiere pdftotext (poppler).
"""
import os, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAME = os.path.join(ROOT, 'tools', 'qa', 'fixtures', 'games', 'tipos')
OUT = os.path.join(ROOT, 'tools', 'qa', 'salida-tipos')
FIX = os.path.join(ROOT, 'tools', 'qa', 'fixtures')
DEMO = os.path.join(OUT, 'tipos.html')
RES = []


def rec(name, ok, detail=''):
    RES.append(ok)
    print(('OK    ' if ok else 'FALLO ') + name + ' | ' + str(detail)[:300], flush=True)


def build():
    os.makedirs(OUT, exist_ok=True)
    r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build-demo.py'),
                        '--game', GAME, '--out', DEMO], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit('build-demo falló: ' + r.stdout + r.stderr)


def fill_screen(pg, lang_vals):
    """Rellena los controles de la pantalla actual según su tipo."""
    fids = pg.evaluate("() => Array.from(document.querySelectorAll('#answer .field[data-field]')).map(w => w.getAttribute('data-field'))")
    for fid in fids:
        box = '#answer .field[data-field="%s"]' % fid
        if pg.locator(box + ' .photobox').count():
            pg.evaluate("(f) => { photoTarget = f; }", fid)
            pg.set_input_files('#filepick', os.path.join(FIX, 'retrato-1.jpg'))
            pg.wait_for_timeout(700)
        elif pg.locator(box + ' .pill[data-v]').count() and pg.locator(box + ' .otherWrap').count():
            # multi: primera opción + «Otro» con texto
            pg.locator(box + ' .pill[data-v]').nth(0).click()
            pg.locator(box + ' .pill:not([data-v])').click()
            pg.fill(box + ' [data-other="%s"]' % fid, lang_vals['OTRO'])
        elif pg.locator(box + ' .pill[data-v]').count():
            # choice: segunda opción
            pg.locator(box + ' .pill[data-v]').nth(1).click()
        elif fid not in lang_vals:
            # pantalla de bienvenida: la casilla «lo he entendido»
            if pg.locator('#answer .checkline').count() and not pg.is_checked('#answer .checkline input'):
                pg.click('#answer .checkline')
        elif pg.locator(box + ' [data-fid="%s"]' % fid).count():
            pg.fill(box + ' [data-fid="%s"]' % fid, lang_vals[fid])
        pg.wait_for_timeout(60)


def to_review(pg, lang_vals, limit=40):
    for _ in range(limit):
        if pg.evaluate("() => view") == 'review':
            return True
        fill_screen(pg, lang_vals)
        pg.click('#dnext' if pg.is_visible('#dnext') else '#next')
        pg.wait_for_timeout(150)
    return pg.evaluate("() => view") == 'review'


def pdf_text(path):
    return subprocess.run(['pdftotext', '-raw', path, '-'], capture_output=True, text=True).stdout


def main():
    build()
    es = {'NOMBRE': 'Ana', 'TEXTO': 'Hola', 'LARGO': 'Una frase', 'EDAD': '30', 'OTRO': 'Algo raro'}
    errs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        pg = ctx.new_page()
        pg.on('dialog', lambda d: d.accept())
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + DEMO)
        pg.wait_for_timeout(500)
        pg.click('#langSwitch button[data-lang="es"]')
        pg.wait_for_timeout(150)
        pg.click('.blank-card button')
        pg.wait_for_timeout(300)

        # 1) Recorrer todas las pantallas rellenando cada tipo, en español.
        rec('tipos: llega a la revisión (español)', to_review(pg, es))
        ans = pg.evaluate("() => JSON.parse(JSON.stringify(answers))")
        rec('tipos: text/long/number/choice/multi se guardan',
            ans.get('NOMBRE') == 'Ana' and ans.get('TEXTO') == 'Hola' and ans.get('LARGO') == 'Una frase'
            and ans.get('EDAD') == '30' and ans.get('ELECCION') == 'Opción B'
            and ans.get('VARIOS') == 'Opción A||Otro: Algo raro' and ans.get('OTRO') == 'Algo raro',
            {k: ans.get(k) for k in ['ELECCION', 'VARIOS', 'OTRO']})
        rec('tipos: la foto queda cargada', pg.evaluate("() => Object.keys(photos).length") == 1)

        # 2) Cambiar a inglés en la revisión: las opciones se traducen sin perder la elección.
        pg.evaluate("() => setLang('en')")
        pg.wait_for_timeout(150)
        ans = pg.evaluate("() => JSON.parse(JSON.stringify(answers))")
        rec('tipos: al cambiar a inglés, choice y multi se traducen',
            ans.get('ELECCION') == 'Option B' and ans.get('VARIOS') == 'Option A||Other: Algo raro',
            {k: ans.get(k) for k in ['ELECCION', 'VARIOS']})

        # 3) Generar el PDF en inglés.
        pg.click('#dnext'); pg.wait_for_timeout(200)
        pg.click('#bGen')
        try:
            pg.wait_for_function("() => document.getElementById('dl').style.display === 'flex' || "
                                 "document.getElementById('err').style.display !== 'none'", timeout=180000)
        except Exception:
            pass
        err = pg.evaluate("() => document.getElementById('err').style.display !== 'none' ? document.getElementById('err').textContent : ''")
        rec('tipos: el PDF se genera sin error', not err, err)
        if not err:
            with pg.expect_download(timeout=60000) as di:
                pg.click('#pdflink')
            path = os.path.join(OUT, 'tipos-en.pdf')
            di.value.save_as(path)
            txt = pdf_text(path)
            # Las opciones pasan a inglés; el texto libre que se escribió en español se queda como está.
            want = ['Ana', 'Option B', 'Option A', 'Algo raro', 'Hola', 'Una frase', '30']
            missing = [w for w in want if w not in txt]
            rec('tipos: el PDF en inglés trae las respuestas', not missing, 'faltan: %s' % missing)
        rec('tipos: sin errores de página', not errs, errs)
        b.close()
    print('\nRESUMEN: %d/%d OK' % (sum(RES), len(RES)))
    return 0 if all(RES) else 1


if __name__ == '__main__':
    sys.exit(main())
