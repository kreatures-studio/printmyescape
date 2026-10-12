#!/usr/bin/env python3
"""Prueba de capas v2 (F1.3b de PLAN-CREADOR-2.md).

Compone tools/qa/fixtures/games/capas-v2 (fondo de color, PDF propio en la página 2, fondo de arte en la 3,
pieza de arte por encima del texto, bloque de puzzle) con tools/qa/capas-v2.mjs, rasteriza cada página a
60 ppp y:
  1. comprueba unos píxeles conocidos (color de fondo, pieza por encima del texto, PDF de fondo);
  2. compara cada página con su PNG de referencia (tools/qa/fixtures/capas-v2/referencia-pN.png).
Pasa si cada página tiene como mucho el 0,1 % de píxeles que difieren en más de 24 niveles.

Uso (desde la raíz del repo):
  python3 tools/qa/capas-v2-test.py            # prueba
  python3 tools/qa/capas-v2-test.py --crear    # escribe las referencias (tras revisarlas a ojo)
Código 0 si pasa; 1 si no.
"""
import glob, os, shutil, subprocess, sys, tempfile
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REFS = os.path.join(ROOT, 'tools', 'qa', 'fixtures', 'capas-v2')
SALIDA = os.path.join(ROOT, 'tools', 'qa', 'salida-qa')
TOL, MAX_FRAC, PPP = 24, 0.001, 60
PAPEL = (239, 230, 210)   # #EFE6D2, fondo de color de la página 1
AZUL = (25, 76, 204)      # pieza prueba-azul (sobre el texto de la página 1, y sobre el PDF de la página 2)
ROJO_PDF = (204, 25, 25)  # fondo PDF de la página 2


def run(cmd):
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if r.returncode != 0:
        print('FALLO', ' '.join(cmd), '\n', r.stderr or r.stdout)
        sys.exit(1)
    return r.stdout


def rasterizar(pdf, carpeta):
    run(['pdftoppm', '-r', str(PPP), '-png', pdf, os.path.join(carpeta, 'pag')])
    return sorted(glob.glob(os.path.join(carpeta, 'pag-*.png')))


def cerca(a, b, tol=6):
    return all(abs(x - y) <= tol for x, y in zip(a, b))


def main():
    crear = '--crear' in sys.argv
    os.makedirs(SALIDA, exist_ok=True)
    pdf = os.path.join(SALIDA, 'capas-v2.pdf')
    run(['node', 'tools/qa/capas-v2.mjs', pdf])
    tmp = tempfile.mkdtemp(prefix='capas-v2-')
    paginas = rasterizar(pdf, tmp)
    if len(paginas) != 3:
        print(f'FALLO: {len(paginas)} páginas, se esperaban 3'); return 1
    imgs = [Image.open(p).convert('RGB') for p in paginas]
    if crear:
        os.makedirs(REFS, exist_ok=True)
        for n, im in enumerate(imgs, 1):
            im.save(os.path.join(REFS, f'referencia-p{n}.png'))
        print(f'Referencias escritas en {os.path.relpath(REFS, ROOT)}')
        shutil.rmtree(tmp); return 0

    errores = []
    p1, p2, p3 = imgs
    def punto(im, fx, fy):
        return im.getpixel((int(im.width * fx), int(im.height * fy)))
    # 1. Píxeles conocidos
    if not cerca(punto(p1, 0.01, 0.01), PAPEL, 4): errores.append(f'p1: fondo de color {punto(p1, 0.01, 0.01)}')
    if not cerca(punto(p1, 0.70, 0.70), AZUL, 8): errores.append(f'p1: la pieza azul no está encima del texto {punto(p1, 0.70, 0.70)}')
    if not cerca(punto(p2, 0.25, 0.25), AZUL, 8): errores.append(f'p2: la pieza de arte no está encima del PDF {punto(p2, 0.25, 0.25)}')
    if not cerca(punto(p2, 0.6, 0.9), ROJO_PDF, 8): errores.append(f'p2: no se ve el PDF de fondo {punto(p2, 0.6, 0.9)}')
    if p3.getpixel((2, 2)) == PAPEL: errores.append('p3: el fondo de arte no se ha dibujado')
    # 2. Referencias
    for n, im in enumerate(imgs, 1):
        ref_path = os.path.join(REFS, f'referencia-p{n}.png')
        if not os.path.exists(ref_path):
            errores.append(f'falta la referencia {os.path.relpath(ref_path, ROOT)} (usar --crear tras revisarla)')
            continue
        ref = Image.open(ref_path).convert('RGB')
        if ref.size != im.size:
            errores.append(f'p{n}: tamaño {im.size} distinto de la referencia {ref.size}'); continue
        dif = ImageChops.difference(im, ref).convert('L').point(lambda v: 255 if v > TOL else 0)
        malos = dif.histogram()[255]
        frac = malos / (im.width * im.height)
        if frac > MAX_FRAC:
            errores.append(f'p{n}: {frac:.4%} de píxeles distintos de la referencia')
    shutil.rmtree(tmp)
    for e in errores: print('FALLO', e)
    if errores:
        return 1
    print('OK capas v2: 3 páginas, píxeles conocidos y referencias en PNG')
    return 0


if __name__ == '__main__':
    sys.exit(main())
