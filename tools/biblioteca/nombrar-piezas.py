#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Aplica los nombres y etiquetas a las piezas recuperadas (segundo paso tras extraer-piezas.py).

Uso:
  python3 tools/biblioteca/nombrar-piezas.py <carpeta-candidatas> <nombres.csv> <carpeta-destino> [--autor "..."]

nombres.csv: id, fichero, nombre, categoria, etiquetas, estado (ok | reexportar | descartar), notas.
Salida en <carpeta-destino>:
  piezas/<fichero>-v1.pdf y .png    (las descartadas no se copian)
  piezas.csv                        la hoja de piezas de la guía de artistas, con estado y notas
  manifest.json                     borrador del manifiesto de la biblioteca (formato de la fase 2)
  revisar.jpg                       hoja de contacto con los nombres, primero las que hay que reexportar
"""
import argparse
import csv
import json
import os
import re
import shutil
import sys

from PIL import Image, ImageDraw

CATEGORIAS = {'fondo', 'marco', 'papel', 'dispositivo', 'objeto', 'icono', 'decoracion', 'ilustracion', 'puzzle'}
ESTADOS = {'ok', 'reexportar', 'descartar'}
RE_FICHERO = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def comprobar(fila):
    errores = []
    if fila['estado'] not in ESTADOS:
        errores.append(f"estado «{fila['estado']}»")
    if fila['estado'] != 'descartar':
        if fila['categoria'] not in CATEGORIAS:
            errores.append(f"categoría «{fila['categoria']}»")
        if not RE_FICHERO.match(fila['fichero']) or not fila['fichero'].startswith(fila['categoria'] + '-'):
            errores.append(f"fichero «{fila['fichero']}» (minúsculas, guiones, empieza por la categoría)")
        n = len([e for e in fila['etiquetas'].split(',') if e.strip()])
        if not 3 <= n <= 6:
            errores.append(f'{n} etiquetas (de 3 a 6)')
    return errores


def hoja(filas, destino):
    T, cols = 200, 6
    orden = sorted(filas, key=lambda f: (f['estado'] != 'reexportar', f['fichero']))
    filas_hoja = (len(orden) + cols - 1) // cols
    sh = Image.new('RGB', (cols * T, filas_hoja * (T + 30)), 'white')
    dr = ImageDraw.Draw(sh)
    for i, f in enumerate(orden):
        im = Image.open(os.path.join(destino, 'piezas', f['archivo'] + '.png')).convert('RGBA')
        im.thumbnail((T - 12, T - 12))
        fondo = (232, 205, 205, 255) if f['estado'] == 'reexportar' else (210, 210, 210, 255)
        bg = Image.new('RGBA', (T - 6, T - 6), fondo)
        bg.alpha_composite(im, ((T - 6 - im.width) // 2, (T - 6 - im.height) // 2))
        x, y = (i % cols) * T, (i // cols) * (T + 30)
        sh.paste(bg.convert('RGB'), (x, y))
        dr.text((x + 3, y + T - 2), f['fichero'][:34], fill='black')
        dr.text((x + 3, y + T + 11), f['estado'], fill=(140, 30, 30) if f['estado'] == 'reexportar' else (40, 90, 60))
    sh.save(os.path.join(destino, 'revisar.jpg'), quality=82)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('candidatas')
    ap.add_argument('nombres')
    ap.add_argument('destino')
    ap.add_argument('--autor', default='Kreatures')
    a = ap.parse_args()
    cand = {c['id']: c for c in json.load(open(os.path.join(a.candidatas, 'candidatas.json'), encoding='utf-8'))}
    filas = list(csv.DictReader(open(a.nombres, encoding='utf-8')))
    errores = []
    for f in filas:
        if f['id'] not in cand:
            errores.append(f"{f['id']}: no está entre las candidatas")
        errores += [f"{f['id']}: {e}" for e in comprobar(f)]
    falta = set(cand) - {f['id'] for f in filas}
    errores += [f'{i}: sin fila en la hoja de nombres' for i in sorted(falta)]
    repes = {f['fichero'] for f in filas if [g['fichero'] for g in filas].count(f['fichero']) > 1}
    errores += [f'fichero repetido: {r}' for r in sorted(repes)]
    if errores:
        print('ERROR\n  ' + '\n  '.join(errores), file=sys.stderr)
        return 1

    dir_piezas = os.path.join(a.destino, 'piezas')
    shutil.rmtree(dir_piezas, ignore_errors=True)
    os.makedirs(dir_piezas)
    usadas, manifiesto = [], []
    for f in filas:
        if f['estado'] == 'descartar':
            continue
        c = cand[f['id']]
        f['archivo'] = f['fichero'] + '-v1'
        for ext in ('.pdf', '.png'):
            shutil.copyfile(os.path.join(a.candidatas, f['id'] + ext), os.path.join(dir_piezas, f['archivo'] + ext))
        etiquetas = [e.strip() for e in f['etiquetas'].split(',') if e.strip()]
        manifiesto.append({
            'id': f['fichero'], 'version': 1, 'file': f"piezas/{f['archivo']}.pdf", 'thumb': f"piezas/{f['archivo']}.png",
            'name': f['nombre'], 'category': f['categoria'], 'tags': etiquetas,
            'widthMm': c['widthMm'], 'heightMm': c['heightMm'], 'zones': c['zonas'],
            'license': 'propia-estudio', 'author': a.autor, 'origin': {'game': c['juego'], 'pages': c['paginas']},
            'status': f['estado'], 'notes': f['notas'],
        })
        usadas.append(f)
    with open(os.path.join(a.destino, 'manifest.json'), 'w', encoding='utf-8') as fh:
        json.dump({'pieces': manifiesto}, fh, indent=2, ensure_ascii=False)
        fh.write('\n')
    with open(os.path.join(a.destino, 'piezas.csv'), 'w', encoding='utf-8', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['fichero', 'nombre', 'categoría', 'etiquetas', 'autor', 'juego de origen', 'licencia', 'estado', 'notas'])
        for f in usadas:
            w.writerow([f['archivo'] + '.pdf', f['nombre'], f['categoria'], f['etiquetas'], a.autor,
                        cand[f['id']]['juego'], 'Propia del estudio', f['estado'], f['notas']])
    hoja(usadas, a.destino)
    ok = sum(1 for f in usadas if f['estado'] == 'ok')
    print(f'OK {len(usadas)} piezas ({ok} listas, {len(usadas) - ok} para reexportar), '
          f'{len(filas) - len(usadas)} descartadas → {a.destino}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
