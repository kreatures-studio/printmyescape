/* Núcleo de composición para el NAVEGADOR (y Node con globales).
   Sin require ni fs: todo entra por parámetros. Usa globales PDFLib/fontkit.
   Incluye rotación de textos (tilts e verticales) y fotos JPG/PNG.
   Expone: globalThis.PMECompose = { composeGame }.
*/
(function () {
'use strict';

const HS_MIN = 0.7, SIZE_MIN = 0.55;

function hex(h, rgb) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
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
function fit(font, text, boxPt, size0, opt) {
  opt = opt || {};
  const single = !!opt.single;
  const targetHs = opt.targetHs || 1;
  const vertical = Math.abs(opt.angle || 0) > 45;
  const lenBudget = vertical ? boxPt.h : boxPt.w;
  const fitW = (single ? boxPt.w * 2.5 : boxPt.w) || 1;
  let size = opt.lockSize || size0;
  const min = size0 * (single ? 0.5 : SIZE_MIN);
  const floor = single ? 0.6 : HS_MIN;
  let lines = [text], hs = [1];
  const once = (sz) => {
    /* Presupuesto de línea con la condensación mínima (70%): lo que quepa
       condensado no se parte; luego hs respeta el aspecto de referencia. */
    const budget = (vertical ? boxPt.h : fitW) / HS_MIN;
    const nat = single ? [text] : wrap(font, text, sz, budget);
    const h = nat.map((ln) => {
      const nw = font.widthOfTextAtSize(ln, sz) || 1;
      return Math.min(targetHs, (vertical ? boxPt.h : fitW) / nw);
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
    const tooNarrow = Math.min.apply(null, hs.concat([1])) < floor;
    const tooTall = vertical
      ? lines.length * size > boxPt.w + size * 0.5
      : (!single && lines.length * lh > boxPt.h + lh * 0.5);
    if ((!tooNarrow && !tooTall) || size <= min) break;
    size *= 0.94;
  }
  return { lines, hs, size, warn: size < size0 * 0.85 };
}

function drawFitted(page, degrees, font, text, boxPt, size0, color, align, opt) {
  opt = opt || {};
  const angle = opt.angle || 0;
  const vertical = Math.abs(angle) > 45;
  const r = fit(font, text, boxPt, size0, {
    single: opt.single, targetHs: opt.targetHs, angle, lockSize: opt.lockSize,
  });
  const { lines, hs, size } = r;
  const rot = degrees(angle);
  if (!vertical) {
    const lh = size * 1.25;
    const cx = boxPt.x + boxPt.w / 2, cy = boxPt.yTop - boxPt.h / 2;
    const firstBase = cy + (lines.length * lh) / 2 - size * 0.95;
    lines.forEach((ln, i) => {
      const w = font.widthOfTextAtSize(ln, size) * hs[i];
      let x = boxPt.x;
      if (align === 'center') x = cx - w / 2;
      else if (align === 'right') x = boxPt.x + boxPt.w - w;
      page.drawText(ln, {
        x, y: firstBase - i * lh, size, font, color,
        horizontalScaling: Math.round(hs[i] * 100), rotate: rot,
      });
    });
  } else {
    /* Texto vertical: las líneas avanzan en perpendicular. Ángulo -90: se lee
       de arriba abajo (base a la derecha de la columna); +90 al revés. */
    const down = angle < 0;
    const step = size;
    const total = (lines.length - 1) * step;
    lines.forEach((ln, i) => {
      const cx = boxPt.x + boxPt.w / 2;
      const x = down ? cx + total / 2 - i * step + size * 0.35
                     : cx - total / 2 + i * step - size * 0.35;
      const y = down ? boxPt.yTop - 2 : boxPt.yTop - boxPt.h + 2;
      page.drawText(ln, {
        x, y, size, font, color,
        horizontalScaling: Math.round(hs[i] * 100), rotate: rot,
      });
    });
  }
  return r.warn;
}

async function composeGame(deps) {
  const PDFLib = globalThis.PDFLib, fontkit = globalThis.fontkit;
  if (!PDFLib || !fontkit) throw new Error('faltan PDFLib/fontkit');
  const { PDFDocument, degrees, rgb } = PDFLib;
  const { bgBytes, fonts, template, fixed, i18n, values, photos, onProgress } = deps;
  const tick = onProgress || (() => {});
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const bgDoc = await PDFDocument.load(bgBytes);
  const ff = {};
  for (const k of Object.keys(fonts)) {
    ff[k] = await out.embedFont(fonts[k].bytes, { subset: fonts[k].subset !== false });
  }
  const pickFont = (family, size) => {
    if (/myriad|caveat|script/i.test(family || '')) return 'caveatBold';
    if (/anton|black|display/i.test(family || '')) return 'antonSC';
    if (/segoe/i.test(family || '')) return /script/i.test(family || '') ? 'caveatBold' : 'opensans';
    if (/georgia|arial/i.test(family || '')) return size >= 12 ? 'opensansBold' : 'opensans';
    return size >= 12 ? 'opensansBold' : 'opensans';
  };
  const warns = [];
  const n = template.pages.length;
  for (let pi = 0; pi < n; pi++) {
    const pages = await out.copyPages(bgDoc, [pi]);
    const bg = pages[0];
    out.addPage(bg);
    const PW = bg.getWidth(), PH = bg.getHeight();
    const box = (b) => ({
      x: (b.x / 100) * PW, w: (b.w / 100) * PW,
      yTop: PH - (b.y / 100) * PH, h: (b.h / 100) * PH,
    });
    for (const f of fixed.filter((x) => x.page === pi + 1)) {
      const str = i18n[f.key] !== undefined ? i18n[f.key] : f.es;
      const font = ff[pickFont(f.fontFamily, f.size)];
      const size0 = (f.size / 100) * PW;
      let use = size0;
      for (const lang of Object.keys(deps.i18nAll || { [deps.lang]: i18n })) {
        const t = (deps.i18nAll[lang] || {})[f.key] !== undefined ? deps.i18nAll[lang][f.key] : f.es;
        const rr = fit(font, t, box(f), size0, { targetHs: f.xscale, angle: f.angle || 0 });
        if (rr.size < use) use = rr.size;
      }
      if (drawFitted(bg, degrees, font, str, box(f), size0, hex(f.color, rgb), f.align || 'left',
          { targetHs: f.xscale, angle: f.angle || 0, lockSize: use })) {
        warns.push(`${f.key}: encogido fuerte`);
      }
    }
    for (const s of template.pages[pi].slots) {
      const fld = template.fields.find((x) => x.id === s.field);
      if (!fld) continue;
      if (fld.type === 'text') {
        const val = values[s.field] || '';
        if (!val) continue;
        const font = ff[pickFont(s.fontFamily || 'caveat', s.size)];
        if (drawFitted(bg, degrees, font, val, box(s), (s.size / 100) * PW,
            hex(s.color || '#000000', rgb), s.align || 'left',
            { single: true, targetHs: s.xscale || 1, angle: s.angle || 0 })) {
          warns.push(`${s.field}: valor encogido`);
        }
      } else if (fld.type === 'image') {
        const ph = photos[s.field];
        if (!ph) continue;
        const im = ph.format === 'png' ? await out.embedPng(ph.bytes) : await out.embedJpg(ph.bytes);
        const b = box(s);
        /* Foto rotada como el marco (angle en grados CCW): se dibuja
           centrada calculando la esquina para que el centro coincida. */
        const th = ((s.angle || 0) * Math.PI) / 180;
        const w = b.w * 0.96, h = b.h * 0.96;
        const cx = b.x + b.w / 2, cy = b.yTop - b.h / 2;
        const c = Math.cos(th), si = Math.sin(th);
        const x0 = cx - ((w * c - h * si) / 2), y0 = cy - ((w * si + h * c) / 2);
        bg.drawImage(im, { x: x0, y: y0, width: w, height: h, rotate: degrees(s.angle || 0) });
      }
    }
    tick((pi + 1) / n);
  }
  return { bytes: await out.save(), warns };
}

globalThis.PMECompose = { composeGame, fit, wrap };
})();
