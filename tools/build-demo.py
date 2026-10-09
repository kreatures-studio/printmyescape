#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ensambla demo/index.html autocontenida (doble clic, sin servidor):
inserta pdf-lib + fontkit + motor (tools/pme-compose-core.js) + fuentes + fondo + plantilla + ejemplo.
Uso: python3 tools/build-demo.py [--tpl templates/final3] [--bg Final3-Clean.pdf]
"""
import argparse
import base64
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def b64(path):
    with open(path, 'rb') as f:
        return base64.b64encode(f.read()).decode('ascii')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tpl', default='templates/final3')
    ap.add_argument('--bg', default='Final3-Clean.pdf')
    ap.add_argument('--out', default='demo/index.html')
    args = ap.parse_args()

    tpldir = os.path.join(ROOT, args.tpl)
    with open(os.path.join(ROOT, 'demo', 'src.html'), encoding='utf-8') as f:
        html = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.min.js'), encoding='utf-8') as f:
        pdflib = f.read()
    with open(os.path.join(ROOT, 'tools', 'node_modules', '@pdf-lib', 'fontkit', 'dist', 'fontkit.umd.min.js'), encoding='utf-8') as f:
        fontkit = f.read()
    with open(os.path.join(ROOT, 'tools', 'pme-compose-core.js'), encoding='utf-8') as f:
        compose = f.read()
    with open(os.path.join(tpldir, 'template.json'), encoding='utf-8') as f:
        template = f.read()
    with open(os.path.join(tpldir, 'texts.json'), encoding='utf-8') as f:
        texts = f.read()
    i18n = {}
    for fn in sorted(os.listdir(tpldir)):
        if fn.startswith('i18n-') and fn.endswith('.json'):
            with open(os.path.join(tpldir, fn), encoding='utf-8') as f:
                i18n[fn[5:-5]] = json.load(f)
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
    data = {'template': json.loads(template), 'texts': json.loads(texts), 'i18n': i18n,
            'fonts': fonts, 'bg': b64(os.path.join(ROOT, args.bg)),
            'samplePhoto': b64(os.path.join(ROOT, 'assets', 'placeholder-retrato.jpg'))}
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
