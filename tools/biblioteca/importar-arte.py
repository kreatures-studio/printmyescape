#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Importa una pieza de arte del artista a una colección de la biblioteca (F2.2 de PLAN-CREADOR-2.md).

Formatos:
  PDF   una página vectorial. Las capas llamadas «zona-foto» y «zona-texto» pasan a ser zonas de la pieza y
        no se dibujan. Texto o imágenes dentro del PDF: se rechaza (exportar como vector o como PNG).
  SVG   vectorial, sin capas: las zonas van en un fichero de zonas (ver abajo).
  PNG   mapa de bits; el tamaño sale de su resolución (300 ppp salvo que el PNG diga otra) y las zonas, del fichero de zonas.

Fichero de zonas (opcional, JSON): [{"tipo": "zona-foto", "x": 5, "y": 10, "w": 30, "h": 30}, ...] en % de la pieza.

Uso:
  python3 tools/biblioteca/importar-arte.py <fichero> <colección> --id papel-hoja-kraft --categoria papel \
      --nombre "Hoja kraft" --etiquetas "misterio, kraft, pista" --autor "Kreatures" --origen "El regalo robado" \
      [--zonas zonas.json] [--version N] [--licencia propia-estudio]

Escribe piezas/<id>-v<N>.pdf y .png y añade la entrada a manifest.json. Después valida la colección con
tools/biblioteca/validar.mjs; si la validación falla, deshace los cambios y sale con error.
Código 0 si la pieza entra; 1 si no.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import pymupdf
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PT_A_MM = 25.4 / 72
ZONAS = {'zona-foto', 'zona-texto'}
CATEGORIAS = {'fondo', 'marco', 'papel', 'dispositivo', 'objeto', 'icono', 'decoracion', 'ilustracion', 'puzzle'}


def redibujar(page, paths):
    """Vuelve a dibujar los trazos (sin capas de zona), para que la pieza no arrastre las guías."""
    sh = page.new_shape()
    for p in paths:
        for it in p['items']:
            if it[0] == 'l':
                sh.draw_line(it[1], it[2])
            elif it[0] == 'c':
                sh.draw_bezier(it[1], it[2], it[3], it[4])
            elif it[0] == 're':
                sh.draw_rect(it[1])
            elif it[0] == 'qu':
                sh.draw_quad(it[1])
        sh.finish(fill=p.get('fill'), color=p.get('color'), width=p.get('width') or 0,
                  even_odd=bool(p.get('even_odd')), closePath=bool(p.get('closePath')),
                  fill_opacity=p.get('fill_opacity') or 1, stroke_opacity=p.get('stroke_opacity') or 1,
                  lineCap=max(p.get('lineCap') or (0,)), lineJoin=int(p.get('lineJoin') or 0))
    sh.commit()


def zona_de(rect, tipo, W, H):
    """Rectángulo en puntos → zona en % de la pieza (x, y en la esquina superior izquierda)."""
    return {'tipo': tipo, 'x': round(rect.x0 / W * 100, 2), 'y': round(rect.y0 / H * 100, 2),
            'w': round(rect.width / W * 100, 2), 'h': round(rect.height / H * 100, 2)}


def desde_pdf(doc, salida_pdf):
    """PDF o SVG vectorial de una página → (ancho pt, alto pt, zonas, PDF de la pieza sin capas de zona)."""
    if doc.page_count != 1:
        raise ValueError(f'el PDF tiene {doc.page_count} páginas: exporta una pieza por archivo')
    page = doc[0]
    W, H = page.rect.width, page.rect.height
    if page.get_text('words'):
        raise ValueError('la pieza tiene texto: exportala como vector sin texto (o como PNG)')
    if page.get_images():
        raise ValueError('la pieza tiene imágenes de mapa de bits: exportala como vector (o como PNG)')
    zonas, arte = [], []
    for d in page.get_drawings():
        capa = d.get('layer')
        if capa in ZONAS:
            zonas.append(zona_de(d['rect'], capa, W, H))
        else:
            arte.append(d)
    out = pymupdf.open()
    pg = out.new_page(width=W, height=H)
    redibujar(pg, arte)
    out.save(salida_pdf)
    return W, H, zonas


def desde_png(ruta, salida_pdf):
    """PNG → (ancho pt, alto pt, zonas vacías, PDF con la imagen a su tamaño real)."""
    im = Image.open(ruta)
    dpi = (im.info.get('dpi') or (300, 300))[0] or 300
    W, H = im.width / dpi * 72, im.height / dpi * 72
    out = pymupdf.open()
    pg = out.new_page(width=W, height=H)
    pg.insert_image(pg.rect, filename=ruta)
    out.save(salida_pdf)
    return W, H, []


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('fichero')
    ap.add_argument('coleccion')
    ap.add_argument('--id', required=True)
    ap.add_argument('--categoria', required=True)
    ap.add_argument('--nombre', required=True)
    ap.add_argument('--etiquetas', required=True, help='3 a 6, separadas por comas')
    ap.add_argument('--autor', required=True)
    ap.add_argument('--origen', required=True, help='de qué juego o de quién viene la pieza')
    ap.add_argument('--licencia', default='propia-estudio')
    ap.add_argument('--zonas', help='fichero JSON de zonas (obligatorio para PNG si tiene zonas)')
    ap.add_argument('--version', type=int)
    a = ap.parse_args()

    if a.categoria not in CATEGORIAS:
        return error(f'categoría «{a.categoria}» no existe ({", ".join(sorted(CATEGORIAS))})')
    if not a.id.startswith(a.categoria + '-'):
        return error(f'el id «{a.id}» debe empezar por «{a.categoria}-»')
    etiquetas = [e.strip() for e in a.etiquetas.split(',') if e.strip()]
    if not 3 <= len(etiquetas) <= 6:
        return error(f'{len(etiquetas)} etiquetas (de 3 a 6)')

    os.makedirs(os.path.join(a.coleccion, 'piezas'), exist_ok=True)
    manifiesto_path = os.path.join(a.coleccion, 'manifest.json')
    if os.path.exists(manifiesto_path):
        manifiesto = json.load(open(manifiesto_path, encoding='utf-8'))
    else:
        manifiesto = {'schema': 'pme-biblioteca/1', 'tipo': 'arte', 'pieces': []}
    previas = [p['version'] for p in manifiesto['pieces'] if p['id'] == a.id]
    version = a.version or (max(previas) + 1 if previas else 1)
    if version in previas:
        return error(f'ya existe la versión {version} de «{a.id}»: las piezas no se editan, se publica la versión siguiente')
    base = f'{a.id}-v{version}'
    pdf_rel, png_rel = f'piezas/{base}.pdf', f'piezas/{base}.png'
    pdf_abs, png_abs = os.path.join(a.coleccion, pdf_rel), os.path.join(a.coleccion, png_rel)

    ext = os.path.splitext(a.fichero)[1].lower()
    try:
        if ext == '.png':
            W, H, zonas = desde_png(a.fichero, pdf_abs)
        elif ext in ('.pdf', '.svg'):
            doc = pymupdf.open(a.fichero)
            if ext == '.svg':
                doc = pymupdf.open('pdf', doc.convert_to_pdf())
            W, H, zonas = desde_pdf(doc, pdf_abs)
        else:
            return error(f'formato «{ext}» no admitido (PDF, SVG o PNG)')
        if a.zonas:
            zonas = json.load(open(a.zonas, encoding='utf-8'))
        doc = pymupdf.open(pdf_abs)
        doc[0].get_pixmap(dpi=110, alpha=True).save(png_abs)
    except ValueError as e:
        return error(str(e))

    entrada = {
        'id': a.id, 'version': version, 'file': pdf_rel, 'thumb': png_rel, 'name': a.nombre,
        'category': a.categoria, 'tags': etiquetas, 'widthMm': round(W * PT_A_MM, 1), 'heightMm': round(H * PT_A_MM, 1),
        'zones': zonas, 'license': a.licencia, 'author': a.autor, 'origin': {'game': a.origen},
    }
    manifiesto['pieces'].append(entrada)
    antes = open(manifiesto_path, encoding='utf-8').read() if os.path.exists(manifiesto_path) else None
    with open(manifiesto_path, 'w', encoding='utf-8') as f:
        json.dump(manifiesto, f, indent=2, ensure_ascii=False)
        f.write('\n')
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'biblioteca', 'validar.mjs'), a.coleccion],
                       capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        for p in (pdf_abs, png_abs):
            if os.path.exists(p):
                os.remove(p)
        if antes is None:
            os.remove(manifiesto_path)
        else:
            open(manifiesto_path, 'w', encoding='utf-8').write(antes)
        return error('la colección no valida con la pieza nueva; no se ha guardado nada:\n' + r.stdout.strip())
    print(f'OK {base}: {entrada["widthMm"]} × {entrada["heightMm"]} mm, {len(zonas)} zona(s) → {a.coleccion}')
    return 0


def error(msg):
    print(f'ERROR {msg}', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main())
