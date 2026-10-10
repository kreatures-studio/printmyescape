"""Prueba dorada (T0.5 de PLAN-CREADOR.md): el juego en game.json compone los PDF de ejemplo
idénticos, página a página, a los de demo/ejemplos/.

Compone cada ejemplo con la CLI (tools/compose.js --game ...), rasteriza ambos PDF a 60 ppp
con pdftoppm y compara los píxeles. Aceptación: 96 de 96 páginas idénticas (6 PDF x 16 páginas).

Uso (desde la raíz del repo):
  python3 tools/qa/golden.py
  PME_GAME=games/final3 PME_OUT=tools/qa/salida-golden python3 tools/qa/golden.py
"""
import os, subprocess, sys
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GAME = os.environ.get('PME_GAME', 'games/final3')
OUT = os.path.abspath(os.environ.get('PME_OUT', os.path.join(ROOT, 'tools', 'qa', 'salida-golden')))
REF = os.path.join(ROOT, 'demo', 'ejemplos')
DPI = '60'
CASES = [('es', 1), ('es', 2), ('es', 3), ('en', 1), ('en', 2), ('en', 3)]


def rasterize(pdf, prefix):
    subprocess.run(['pdftoppm', '-r', DPI, '-png', pdf, prefix], check=True)
    d, base = os.path.dirname(prefix), os.path.basename(prefix)
    return sorted(os.path.join(d, f) for f in os.listdir(d) if f.startswith(base + '-') and f.endswith('.png'))


def compare(a_pdf, b_pdf, tag):
    fa = rasterize(a_pdf, os.path.join(OUT, tag + '-a'))
    fb = rasterize(b_pdf, os.path.join(OUT, tag + '-b'))
    if len(fa) != len(fb):
        return 0, max(len(fa), len(fb)), f'páginas {len(fa)} frente a {len(fb)}'
    same, peor = 0, 0
    for x, y in zip(fa, fb):
        ia, ib = Image.open(x).convert('RGB'), Image.open(y).convert('RGB')
        if ia.size != ib.size:
            peor = 255
            continue
        d = ImageChops.difference(ia, ib)
        m = max(v for band in d.getextrema() for v in band)
        peor = max(peor, m)
        if m == 0:
            same += 1
    for f in fa + fb:
        os.remove(f)
    return same, len(fa), f'diferencia máxima {peor}'


def main():
    os.makedirs(OUT, exist_ok=True)
    total_ok = total = 0
    for lang, n in CASES:
        ref = os.path.join(REF, f'ejemplo-{n}-{lang}.pdf')
        cli = os.path.join(OUT, f'juego-{lang}-{n}.pdf')
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'compose.js'), '--game', GAME,
                            '--example', str(n), '--lang', lang,
                            '--out', os.path.relpath(cli, ROOT)],
                           cwd=ROOT, capture_output=True, text=True)
        if r.returncode != 0:
            print(f'FALLO {lang} {n}: {r.stderr.strip()[:300]}')
            return 1
        ok, tot, det = compare(cli, ref, f'{lang}-{n}')
        total_ok += ok
        total += tot
        print(f'{"OK   " if ok == tot else "FALLO"} {lang} ejemplo {n}: {ok}/{tot} páginas idénticas | {det}')
    print(f'TOTAL {total_ok}/{total} páginas idénticas (esperado {total}/{total})')
    return 0 if total_ok == total == 96 else 1


if __name__ == '__main__':
    sys.exit(main())
