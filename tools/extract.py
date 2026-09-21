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
SRC_TEXT = os.path.join(ROOT, 'juego-con-textos.pdf')
SRC_BG = os.path.join(ROOT, 'juego-fondo.pdf')
OUT_TPL = os.path.join(ROOT, 'templates', 'recurso-1')
OUT_PAGES = os.path.join(ROOT, 'assets', 'pages')
OUT_VERIFY = os.path.join(ROOT, 'tools', 'verify-recurso-1.html')

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
    tok = norm(re.sub(r'-(regular|bold|italic|black|light|medium).*$', '', spanfam, flags=re.IGNORECASE))
    best = None
    for e in FONTS_IDX:
        if tok and tok in e['fam']:
            if not best or len(e['fam']) < len(best['fam']):
                best = e
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


def extract_texts(doc):
    """Devuelve (fixed, slots): cajas fijas y huecos [CODIGO] con geometría en %."""
    fixed, slots = [], []
    for pi, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        key_count = {}
        for b in page.get_text('dict')['blocks']:
            if b['type'] != 0:
                continue
            for line in b['lines']:
                spans = [s for s in line['spans'] if s['text'].strip()]
                if not spans:
                    continue
                # Partir la línea en tramos fijos y códigos
                for s in spans:
                    parts = CODE_RE.split(s['text'])
                    x0, y0, x1, y1 = s['bbox']
                    sw = max(x1 - x0, 1)
                    total_chars = max(len(s['text']), 1)
                    cursor = 0
                    for k, part in enumerate(parts):
                        plen = len(part)
                        if plen == 0:
                            continue
                        fx0 = x0 + sw * cursor / total_chars
                        fx1 = x0 + sw * (cursor + plen) / total_chars
                        cursor += plen
                        xs = None
                        fp = find_font(s['font'])
                        if fp and plen:
                            nat = natural_width(fp, part, s['size'])
                            if nat > 0:
                                xs = round((fx1 - fx0) / nat, 2)
                        if k % 2 == 1:  # es un [CODIGO]
                            code = part.strip()
                            slots.append({
                                'page': pi + 1, 'field': code,
                                'x': pct(fx0, W), 'y': pct(s['bbox'][1], H),
                                'w': pct(fx1 - fx0, W), 'h': pct(s['bbox'][3] - s['bbox'][1], H),
                                'fontFamily': basefont(s['font']),
                                'size': round(s['size'] / W * 100, 2),
                                'color': '#%06X' % (s['color'] & 0xFFFFFF),
                                'xscale': xs,
                            })
                        else:
                            txt = part.strip()
                            if txt:
                                key_count[txt] = key_count.get(txt, 0) + 1
                                fixed.append({
                                    'page': pi + 1,
                                    'key': slugify(txt) + ('' if key_count[txt] == 1 else '-' + str(key_count[txt])),
                                    'es': txt,
                                    'x': pct(fx0, W), 'y': pct(s['bbox'][1], H),
                                    'w': pct(fx1 - fx0, W), 'h': pct(s['bbox'][3] - s['bbox'][1], H),
                                    'fontFamily': basefont(s['font']),
                                    'size': round(s['size'] / W * 100, 2),
                                    'color': '#%06X' % (s['color'] & 0xFFFFFF),
                                    'xscale': xs,
                                })
    return fixed, slots


def extract_frames(doc):
    """Marcos de foto: rectángulos con trazo magenta/morado (tolerante)."""
    frames = []
    for pi, page in enumerate(doc):
        W, H = page.rect.width, page.rect.height
        for dr in page.get_drawings():
            col = dr.get('color')
            if not col or len(col) != 3:
                continue
            r, g, b = col
            area = dr['rect'].width * dr['rect'].height
            if r > 0.5 and b > 0.5 and g < 0.45 and area > 2000:
                frames.append({
                    'page': pi + 1,
                    'stroke': [round(r, 3), round(g, 3), round(b, 3)],
                    'x': pct(dr['rect'].x0, W), 'y': pct(dr['rect'].y0, H),
                    'w': pct(dr['rect'].width, W), 'h': pct(dr['rect'].height, H),
                })
    frames.sort(key=lambda f: (f['page'], f['y'], f['x']))
    for i, f in enumerate(frames, 1):
        f['field'] = 'FOTO_%d' % i
    return frames


def build_template(slots, frames, npages):
    fields = {}
    for s in slots:
        code = s['field']
        if code not in fields:
            fields[code] = {'id': code, 'type': 'image' if 'FOTO' in code else 'text',
                            'label': code.replace('_', ' ').title(), 'maxLength': 70}
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
                               'xscale': s.get('xscale')})
        for f in frames:
            if f['page'] == pi:
                pslots.append({'field': f['field'], 'x': f['x'], 'y': f['y'],
                               'w': f['w'], 'h': f['h'], 'fit': 'cover'})
        pages.append({'id': 'p%d' % pi, 'title': 'Página %d' % pi,
                      'background': '../assets/pages/recurso-1-fondo-p%d.png' % pi,
                      'slots': pslots})
    return {'id': 'recurso-1', 'version': 1, 'name': 'Recurso 1 (piloto artista)',
            'pageSize': 'A4', 'fields': list(fields.values()), 'pages': pages}


def render_pages(src, prefix, dpi):
    doc = fitz.open(src)
    files = []
    for i, page in enumerate(doc):
        out = os.path.join(OUT_PAGES, '%s-p%d.png' % (prefix, i + 1))
        page.get_pixmap(dpi=dpi).save(out)
        files.append(out)
    return files


def build_verify(fixed, slots, frames, bg_files, npages):
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
<title>Verificación recurso-1</title><style>
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
<div id="bar"><b>Verificación recurso-1</b><span id="counts"></span>
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
    html = html.replace('__DATA__', data)
    with open(OUT_VERIFY, 'w', encoding='utf-8') as f:
        f.write(html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fonts', default=None)
    args = ap.parse_args()
    index_fonts(args.fonts)
    os.makedirs(OUT_TPL, exist_ok=True)
    os.makedirs(OUT_PAGES, exist_ok=True)
    doc = fitz.open(SRC_TEXT)
    fixed, slots = extract_texts(doc)
    frames = extract_frames(doc)
    npages = doc.page_count
    with open(os.path.join(OUT_TPL, 'texts.json'), 'w', encoding='utf-8') as f:
        json.dump(fixed, f, ensure_ascii=False, indent=1)
    tpl = build_template(slots, frames, npages)
    with open(os.path.join(OUT_TPL, 'template.json'), 'w', encoding='utf-8') as f:
        json.dump(tpl, f, ensure_ascii=False, indent=1)
    bg_files = render_pages(SRC_BG, 'recurso-1-fondo', 150)
    render_pages(SRC_TEXT, 'recurso-1-ref', 80)
    build_verify(fixed, slots, frames, bg_files, npages)
    print('fijos:', len(fixed), '| slots:', len(slots), '| fotos:', len(frames), '| páginas:', npages)
    print('claves:', [f['key'] for f in fixed])
    print('campos:', [f['id'] for f in tpl['fields']])


if __name__ == '__main__':
    main()
