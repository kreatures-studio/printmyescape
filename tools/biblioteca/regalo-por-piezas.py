#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Copia de «El regalo robado» compuesta con las piezas sueltas de la biblioteca, en vez del PDF del artista.

Cada página es una hoja en blanco con las piezas de arte de biblioteca/arte/el-regalo-robado en el sitio donde las
puso el artista (localizadas en Final3-Clean.pdf por sus trazos vectoriales), y encima los mismos textos, huecos y
fotos del juego original. Lo que en el PDF no cuadraba de una página a otra se alinea (feedback del cliente):

  - páginas de sospechoso (9 a 16, salvo la 13, que lleva la polaroid horizontal): la polaroid y la nota con clip
    van en el mismo sitio en todas; la foto y el nombre se mueven con la polaroid, y el texto de la nota con su
    nota (empieza siempre en el mismo margen). En la 11 y la 12 la nota pasa a ser la misma que en las demás;
  - «Posibles ubicaciones» (5 y 6): la misma lista, en el mismo sitio, en las dos;
  - fichas de sospechosos (2): las nueve fichas en una cuadrícula exacta;
  - triángulo verde de las páginas 12 a 16: el mismo, en el mismo sitio (en la 16 estaba 3 pt más abajo).

Sin la nota cifrada impresa (la pieza de la 10 ya está limpia), sobra la mecánica runes-panel que la tapaba.

Uso:  python3 tools/biblioteca/regalo-por-piezas.py [--juego games/final3] [--salida ensayos/f5/el-regalo-robado-piezas]
Escribe <salida>/game.json (pme-game/2) y copia las fotos de muestra a <salida>/fotos/.
"""
import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
COLECCION = os.path.join(ROOT, 'biblioteca', 'arte', 'el-regalo-robado')
PW, PH = 595.276, 841.89
MM = 72 / 25.4

# Sitios comunes (en puntos, esquina superior izquierda de la pieza).
POLAROID = (16.0, 16.0)          # marco-foto-polaroid-verde-grande en las páginas de sospechoso
NOTA = (239.0, 33.0)             # papel-nota-kraft-clip-grande (o la de la interrogación, en la 9)
MARGEN_NOTA = 304.0              # donde empieza el texto de la nota
TRIANGULO = (0.0, 88.3)          # fondo-triangulo-salvia
LISTA = (23.3, 4.7)              # marco-lista-ubicaciones-cuatro-fotos
FICHA_X = (13.4, 303.7)          # columnas de las fichas de la página 2
FICHA_FILAS = (82.6, 234.5, 387.0, 539.0, 691.1)


def fila(y):
    return min(FICHA_FILAS, key=lambda f: abs(f - y))

# Piezas de cada página en orden de dibujo: (pieza, versión, x, y) con el sitio del artista, y 'a' = sitio nuevo
# cuando se alinea. 'mueve': qué elementos del juego se van con la pieza ('marco': lo que cae dentro;
# 'nota': el texto de la nota, al margen común; 'todo': la página entera).
PAGINAS = {
    1: [('papel-sobre-correo-aereo', 1, 34.4, 309.4), ('papel-hoja-kraft-carta', 1, 32.9, 41.0),
        ('objeto-lupa-grande', 1, 41.78, 673.51)],
    2: [('papel-etiqueta-kraft-alargada', 1, 312.7, 18.7),
        ('marco-ficha-sospechoso-verde-regalo', 1, 311.4, 82.6, {'a': (FICHA_X[1], fila(82.6)), 'mueve': 'marco'}),
        ('decoracion-banda-titulo-verde', 1, 14.0, 140.5), ('objeto-regalo-azul', 1, 224.7, 21.8)]
       + [('marco-ficha-sospechoso-verde', 1, x, y, {'a': (FICHA_X[0 if x < 100 else 1], fila(y)), 'mueve': 'marco'})
          for x, y in [(303.3, 386.8), (304.8, 234.2), (303.5, 538.8), (303.0, 690.9),
                       (13.0, 387.2), (14.5, 234.7), (13.3, 539.3), (12.7, 691.3)]],
    3: [('puzzle-plano-casa-cuadricula', 2, 15.3, 228.6), ('marco-panel-calaveras-verde', 1, 303.0, 19.4),
        ('objeto-regalo-azul', 1, 227.8, 20.3), ('papel-etiqueta-kraft-regalo', 1, 316.1, 730.8),
        ('objeto-regalo-azul', 1, 515.9, 759.8), ('objeto-lupa', 1, 66.51, 716.92)],
    4: [('fondo-esquina-verde-claro', 1, 0.0, 0.0), ('papel-nota-kraft-casillas', 1, 12.4, 389.3),
        ('decoracion-banda-titulo-verde-corta', 1, 27.0, 389.3), ('papel-nota-kraft-lineas', 1, 13.8, 605.7),
        ('decoracion-banda-titulo-verde-corta', 1, 27.0, 605.7), ('decoracion-banda-titulo-verde-corta', 1, 381.2, 68.5)]
       + [('icono-vineta-calavera', 1, 225.75, y) for y in (114.57, 153.27, 191.36, 226.3, 264.68)]
       + [('decoracion-lineas-cuaderno-verde', 1, 429.4, 155.4), ('decoracion-lapiz-verde', 1, 512.1, 741.8),
          ('marco-foto-polaroid-verde', 1, 17.9, 78.8)],
    5: [('marco-lista-ubicaciones-cuatro-fotos', 1, 23.3, 4.7)],
    6: [('marco-lista-ubicaciones-cuatro-fotos', 1, 19.9, 9.3, {'a': LISTA, 'mueve': 'todo'})],
    7: [('ilustracion-perros-jugando-cartas', 2, 39.5, 364.0), ('puzzle-tarjeta-iconos-libros-cafetera', 1, 484.3, 183.0),
        ('puzzle-tarjeta-iconos-taza-cafetera', 1, 402.9, 173.0), ('puzzle-tarjeta-iconos-bici-cajon', 1, 320.8, 163.4),
        ('puzzle-clave-cifrado-pigpen', 1, 47.9, 94.1)],
    8: [('puzzle-maletin-cuadricula', 2, 65.3, 84.6)],
    9: [('papel-nota-kraft-clip-interrogacion', 1, 233.4, 32.4, {'a': NOTA, 'mueve': 'nota'}),
        ('papel-hoja-kraft-rayada', 1, 44.8, 283.8),
        ('marco-foto-polaroid-verde-grande', 1, 13.3, 8.2, {'a': POLAROID, 'mueve': 'marco'})],
    10: [('papel-nota-kraft-rasgada-grande', 1, 27.0, 295.3),
         ('papel-nota-kraft-clip-grande', 1, 237.2, 38.2, {'a': NOTA, 'mueve': 'nota'}),
         ('marco-foto-polaroid-verde-grande', 1, 15.1, 15.9, {'a': POLAROID, 'mueve': 'marco'})],
    11: [('papel-factura-verde', 1, 22.3, 257.4),
         ('marco-foto-polaroid-verde-grande', 1, 41.4, 3.5, {'a': POLAROID, 'mueve': 'marco'}),
         # la nota rasgada de esta página pasa a ser la nota con clip de las demás
         ('papel-nota-kraft-clip-grande', 1, 228.9, 59.8, {'a': NOTA, 'mueve': 'nota', 'caja': (312.1, 184.3)})],
    12: [('fondo-triangulo-salvia', 1, 0.0, 88.3),
         ('marco-foto-polaroid-verde-grande', 1, 11.4, 7.4, {'a': POLAROID, 'mueve': 'marco'}),
         ('papel-nota-kraft-clip-grande', 1, 240.8, 28.6, {'a': NOTA, 'mueve': 'nota', 'caja': (273.3, 143.2)}),
         ('dispositivo-movil-morado', 1, 204.2, 202.2), ('icono-bombilla', 1, 42.6, 350.3)],
    13: [('fondo-triangulo-salvia', 1, 0.0, 88.4, {'a': TRIANGULO}),
         ('marco-foto-polaroid-verde-horizontal', 1, 287.8, 17.6),
         ('dispositivo-monitor-morado', 1, 51.8, 230.7), ('papel-tira-kraft', 1, 50.4, 48.9)],
    14: [('fondo-triangulo-salvia', 1, 0.0, 88.4, {'a': TRIANGULO}), ('papel-nota-kraft-clip-ancha', 1, 115.0, 294.2),
         ('puzzle-postal-sobres', 1, 106.1, 529.1), ('objeto-sello-barco', 1, 391.4, 347.0),
         ('papel-nota-kraft-clip-grande', 1, 242.4, 32.8, {'a': NOTA, 'mueve': 'nota'}),
         ('marco-foto-polaroid-verde-grande', 1, 19.0, 15.5, {'a': POLAROID, 'mueve': 'marco'})],
    15: [('fondo-triangulo-salvia', 1, 0.0, 88.2, {'a': TRIANGULO}), ('papel-hoja-kraft-anillas', 1, 91.2, 228.3),
         ('papel-nota-kraft-clip-grande', 1, 237.3, 31.6, {'a': NOTA, 'mueve': 'nota'}),
         ('marco-foto-polaroid-verde-grande', 1, 16.8, 18.5, {'a': POLAROID, 'mueve': 'marco'})],
    16: [('fondo-triangulo-salvia', 1, 0.0, 91.4, {'a': TRIANGULO}), ('dispositivo-tableta-morada', 3, 124.9, 255.9),
         ('papel-nota-kraft-clip-grande', 1, 244.3, 32.6, {'a': NOTA, 'mueve': 'nota'}),
         ('marco-foto-polaroid-verde-grande', 1, 18.2, 18.2, {'a': POLAROID, 'mueve': 'marco'}),
         ('icono-bombilla-morada', 1, 19.8, 505.1)],
}


def tamanos():
    man = json.load(open(os.path.join(COLECCION, 'manifest.json'), encoding='utf-8'))
    return {(p['id'], p['version']): (p['widthMm'] * MM, p['heightMm'] * MM) for p in man['pieces']}


def caja_pt(e):
    return (e['x'] / 100 * PW, e['y'] / 100 * PH, e['w'] / 100 * PW, e['h'] / 100 * PH)


def dentro(e, r):
    x, y, w, h = caja_pt(e)
    cx, cy = x + w / 2, y + h / 2
    return r[0] <= cx <= r[0] + r[2] and r[1] <= cy <= r[1] + r[3]


def mover(e, dx, dy):
    e['x'] = round(e['x'] + dx / PW * 100, 3)
    e['y'] = round(e['y'] + dy / PH * 100, 3)


def construir(v2, hoy):
    tam = tamanos()
    g = json.loads(json.dumps(v2))
    g['id'] = 'el-regalo-robado-piezas'
    g['name'] = {'es': 'Regalo robado (por piezas)', 'en': 'Stolen gift (pieces)'}
    g['status'] = 'borrador'
    g['compat']['backgroundKind'] = 'layers'
    g['mechanics'] = [m for m in g.get('mechanics', []) if m['type'] != 'runes-panel']
    informe = []
    for p in g['pages']:
        n = int(p['id'][1:])
        p['background'] = {'kind': 'color', 'value': '#FFFFFF'}
        p.pop('preview', None)
        p.pop('emptyLayers', None)
        originales = p['elements']
        movidos = set()
        arte = []
        for k, item in enumerate(PAGINAS[n]):
            pid, ver, x, y = item[:4]
            op = item[4] if len(item) > 4 else {}
            w, h = tam[(pid, ver)]
            nx, ny = op.get('a', (x, y))
            arte.append({'id': f'{p["id"]}-a{k + 1}', 'kind': 'art', 'ref': f'{pid}@{ver}',
                         'x': round(nx / PW * 100, 3), 'y': round(ny / PH * 100, 3),
                         'w': round(w / PW * 100, 3), 'h': round(h / PH * 100, 3), 'angle': 0})
            if (nx, ny) != (x, y):
                informe.append(f'p{n} {pid}: ({x:.1f}, {y:.1f}) → ({nx:.1f}, {ny:.1f}) pt')
            modo = op.get('mueve')
            if not modo:
                continue
            ow, oh = op.get('caja', (w, h))
            viejo = (x, y, ow, oh)
            if modo == 'todo':
                grupo = [e for e in originales if e['id'] not in movidos]
            else:
                grupo = [e for e in originales if e['id'] not in movidos and dentro(e, viejo)]
            if modo == 'nota' and grupo:
                izq = min(caja_pt(e)[0] for e in grupo)
                dx, dy = MARGEN_NOTA - izq, ny - y
            else:
                dx, dy = nx - x, ny - y
            for e in grupo:
                mover(e, dx, dy)
                movidos.add(e['id'])
        p['elements'] = arte + originales
    piezas = sorted({f'{it[0]}@{it[1]}' for lst in PAGINAS.values() for it in lst})
    g['changes'] = [{'date': hoy, 'text': (
        'Copia de «Regalo robado» compuesta con las piezas sueltas de la biblioteca (el-regalo-robado) en lugar del '
        'PDF del artista: cada pieza se puede mover, cambiar o quitar desde el creador. Los textos, huecos, fotos, '
        'formulario y ejemplos son los del juego original.\n\nAlineado respecto al PDF (lo que no cuadraba de una página '
        'a otra): la polaroid y la nota con clip de los sospechosos están en el mismo sitio en las páginas 9 a 16 (salvo la '
        '13, con la polaroid horizontal), y el texto de la nota empieza siempre en el mismo margen; en la 11 y la 12 la nota '
        'es la misma que en las demás; las dos listas de «Posibles ubicaciones» (5 y 6) están en el mismo sitio; las fichas '
        'de la página 2 forman una cuadrícula exacta; y el triángulo verde de las páginas 12 a 16 es el mismo. Sin la nota '
        'cifrada impresa, sobra la mecánica que la tapaba (runes-panel).\n\nPiezas nuevas en la biblioteca, separadas del '
        'mismo PDF: sobre de correo aéreo, hoja kraft de carta, lupa grande, esquina verde claro, líneas de cuaderno, '
        'viñeta de calavera, factura verde, nota kraft con clip grande, triángulo salvia, bombilla morada y postal con '
        'sobres; nuevas versiones del plano (con su papel), de los perros (con su fondo) y del maletín (el corregido por '
        'los artistas).\n\nPara revisar: que cada página se vea como el original salvo esos ajustes.'),
        'presupuestar': []}]
    g['review'] = {'changes': 0, 'items': {}}
    for ex in g.get('examples', []):
        ex['photos'] = {k: 'fotos/' + os.path.basename(v) for k, v in (ex.get('photos') or {}).items()}
    return g, informe, piezas


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--juego', default='games/final3')
    ap.add_argument('--salida', default='ensayos/f5/el-regalo-robado-piezas')
    a = ap.parse_args()
    with tempfile.TemporaryDirectory(dir=os.path.join(ROOT, 'salidas')) as tmp:
        subprocess.run(['node', 'tools/game/migrar-v2.mjs', a.juego, tmp], cwd=ROOT, check=True, capture_output=True)
        v2 = json.load(open(os.path.join(tmp, 'game.json'), encoding='utf-8'))
    juego_dir = os.path.join(ROOT, a.juego)
    fotos = {os.path.normpath(os.path.join(juego_dir, v)) for ex in v2.get('examples', []) for v in (ex.get('photos') or {}).values()}
    g, informe, piezas = construir(v2, datetime.date.today().isoformat())
    out = os.path.join(ROOT, a.salida)
    os.makedirs(os.path.join(out, 'fotos'), exist_ok=True)
    for f in sorted(fotos):
        shutil.copyfile(f, os.path.join(out, 'fotos', os.path.basename(f)))
    with open(os.path.join(out, 'game.json'), 'w', encoding='utf-8') as fh:
        fh.write(json.dumps(g, ensure_ascii=False, indent=2) + '\n')
    print('\n'.join(informe))
    print(f'OK {os.path.relpath(out, ROOT)}: {len(g["pages"])} páginas, {len(piezas)} piezas distintas, {len(fotos)} fotos')
    return 0


if __name__ == '__main__':
    sys.exit(main())
