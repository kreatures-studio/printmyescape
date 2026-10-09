"""Genera assets/fonts/PigpenRunes.ttf: cifrado pigpen de la página 10.

Misma geometría que tools/compose.js (PIG_WALLS / PIG_CELLS / PIG_X):
  A-I   celda 3x3 con paredes (L, R, T, B) de la subcelda
  J-R   igual que A-I con punto en el centro de la subcelda
  S-V   aspas (medias diagonales) desde los vértices al centro
  W-Z   aspas con punto central
Coordenadas de la fuente: UPM 1000, eje Y hacia arriba.
"""
import math
import os
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'assets', 'fonts', 'PigpenRunes.ttf')

UPM = 1000
ADV = 1700          # avance por runa (~1,7 em, como el original)
T = 50              # grosor de trazo
DOT_R = 80          # radio del punto
Q = 1 / 3

WALLS = {'A': 'RB', 'B': 'LRB', 'C': 'LB', 'D': 'TRB', 'E': 'LRTB', 'F': 'TLB', 'G': 'TR', 'H': 'TLR', 'I': 'TL'}
CELLS = {'A': (0, 0), 'B': (1, 0), 'C': (2, 0), 'D': (0, 1), 'E': (1, 1), 'F': (2, 1), 'G': (0, 2), 'H': (1, 2), 'I': (2, 2)}
XS = {
    'S': [((0, 0), (0.5, 0.5)), ((1, 0), (0.5, 0.5))],
    'T': [((0, 0), (0.5, 0.5)), ((0, 1), (0.5, 0.5))],
    'U': [((1, 0), (0.5, 0.5)), ((1, 1), (0.5, 0.5))],
    'V': [((0, 1), (0.5, 0.5)), ((1, 1), (0.5, 0.5))],
}


def segments_and_dots(ch):
    """Devuelve (segmentos, puntos) en coordenadas de caja 0..1 con Y hacia abajo (como compose.js)."""
    segs, dots = [], []
    if ch in WALLS or ch in 'JKLMNOPQR':
        base = ch if ch in WALLS else 'ABCDEFGHI'['JKLMNOPQR'.index(ch)]
        # cada letra es la celda entera: paredes en los bordes (no subcelda)
        w = WALLS[base]
        if 'L' in w: segs.append(((0, 0), (0, 1)))
        if 'R' in w: segs.append(((1, 0), (1, 1)))
        if 'T' in w: segs.append(((0, 0), (1, 0)))
        if 'B' in w: segs.append(((0, 1), (1, 1)))
        if ch in 'JKLMNOPQR':
            dots.append((0.5, 0.5))
    elif ch in XS:
        segs.extend(XS[ch])
    elif ch in 'WXYZ':
        segs.extend(XS['STUV'['WXYZ'.index(ch)]])
        dots.append((0.5, 0.5))
    return segs, dots


def to_font(p):
    """(x, y_abajo) en 0..1 -> (X, Y) en unidades de fuente."""
    return (p[0] * UPM, (1 - p[1]) * UPM)


def ccw(poly):
    area = 0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        area += x1 * y2 - x2 * y1
    return poly if area > 0 else list(reversed(poly))


def rect_for(p, q):
    (x1, y1), (x2, y2) = to_font(p), to_font(q)
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    h = T / 2
    # extensión de h en cada extremo: sin muescas en las esquinas
    ax, ay = x1 - ux * h, y1 - uy * h
    bx, by = x2 + ux * h, y2 + uy * h
    return ccw([(ax + nx * h, ay + ny * h), (bx + nx * h, by + ny * h),
                (bx - nx * h, by - ny * h), (ax - nx * h, ay - ny * h)])


def circle_for(p, n=24):
    cx, cy = to_font(p)
    return ccw([(cx + DOT_R * math.cos(2 * math.pi * i / n), cy + DOT_R * math.sin(2 * math.pi * i / n))
                for i in range(n)])


def glyph_for(ch):
    pen = TTGlyphPen(None)
    segs, dots = segments_and_dots(ch)
    for p, q in segs:
        poly = rect_for(p, q)
        pen.moveTo(poly[0]); [pen.lineTo(pt) for pt in poly[1:]]; pen.closePath()
    for d in dots:
        poly = circle_for(d)
        pen.moveTo(poly[0]); [pen.lineTo(pt) for pt in poly[1:]]; pen.closePath()
    return pen.glyph()


def build():
    letters = [chr(ord('A') + i) for i in range(26)]
    order = ['.notdef', 'space'] + letters
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {ord(' '): 'space'}
    for L in letters:
        cmap[ord(L)] = L
        cmap[ord(L.lower())] = L
    fb.setupCharacterMap(cmap)
    glyphs = {'.notdef': TTGlyphPen(None).glyph(), 'space': TTGlyphPen(None).glyph()}
    for L in letters:
        glyphs[L] = glyph_for(L)
    fb.setupGlyf(glyphs)
    metrics = {'.notdef': (ADV, 0), 'space': (700, 0)}
    metrics.update({L: (ADV, 0) for L in letters})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=800, descent=-200)
    fb.setupNameTable({'familyName': 'PigpenRunes', 'styleName': 'Regular',
                       'uniqueFontIdentifier': 'PigpenRunes-Regular', 'fullName': 'PigpenRunes Regular',
                       'psName': 'PigpenRunes-Regular', 'version': 'Version 1.000'})
    fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, sTypoLineGap=0,
                usWinAscent=800, usWinDescent=200)
    fb.setupPost()
    fb.save(OUT)
    print('ok', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    build()
