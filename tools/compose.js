#!/usr/bin/env node
/* Fase 2 — Compone el PDF final: fondo limpio + fijos traducidos (i18n)
   + variables del usuario + fotos. Mismo stack que usará el wizard
   en el navegador (pdf-lib + fontkit), ejecutado aquí en Node.
   Uso: node tools/compose.js --lang es|en --out salidas/X.pdf [--values '{"NOMBRE":"..."}']
*/
'use strict';
const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const ROOT = path.join(__dirname, '..');
const FONTS = {
  /* Caveat: embed completo (el subsetter rompe algunos glifos) */
  caveatBold: { file: '../assets/fonts/Caveat-Bold.ttf', subset: false },
  antonSC: { file: '../assets/fonts/AntonSC-Regular.ttf', subset: true },
  opensans: { file: '../assets/fonts/OpenSans-Regular.ttf', subset: true },
  opensansBold: { file: '../assets/fonts/OpenSans-Bold.ttf', subset: true },
};
/* MAPEO (el piloto usa OpenSans/Anton/MyriadPro; el acuerdo final es
   Anton SC + Open Sans + Caveat para nombres; cuando el artista reexporte,
   este mapa será casi identidad).
   Variables/manuscritas -> Caveat; titulares Anton -> Anton SC;
   etiquetas OpenSans 10pt -> Open Sans regular; lista 14pt -> Open Sans bold. */
function pickFont(family, size) {
  if (/myriad|caveat|script|hand/i.test(family)) return 'caveatBold';
  if (/anton|black|display/i.test(family)) return 'antonSC';
  return size >= 12 ? 'opensansBold' : 'opensans';
}
const ALIGN_OVERRIDE = {}; /* ej: {'notas-y-observaciones': 'center'} */

function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function args() {
  const o = { lang: 'es', out: null, values: {}, photos: {} };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--values') o.values = JSON.parse(a[++i]);
    else if (a[i] === '--values-file') o.values = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
    else if (a[i] === '--photos-file') o.photos = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
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
   condensación horizontal (como hace Illustrator) hasta el 70% y encoge
   el tamaño hasta el 55%. Devuelve líneas + tamaño + hs por línea. */
const HS_MIN = 0.7, SIZE_MIN = 0.55;
function fit(font, text, boxPt, size0, single) {
  let size = size0;
  const min = size0 * SIZE_MIN;
  let lines = [text], hs = [1];
  for (;;) {
    const nat = single ? [text] : wrap(font, text, size, boxPt.w);
    lines = nat;
    hs = nat.map((ln) => {
      const w = font.widthOfTextAtSize(ln, size) || 1;
      return Math.min(1, boxPt.w / w);
    });
    const lh = size * 1.25;
    const tooNarrow = Math.min(...hs) < HS_MIN;
    const tooTall = !single && lines.length * lh > boxPt.h + lh * 0.5;
    if ((!tooNarrow && !tooTall) || size <= min) break;
    size *= 0.94;
  }
  return { lines, hs, size, warn: size < size0 * 0.85 };
}
function drawFitted(page, font, text, boxPt, size0, color, align, single) {
  const { lines, hs, size } = fit(font, text, boxPt, size0, single);
  const lh = size * 1.25;
  const cx = boxPt.x + boxPt.w / 2, cy = boxPt.yTop - boxPt.h / 2;
  const firstBase = cy + (lines.length * lh) / 2 - size * 0.95;
  lines.forEach((ln, i) => {
    const w = font.widthOfTextAtSize(ln, size) * hs[i];
    let x = boxPt.x;
    if (align === 'center') x = cx - w / 2;
    else if (align === 'right') x = boxPt.x + boxPt.w - w;
    page.drawText(ln, { x, y: firstBase - i * lh, size, font, color, horizontalScaling: Math.round(hs[i] * 100) });
  });
}

async function main() {
  const o = args();
  if (!o.out) { console.error('falta --out'); process.exit(1); }
  const tpl = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/recurso-1/template.json'), 'utf8'));
  const fixed = JSON.parse(fs.readFileSync(path.join(ROOT, 'templates/recurso-1/texts.json'), 'utf8'));
  const i18n = JSON.parse(fs.readFileSync(path.join(ROOT, `templates/recurso-1/i18n-${o.lang}.json`), 'utf8'));

  const bgBytes = fs.readFileSync(path.join(ROOT, 'juego-fondo.pdf'));
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
    /* fijos traducidos */
    for (const f of fixed.filter((x) => x.page === pi + 1)) {
      const str = i18n[f.key] !== undefined ? i18n[f.key] : f.es;
      const font = ff[pickFont(f.fontFamily, f.size)];
      const size0 = (f.size / 100) * PW;
      const align = ALIGN_OVERRIDE[f.key] || 'left';
      if (drawFitted(bg, font, str, box(f), size0, hex(f.color), align)) {
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
      drawFitted(bg, font, val, box(s), (s.size / 100) * PW, hex(s.color || '#000000'), s.align || 'left', true);
    }
    /* fotos: JPEG/PNG recortados al aspecto del marco (el wizard los
       pre-recorta con canvas); sin foto, marcador gris de geometría */
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
        bg.drawImage(im, { x: b.x, y: by, width: b.w, height: b.h });
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
  console.log('OK', o.out, warns.length ? '| avisos: ' + warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
