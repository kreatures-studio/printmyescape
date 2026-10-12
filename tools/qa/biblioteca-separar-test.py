#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prueba de las piezas separadas de El regalo robado (F2.3 de PLAN-CREADOR-2.md).

1. Volver a separar con biblioteca/arte/el-regalo-robado/separar/spec.json da las mismas piezas que hay en la
   colección (mismos píxeles a 60 ppp): las piezas se pueden rehacer desde el PDF del artista.
2. Ninguna pieza pegada sigue en la colección, y nada queda por reexportar.
Uso: python3 tools/qa/biblioteca-separar-test.py   (código 0 si todo pasa)
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys

import pymupdf

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
COL = os.path.join(ROOT, 'biblioteca', 'arte', 'el-regalo-robado')
TMP = os.path.join(ROOT, 'tools', 'qa', 'salida-qa', 'biblioteca-separar')
fallos = 0


def ok(nombre, cond, detalle=''):
    global fallos
    if not cond:
        fallos += 1
    print(f'{"OK  " if cond else "FALLO"} {nombre}{"" if cond or not detalle else " | " + detalle}')


def huella(pdf):
    return hashlib.md5(pymupdf.open(pdf)[0].get_pixmap(dpi=60, alpha=True).samples).hexdigest()


shutil.rmtree(TMP, ignore_errors=True)
spec = json.load(open(os.path.join(COL, 'separar', 'spec.json'), encoding='utf-8'))
r = subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'biblioteca', 'separar-piezas.py'),
                    os.path.join(ROOT, 'Final3-Clean.pdf'), os.path.join(COL, 'separar', 'spec.json'), TMP],
                   capture_output=True, text=True)
ok('separar-piezas.py rehace las piezas del spec', r.returncode == 0, r.stderr[-300:])
manifiesto = json.load(open(os.path.join(COL, 'manifest.json'), encoding='utf-8'))
ultima = {}
for p in manifiesto['pieces']:
    if p['id'] not in ultima or p['version'] > ultima[p['id']]['version']:
        ultima[p['id']] = p
for p in spec['piezas']:
    pieza = ultima.get(p['id'])
    if not pieza:
        ok(f'{p["id"]} está en la colección', False)
        continue
    iguales = huella(os.path.join(TMP, p['id'] + '.pdf')) == huella(os.path.join(COL, pieza['file']))
    ok(f'{p["id"]}: igual que la de la colección', iguales)
    ok(f'{p["id"]}: autor, licencia y páginas de origen',
       pieza['author'] == 'Kreatures' and pieza['license'] == 'propia-estudio' and pieza['origin'].get('pages') == p['paginas'])
sustituidas = {v for p in spec['piezas'] for v in p['sustituye']} - {p['id'] for p in spec['piezas']}
quedan = [i for i in sustituidas if i in ultima]
ok('ninguna pieza pegada sigue en la colección', not quedan, ', '.join(quedan))
ok('nada por reexportar', not [p for p in manifiesto['pieces'] if p.get('status') == 'reexportar'])
print(f'\nRESUMEN: {"todo OK" if not fallos else f"{fallos} FALLO(S)"}')
sys.exit(1 if fallos else 0)
