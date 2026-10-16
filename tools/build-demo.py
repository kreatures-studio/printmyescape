#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ensambla demo/index.html autocontenida (doble clic, sin servidor):
inserta pdf-lib + fontkit + motor (tools/pme-compose-core.js) + fuentes + fondo + plantilla + ejemplo.
Uso: python3 tools/build-demo.py [--game games/final3] [--out demo/index.html] [--final]
El juego (game.json, pme-game/1 o /2) trae plantilla, textos, idiomas, fondo, ejemplos y fotos de muestra. Si sus
páginas son piezas de arte (juegos por piezas), las piezas que usa van dentro, sacadas de la biblioteca.
"""
import argparse
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def sample_photos(game, gdir):
    """Una foto de muestra por cada campo de foto: las del primer ejemplo del juego."""
    out = {}
    photos = game['examples'][0].get('photos', {})
    for f in game['template']['fields']:
        if f.get('type') != 'image' or f['id'] not in photos:
            continue
        out[f['id']] = b64(os.path.normpath(os.path.join(gdir, photos[f['id']])))
    return out


def piezas_de_arte(game):
    """Piezas de arte que usan las capas de las páginas: id → {kind, b64}, de la biblioteca (tools/biblioteca/indice.mjs)."""
    usadas = sorted({c['asset'] for p in game['template']['pages'] for c in (p.get('layers') or []) + (p.get('topLayers') or [])})
    if not usadas:
        return {}
    import subprocess
    js = ("import { arteCombinado } from './tools/biblioteca/indice.mjs';"
          "import { createRequire } from 'node:module';"
          "const { indicePiezas } = createRequire(import.meta.url)('./tools/game/kit.cjs');"
          "const piezas = indicePiezas(arteCombinado()); const out = {};"
          "for (const id of JSON.parse(process.argv[1])) { const p = piezas.get(id);"
          "  if (!p) { console.error('falta la pieza ' + id); process.exit(1); } out[id] = p.file; }"
          "console.log(JSON.stringify(out));")
    r = subprocess.run(['node', '--input-type=module', '-e', js, json.dumps(usadas)], capture_output=True, text=True, cwd=ROOT)
    if r.returncode != 0:
        raise SystemExit('piezas de arte: ' + r.stderr.strip())
    rutas = json.loads(r.stdout)
    return {i: {'kind': 'pdf' if f.lower().endswith('.pdf') else 'png', 'b64': b64(f)} for i, f in rutas.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', default='games/final3', help='carpeta del juego (game.json)')
    ap.add_argument('--out', default='demo/index.html')
    ap.add_argument('--final', action='store_true',
                    help='versión final: sin pantalla de control de demostración (DEMO_CONTROL = false)')
    args = ap.parse_args()

    gdir = os.path.join(ROOT, args.game)
    with open(os.path.join(gdir, 'game.json'), encoding='utf-8') as f:
        game = json.load(f)
    if game.get('schema') == 'pme-game/2':
        # F1.6: la demo se monta con la forma v1 equivalente (tools/game/a-v1.mjs), que es la que lee el motor.
        import subprocess
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'game', 'a-v1.mjs'), gdir],
                           capture_output=True, text=True, cwd=ROOT)
        if r.returncode != 0:
            raise SystemExit(f'no se pudo convertir el juego v2: {r.stderr.strip()}')
        game = json.loads(r.stdout)
    with open(os.path.join(ROOT, 'demo', 'src.html'), encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), encoding='utf-8') as f:
        pdflib = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', '@pdf-lib', 'fontkit', 'dist', 'fontkit.umd.min.js'), encoding='utf-8') as f:
        fontkit = f.read()
    with open(os.path.join(ROOT, 'tools', 'pme-compose-core.js'), encoding='utf-8') as f:
        compose = f.read()
    # Mecánicas (mechanics/*.js, salvo el índice de Node) van delante del motor: se registran en PMEMechanics.
    mech = ''
    mdir = os.path.join(ROOT, 'mechanics')
    for name in sorted(os.listdir(mdir)):
        if name.endswith('.js') and name != 'index.js':
            with open(os.path.join(mdir, name), encoding='utf-8') as f:
                mech += f.read() + '\n'
    compose = mech + compose
    fonts = {
        'runes': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'PigpenRunes.ttf')), 'subset': False},
        'caveatBold': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'Caveat-Bold.ttf')), 'subset': False},
        'caveat': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'Caveat-Regular.ttf')), 'subset': False},
        'anton': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'Anton-Regular.ttf')), 'subset': True},
        'opensans': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'OpenSans-Regular.ttf')), 'subset': True},
        'opensansBold': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'OpenSans-Bold.ttf')), 'subset': True},
        'courier': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'CourierPrime-Regular.ttf')), 'subset': True},
        'courierBold': {'b64': b64(os.path.join(ROOT, 'assets', 'fonts', 'CourierPrime-Bold.ttf')), 'subset': True},
    }
    if game.get('schema') != 'pme-game/1':
        raise SystemExit('%s: no es un juego pme-game/1' % args.game)
    kind = game['background'].get('kind')
    if kind not in ('pdf', 'layers'):
        raise SystemExit('%s: el fondo debe ser un PDF o páginas con piezas de arte (layers)' % args.game)
    data = {'game': game, 'template': game['template'], 'texts': game['texts'], 'i18n': game['i18n'],
            'fonts': fonts, 'samplePhotos': sample_photos(game, gdir)}
    if kind == 'pdf':
        data['bg'] = b64(os.path.normpath(os.path.join(gdir, game['background']['file'])))
    # Juegos por piezas (v2): las piezas de arte que usan sus páginas, de la biblioteca, y los PDF de fondo por página.
    data['assets'] = piezas_de_arte(game)
    bg_files = sorted({p['bgFile'] for p in game['template']['pages'] if p.get('bgFile')})
    data['bgFiles'] = {f: b64(os.path.normpath(os.path.join(gdir, f))) for f in bg_files}
    if 'var DEMO_CONTROL = true;' not in html:
        raise SystemExit('demo/src.html: no encuentro "var DEMO_CONTROL = true;"')
    html = html.replace('var DEMO_CONTROL = true;',
                        'var DEMO_CONTROL = %s;' % ('false' if args.final else 'true'))
    html = html.replace('/*__PDFLIB__*/', pdflib)
    html = html.replace('/*__FONTKIT__*/', fontkit)
    html = html.replace('/*__COMPOSE__*/', compose)
    html = html.replace('/*__DATA__*/', 'var PME_DEMO_DATA=' + json.dumps(data) + ';')
    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('OK %s (%.1f MB)' % (args.out, os.path.getsize(out) / 1024 / 1024))


if __name__ == '__main__':
    main()
