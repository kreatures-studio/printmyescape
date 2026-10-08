#!/usr/bin/env node
/* Fase 2 — Compone el PDF final: fondo limpio + fijos traducidos (i18n)
   + variables del usuario + fotos. Mismo motor que el wizard en el
   navegador (demo/compose-browser.js): rotación sobre el centro de la
   caja, condensación real por CTM (pdf-lib no aplica horizontalScaling),
   fotos en cover recortadas al marco y fuentes según la familia extraída.
   Uso: node tools/compose.js --tpl templates/DOC --bg fondo.pdf --lang es|en
        --out salidas/X.pdf [--values-file v.json] [--photos-file f.json]
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, degrees, pushGraphicsState, popGraphicsState,
  translate, scale: pdfScale, rotateRadians, moveTo, lineTo, closePath,
  clip, endPath } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const OPS = { pushGraphicsState, popGraphicsState, translate, scale: pdfScale,
  rotateRadians, moveTo, lineTo, closePath, clip, endPath };

const ROOT = path.join(__dirname, '..');
const FONTS = {
  /* Caveat: embed completo en los dos pesos (el subsetter rompe glifos) */
  caveatBold: { file: '../assets/fonts/Caveat-Bold.ttf', subset: false },
  caveat: { file: '../assets/fonts/Caveat-Regular.ttf', subset: false },
  anton: { file: '../assets/fonts/Anton-Regular.ttf', subset: true },
  opensans: { file: '../assets/fonts/OpenSans-Regular.ttf', subset: true },
  opensansBold: { file: '../assets/fonts/OpenSans-Bold.ttf', subset: true },
  courier: { file: '../assets/fonts/CourierPrime-Regular.ttf', subset: true },
  courierBold: { file: '../assets/fonts/CourierPrime-Bold.ttf', subset: true },
};
/* La familia extraída manda: manuscritas a Caveat (Bold solo si el
   artista la marcó Bold), titulares a Anton Regular y las Bold del
   artista a OpenSans-Bold. OpenSans/Myriad Regular van en regular:
   el tamaño NO decide el peso. */
function pickFont(family, size) {
  void size;
  const f = family || '';
  if (/myriad/i.test(f)) return 'caveatBold';
  if (/caveat|script|hand/i.test(f)) return /bold|black/i.test(f) ? 'caveatBold' : 'caveat';
  if (/anton|display/i.test(f)) return 'anton';
  if (/bold|black/i.test(f)) return 'opensansBold';
  return 'opensans';
}
const ALIGN_OVERRIDE = {}; /* ej: {'notas-y-observaciones': 'center'} */
/* Runas pigpen (p10, hoja de recursos 1): paredes de la celda + punto.
   Coordenadas unidad con y hacia abajo. */
const RUNE_INK = rgb(0.27, 0.06, 0.08);
const RUNE_BG = rgb(0.85, 0.77, 0.64);
const PIG_WALLS = { A: 'RB', B: 'LRB', C: 'LB', D: 'TRB', E: 'LRTB', F: 'TLB', G: 'TR', H: 'TLR', I: 'TL' };
const PIG_CELLS = { A: [0,0], B: [1,0], C: [2,0], D: [0,1], E: [1,1], F: [2,1], G: [0,2], H: [1,2], I: [2,2] };
const PIG_X = { S: [[[0,0],[0.5,0.5]], [[1,0],[0.5,0.5]]], T: [[[0,0],[0.5,0.5]], [[0,1],[0.5,0.5]]],
  U: [[[1,0],[0.5,0.5]], [[1,1],[0.5,0.5]]], V: [[[0,1],[0.5,0.5]], [[1,1],[0.5,0.5]]] };
function normRunes(s) {
  return (s || '').toUpperCase().replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I').replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[^A-Z ]/g, '').replace(/ +/g, ' ').trim();
}
function runeInfo(ch) {
  if (PIG_WALLS[ch]) return { walls: PIG_WALLS[ch], cell: PIG_CELLS[ch], dot: false };
  if ('JKLMNOPQR'.indexOf(ch) >= 0) { const b = 'ABCDEFGHI'['JKLMNOPQR'.indexOf(ch)]; return { walls: PIG_WALLS[b], cell: PIG_CELLS[b], dot: true }; }
  if (PIG_X[ch]) return { xsegs: PIG_X[ch], dot: false };
  if ('WXYZ'.indexOf(ch) >= 0) return { xsegs: PIG_X['STUV'['WXYZ'.indexOf(ch)]], dot: true };
  return null;
}
function drawRunes(page, text, cx, cy, cell, maxW) {
  const layout = (cs) => {
    const items = [];
    let total = 0;
    for (const ch of text) {
      if (ch === ' ') { total += cs * 0.7; continue; }
      if (!runeInfo(ch)) continue;
      items.push({ ch, adv: total });
      total += cs * 1.3;
    }
    return { items, total };
  };
  let lay = layout(cell);
  if (lay.items.length && lay.total > maxW) {
    cell *= maxW / lay.total;
    lay = layout(cell);
  }
  const x0 = cx - lay.total / 2;
  for (const it of lay.items) {
    const ox = x0 + it.adv, oy = cy - cell / 2;
    const seg = (ax, ay, bx, by) => page.drawLine({
      start: { x: ox + ax * cell, y: oy + (1 - ay) * cell },
      end: { x: ox + bx * cell, y: oy + (1 - by) * cell },
      thickness: 1.6, color: RUNE_INK });
    const g = runeInfo(it.ch);
    if (g.xsegs) {
      g.xsegs.forEach((s) => seg(s[0][0], s[0][1], s[1][0], s[1][1]));
      if (g.dot) page.drawCircle({ x: ox + cell / 2, y: oy + cell / 2, size: cell * 0.18, color: RUNE_INK });
    } else {
      const c = g.cell[0] / 3, r = g.cell[1] / 3, q = 1 / 3;
      if (g.walls.indexOf('L') >= 0) seg(c, r, c, r + q);
      if (g.walls.indexOf('R') >= 0) seg(c + q, r, c + q, r + q);
      if (g.walls.indexOf('T') >= 0) seg(c, r, c + q, r);
      if (g.walls.indexOf('B') >= 0) seg(c, r + q, c + q, r + q);
      if (g.dot) page.drawCircle({ x: ox + (c + q / 2) * cell, y: oy + (1 - r - q / 2) * cell, size: cell * 0.18, color: RUNE_INK });
    }
  }
}
/* Factura: typewriter monoespaciada (cifras y columnas legibles). */
const MONO = { factura: 1, concepto: 1, cant: 1, 'precio-unit': 1, importe: 1, cliente: 1 };
const MONO_R = /vibrador|1-000|no-2025|^1-9$/;
function pickFontFor(f) {
  if (MONO[f.key]) return 'courierBold';
  if (MONO_R.test(f.key)) return 'courier';
  return pickFont(f.fontFamily, f.size);
}
/* Reflow por línea: los valores se sustituyen DENTRO de la frase y la
   línea se compone completa (sin huecos reservados). Solo líneas
   horizontales con huecos pequeños; el resto sigue el camino clásico. */
const FLOW_GAP_MAX = 5;
function flowPairOk(segs) {
  if (segs.length !== 2) return false;
  const ids = segs.map((g) => ((g.ref.field || '').toUpperCase()));
  const m0 = /^(NOMBRE|APODO)_(\d+)$/.exec(ids[0] || '');
  const m1 = /^(NOMBRE|APODO)_(\d+)$/.exec(ids[1] || '');
  return !!(m0 && m1 && m0[2] === m1[2] && m0[1] !== m1[1]);
}
function buildFlowGroups(tpl, fixed, pi) {
  const items = [];
  for (const f of fixed) {
    if (f.page !== pi + 1 || Math.abs(f.angle || 0) >= 45) continue;
    const multi = /\n/.test(f.es || '');
    /* Los multilínea participan por su primera línea (para vetar) */
    items.push({ kind: multi ? 'm' : 'f', ref: f,
      x0: f.x, x1: f.x + f.w, cy: multi ? f.y : f.y + f.h / 2, h: f.h });
  }
  for (const s of tpl.pages[pi].slots) {
    const fld = tpl.fields.find((x) => x.id === s.field);
    if (!fld || fld.type !== 'text' || Math.abs(s.angle || 0) >= 45) continue;
    items.push({ kind: 's', ref: s,
      x0: s.x, x1: s.x + s.w, cy: s.y + s.h / 2, h: s.h });
  }
  items.sort((a, b) => a.cy - b.cy || a.x0 - b.x0);
  const lines = [];
  for (const it of items) {
    let ln = null;
    for (const l of lines) {
      if (Math.abs(l.cy - it.cy) <= 0.45 * Math.min(l.minH, it.h)) { ln = l; break; }
    }
    if (!ln) lines.push({ cy: it.cy, minH: it.h, items: [it] });
    else { ln.items.push(it); ln.minH = Math.min(ln.minH, it.h); }
  }
  const groups = [];
  const multiBands = items.filter((it) => it.kind === 'm')
    .map((it) => ({ x0: it.x0, x1: it.x1, top: it.ref.y, bot: it.ref.y + it.ref.h }));
  for (const ln of lines) {
    ln.items.sort((a, b) => a.x0 - b.x0);
    if (ln.items.some((it) => it.kind === 'm')) continue;
    const angs = ln.items.map((it) => (it.kind === 'f' ? it.ref.angle : it.ref.angle) || 0);
    if (Math.max(...angs) - Math.min(...angs) > 12) continue;
    const gx0 = Math.min(...ln.items.map((it) => it.x0));
    const gx1 = Math.max(...ln.items.map((it) => it.x1));
    const lh = Math.max(...ln.items.map((it) => it.h));
    const clash = multiBands.some((mb) => gx0 < mb.x1 && gx1 > mb.x0 &&
      ln.cy >= mb.top - lh && ln.cy <= mb.bot + lh * 0.5);
    if (clash) continue;
    let cur = [ln.items[0]];
    const flush = () => {
      const hasS = cur.some((it) => it.kind === 's');
      const hasF = cur.some((it) => it.kind === 'f');
      const ok = cur.length >= 2 && hasS && (hasF || flowPairOk(cur));
      if (ok) {
        cur.forEach((it) => { it.ref._flow = true; });
        groups.push(cur);
      }
    };
    for (let i = 1; i < ln.items.length; i++) {
      if (ln.items[i].x0 - cur[cur.length - 1].x1 < FLOW_GAP_MAX) cur.push(ln.items[i]);
      else { flush(); cur = [ln.items[i]]; }
    }
    flush();
  }
  return groups;
}
function cleanFlowText(s) {
  return String(s || '').replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%)\]}])/g, '$1').replace(/([(\[{])\s+/g, '$1').trim();
}
function drawFlowGroup(bg, ff, group, textOf, valOf, PW, PH, warns) {
  const runs = [];
  for (const g of group) {
    if (g.kind === 'f') {
      const t = cleanFlowText(textOf(g.ref));
      if (!t) continue;
      runs.push({ text: t, fam: g.ref.fontFamily, size: g.ref.size,
        color: g.ref.color, hsMax: g.ref.xscale || 1, align: g.ref.align || 'left' });
    } else {
      const t = cleanFlowText(String(valOf(g.ref.field) || '').replace(/\n/g, ' '));
      if (!t) continue;
      runs.push({ text: t, fam: g.ref.fontFamily, size: g.ref.size,
        color: g.ref.color || '#000000', hsMax: g.ref.xscale || 1, align: g.ref.align || 'left' });
    }
  }
  if (!runs.length) return;
  const x0 = Math.min(...group.map((g) => g.x0)) / 100 * PW;
  const x1 = Math.max(...group.map((g) => g.x1)) / 100 * PW;
  const yT = Math.min(...group.map((g) => g.ref.y)) / 100;
  const yB = Math.max(...group.map((g) => g.ref.y + g.ref.h)) / 100;
  const yTop = PH - yT * PH, boxH = (yB - yT) * PH, maxW = x1 - x0;
  const fonts = runs.map((r) => ff[pickFont(r.fam, r.size)]);
  const floorHs = Math.min(0.6, ...runs.map((r) => (r.hsMax > 0 ? r.hsMax : 1)));
  let scale = 1, laid = null;
  for (;;) {
    const words = [];
    runs.forEach((r, ri) => {
      const sz = r.size / 100 * PW * scale;
      const f = fonts[ri];
      r.text.split(' ').filter(Boolean).forEach((w) => {
        words.push({ w, f, sz, color: r.color, glue: /^[.,;:!?%)\]}]/.test(w) });
      });
    });
    let total = 0;
    words.forEach((w, i) => {
      w.nat = w.f.widthOfTextAtSize(w.w, w.sz) || 1;
      const sp = (i && !w.glue) ? (w.f.widthOfTextAtSize(' ', w.sz) || 0) : 0;
      w.gap = sp;
      total += w.nat + sp;
    });
    const hs = Math.min(...runs.map((r) => (r.hsMax > 0 ? r.hsMax : 1)), maxW / Math.max(total, 1));
    const maxSz = Math.max(...words.map((w) => w.sz));
    if ((hs >= floorHs && maxSz * 1.25 <= boxH + maxSz * 0.5) || scale <= 0.5) {
      laid = { words, hs: Math.max(hs, 0.1), maxSz, total };
      if (scale < 0.85) {
        const lbl = (group.find((g) => g.kind === 'f') || {}).ref;
        warns.push(((lbl && lbl.key) || (group[0].ref.field || 'flujo')) + ': encogido');
      }
      break;
    }
    scale *= 0.94;
  }
  const align = runs[0].align;
  const ink = Math.min(laid.total, maxW) * laid.hs;
  let xx = x0;
  if (align === 'center') xx = (x0 + x1) / 2 - ink / 2;
  else if (align === 'right') xx = x1 - ink;
  const cy = yTop - boxH / 2;
  const base = cy - laid.maxSz * 0.45;
  const angle = (group[0].kind === 'f' ? group[0].ref.angle : group[0].ref.angle) || 0;
  const rad = (angle * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
  const ccx = (x0 + x1) / 2, ccy = yTop - boxH / 2;
    let pen = xx;
    for (const w of laid.words) {
      const px = ccx + (pen - ccx) * c - (base - ccy) * s;
      const py = ccy + (pen - ccx) * s + (base - ccy) * c;
      drawLine(bg, w.w, px, py, w.sz, w.f, hex(w.color), laid.hs, angle);
      pen += (w.nat + (w.gap || 0)) * laid.hs;
    }
  }

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function args() {
  const o = { lang: 'es', out: null, values: {}, photos: {}, tpl: 'templates/recurso-1', bg: 'juego-fondo.pdf' };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--values') o.values = JSON.parse(a[++i]);
    else if (a[i] === '--values-file') o.values = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
    else if (a[i] === '--photos-file') o.photos = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
    else if (a[i] === '--tpl') o.tpl = a[++i];
    else if (a[i] === '--bg') o.bg = a[++i];
    else if (a[i] === '--no-subset') o.noSubset = true;
  }
  return o;
}
/* Parte en palabras que caben en maxW; si ni una palabra cabe, la corta. */
function wrap(font, text, size, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (font.widthOfTextAtSize(t, size) <= maxW || !cur) cur = t;
      else { lines.push(cur); cur = w; }
    }
    lines.push(cur);
  }
  return lines;
}
/* Encaja el texto en la caja: envuelve con anchos naturales, permite
   condensación horizontal (como hace Illustrator) y encoge el tamaño.
   targetHs: condensación de referencia del artista (xscale extraído).
   Las traducciones heredan ese aspecto en vez de recalcularlo, para que
   todos los idiomas se vean iguales aunque las frases midan distinto. */
const HS_MIN = 0.7, SIZE_MIN = 0.55, HS_MAX = 1.05, HS_ABS_MIN = 0.3;
function clampTarget(t, vertical) {
  let x = Number(t);
  if (!(x > 0)) x = 1;
  /* xscale de extracción para textos verticales con valores extremos
     (<0.3 o >2) es ruido de la extracción: se ignora (sin condensar). */
  if (vertical && (x < 0.3 || x > 2)) x = 1;
  if (x > HS_MAX) x = HS_MAX;
  return x;
}
function fit(font, text, boxPt, size0, opt) {
  opt = opt || {};
  const single = !!opt.single;
  const vertical = Math.abs(opt.angle || 0) > 45;
  const targetHs = clampTarget(opt.targetHs, vertical);
  /* El artista puede haber condensado por debajo del 70%: el suelo
     respeta su valor en vez de forzar encogidos. */
  const floor = single ? Math.min(0.6, targetHs) : Math.min(HS_MIN, targetHs);
  /* Los valores de una línea pueden crecer a la derecha de su caja solo
     si esta es estrecha (códigos): en cajas anchas (títulos) el texto
     blanco se saldría de su pastilla y se volvería invisible. */
  const grow = single ? (opt.grow || 1) : 1;
  const fitW = (boxPt.w * grow) || 1;
  let size = opt.lockSize || size0;
  const min = size0 * (single ? 0.5 : SIZE_MIN);
  let lines = [text], hs = [1];
  const once = (sz) => {
    const budget = (vertical ? boxPt.h : fitW) / floor;
    /* Los valores de una línea pueden traer \n (p. ej. el chat): se
       apilan como líneas propias. */
    const nat = single ? String(text).split('\n') : wrap(font, text, sz, budget);
    const ref = vertical ? boxPt.h : fitW;
    const h = nat.map((ln) => {
      const nw = font.widthOfTextAtSize(ln, sz) || 1;
      let v = Math.min(targetHs, ref / nw);
      if (v > HS_MAX) v = HS_MAX;
      if (v < HS_ABS_MIN) v = HS_ABS_MIN;
      return v;
    });
    return { lines: nat, hs: h };
  };
  if (opt.lockSize) {
    const r = once(size);
    return { lines: r.lines, hs: r.hs, size, warn: size < size0 * 0.85 };
  }
  for (;;) {
    const r = once(size);
    lines = r.lines; hs = r.hs;
    const lh = size * 1.25;
    const tooNarrow = Math.min(...hs.concat([1])) < floor;
    const multi = !single || lines.length > 1;
    const tooTall = vertical
      ? lines.length * size > boxPt.w + size * 0.5
      : (multi && lines.length * lh > boxPt.h + lh * 0.5);
    if ((!tooNarrow && !tooTall) || size <= min) break;
    size *= 0.94;
  }
  return { lines, hs, size, warn: size < size0 * 0.85 };
}
/* Condensación real por CTM a lo largo de la dirección del texto
   (pdf-lib no tiene horizontalScaling: la opción se ignora en silencio). */
function drawLine(page, ln, x, y, size, font, color, hs, angle) {
  if (!(hs < 0.999)) {
    page.drawText(ln, { x, y, size, font, color, rotate: degrees(angle) });
    return;
  }
  const rad = (angle * Math.PI) / 180;
  page.pushOperators(
    OPS.pushGraphicsState(), OPS.translate(x, y),
    OPS.rotateRadians(rad), OPS.scale(hs, 1), OPS.rotateRadians(-rad),
    OPS.translate(-x, -y),
  );
  try {
    page.drawText(ln, { x, y, size, font, color, rotate: degrees(angle) });
  } finally {
    page.pushOperators(OPS.popGraphicsState());
  }
}
function drawFitted(page, font, text, boxPt, size0, color, align, opt) {
  opt = opt || {};
  const angle = opt.angle || 0;
  const vertical = Math.abs(angle) > 45;
  const { lines, hs, size, warn } = fit(font, text, boxPt, size0,
    { single: opt.single, targetHs: opt.targetHs, angle, lockSize: opt.lockSize, grow: opt.grow });
  const rad = (angle * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const cx = boxPt.x + boxPt.w / 2, cy = boxPt.yTop - boxPt.h / 2;
  /* La rotación pivota sobre el centro de la caja: el bloque no se
     desplaza aunque esté inclinado. */
  const pivot = (x0, y0) => ({
    x: cx + (x0 - cx) * c - (y0 - cy) * s,
    y: cy + (x0 - cx) * s + (y0 - cy) * c,
  });
  /* Líneas posicionales: si la caja trae sus líneas originales y el texto
     cabe en ellas, cada línea se dibuja en su sitio exacto (sin reflujo). */
  const lbs = (!vertical && !opt.single && boxPt.lines && boxPt.lines.length > 1) ? boxPt.lines : null;
  if (lbs) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const placed = [];
    let wi = 0;
    for (const lb of lbs) {
      const cur = [];
      while (wi < words.length) {
        const t = cur.concat([words[wi]]).join(' ');
        const nw = font.widthOfTextAtSize(t, size) || 1;
        if (nw <= lb.w / HS_MIN || cur.length === 0) { cur.push(words[wi++]); }
        else break;
      }
      placed.push({ text: cur.join(' '), box: lb });
    }
    if (wi >= words.length) {
      let bad = false;
      const drawn = placed.map((pl) => {
        const nw = font.widthOfTextAtSize(pl.text, size) || 1;
        const h = Math.min(opt.targetHs || 1, pl.box.w / nw);
        if (pl.text && h < 0.6) bad = true;
        return { text: pl.text, box: pl.box, hs: h };
      });
      if (!bad) {
        drawn.forEach((ln) => {
          if (!ln.text) return;
          const lb = ln.box;
          const lcx = lb.x + lb.w / 2, lcy = lb.yTop - lb.h / 2;
          const base = lcy + (size * 1.25) / 2 - size * 0.95;
          const w = font.widthOfTextAtSize(ln.text, size) * ln.hs;
          let x = lb.x;
          if (align === 'center') x = lcx - w / 2;
          else if (align === 'right') x = lb.x + lb.w - w;
          const p = pivot(x, base);
          drawLine(page, ln.text, p.x, p.y, size, font, color, ln.hs, angle);
        });
        return warn;
      }
    }
  }
  if (!vertical) {
    const lh = size * 1.25;
    /* Líneas justificadas en la altura (primera arriba, última abajo):
       en cajas normales equivale al centrado clásico; en cajas altas de
       fijos evita chocar con valores intercalados. */
    const topBase = boxPt.yTop - size * 0.8;
    const botBase = boxPt.yTop - boxPt.h + size * 0.3;
    const spread = lines.length > 1 ? (topBase - botBase) / (lines.length - 1) : 0;
    let useSpread = lines.length > 1 && spread >= lh * 0.9;
    /* No dispersar si alguna línea caería dentro de la caja de otro fijo
       (cajas de extracción solapadas, como la carta de la p15): en ese
       caso, bloque centrado clásico. */
    if (useSpread && opt.siblings) {
      const m = size * 0.3;
      for (let i = 0; i < lines.length; i++) {
        const yb = topBase - i * spread;
        for (const sb of opt.siblings) {
          if (sb.h >= size * 1.8 && yb < sb.top + m && yb > sb.bot - m) {
            useSpread = false;
            break;
          }
        }
        if (!useSpread) break;
      }
    }
    const totalH = (lines.length - 1) * lh + size;
    const firstBase = cy + totalH / 2 - size * 0.95;
    /* Continuación inline: si un valor de la misma página comparte línea
       con este fijo y lo pisa (p. ej. "A [NOMBRE] le daba..."), el fijo
       continúa tras el valor en vez de sobreescribirlo. */
    const runs = (opt.inline || []).filter((g) => Math.abs(angle) <= 45 && Math.abs(g.angle || 0) <= 45);
    lines.forEach((ln, i) => {
      const nw = font.widthOfTextAtSize(ln, size) || 1;
      let hsi = hs[i];
      let x0 = boxPt.x;
      if (align === 'center') x0 = cx - nw * hsi / 2;
      else if (align === 'right') x0 = boxPt.x + boxPt.w - nw * hsi;
      const y0 = useSpread ? topBase - i * spread : firstBase - i * lh;
      for (const g of runs) {
        if (Math.abs(y0 - g.base) < Math.max(size, g.size) * 0.4 &&
            g.x0 < x0 + nw * hsi && g.x1 > x0 && g.x0 >= boxPt.x - 1) {
          x0 = Math.max(x0, g.x1 + size * 0.25);
          const room = boxPt.x + boxPt.w - x0;
          if (room < nw * hsi && room > 0) hsi = Math.max(HS_ABS_MIN, Math.min(hsi, room / nw));
        }
      }
      const p = pivot(x0, y0);
      drawLine(page, ln, p.x, p.y, size, font, color, hsi, angle);
    });
  } else {
    /* Vertical: cada línea recorre el alto y se centra en él; las
       columnas se centran en el ancho. -90 lee de arriba abajo. */
    const down = angle < 0;
    const step = size;
    const total = (lines.length - 1) * step;
    lines.forEach((ln, i) => {
      const len = font.widthOfTextAtSize(ln, size) * hs[i];
      const span = Math.min(len, boxPt.h);
      const colC = down ? cx + total / 2 - i * step : cx - total / 2 + i * step;
      const x0 = down ? colC - size * 0.35 : colC + size * 0.35;
      const y0 = down
        ? boxPt.yTop - (boxPt.h - span) / 2
        : boxPt.yTop - boxPt.h + (boxPt.h - span) / 2;
      /* SIN pivot: (x0, y0) ya está en el marco rotado. */
      drawLine(page, ln, x0, y0, size, font, color, hs[i], angle);
    });
  }
  return warn;
}
/* Foto con ajuste "cover" (sin deformar) recortada al marco rotado. */
function drawPhoto(page, im, b, angle) {
  const iw = im.width || 100, ih = im.height || 100;
  const fw = b.w, fh = b.h;
  const cx = b.x + b.w / 2, cy = b.yTop - b.h / 2;
  const th = ((angle || 0) * Math.PI) / 180;
  const c = Math.cos(th), si = Math.sin(th);
  const sc = Math.max(fw / iw, fh / ih);
  const dw = iw * sc, dh = ih * sc;
  const x0 = cx - (dw * c - dh * si) / 2, y0 = cy - (dw * si + dh * c) / 2;
  const fx = cx - fw / 2, fy = cy - fh / 2;
  const corner = (u, v) => ({ x: fx + u * c - v * si, y: fy + u * si + v * c });
  const p1 = corner(0, 0), p2 = corner(fw, 0), p3 = corner(fw, fh), p4 = corner(0, fh);
  page.pushOperators(
    OPS.pushGraphicsState(),
    OPS.moveTo(p1.x, p1.y), OPS.lineTo(p2.x, p2.y),
    OPS.lineTo(p3.x, p3.y), OPS.lineTo(p4.x, p4.y),
    OPS.closePath(), OPS.clip(), OPS.endPath(),
  );
  try {
    page.drawImage(im, { x: x0, y: y0, width: dw, height: dh, rotate: degrees(angle || 0) });
  } finally {
    page.pushOperators(OPS.popGraphicsState());
  }
}

async function main() {
  const o = args();
  if (!o.out) { console.error('falta --out'); process.exit(1); }
  const tplDir = path.join(ROOT, o.tpl);
  const tpl = JSON.parse(fs.readFileSync(path.join(tplDir, 'template.json'), 'utf8'));
  const fixed = JSON.parse(fs.readFileSync(path.join(tplDir, 'texts.json'), 'utf8'));
  const i18n = JSON.parse(fs.readFileSync(path.join(tplDir, `i18n-${o.lang}.json`), 'utf8'));
  /* Todos los idiomas disponibles: el tamaño se bloquea por caja al mínimo
     común, para que la misma línea mida lo mismo en todos los idiomas. */
  const allI18n = fs.readdirSync(tplDir)
    .filter((f) => /^i18n-.*\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8')));

  const bgBytes = fs.readFileSync(path.join(ROOT, o.bg));
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const bgDoc = await PDFDocument.load(bgBytes);
  const ff = {};
  for (const k of Object.keys(FONTS)) {
    ff[k] = await out.embedFont(fs.readFileSync(path.join(__dirname, FONTS[k].file)),
      { subset: o.noSubset ? false : FONTS[k].subset });
  }
  const warns = [];
  /* Alias junto al nombre: si el sospechoso/cumpleañero tiene alias, el hueco
     del nombre imprime Nombre "Alias" (la plantilla no trae huecos de alias). */
  function slotVal(field) {
    const v = o.values[field] || '';
    let a = '';
    if (field === 'NOMBRE_CUMPLE') a = o.values.B_ALIAS || '';
    else {
      const m = /^NOMBRE_([1-8])$/.exec(field || '');
      if (m) a = o.values['S' + m[1] + '_ALIAS'] || '';
    }
    a = (a || '').trim();
    if (a && v) return v + ' "' + a + '"';
    /* APODO_N lleva su coma (el fijo "," se pierde al extraer): sin apodo, nada */
    if (/^APODO_[1-8]$/.exec(field || '')) return v ? ', ' + v : v;
    /* S8_ICON_N: inicial del nombre de la app (no se pregunta, se deriva) */
    {
      const mi = /^S8_ICON_([1-4])$/.exec(field || '');
      if (mi) {
        const av = (o.values['APP_' + mi[1]] || '').trim();
        const mc = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9]/.exec(av);
        return mc ? mc[0].toUpperCase() : '';
      }
    }
    return v;
  }
  for (let pi = 0; pi < tpl.pages.length; pi++) {
    const [bg] = await out.copyPages(bgDoc, [pi]);
    out.addPage(bg);
    const PW = bg.getWidth(), PH = bg.getHeight();
    const box = (b) => ({ x: (b.x / 100) * PW, w: (b.w / 100) * PW, yTop: PH - (b.y / 100) * PH, h: (b.h / 100) * PH });
    const withLines = (f) => {
      const bp = box(f);
      bp.lines = ((f && f.lines) || []).map(box);
      return bp;
    };
    /* fotos primero (debajo de textos): JPEG/PNG con ajuste cover recortado
       al marco (rotado según el ángulo del marco); sin foto, marcador gris.
       Bleed 2.5pt por lado para tapar el marco rosa del fondo. */
    const imgCache = {};
    async function imgFor(p) {
      if (!imgCache[p]) {
        const b = fs.readFileSync(path.join(ROOT, p));
        imgCache[p] = /\.png$/i.test(p) ? await out.embedPng(b) : await out.embedJpg(b);
      }
      return imgCache[p];
    }
    for (const s of tpl.pages[pi].slots) {
      const fld = tpl.fields.find((x) => x.id === s.field);
      if (!fld || fld.type !== 'image') continue;
      const b = box(s);
      const bb = { x: b.x - 2.5, w: b.w + 5, yTop: b.yTop + 2.5, h: b.h + 5 };
      const by = bb.yTop - bb.h;
      const src = o.photos[s.field];
      if (src) {
        const im = await imgFor(src);
        drawPhoto(bg, im, bb, s.angle || 0);
      } else {
        bg.drawRectangle({ x: bb.x, y: by, width: bb.w, height: bb.h, color: rgb(0.85, 0.85, 0.85), borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
        const t = 'FOTO';
        const fs2 = 10, tw = ff.opensansBold.widthOfTextAtSize(t, fs2);
        bg.drawText(t, { x: bb.x + (bb.w - tw) / 2, y: by + bb.h / 2, size: fs2, font: ff.opensansBold, color: rgb(0.4, 0.4, 0.4) });
      }
    }
    /* fijos traducidos (los grupos de reflow dibujan aparte) */
    const pageFixed = fixed.filter((x) => x.page === pi + 1);
    const textOf = (f) => (i18n[f.key] !== undefined ? i18n[f.key] : f.es);
    const flowGroups = buildFlowGroups(tpl, fixed, pi);
    const sibBoxes = pageFixed.filter((x) => !x._flow).map((x) => {
      const bb = box(x);
      return { ref: x, top: bb.yTop, bot: bb.yTop - bb.h, h: bb.h };
    });
    for (const f of pageFixed) {
      if (f._flow) continue;
      const str = textOf(f);
      const font = ff[pickFontFor(f)];
      const size0 = (f.size / 100) * PW;
      const align = ALIGN_OVERRIDE[f.key] || f.align || 'left';
      let use = size0;
      for (const d of allI18n) {
        const t = d[f.key] !== undefined ? d[f.key] : f.es;
        const r = fit(font, t, box(f), size0, { targetHs: f.xscale, angle: f.angle || 0 });
        if (r.size < use) use = r.size;
      }
      if (process.env.COMPOSE_DEBUG) {
        console.log(`${f.key}: size0=${size0.toFixed(1)} -> usa=${use.toFixed(1)}`);
      }
      /* Carreras de valores de esta página para continuaciones inline
         (fijo y valor en la misma línea: el fijo continúa tras el valor).
         Solo valores de una línea; la x1 es el final de la tinta. */
      const inline = [];
      if (!((f.angle || 0) > 45 || (f.angle || 0) < -45)) {
        for (const s of tpl.pages[pi].slots) {
          const fld = tpl.fields.find((x) => x.id === s.field);
          if (!fld || fld.type !== 'text' || s._flow) continue;
          const val = slotVal(s.field);
          if (!val || val.indexOf('\n') >= 0) continue;
          if (((s.angle || 0) > 45 || (s.angle || 0) < -45)) continue;
          const sfont = ff[pickFont(s.fontFamily || 'caveat', s.size)];
          const ssize0 = (s.size / 100) * PW;
          const bb = box(s);
          const sr = fit(sfont, val, bb, ssize0,
            { single: true, targetHs: s.xscale || 1, angle: s.angle || 0,
              grow: (s.w || 0) < 10 ? 2.5 : 1 });
          const ink = (sfont.widthOfTextAtSize(val, sr.size) || 0) * (sr.hs[0] || 1);
          const cy2 = bb.yTop - bb.h / 2;
          const cx2 = bb.x + bb.w / 2;
          let vx0 = bb.x;
          if ((s.align || 'left') === 'center') vx0 = cx2 - ink / 2;
          else if ((s.align || 'left') === 'right') vx0 = bb.x + bb.w - ink;
          inline.push({
            x0: vx0, x1: vx0 + ink, base: cy2 - sr.size * 0.45,
            size: sr.size, angle: s.angle || 0,
          });
        }
      }
      if (drawFitted(bg, font, str, withLines(f), size0, hex(f.color), align,
          { targetHs: f.xscale, angle: f.angle || 0, lockSize: use, inline,
            siblings: sibBoxes.filter((sb) => sb.ref !== f) })) {
        warns.push(`${f.key}: encogido fuerte`);
      }
    }
    /* variables (las de reflow dibujan aparte) */
    for (const s of tpl.pages[pi].slots) {
      const fld = tpl.fields.find((x) => x.id === s.field);
      if (!fld || fld.type !== 'text' || s._flow) continue;
      const val = slotVal(s.field);
      if (!val) continue;
      const font = ff[pickFont(s.fontFamily || 'caveat', s.size)];
      if (process.env.COMPOSE_DEBUG) {
        console.log(`slot ${s.field} val="${val}" box=`, JSON.stringify(box(s)));
      }
      if (drawFitted(bg, font, val, box(s), (s.size / 100) * PW, hex(s.color || '#000000'), s.align || 'left',
          { single: true, targetHs: s.xscale || 1, angle: s.angle || 0, grow: (s.w || 0) < 10 ? 2.5 : 1 })) {
        warns.push(`${s.field}: valor encogido`);
      }
    }
    /* reflow por línea: valores sustituidos dentro de la frase */
    for (const gr of flowGroups) {
      drawFlowGroup(bg, ff, gr, textOf, (fid) => slotVal(fid), PW, PH, warns);
    }
    /* Nota cifrada (p10): el amor secreto de S2 en runas pigpen sobre la hoja.
       Se tapa el ejemplo del artista con el color de la hoja. */
    if (tpl.pages[pi].id === 'p10') {
      const love = normRunes(o.values.S2_SECRET_LOVE || '');
      if (love) {
        const rx = (v) => (v / 100) * PW, ry = (v) => PH - (v / 100) * PH;
        bg.drawRectangle({ x: rx(8), y: ry(90.5), width: rx(90.5) - rx(8), height: ry(37.5) - ry(90.5), color: RUNE_BG });
        drawRunes(bg, 'TE QUIERO ' + love, (rx(8) + rx(90.5)) / 2, (ry(37.5) + ry(90.5)) / 2, 13, rx(90.5) - rx(8) - 24);
      }
    }
  }
  /* Hoja de recortes (p9): la hoja sale en tiras verticales desordenadas
     para recortar y unir. Se recompone la página con las tiras permutadas. */
  if (tpl.shuffle) {
    const sh = tpl.shuffle;
    const pix = tpl.pages.findIndex((p) => p.id === sh.page);
    if (pix >= 0) {
      const src = out.getPage(pix);
      const PW2 = src.getWidth(), PH2 = src.getHeight();
      const emb = await out.embedPage(src);
      out.removePage(pix);
      const np = out.insertPage(pix, [PW2, PH2]);
      np.drawPage(emb, { x: 0, y: 0, width: PW2, height: PH2 });
      const X = (v) => (v / 100) * PW2;
      const Y = (v) => PH2 - (v / 100) * PH2;
      const sw = (sh.x1 - sh.x0) / sh.strips;
      for (let i = 0; i < sh.strips; i++) {
        const dx0 = X(sh.x0 + i * sw), dx1 = X(sh.x0 + (i + 1) * sw);
        const sx0 = X(sh.x0 + sh.perm[i] * sw);
        const yT = Y(sh.y0), yB = Y(sh.y1);
        np.pushOperators(pushGraphicsState(),
          moveTo(dx0, yB), lineTo(dx1, yB), lineTo(dx1, yT), lineTo(dx0, yT),
          closePath(), clip(), endPath());
        np.drawPage(emb, { x: dx0 - sx0, y: 0, width: PW2, height: PH2 });
        np.pushOperators(popGraphicsState());
      }
      /* Guías de corte: discontinuas en cada frontera + tijera arriba */
      const ink = rgb(0.05, 0.15, 0.16);
      const yB2 = Y(sh.y1), yT2 = Y(sh.y0);
      for (let i = 1; i < sh.strips; i++) {
        const lx = X(sh.x0 + i * sw);
        np.drawLine({ start: { x: lx, y: yB2 }, end: { x: lx, y: yT2 },
          thickness: 1, color: ink, dashArray: [6, 4] });
      }
      const scx = X(sh.x0 + sw), scy = yT2 + 16;
      np.drawLine({ start: { x: scx - 5, y: scy + 7 }, end: { x: scx + 5, y: scy - 7 }, thickness: 1.6, color: ink });
      np.drawLine({ start: { x: scx + 5, y: scy + 7 }, end: { x: scx - 5, y: scy - 7 }, thickness: 1.6, color: ink });
      np.drawCircle({ x: scx - 6.5, y: scy + 8.5, size: 3.2, borderColor: ink, borderWidth: 1.6 });
      np.drawCircle({ x: scx + 6.5, y: scy + 8.5, size: 3.2, borderColor: ink, borderWidth: 1.6 });
    }
  }
  fs.mkdirSync(path.dirname(path.join(ROOT, o.out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, o.out), await out.save());
  console.log('OK', o.out, '| valores:', Object.keys(o.values).length, '| fotos:', Object.keys(o.photos).length,
    warns.length ? '| avisos: ' + warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
