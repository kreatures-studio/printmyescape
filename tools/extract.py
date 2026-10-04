#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fase 1 — Extrae del PDF del artista (texto vivo) el mapa de cajas:
  - texts.json .... textos fijos con bbox/estilo (base para i18n)
  - template.json . campos [CODIGO] + marcos de foto como slots
  - fondos PNG .... render del PDF de fondo limpio (studio/preview)
  - verify.html ... visor de verificación con cajas numeradas (autocontenido)

Uso:  python3 tools/extract.py [--fonts DIR]
  --fonts DIR: carpeta con TTF para medir el ancho natural y calcular
  el xscale (condensación horizontal aplicada en Illustrator).
  Sin --fonts, xscale se omite (el compositor asume 1.0).
Lee:  juego-con-textos.pdf + juego-fondo.pdf (raíz del repo)
Escribe: templates/recurso-1/*, assets/pages/recurso-1-*.png, tools/verify-recurso-1.html
"""
import argparse
import fitz
import json
import os
import re
import unicodedata

try:
    from fontTools.ttLib import TTFont
    HAS_FT = True
except ImportError:
    HAS_FT = False

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def parse_args():
    ap = argparse.ArgumentParser(description='Extrae cajas del PDF del artista')
    ap.add_argument('--doc', default='recurso-1', help='id del documento (carpeta en templates/)')
    ap.add_argument('--name', default=None, help='nombre legible (por defecto, el id)')
    ap.add_argument('--src-text', default='juego-con-textos.pdf', help='PDF con textos (relativo a la raíz)')
    ap.add_argument('--src-bg', default='juego-fondo.pdf', help='PDF de fondo limpio (relativo a la raíz)')
    ap.add_argument('--fonts', default=None, help='carpeta con TTF para medir xscale')
    return ap.parse_args()

CODE_RE = re.compile(r'\[([A-Za-z0-9_]+)\]')


def slugify(s, n=6):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode('ascii')
    s = re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
    return (s or 'texto')[:40]


def basefont(name):
    return name.split('+')[-1]


def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())


FONTS_IDX = []


def index_fonts(d):
    FONTS_IDX.clear()
    if not (HAS_FT and d and os.path.isdir(d)):
        return
    for fn in sorted(os.listdir(d)):
        if not fn.lower().endswith('.ttf'):
            continue
        try:
            f = TTFont(os.path.join(d, fn))
            fam = f['name'].getDebugName(16) or f['name'].getDebugName(1) or ''
            sub = f['name'].getDebugName(17) or f['name'].getDebugName(2) or ''
            FONTS_IDX.append({'file': os.path.join(d, fn), 'fam': norm(fam), 'sub': norm(sub)})
        except Exception:
            pass


def find_font(spanfam):
    parts = re.split(r'[-_]', spanfam)
    tok = norm(parts[0])
    sub = norm(' '.join(parts[1:])) or 'regular'
    best, best_score = None, -1
    for e in FONTS_IDX:
        if not (tok and tok in e['fam']):
            continue
        score = 10 - min(len(e['fam']) - len(tok), 5)
        esub = e['sub'] or 'regular'
        if sub == esub:
            score += 5
        elif sub in esub or esub in sub:
            score += 2
        if score > best_score:
            best, best_score = e, score
    return best['file'] if best else None


NW_CACHE = {}


def natural_width(ttf, text, size):
    key = (ttf, text)
    if key not in NW_CACHE:
        f = TTFont(ttf)
        cmap, hmtx, upm = f.getBestCmap(), f['hmtx'], f['head'].unitsPerEm
        NW_CACHE[key] = sum(hmtx[cmap[ord(c)]][0] for c in text if ord(c) in cmap) / upm
    return NW_CACHE[key] * size


def pct(v, total):
    return round(v / total * 100, 2)


def line_angle(line):
    import math
    dx, dy = line['dir'][0], line['dir'][1]
    a = -math.degrees(math.atan2(dy, dx))
    a = ((a + 180) % 360) - 180
    return round(a, 1) if abs(a) >= 0.5 else 0


def xscale_of(span, text, width_pt):
    fp = find_font(span['font'])
    if fp and text.strip():
        nat = natural_width(fp, text, span['size'])
        if nat > 0:
            return round(width_pt / nat, 2)
    return None


def norm_code(inner):
    code = re.sub(r'\s+', '_', inner.strip())
    code = re.sub(r'_+', '_', code).strip('_')
    code = re.sub(r'^[^A-Za-z0-9]+|[^A-Za-z0-9]+$', '', code)
    return code


def merge_fixed(fixed, slots):
    """Fusiona cajas consecutivas de misma página/estilo en párrafos.
    - Texto horizontal: adyacentes en vertical, solapadas en horizontal,
      sin fila de hueco entre medias; se unen con salto de línea y se
      conservan las líneas originales (dibujo posicional).
    - Texto inclinado: proximidad en su propio marco rotado (misma
      inclinación ±12°); se unen con espacio para refluir.
    NO fusiona cajas de una palabra (chips, números)."""
    import math
    slot_rows = [(s['page'], s['y'] + s['h'] / 2) for s in slots or []]
    out = []
    for f in fixed:
        merged = False
        if (out and out[-1]['page'] == f['page']
                and out[-1]['fontFamily'] == f['fontFamily']
                and out[-1]['size'] == f['size']
                and out[-1]['color'] == f['color']
                and abs((out[-1]['angle'] or 0) - (f['angle'] or 0)) < 12
                and (len(out[-1]['es'].split()) > 1 or abs(out[-1]['angle'] or 0) > 15)
                and (len(f['es'].split()) > 1 or abs(f['angle'] or 0) > 15):
            p = out[-1]
            ang = p['angle'] or 0
            if abs(ang) > 15:
                # marco rotado: proximidad perpendicular + hueco paralelo.
                # OJO: las coords % usan y hacia abajo; la dirección de
                # lectura en ese sistema es (cos, -sin) del ángulo CCW.
                import math as _m
                th = _m.radians(ang)
                dx, dy = _m.cos(th), -_m.sin(th)
                ux, uy = _m.sin(th), _m.cos(th)
                # OJO: coordenadas % con y hacia abajo; el ángulo de
                # extracción ya es compatible con pdf-lib (CCW en y-up).
                # Para proximidad basta la geometría relativa:
                c1 = (p['x'] + p['w'] / 2, p['y'] + p['h'] / 2)
                c2 = (f['x'] + f['w'] / 2, f['y'] + f['h'] / 2)
                vx, vy = c2[0] - c1[0], c2[1] - c1[1]
                du = abs(vx * ux + vy * uy)
                dp = vx * dx + vy * dy - (p['w'] * abs(dx) + p['h'] * abs(dy)
                                          + f['w'] * abs(dx) + f['h'] * abs(dy)) / 2
                sizepct = p['size']
                if du < sizepct * 2.5 and -sizepct < dp < sizepct * 3:
                    p['es'] += ' ' + f['es']
                    x0 = min(p['x'], f['x']); y0 = min(p['y'], f['y'])
                    x1 = max(p['x'] + p['w'], f['x'] + f['w'])
                    y1 = max(p['y'] + p['h'], f['y'] + f['h'])
                    p['x'], p['y'], p['w'], p['h'] = x0, y0, x1 - x0, y1 - y0
                    p.pop('lines', None)
                    merged = True
            else:
                gap = f['y'] - (p['y'] + p['h'])
                ox0, ox1 = max(p['x'], f['x']), min(p['x'] + p['w'], f['x'] + f['w'])
                overlap = (ox1 - ox0) / max(min(p['w'], f['w']), 0.01)
                sizept = p['size'] / 100 * 595
                gaplim = sizept / 595 * 100 * 1.6
                blocked = any(pg == f['page'] and (p['y'] + p['h']) < sy < f['y']
                              for pg, sy in slot_rows)
                if not blocked and -0.5 <= gap <= gaplim and overlap > 0.4:
                    p['es'] += '\n' + f['es']
                    p['lines'] = (p.get('lines') or []) + (f.get('lines') or [])
                    x0 = min(p['x'], f['x']); y0 = min(p['y'], f['y'])
                    x1 = max(p['x'] + p['w'], f['x'] + f['w'])
                    y1 = max(p['y'] + p['h'], f['y'] + f['h'])
                    p['x'], p['y'], p['w'], p['h'] = x0, y0, x1 - x0, y1 - y0
                    merged = True
        if not merged:
            out.append(f)
    # re-clavar claves únicas tras fusionar (misma clave solo si mismo texto)
    seen = {}
    for f in out:
        base = slugify(f['es'].replace('\n', ' '))
        key = base
        n = 1
        while key in seen and seen[key] != f['es']:
            n += 1
            key = '%s-%d' % (base, n)
        seen[key] = f['es']
        f['key'] = key
    return out


def span_at(spans, cx, cy):
    for s in spans:
        x0, y0, x1, y1 = s['bbox']
        if x0 - 1 <= cx <= x1 + 1 and y0 - 2 <= cy <= y1 + 2:
            return s
    return None


def extract_texts(doc):
    """Cajas fijas y huecos [CODIGO] con geometría exacta por palabras.
    Soporta códigos multilínea, texto rotado (angle) y estilos por tramo.
    Líneas adyacentes del mismo estilo y solapadas se fusionan en una caja."""
    import math
    fixed, slots = [], []
    key_count = {}
    for pi, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        dd = page.get_text('dict')
        words = page.get_text('words')
        span_by_bl = {}
        all_spans = []
        for bi, b in enumerate(dd['blocks']):
            if b['type'] != 0:
                continue
            for li, line in enumerate(b['lines']):
                span_by_bl[(bi, li)] = (line, line['spans'])
                all_spans.extend(line['spans'])
        lines = {}
        for w in words:
            if not w[4].strip():
                continue
            lines.setdefault((w[5], w[6]), []).append(w)
        # Quitar copias sombra en TODA la página (mismo texto superpuesto:
        # negritas duplicadas, incluso entre bloques) y glifos dobles
        # ('22' estrecho -> '2')
        allw = []
        for lk in sorted(lines):
            allw.extend(sorted(lines[lk], key=lambda w: w[7]))
        kept = []
        for w in allw:
            t = w[4]
            ww, hh = w[2] - w[0], max(w[3] - w[1], 1)
            if len(t) >= 2 and len(set(t)) == 1 and ww / hh < 0.75:
                w = (w[0], w[1], w[0] + ww / len(t), w[3], t[0], w[5], w[6], w[7])
                t = w[4]
            cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
            h = max(w[3] - w[1], 1)
            if any(o[4] == t and abs((o[0] + o[2]) / 2 - cx) < 0.4 * h
                   and abs((o[1] + o[3]) / 2 - cy) < 0.4 * h for o in kept):
                continue
            kept.append(w)
        lines = {}
        for w in kept:
            lines.setdefault((w[5], w[6]), []).append(w)
        # Ensamblar líneas con corchete sin cerrar (códigos multilínea)
        order = sorted(lines)
        asm = []
        buf = None
        for key in order:
            ws = sorted(lines[key], key=lambda w: w[7])
            if buf is not None:
                ws = buf + ws
                key = buf_key
                buf = None
            joined = ' '.join(w[4] for w in ws)
            tail = joined.split('[')[-1]
            if '[' in joined and ']' not in tail:
                # Solo se arrastra el tramo sin cerrar; lo ya cerrado se procesa
                cut = next((i for i, w in enumerate(ws) if '[' in w[4]), 0)
                if cut:
                    asm.append((key, ws[:cut]))
                buf, buf_key = ws[cut:], key
                continue
            asm.append((key, ws))
        if buf is not None:
            asm.append((buf_key, buf))
        for (bi, li), ws in asm:
            ws = sorted(ws, key=lambda w: (w[1], w[7]))
            entry = span_by_bl.get((bi, li))
            if entry:
                line, spans = entry
                angle = line_angle(line)
            else:
                # Sin correspondencia bloque/línea (texto vertical): estilos
                # por búsqueda global y ángulo por geometría de lectura.
                spans = all_spans
                xs = [w[0] for w in ws]; ys = [w[1] for w in ws]
                bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
                if bh > bw * 2:
                    angle = -90 if ys == sorted(ys) else 90
                else:
                    angle = 0
                line = None
            joined = ' '.join(w[4] for w in ws)
            # localizar códigos en el texto unido
            matches = []
            for m in re.finditer(r'\[([^\[\]]+?)\]', joined):
                field = norm_code(m.group(1))
                if field:
                    matches.append((m.start(), m.end(), field))
            # cursor de caracteres -> palabras cubiertas
            pos, wi = 0, []
            for idx, w in enumerate(ws):
                wi.append((pos, pos + len(w[4])))
                pos += len(w[4]) + 1
            used = set()
            for (a, b_, field) in matches:
                cov = [ws[i] for i, (s0, s1) in enumerate(wi) if s0 < b_ and s1 > a]
                if not cov:
                    continue
                used.update(id(w) for w in cov)
                x0 = min(w[0] for w in cov); y0 = min(w[1] for w in cov)
                x1 = max(w[2] for w in cov); y1 = max(w[3] for w in cov)
                st = span_at(spans, (x0 + x1) / 2, (y0 + y1) / 2) or spans[0]
                xs = xscale_of(st, joined[a:b_], x1 - x0)
                slots.append({
                    'page': pi + 1, 'field': field,
                    'x': pct(x0, W), 'y': pct(y0, H),
                    'w': pct(x1 - x0, W), 'h': pct(y1 - y0, H),
                    'fontFamily': basefont(st['font']),
                    'size': round(st['size'] / W * 100, 2),
                    'color': '#%06X' % (st['color'] & 0xFFFFFF),
                    'xscale': xs, 'angle': angle,
                })
            # tramos fijos (palabras no usadas), partidos por estilo
            run, runstyle = [], None
            def flush():
                if not run:
                    return
                txt = ' '.join(w[4] for w in run)
                if not txt.strip():
                    return
                x0 = min(w[0] for w in run); y0 = min(w[1] for w in run)
                x1 = max(w[2] for w in run); y1 = max(w[3] for w in run)
                st = span_at(spans, (x0 + x1) / 2, (y0 + y1) / 2) or spans[0]
                key = slugify(txt)
                key_count[key] = key_count.get(key, 0) + 1
                xs = xscale_of(st, txt, x1 - x0)
                fixed.append({
                    'page': pi + 1,
                    'key': key + ('' if key_count[key] == 1 else '-' + str(key_count[key])),
                    'es': txt,
                    'x': pct(x0, W), 'y': pct(y0, H),
                    'w': pct(x1 - x0, W), 'h': pct(y1 - y0, H),
                    'fontFamily': basefont(st['font']),
                    'size': round(st['size'] / W * 100, 2),
                    'color': '#%06X' % (st['color'] & 0xFFFFFF),
                    'xscale': xs, 'angle': angle,
                })
            for w in ws:
                if id(w) in used:
                    flush(); run, runstyle = [], None
                    continue
                st = span_at(spans, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2)
                style = (st['font'], round(st['size'], 1), st['color']) if st else None
                if run and style != runstyle:
                    flush(); run, runstyle = [], None
                run.append(w); runstyle = style
            flush()
    return merge_fixed(fixed, slots), slots


def extract_frames(doc):
    """Marcos de foto: rectángulos con trazo magenta/morado (tolerante).
    Mide la inclinación visual del marco (tilt) desde sus segmentos."""
    import math
    frames = []
    for pi, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        for dr in page.get_drawings():
            col = dr.get('color')
            if not col or len(col) != 3:
                continue
            r, g, b = col
            area = dr['rect'].width * dr['rect'].height
            if not (r > 0.5 and b > 0.5 and g < 0.45 and area > 2000):
                continue
            tilt = 0
            for it in dr.get('items', []):
                if it[0] == 'qu':
                    q = it[1]
                    pts = [q.ul, q.ur, q.lr, q.ll]
                    best = None
                    for k in range(4):
                        p0, p1 = pts[k], pts[(k + 1) % 4]
                        a = math.degrees(math.atan2(p1.y - p0.y, p1.x - p0.x))
                        while a > 90:
                            a -= 180
                        while a <= -90:
                            a += 180
                        if best is None or abs(a) < abs(best):
                            best = a
                    if best is not None and abs(best) >= 0.5:
                        tilt = round(best, 1)
            frames.append({
                'page': pi + 1,
                'stroke': [round(r, 3), round(g, 3), round(b, 3)],
                'x': pct(dr['rect'].x0, W), 'y': pct(dr['rect'].y0, H),
                'w': pct(dr['rect'].width, W), 'h': pct(dr['rect'].height, H),
                'tilt': tilt,
            })
    frames.sort(key=lambda f: (f['page'], f['y'], f['x']))
    return frames


def dedup_slots(slots):
    """Fusiona slots del mismo campo/página casi superpuestos
    (copias sombra del artista): distancia de centros < 2% -> unión."""
    out = []
    for s in slots:
        cx, cy = s['x'] + s['w'] / 2, s['y'] + s['h'] / 2
        twin = None
        for o in out:
            if o['page'] == s['page'] and o['field'] == s['field']:
                ox, oy = o['x'] + o['w'] / 2, o['y'] + o['h'] / 2
                if abs(ox - cx) < 2 and abs(oy - cy) < 2:
                    twin = o
                    break
        if twin:
            x0 = min(twin['x'], s['x']); y0 = min(twin['y'], s['y'])
            x1 = max(twin['x'] + twin['w'], s['x'] + s['w'])
            y1 = max(twin['y'] + twin['h'], s['y'] + s['h'])
            twin.update(x=x0, y=y0, w=x1 - x0, h=y1 - y0)
        else:
            out.append(s)
    return out


def remap_resp(slots):
    """RESP_PERSONALIZADA_k se reutilizan por página para distintos
    sospechosos: se reasignan por parejas (orden vertical) a
    S{N}_HIDE{A,B} según los NOMBRE_N de la página. Devuelve log."""
    import re
    log = []
    by_page = {}
    for s in slots:
        by_page.setdefault(s['page'], []).append(s)
    for pg, ss in sorted(by_page.items()):
        names = sorted(set(re.match(r'NOMBRE_(\d+)$', s['field']).group(1)
                           for s in ss if re.match(r'NOMBRE_(\d+)$', s['field'] or '')),
                       key=int)
        resps = sorted([s for s in ss if (s['field'] or '').startswith('RESP_PERSONALIZADA_')],
                       key=lambda s: s['y'])
        if not resps or not names:
            continue
        per = len(resps) // len(names)
        for i, s in enumerate(resps):
            n = names[min(i // max(per, 1), len(names) - 1)]
            newf = 'S%s_HIDE%s' % (n, 'A' if i % 2 == 0 else 'B')
            if s['field'] != newf:
                log.append('p%d %s -> %s' % (pg, s['field'], newf))
            s['field'] = newf
    return log


def link_frames(slots, frames):
    """Vincula cada marco al NOMBRE_N más cercano de su página
    (misma foto en todas las páginas del sospechoso: FOTO_N).
    Sin nombre cercano: FOTO_P{página}_{k} único."""
    import re
    from collections import Counter
    names = [s for s in slots
             if re.match(r'NOMBRE_(\d+)$', s['field'] or '')]
    cumple = [s for s in slots if (s['field'] or '') == 'NOMBRE_CUMPLE']
    used = Counter()
    for f in frames:
        fx, fy = f['x'] + f['w'] / 2, f['y'] + f['h'] / 2
        best, bd = None, 1e9
        for s in names:
            if s['page'] != f['page']:
                continue
            d = abs(s['x'] + s['w'] / 2 - fx) + abs(s['y'] + s['h'] / 2 - fy)
            if d < bd:
                best, bd = s, d
        if best and bd < 40:
            n = re.match(r'NOMBRE_(\d+)$', best['field']).group(1)
            f['field'] = 'FOTO_%s' % n
        elif any(s['page'] == f['page'] for s in cumple):
            f['field'] = 'FOTO_CUMPLE'
        else:
            used[f['page']] += 1
            f['field'] = 'FOTO_P%d_%d' % (f['page'], used[f['page']])
    return frames


def build_template(slots, frames, npages, doc_id, name):
    import re
    fields = {}
    for s in slots:
        code = s['field']
        if code not in fields:
            m = re.match(r'S(\d+)_HIDE([AB])$', code)
            label = ('Sospechoso %s escondite %s' % (m.group(1), m.group(2))) if m \
                else code.replace('_', ' ').title()
            fields[code] = {'id': code, 'type': 'image' if 'FOTO' in code else 'text',
                            'label': label, 'maxLength': 70}
    for f in frames:
        if f['field'] not in fields:
            fields[f['field']] = {'id': f['field'], 'type': 'image', 'label': 'Foto %s' % f['field'].split('_')[-1]}
    pages = []
    for pi in range(1, npages + 1):
        pslots = []
        for s in slots:
            if s['page'] == pi:
                pslots.append({'field': s['field'], 'x': s['x'], 'y': s['y'],
                               'w': s['w'], 'h': s['h'], 'size': s['size'],
                               'color': s['color'], 'fontFamily': s['fontFamily'],
                               'xscale': s.get('xscale'), 'angle': s.get('angle', 0)})
        for f in frames:
            if f['page'] == pi:
                pslots.append({'field': f['field'], 'x': f['x'], 'y': f['y'],
                               'w': f['w'], 'h': f['h'], 'fit': 'cover',
                               'angle': round(-(f.get('tilt') or 0), 1)})
        pages.append({'id': 'p%d' % pi, 'title': 'Página %d' % pi,
                      'background': '../assets/pages/%s-fondo-p%d.png' % (doc_id, pi),
                      'slots': pslots})
    return {'id': doc_id, 'version': 1, 'name': name,
            'pageSize': 'A4', 'fields': list(fields.values()), 'pages': pages}


def render_pages(src, out_dir, prefix, dpi):
    doc = fitz.open(src)
    files = []
    for i, page in enumerate(doc):
        out = os.path.join(out_dir, '%s-p%d.png' % (prefix, i + 1))
        page.get_pixmap(dpi=dpi).save(out)
        files.append(out)
    return files


def build_verify(fixed, slots, frames, bg_files, out_path, doc_id):
    boxes = []
    for f in fixed:
        boxes.append(dict(kind='fijo', label=f['key'], text=f['es'], page=f['page'],
                          x=f['x'], y=f['y'], w=f['w'], h=f['h'],
                          info='%s %.1fpt %s' % (f['fontFamily'], f['size'], f['color'])))
    for s in slots:
        boxes.append(dict(kind='slot', label=s['field'], text='[' + s['field'] + ']', page=s['page'],
                          x=s['x'], y=s['y'], w=s['w'], h=s['h'],
                          info='%s %.1fpt %s' % (s['fontFamily'], s['size'], s['color'])))
    for f in frames:
        boxes.append(dict(kind='foto', label=f['field'], text=f['field'], page=f['page'],
                          x=f['x'], y=f['y'], w=f['w'], h=f['h'],
                          info='trazo %s' % f['stroke']))
    data = json.dumps({'pages': [{'bg': os.path.basename(bf)} for bf in bg_files],
                       'boxes': boxes}, ensure_ascii=False)
    html = """<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Verificación __DOC__</title><style>
body{font-family:system-ui,sans-serif;margin:0;background:#222;color:#eee}
#bar{position:sticky;top:0;background:#111;padding:10px;display:flex;gap:10px;align-items:center;z-index:5}
#wrap{display:flex;gap:16px;padding:16px;align-items:flex-start}
.pg{position:relative;flex:none}
.pg img{display:block;max-height:82vh}
.bx{position:absolute;border:2px solid;font-size:10px;font-weight:700;cursor:pointer}
.bx.fijo{border-color:#4aa3ff;color:#4aa3ff}
.bx.slot{border-color:#3ddc84;color:#3ddc84}
.bx.foto{border-color:#ff4dff;color:#ff4dff}
.bx span{background:rgba(0,0,0,.7);padding:0 3px}
#info{position:sticky;top:60px;background:#111;border:1px solid #555;padding:12px;min-width:260px;font-size:13px;white-space:pre-wrap}
button{font-size:14px;padding:8px 14px;cursor:pointer}
</style></head><body>
<div id="bar"><b>Verificación __DOC__</b><span id="counts"></span>
<button onclick="toggle('fijo')">fijos</button><button onclick="toggle('slot')">slots</button>
<button onclick="toggle('foto')">fotos</button><span>azul=fijo · verde=[CODIGO] · magenta=foto</span></div>
<div id="wrap"><div id="pages"></div><div id="info">Pulsa una caja…</div></div>
<script>var D=__DATA__;
var shown={fijo:true,slot:true,foto:true};
function toggle(k){shown[k]=!shown[k];draw();}
function draw(){
 var P=document.getElementById('pages');P.innerHTML='';
 var n={fijo:0,slot:0,foto:0};
 D.pages.forEach(function(pg,pi){
  var d=document.createElement('div');d.className='pg';
  var im=document.createElement('img');im.src='../../assets/pages/'+pg.bg;d.appendChild(im);
  D.boxes.forEach(function(b){
   if(b.page!==pi+1||!shown[b.kind])return;n[b.kind]++;
   var e=document.createElement('div');e.className='bx '+b.kind;
   e.style.left=b.x+'%';e.style.top=b.y+'%';e.style.width=b.w+'%';e.style.height=b.h+'%';
   e.innerHTML='<span>'+b.label+'</span>';
   e.onclick=function(){document.getElementById('info').textContent=b.kind+' · '+b.label+'\\n'+b.text+'\\n'+b.info+'\\n caja '+b.x+','+b.y+' '+b.w+'x'+b.h;};
   d.appendChild(e);});P.appendChild(d);});
 document.getElementById('counts').textContent='fijos:'+n.fijo+' slots:'+n.slot+' fotos:'+n.foto;
}draw();</script></body></html>"""
    html = html.replace('__DATA__', data).replace('__DOC__', doc_id)
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(html)


def main():
    args = parse_args()
    index_fonts(args.fonts)
    out_tpl = os.path.join(ROOT, 'templates', args.doc)
    out_pages = os.path.join(ROOT, 'assets', 'pages')
    out_verify = os.path.join(ROOT, 'tools', 'verify-%s.html' % args.doc)
    os.makedirs(out_tpl, exist_ok=True)
    os.makedirs(out_pages, exist_ok=True)
    doc = fitz.open(os.path.join(ROOT, args.src_text))
    fixed, slots = extract_texts(doc)
    slots = dedup_slots(slots)
    for line in remap_resp(slots):
        print('remap:', line)
    frames = link_frames(slots, extract_frames(doc))
    npages = doc.page_count
    # Overrides manuales (textos irrecuperables del PDF: la fuente trae un
    # mapa roto y se sustituyen por transcripción; queda registrado aquí)
    ov_path = os.path.join(out_tpl, 'texts-override.json')
    if os.path.exists(ov_path):
        with open(ov_path, encoding='utf-8') as f:
            ov = json.load(f)
        for bx in fixed:
            if bx['key'] in ov:
                for k in ('es', 'fontFamily', 'size', 'color'):
                    if k in ov[bx['key']]:
                        bx[k] = ov[bx['key']][k]
                print('override:', bx['key'])
    with open(os.path.join(out_tpl, 'texts.json'), 'w', encoding='utf-8') as f:
        json.dump(fixed, f, ensure_ascii=False, indent=1)
    tpl = build_template(slots, frames, npages, args.doc, args.name or args.doc)
    with open(os.path.join(out_tpl, 'template.json'), 'w', encoding='utf-8') as f:
        json.dump(tpl, f, ensure_ascii=False, indent=1)
    bg_files = render_pages(os.path.join(ROOT, args.src_bg), out_pages, '%s-fondo' % args.doc, 150)
    render_pages(os.path.join(ROOT, args.src_text), out_pages, '%s-ref' % args.doc, 80)
    build_verify(fixed, slots, frames, bg_files, out_verify, args.doc)
    print('fijos:', len(fixed), '| slots:', len(slots), '| fotos:', len(frames), '| páginas:', npages)
    print('claves:', [f['key'] for f in fixed])
    print('campos:', [f['id'] for f in tpl['fields']])


if __name__ == '__main__':
    main()
