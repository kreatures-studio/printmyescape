#!/usr/bin/env python3
"""Prueba del fondo por capas (T4.2 de PLAN-CREADOR.md).

Compone la página de prueba (tools/qa/fixtures/games/capas: tres piezas del kit de prueba, una
PNG y dos PDF, una de ellas girada 30°), la rasteriza a 60 ppp y la compara con su PNG de
referencia (tools/qa/fixtures/capas/referencia.png). Pasa si como mucho el 0,1 % de los píxeles
difiere en más de 24 niveles en algún canal.
Uso (desde la raíz del repo):  python3 tools/qa/capas-test.py
Código 0 si pasa; 1 si no.
"""
import os, subprocess, sys, tempfile
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JUEGO = os.path.join(ROOT, 'tools', 'qa', 'fixtures', 'games', 'capas')
KIT = os.path.join(ROOT, 'tools', 'qa', 'fixtures', 'capas', 'kit', 'manifest.json')
REF = os.path.join(ROOT, 'tools', 'qa', 'fixtures', 'capas', 'referencia.png')
TOL, MAX_FRAC = 24, 0.001


def run(cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('FALLO', ' '.join(cmd), '\n', r.stderr or r.stdout)
        sys.exit(1)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        pdf = os.path.join(tmp, 'capas.pdf')
        run(['node', 'tools/compose.js', '--game', JUEGO, '--kit', KIT, '--example', '1', '--lang', 'es', '--out', os.path.relpath(pdf, ROOT)])
        base = os.path.join(tmp, 'pagina')
        run(['pdftoppm', '-r', '60', '-png', '-singlefile', pdf, base])
        a = Image.open(base + '.png').convert('RGB')
        b = Image.open(REF).convert('RGB')
        if a.size != b.size:
            print(f'FALLO: tamaño {a.size} y referencia {b.size}')
            return 1
        diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > TOL else 0)
        malos = diff.histogram()[255]
        frac = malos / (a.size[0] * a.size[1])
        ok = frac <= MAX_FRAC
        print(('OK ' if ok else 'FALLO ') + f'capas: {malos} píxeles distintos ({frac:.4%}), máximo {MAX_FRAC:.1%}')
        return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
