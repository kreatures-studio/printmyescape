#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Limpia TTF para incrustar en PDF: quita tablas de layout variable
(GPOS/GSUB aplicados por algunos visores rompen el render) y fija
los nombres (el instancer los deja mal: 'Nunito-ExtraLight', etc.).
Uso: python3 tools/cleanfonts.py
"""
import os
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONTS = [
    ('Caveat-Bold.ttf', 'Caveat', 'Bold'),
    ('Nunito-Regular.ttf', 'Nunito', 'Regular'),
    ('Nunito-Bold.ttf', 'Nunito', 'Bold'),
    ('Nunito-ExtraBold.ttf', 'Nunito', 'ExtraBold'),
]
DROP = ('GSUB', 'GPOS', 'GDEF', 'STAT', 'HVAR', 'MVAR', 'VVAR', 'avar', 'fvar', 'gvar', 'cvar')


def set_name(font, nid, text):
    for rec in font['name'].names:
        if rec.nameID == nid:
            rec.string = text.encode(rec.getEncoding())
    font['name'].setName(text, nid, 3, 1, 0x409)
    font['name'].setName(text, nid, 1, 0, 0)


for fn, fam, sub in FONTS:
    p = os.path.join(ROOT, 'assets', 'fonts', fn)
    f = TTFont(p)
    for t in DROP:
        if t in f:
            del f[t]
    ps = '%s-%s' % (fam.replace(' ', ''), sub.replace(' ', ''))
    set_name(f, 1, fam)
    set_name(f, 2, sub if sub in ('Regular', 'Bold', 'Italic') else 'Regular')
    set_name(f, 4, '%s %s' % (fam, sub))
    set_name(f, 6, ps)
    set_name(f, 16, fam)
    set_name(f, 17, sub)
    f.save(p)
    print('ok', fn, '->', ps, '| tablas:', sorted(f.keys()))
