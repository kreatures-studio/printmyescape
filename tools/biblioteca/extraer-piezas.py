#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Recupera piezas de arte sueltas de un PDF de fondo del artista (todo vectorial).

Uso:
  python3 tools/biblioteca/extraer-piezas.py <fondo.pdf> <carpeta-salida> [--juego "El regalo robado"] [--prefijo f3]

Cómo funciona:
  1. Agrupa los trazos de cada página que se tocan (cada grupo es una pieza candidata). Las formas que
     ocupan más del 35 % de la página se consideran fondo y no forman pieza.
  2. Los rectángulos de guía (solo contorno, color magenta o morado) son la «zona útil» del artista
     (el recuadro rosa: dónde va la foto o el texto). No se dibujan: se guardan como zona de la pieza
     y la ventana se pinta en blanco, como se ve en el juego.
  3. Cada pieza se redibuja en vector en su propio PDF, con fondo transparente, más una miniatura PNG.
  4. Las piezas repetidas (mismo tamaño y mismo aspecto) se quedan una sola vez; se anota en qué páginas
     aparece.

Salida: <id>.pdf y <id>.png por pieza, candidatas.json (id, páginas, tamaño en mm, zonas, número de trazos)
y revisar.jpg (hoja de contacto con los ids). No pone nombres: eso lo hace nombrar-piezas.py con una hoja.
"""
import argparse
import json
import os
import sys

import pymupdf
from PIL import Image, ImageDraw

PT_A_MM = 25.4 / 72


def es_guia(d):
    """Contorno sin relleno de color magenta o morado: la guía de zona útil del artista."""
    c = d.get('color')
    if d.get('fill') is not None or not c:
        return False
    r, g, b = c[:3]
    return r > 0.5 and b > 0.45 and g < 0.45


def redibujar(page, paths, dx, dy):
    sh = page.new_shape()
    for p in paths:
        for it in p['items']:
            if it[0] == 'l':
                sh.draw_line(it[1] - (dx, dy), it[2] - (dx, dy))
            elif it[0] == 'c':
                sh.draw_bezier(it[1] - (dx, dy), it[2] - (dx, dy), it[3] - (dx, dy), it[4] - (dx, dy))
            elif it[0] == 're':
                sh.draw_rect(it[1] - (dx, dy, dx, dy))
            elif it[0] == 'qu':
                sh.draw_quad(pymupdf.Quad(*(pt - (dx, dy) for pt in it[1])))
        sh.finish(fill=p.get('fill'), color=p.get('color'), width=p.get('width') or 0,
                  even_odd=bool(p.get('even_odd')), closePath=bool(p.get('closePath')),
                  fill_opacity=p.get('fill_opacity') or 1, stroke_opacity=p.get('stroke_opacity') or 1,
                  lineCap=max(p.get('lineCap') or (0,)), lineJoin=int(p.get('lineJoin') or 0))
    sh.commit()


def grupos_de(dr):
    """Une los trazos cuyos rectángulos se tocan (margen 1 pt). Devuelve listas de índices."""
    padre = list(range(len(dr)))

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    rects = [x['rect'] + (-1, -1, 1, 1) for x in dr]
    orden = sorted(range(len(dr)), key=lambda i: rects[i].x0)
    for k, a in enumerate(orden):
        for b in orden[k + 1:]:
            if rects[b].x0 > rects[a].x1:
                break
            if rects[a].intersects(rects[b]):
                padre[raiz(a)] = raiz(b)
    grupos = {}
    for i in range(len(dr)):
        grupos.setdefault(raiz(i), []).append(i)
    return list(grupos.values())


def huella(png):
    """Huella para detectar repetidas: 16×16 en gris sobre fondo blanco."""
    im = Image.open(png).convert('RGBA')
    fondo = Image.new('RGBA', im.size, (255, 255, 255, 255))
    fondo.alpha_composite(im)
    return list(fondo.convert('L').resize((16, 16)).getdata())


def iguales(a, b):
    if abs(a['w'] - b['w']) > 2 or abs(a['h'] - b['h']) > 2:
        return False
    return sum(abs(x - y) for x, y in zip(a['huella'], b['huella'])) / 256 < 6


def hoja(piezas, salida, archivo):
    T, cols = 190, 7
    filas = (len(piezas) + cols - 1) // cols
    sh = Image.new('RGB', (cols * T, filas * (T + 18)), 'white')
    dr = ImageDraw.Draw(sh)
    for i, p in enumerate(piezas):
        im = Image.open(os.path.join(salida, p['id'] + '.png')).convert('RGBA')
        im.thumbnail((T - 12, T - 12))
        bg = Image.new('RGBA', (T - 6, T - 6), (205, 205, 205, 255))
        bg.alpha_composite(im, ((T - 6 - im.width) // 2, (T - 6 - im.height) // 2))
        x, y = (i % cols) * T, (i // cols) * (T + 18)
        sh.paste(bg.convert('RGB'), (x, y))
        dr.text((x + 4, y + T - 2), p['id'], fill='black')
    sh.save(os.path.join(salida, archivo), quality=82)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('pdf')
    ap.add_argument('salida')
    ap.add_argument('--juego', default='')
    ap.add_argument('--prefijo', default='pz')
    a = ap.parse_args()
    os.makedirs(a.salida, exist_ok=True)
    doc = pymupdf.open(a.pdf)
    candidatas = []
    for pn in range(1, doc.page_count + 1):
        page = doc[pn - 1]
        W, H = page.rect.width, page.rect.height
        todos = [x for x in page.get_drawings() if x['rect'].width * x['rect'].height < 0.35 * W * H]
        guias = [x for x in todos if es_guia(x)]
        arte = [x for x in todos if not es_guia(x)]
        for k, idx in enumerate(sorted(grupos_de(arte), key=lambda g: -len(g))):
            bb = pymupdf.Rect(arte[idx[0]]['rect'])
            for i in idx:
                bb |= arte[i]['rect']
            if bb.width < 25 or bb.height < 25:
                continue
            zonas = [g['rect'] for g in guias if bb.contains(g['rect'])]
            pid = f'{a.prefijo}-p{pn:02d}-{k + 1:02d}'
            out = pymupdf.open()
            pg = out.new_page(width=bb.width, height=bb.height)
            redibujar(pg, [arte[i] for i in sorted(idx, key=lambda i: arte[i]['seqno'])], bb.x0, bb.y0)
            for z in zonas:  # la ventana de la zona útil, en blanco (debajo irá la foto o el texto)
                pg.draw_rect(z - (bb.x0, bb.y0, bb.x0, bb.y0), color=None, fill=(1, 1, 1))
            out.save(os.path.join(a.salida, pid + '.pdf'))
            png = os.path.join(a.salida, pid + '.png')
            pg.get_pixmap(dpi=110, alpha=True).save(png)
            candidatas.append({
                'id': pid, 'paginas': [pn], 'w': round(bb.width, 1), 'h': round(bb.height, 1),
                'widthMm': round(bb.width * PT_A_MM, 1), 'heightMm': round(bb.height * PT_A_MM, 1),
                'zonas': [{'tipo': 'zona-foto' if z.height > 40 else 'zona-texto',
                           'x': round((z.x0 - bb.x0) / bb.width * 100, 2), 'y': round((z.y0 - bb.y0) / bb.height * 100, 2),
                           'w': round(z.width / bb.width * 100, 2), 'h': round(z.height / bb.height * 100, 2)} for z in zonas],
                'trazos': len(idx), 'huella': huella(png),
            })
    # Repetidas: se queda la primera; las demás suman sus páginas y se borran.
    unicas = []
    for c in candidatas:
        igual = next((u for u in unicas if iguales(u, c)), None)
        if igual:
            igual['paginas'] += c['paginas']
            for ext in ('.pdf', '.png'):
                os.remove(os.path.join(a.salida, c['id'] + ext))
        else:
            unicas.append(c)
    for u in unicas:
        u.pop('huella')
        u['juego'] = a.juego
    with open(os.path.join(a.salida, 'candidatas.json'), 'w', encoding='utf-8') as f:
        json.dump(unicas, f, indent=2, ensure_ascii=False)
    hoja(unicas, a.salida, 'revisar.jpg')
    print(f'{len(candidatas)} candidatas, {len(unicas)} sin repetir, '
          f'{sum(1 for u in unicas if u["zonas"])} con zona útil → {a.salida}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
