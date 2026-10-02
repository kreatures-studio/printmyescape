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
  /* Caveat: embed completo (el subsetter rompe algunos glifos) */
  caveatBold: { file: '../assets/fonts/Caveat-Bold.ttf', subset: false },
  antonSC: { file: '../assets/fonts/AntonSC-Regular.ttf', subset: true },
  opensans: { file: '../assets/fonts/OpenSans-Regular.ttf', subset: true },
  opensansBold: { file: '../assets/fonts/OpenSans-Bold.ttf', subset: true },
  courier: { file: '../assets/fonts/CourierPrime-Regular.ttf', subset: true },
  courierBold: { file: '../assets/fonts/CourierPrime-Bold.ttf', subset: true },
};
/* La familia extraída manda: manuscritas a Caveat, titulares a Anton SC y
   las Bold del artista a OpenSans-Bold. OpenSans/Myriad Regular van en
   regular: el tamaño NO decide el peso. */
function pickFont(family, size) {
  void size;
  const f = family || '';
  if (/myriad|caveat|script|hand/i.test(f)) return 'caveatBold';
  if (/anton|display/i.test(f)) return 'antonSC';
  if (/bold|black/i.test(f)) return 'opensansBold';
  return 'opensans';
}
const ALIGN_OVERRIDE = {}; /* ej: {'notas-y-observaciones': 'center'} */
/* Factura: typewriter monoespaciada (cifras y columnas legibles). */
const MONO = { factura: 1, concepto: 1, cant: 1, 'precio-unit': 1, importe: 1, cliente: 1 };
const MONO_R = /vibrador|1-000|no-2025|^1-9$/;
function pickFontFor(f) {
  if (MONO[f.key]) return 'courierBold';
  if (MONO_R.test(f.key)) return 'courier';
  return pickFont(f.fontFamily, f.size);
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
      const x0 = down ? colC + size * 0.35 : colC - size * 0.35;
      const y0 = down
        ? boxPt.yTop - (boxPt.h - span) / 2
        : boxPt.yTop - boxPt.h + (boxPt.h - span) / 2;
      const p = pivot(x0, y0);
      drawLine(page, ln, p.x, p.y, size, font, color, hs[i], angle);
    });
  }
  return warn;
}
/* Foto con ajuste "cover" (sin deformar) recortada al marco rotado. */
function drawPhoto(page, im, b, angle) {
  const iw = im.width || 100, ih = im.height || 100;
  const fw = b.w * 0.96, fh = b.h * 0.96;
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
    /* fijos traducidos */
    const pageFixed = fixed.filter((x) => x.page === pi + 1);
    const sibBoxes = pageFixed.map((x) => {
      const bb = box(x);
      return { ref: x, top: bb.yTop, bot: bb.yTop - bb.h, h: bb.h };
    });
    for (const f of pageFixed) {
      const str = i18n[f.key] !== undefined ? i18n[f.key] : f.es;
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
          if (!fld || fld.type !== 'text') continue;
          const val = o.values[s.field] || '';
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
    /* variables */
    for (const s of tpl.pages[pi].slots) {
      const fld = tpl.fields.find((x) => x.id === s.field);
      if (!fld || fld.type !== 'text') continue;
      const val = o.values[s.field] || '';
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
    /* fotos: JPEG/PNG con ajuste cover recortado al marco (rotado según
       el ángulo del marco); sin foto, marcador gris de geometría */
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
      const by = b.yTop - b.h;
      const src = o.photos[s.field];
      if (src) {
        const im = await imgFor(src);
        drawPhoto(bg, im, b, s.angle || 0);
      } else {
        bg.drawRectangle({ x: b.x, y: by, width: b.w, height: b.h, color: rgb(0.85, 0.85, 0.85), borderColor: rgb(0.5, 0.5, 0.5), borderWidth: 1 });
        const t = 'FOTO';
        const fs2 = 10, tw = ff.opensansBold.widthOfTextAtSize(t, fs2);
        bg.drawText(t, { x: b.x + (b.w - tw) / 2, y: by + b.h / 2, size: fs2, font: ff.opensansBold, color: rgb(0.4, 0.4, 0.4) });
      }
    }
  }
  fs.mkdirSync(path.dirname(path.join(ROOT, o.out)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, o.out), await out.save());
  console.log('OK', o.out, '| valores:', Object.keys(o.values).length, '| fotos:', Object.keys(o.photos).length,
    warns.length ? '| avisos: ' + warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
