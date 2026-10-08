#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera el PDF de fondo limpio a partir del PDF con textos:
borra textos y marcos de foto por redacción SIN relleno (el dibujo
de debajo queda intacto). Vectores e imágenes se conservan.
Uso: python3 tools/make-clean.py --src FinalLayout.pdf --out FinalLayout-Clean.pdf
"""
import argparse
import fitz
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def frame_rects(page):
    out = []
    for dr in page.get_drawings():
        col = dr.get('color')
        if not col or len(col) != 3:
            continue
        r, g, b = col
        area = dr['rect'].width * dr['rect'].height
        if r > 0.5 and b > 0.5 and g < 0.45 and area > 2000:
            out.append(dr['rect'])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default='PrintMyScape_FinalLayout.pdf')
    ap.add_argument('--out', default='FinalLayout-Clean.pdf')
    args = ap.parse_args()
    doc = fitz.open(os.path.join(ROOT, args.src))
    for pi, page in enumerate(doc):
        words = page.get_text('words')
        imgs = page.get_images()
        if imgs:
            irects = []
            for img in imgs:
                try:
                    irects += page.get_image_rects(img)
                except Exception:
                    pass
            touched = 0
            for w in words:
                wr = fitz.Rect(w[:4])
                if any(wr.intersects(ir) for ir in irects):
                    touched += 1
            print('p%d: %d imágenes, %d palabras sobre imagen' % (pi + 1, len(imgs), touched))
        n = 0
        for w in words:
            if not w[4].strip():
                continue
            r = fitz.Rect(w[:4])
            r.x0 -= 0.5; r.y0 -= 0.5; r.x1 += 0.5; r.y1 += 0.5
            page.add_redact_annot(r, fill=False)
            n += 1
        for r in frame_rects(page):
            page.add_redact_annot(r + (-1, -1, 1, 1), fill=False)
            n += 1
        page.apply_redactions(images=fitz.PDF_REDACT_IMAGE_NONE,
                              graphics=fitz.PDF_REDACT_LINE_ART_NONE)
        print('p%d: %d redacciones' % (pi + 1, n))
    doc.save(os.path.join(ROOT, args.out), garbage=4, deflate=True)
    print('OK', args.out)


if __name__ == '__main__':
    main()
