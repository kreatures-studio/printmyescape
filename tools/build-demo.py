#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ensambla demo/index.html autocontenida (doble clic, sin servidor):
inserta pdf-lib + fontkit + motor (tools/pme-compose-core.js) + fuentes + fondo + plantilla + ejemplo.
Uso: python3 tools/build-demo.py [--game games/final3] [--out demo/index.html] [--final]
El juego (game.json, pme-game/1) trae plantilla, textos, idiomas, fondo, ejemplos y fotos de muestra.
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
    with open(os.path.join(ROOT, 'demo', 'src.html'), encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), encoding='utf-8') as f:
        pdflib = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', '@pdf-lib', 'fontkit', 'dist', 'fontkit.umd.min.js'), encoding='utf-8') as f:
        fontkit = f.read()
    with open(os.path.join(ROOT, 'tools', 'pme-compose-core.js'), encoding='utf-8') as f:
        compose = f.read()
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
    if game['background'].get('kind') != 'pdf':
        raise SystemExit('%s: el fondo debe ser un PDF' % args.game)
    data = {'game': game, 'template': game['template'], 'texts': game['texts'], 'i18n': game['i18n'],
            'fonts': fonts, 'bg': b64(os.path.normpath(os.path.join(gdir, game['background']['file']))),
            'samplePhotos': sample_photos(game, gdir)}
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
