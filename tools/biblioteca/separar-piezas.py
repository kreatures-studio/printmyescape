#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Separa piezas que salieron pegadas al recuperarlas del PDF vectorial del artista (F2.3).

extraer-piezas.py agrupa los trazos que se tocan; cuando una pieza está encima de otra (una polaroid sobre una
hoja), salen juntas. Aquí cada pieza se elige a mano con rectángulos de la página, en puntos:

  dentro     la pieza está dentro de este rectángulo (se toman los trazos que caben en él);
  fuera      trazos de otras piezas que están encima (cada trazo que cabe en uno de estos rectángulos se quita);
  sin_color  colores de relleno que no son de la pieza (p. ej. el texto cifrado dibujado sobre la nota);
  bloques    opcional: solo trazos de estos grupos del artista (índices de bloques de nivel 1, ver --bloques);
  con_fondo  admite trazos muy grandes (más del 60 % de la página), que de otro modo se toman por el fondo.

Uso:
  python3 tools/biblioteca/separar-piezas.py <fondo.pdf> <spec.json> <carpeta-salida> [--solo id1,id2]
  python3 tools/biblioteca/separar-piezas.py <fondo.pdf> --bloques <página>    (lista los grupos de una página)

spec.json: { "piezas": [ { "id": "...", "pagina": 15, "dentro": [x0, y0, x1, y1], "fuera": [[...]],
             "sin_color": [[r, g, b]], "bloques": [1], "con_fondo": false }, ... ] }

Las imágenes de mapa de bits y los degradados del artista (pantallas del monitor, del móvil, de la tableta) se copian
también, en su sitio del orden de dibujo: se rasterizan a 200 ppp desde una copia de la página sin trazos.

Salida por pieza: <id>.pdf (vectorial salvo esas imágenes, fondo transparente), <id>.png (miniatura) y <id>.zonas.json (zonas útiles
según las guías magenta del artista, en % de la pieza). Después se importan con importar-arte.py.
"""
import argparse
import importlib.util
import json
import os
import sys

import pymupdf

AQUI = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('extraer', os.path.join(AQUI, 'extraer-piezas.py'))
extraer = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(extraer)

TOL = 2.0  # pt
PPP_IMAGENES = 200


def bloques_de(page):
    """Trazos de la página repartidos en los grupos de nivel 1 del artista (recortes de Illustrator)."""
    out, actual = [], None
    for x in page.get_drawings(extended=True):
        if x['type'] == 'group' and x['level'] == 0:
            continue
        if x['level'] == 1:
            if x['type'] in ('clip', 'group'):
                actual = []
                out.append(actual)
                continue
            out.append([x])
            actual = None
            continue
        if actual is None:
            actual = []
            out.append(actual)
        if x['type'] not in ('clip', 'group'):
            actual.append(x)
    return [b for b in out if b]


def cabe(r, caja, tol=TOL):
    return r.x0 >= caja[0] - tol and r.y0 >= caja[1] - tol and r.x1 <= caja[2] + tol and r.y1 <= caja[3] + tol


def mismo_color(a, b, tol=0.03):
    return a is not None and all(abs(x - y) <= tol for x, y in zip(a[:3], b[:3]))


def separar(page, p):
    W, H = page.rect.width, page.rect.height
    bloques = bloques_de(page)
    elegidos = range(len(bloques)) if p.get('bloques') is None else p['bloques']
    trazos = [x for k in elegidos for x in bloques[k]]
    arte, guias, imagenes = [], [], []
    # Imágenes y degradados, en el orden de dibujo. Un degradado da una caja infinita en el registro: su caja visible
    # es la de get_image_info, que los lista en el mismo orden.
    info = page.get_image_info()
    k = 0
    for n, (tipo, r) in enumerate(page.get_bboxlog()):
        if tipo not in ('fill-image', 'fill-imgmask', 'fill-shade'):
            continue
        r = pymupdf.Rect(info[k]['bbox']) if k < len(info) else pymupdf.Rect(r)
        k += 1
        if cabe(r, p['dentro']) and not any(cabe(r, f, 1.0) for f in p.get('fuera', [])):
            imagenes.append((n, r))
    for x in sorted(trazos, key=lambda d: d['seqno']):
        r = x['rect']
        if not cabe(r, p['dentro']):
            continue
        if any(cabe(r, f, 1.0) for f in p.get('fuera', [])):
            continue
        if extraer.es_guia(x):
            guias.append(r)
            continue
        if not p.get('con_fondo') and r.width * r.height > 0.6 * W * H:
            continue
        if any(mismo_color(x.get('fill'), c) for c in p.get('sin_color', [])):
            continue
        arte.append(x)
    if not arte:
        raise SystemExit(f'{p["id"]}: ningún trazo en la selección')
    bb = pymupdf.Rect(arte[0]['rect'])
    for x in arte:
        bb |= x['rect']
    for _, r in imagenes:
        bb |= r
    zonas = [{'tipo': 'zona-foto' if z.height > 40 else 'zona-texto',
              'x': round((z.x0 - bb.x0) / bb.width * 100, 2), 'y': round((z.y0 - bb.y0) / bb.height * 100, 2),
              'w': round(z.width / bb.width * 100, 2), 'h': round(z.height / bb.height * 100, 2)}
             for z in guias if bb.contains(z)]
    return arte, bb, zonas, imagenes


def capa_de_imagenes(pdf, pagina, rect):
    """PNG (con transparencia) de las imágenes de la página dentro de rect, sin ningún trazo vectorial ni texto."""
    doc = pymupdf.open(pdf)
    doc.select([pagina - 1])
    pg = doc[0]
    pg.add_redact_annot(pg.rect)
    pg.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE, graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED,
                        text=pymupdf.PDF_REDACT_TEXT_REMOVE)
    return pg.get_pixmap(dpi=PPP_IMAGENES, clip=rect, alpha=True).tobytes('png')


def dibujar(pg, pdf, pagina, arte, imagenes, bb):
    """Redibuja los trazos en orden y pone las imágenes en su sitio (una capa con todas, donde va la primera)."""
    if not imagenes:
        extraer.redibujar(pg, arte, bb.x0, bb.y0)
        return
    primera = min(n for n, _ in imagenes)
    caja = pymupdf.Rect(imagenes[0][1])
    for _, r in imagenes:
        caja |= r
    antes = [x for x in arte if x['seqno'] < primera]
    despues = [x for x in arte if x['seqno'] > primera]
    if antes:
        extraer.redibujar(pg, antes, bb.x0, bb.y0)
    pg.insert_image(caja - (bb.x0, bb.y0, bb.x0, bb.y0), stream=capa_de_imagenes(pdf, pagina, caja))
    if despues:
        extraer.redibujar(pg, despues, bb.x0, bb.y0)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('pdf')
    ap.add_argument('spec', nargs='?')
    ap.add_argument('salida', nargs='?')
    ap.add_argument('--solo', help='ids separados por comas')
    ap.add_argument('--bloques', type=int, help='lista los grupos de esta página y sale')
    a = ap.parse_args()
    doc = pymupdf.open(a.pdf)
    if a.bloques:
        for k, b in enumerate(bloques_de(doc[a.bloques - 1])):
            bb = pymupdf.Rect(b[0]['rect'])
            for x in b:
                bb |= x['rect']
            print(f'b{k}: {len(b)} trazos, {[round(v) for v in bb]}')
        return 0
    if not a.spec or not a.salida:
        ap.error('faltan spec.json y la carpeta de salida')
    spec = json.load(open(a.spec, encoding='utf-8'))
    solo = set(a.solo.split(',')) if a.solo else None
    os.makedirs(a.salida, exist_ok=True)
    for p in spec['piezas']:
        if solo and p['id'] not in solo:
            continue
        arte, bb, zonas, imagenes = separar(doc[p['pagina'] - 1], p)
        out = pymupdf.open()
        pg = out.new_page(width=bb.width, height=bb.height)
        dibujar(pg, a.pdf, p['pagina'], arte, imagenes, bb)
        base = os.path.join(a.salida, p['id'])
        out.save(base + '.pdf')
        pg.get_pixmap(dpi=110, alpha=True).save(base + '.png')
        with open(base + '.zonas.json', 'w', encoding='utf-8') as f:
            json.dump(zonas, f, indent=1)
        print(f'OK {p["id"]}: {len(arte)} trazos, {len(imagenes)} imagen(es), {round(bb.width * extraer.PT_A_MM, 1)} × '
              f'{round(bb.height * extraer.PT_A_MM, 1)} mm, {len(zonas)} zona(s)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
