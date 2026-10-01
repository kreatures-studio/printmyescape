/* Núcleo de composición para el NAVEGADOR (y Node con globales).
   Sin require ni fs: todo entra por parámetros. Usa globales PDFLib/fontkit.
   Incluye rotación de textos (tilts e verticales) y fotos JPG/PNG.
   Expone: globalThis.PMECompose = { composeGame }.
*/
(function () {
'use strict';

/* NOTA DE IMPRESIÓN (2026-10-01): pdf-lib NO aplica `horizontalScaling`
   en drawText (la opción no existe y se ignora en silencio): la
   condensación se aplica con la matriz de transformación (CTM) alrededor
   del origen de cada línea, y la rotación pivota sobre el centro de la
   caja para que el bloque no se desplace al imprimir. */
const HS_MIN = 0.7, SIZE_MIN = 0.55, HS_MAX = 1.05, HS_ABS_MIN = 0.3;

function hex(h, rgb) {
  const n = parseInt(h.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function clampTarget(t, vertical) {
  let x = Number(t);
  if (!(x > 0)) x = 1;
  /* xscale de extracción para textos verticales con valores extremos
     (<0.3 o >2) es ruido de la extracción: se ignora (sin condensar). */
  if (vertical && (x < 0.3 || x > 2)) x = 1;
  if (x > HS_MAX) x = HS_MAX;
  return x;
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
  const vertical = Math.abs(opt.angle || 0) > 45;
  const targetHs = clampTarget(opt.targetHs, vertical);
  /* El artista puede haber condensado por debajo del 70% (p. ej. 0.63):
     el suelo de condensación respeta su valor en vez de forzar encogidos. */
  const floor = single ? Math.min(0.6, targetHs) : Math.min(HS_MIN, targetHs);
  /* Los valores de una línea pueden crecer a la derecha de su caja solo
     si esta es estrecha (códigos): en cajas anchas (títulos) el texto
     blanco se saldría de su pastilla y se volvería invisible. */
  const grow = single ? (opt.grow || 1) : 1;
  const fitW = (boxPt.w * grow) || 1;
  let size = opt.lockSize || size0;
  const min = size0 * (single ? 0.5 : SIZE_MIN);
  let lines = [text], hs = [1];
  const budgetFor = (sz) => {
    void sz;
    return (vertical ? boxPt.h : fitW) / floor;
  };
  const once = (sz) => {
    /* Presupuesto de línea con la condensación efectiva: lo que quepa
       condensado no se parte; luego hs respeta el aspecto de referencia.
       Los valores de una línea pueden traer \n (p. ej. el chat): se
       apilan como líneas propias (pdf-lib partiría el texto por su
       cuenta y lo descentraría). */
    const budget = budgetFor(sz);
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
    const tooNarrow = Math.min.apply(null, hs.concat([1])) < floor;
    const multi = !single || lines.length > 1;
    const tooTall = vertical
      ? lines.length * size > boxPt.w + size * 0.5
      : (multi && lines.length * lh > boxPt.h + lh * 0.5);
    if ((!tooNarrow && !tooTall) || size <= min) break;
    size *= 0.94;
  }
  return { lines, hs, size, warn: size < size0 * 0.85 };
}

/* Dibuja una línea aplicando condensación horizontal hs a lo largo de la
   dirección del texto mediante la CTM (pdf-lib no tiene horizontalScaling).
   Si no hay operadores disponibles, dibuja sin condensar. */
function drawLine(page, degrees, ops, ln, x, y, size, font, color, hs, angle) {
  if (!ops || !(hs < 0.999)) {
    page.drawText(ln, { x, y, size, font, color, rotate: degrees(angle) });
    return;
  }
  const rad = (angle * Math.PI) / 180;
  page.pushOperators(
    ops.pushGraphicsState(), ops.translate(x, y),
    ops.rotateRadians(rad), ops.scale(hs, 1), ops.rotateRadians(-rad),
    ops.translate(-x, -y),
  );
  try {
    page.drawText(ln, { x, y, size, font, color, rotate: degrees(angle) });
  } finally {
    page.pushOperators(ops.popGraphicsState());
  }
}

function drawFitted(page, degrees, ops, font, text, boxPt, size0, color, align, opt) {
  opt = opt || {};
  const angle = opt.angle || 0;
  const vertical = Math.abs(angle) > 45;
  const r = fit(font, text, boxPt, size0, {
    single: opt.single, targetHs: opt.targetHs, angle, lockSize: opt.lockSize,
    grow: opt.grow,
  });
  const { lines, hs, size } = r;
  const rad = (angle * Math.PI) / 180;
  const c = Math.cos(rad), s = Math.sin(rad);
  const cx = boxPt.x + boxPt.w / 2, cy = boxPt.yTop - boxPt.h / 2;
  /* Rota un punto del layout (calculado sin rotar) alrededor del centro
     de la caja: el bloque queda centrado aunque esté inclinado. */
  const pivot = (x0, y0) => ({
    x: cx + (x0 - cx) * c - (y0 - cy) * s,
    y: cy + (x0 - cx) * s + (y0 - cy) * c,
  });
  if (!vertical) {
    const lh = size * 1.25;
    /* Líneas justificadas en la altura de la caja (primera arriba, última
       abajo): en cajas normales equivale al apilado clásico centrado, y en
       cajas altas de fijos (unión de varias líneas de origen, con valores
       intercalados en sus propias cajas) cada línea vuelve a su zona en
       vez de chocar con los valores. Si la caja es baja, bloque centrado. */
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
      drawLine(page, degrees, ops, ln, p.x, p.y, size, font, color, hsi, angle);
    });
  } else {
    /* Texto vertical: cada línea recorre el alto de la caja y se centra
       en él; las columnas se centran en el ancho. Ángulo -90: se lee
       de arriba abajo; +90 al revés. */
    const down = angle < 0;
    const step = size;
    const total = (lines.length - 1) * step;
    lines.forEach((ln, i) => {
      const len = font.widthOfTextAtSize(ln, size) * hs[i];
      const span = Math.min(len, boxPt.h);
      const colC = down
        ? cx + total / 2 - i * step
        : cx - total / 2 + i * step;
      /* La columna del glifo ocupa ~0.35·size a la derecha del origen
         (para -90): se compensa para centrar la tinta en la columna. */
      const x0 = down ? colC + size * 0.35 : colC - size * 0.35;
      const y0 = down
        ? boxPt.yTop - (boxPt.h - span) / 2
        : boxPt.yTop - boxPt.h + (boxPt.h - span) / 2;
      const p = pivot(x0, y0);
      drawLine(page, degrees, ops, ln, p.x, p.y, size, font, color, hs[i], angle);
    });
  }
  return r.warn;
}

/* Foto con ajuste "cover" (sin deformar) recortada al marco rotado. */
function drawPhoto(page, ops, im, iw, ih, b, angle, degrees) {
  const fw = b.w * 0.96, fh = b.h * 0.96;
  const cx = b.x + b.w / 2, cy = b.yTop - b.h / 2;
  const th = ((angle || 0) * Math.PI) / 180;
  const c = Math.cos(th), si = Math.sin(th);
  const sc = Math.max(fw / iw, fh / ih);
  const dw = iw * sc, dh = ih * sc;
  /* Origen de la imagen (rotada sobre su esquina) para que su centro
     coincida con el del marco. */
  const x0 = cx - (dw * c - dh * si) / 2, y0 = cy - (dw * si + dh * c) / 2;
  const fx = cx - fw / 2, fy = cy - fh / 2;
  const corner = (u, v) => ({ x: fx + u * c - v * si, y: fy + u * si + v * c });
  const p1 = corner(0, 0), p2 = corner(fw, 0), p3 = corner(fw, fh), p4 = corner(0, fh);
  if (ops) {
    page.pushOperators(
      ops.pushGraphicsState(),
      ops.moveTo(p1.x, p1.y), ops.lineTo(p2.x, p2.y),
      ops.lineTo(p3.x, p3.y), ops.lineTo(p4.x, p4.y),
      ops.closePath(), ops.clip(), ops.endPath(),
    );
  }
  try {
    page.drawImage(im, { x: x0, y: y0, width: dw, height: dh, rotate: degrees(angle || 0) });
  } finally {
    if (ops) page.pushOperators(ops.popGraphicsState());
  }
}

async function composeGame(deps) {
  const PDFLib = globalThis.PDFLib, fontkit = globalThis.fontkit;
  if (!PDFLib || !fontkit) throw new Error('faltan PDFLib/fontkit');
  const { PDFDocument, degrees, rgb } = PDFLib;
  const hasOps = PDFLib.pushGraphicsState && PDFLib.popGraphicsState &&
    PDFLib.translate && PDFLib.scale && PDFLib.rotateRadians &&
    PDFLib.moveTo && PDFLib.lineTo && PDFLib.closePath &&
    PDFLib.clip && PDFLib.endPath;
  const ops = hasOps ? {
    pushGraphicsState: PDFLib.pushGraphicsState, popGraphicsState: PDFLib.popGraphicsState,
    translate: PDFLib.translate, scale: PDFLib.scale, rotateRadians: PDFLib.rotateRadians,
    moveTo: PDFLib.moveTo, lineTo: PDFLib.lineTo, closePath: PDFLib.closePath,
    clip: PDFLib.clip, endPath: PDFLib.endPath,
  } : null;
  const { bgBytes, fonts, template, fixed, i18n, values, photos, onProgress } = deps;
  const tick = onProgress || (() => {});
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const bgDoc = await PDFDocument.load(bgBytes);
  const ff = {};
  for (const k of Object.keys(fonts)) {
    ff[k] = await out.embedFont(fonts[k].bytes, { subset: fonts[k].subset !== false });
  }
  /* La familia extraída manda: Anton a Anton SC, manuscritas a Caveat y
     las Bold del artista (Arial-BoldMT, Georgia-Bold) a OpenSans-Bold.
     OpenSans/Myriad Regular van en regular: el tamaño NO decide el peso
     (una negrita indebida ensancha el texto y come el hueco de al lado). */
  const pickFont = (family, size) => {
    void size;
    const f = family || '';
    if (/myriad|caveat|script|hand/i.test(f)) return 'caveatBold';
    if (/anton|display/i.test(f)) return 'antonSC';
    if (/bold|black/i.test(f)) return 'opensansBold';
    return 'opensans';
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
    const pageFixed = fixed.filter((x) => x.page === pi + 1);
    const sibBoxes = pageFixed.map((x) => {
      const bb = box(x);
      return { ref: x, top: bb.yTop, bot: bb.yTop - bb.h, h: bb.h };
    });
    for (const f of pageFixed) {
      const str = i18n[f.key] !== undefined ? i18n[f.key] : f.es;
      const font = ff[pickFont(f.fontFamily, f.size)];
      const size0 = (f.size / 100) * PW;
      let use = size0;
      for (const lang of Object.keys(deps.i18nAll || { [deps.lang]: i18n })) {
        const t = (deps.i18nAll[lang] || {})[f.key] !== undefined ? deps.i18nAll[lang][f.key] : f.es;
        const rr = fit(font, t, box(f), size0, { targetHs: f.xscale, angle: f.angle || 0 });
        if (rr.size < use) use = rr.size;
      }
      /* Carreras de valores de esta página para continuaciones inline
         (fijo y valor en la misma línea: el fijo continúa tras el valor).
         Solo valores de una línea; la x1 es el final de la tinta. */
      const inline = [];
      if (!((f.angle || 0) > 45 || (f.angle || 0) < -45)) {
        for (const s of template.pages[pi].slots) {
          const fld = template.fields.find((x) => x.id === s.field);
          if (!fld || fld.type !== 'text') continue;
          const val = values[s.field] || '';
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
      if (drawFitted(bg, degrees, ops, font, str, box(f), size0, hex(f.color, rgb), f.align || 'left',
          { targetHs: f.xscale, angle: f.angle || 0, lockSize: use, inline,
            siblings: sibBoxes.filter((s) => s.ref !== f) })) {
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
        if (drawFitted(bg, degrees, ops, font, val, box(s), (s.size / 100) * PW,
            hex(s.color || '#000000', rgb), s.align || 'left',
            { single: true, targetHs: s.xscale || 1, angle: s.angle || 0,
              grow: (s.w || 0) < 10 ? 2.5 : 1 })) {
          warns.push(`${s.field}: valor encogido`);
        }
      } else if (fld.type === 'image') {
        const ph = photos[s.field];
        if (!ph) continue;
        const im = ph.format === 'png' ? await out.embedPng(ph.bytes) : await out.embedJpg(ph.bytes);
        const iw = im.width || 100, ih = im.height || 100;
        drawPhoto(bg, ops, im, iw, ih, box(s), s.angle || 0, degrees);
      }
    }
    tick((pi + 1) / n);
  }
  return { bytes: await out.save(), warns };
}

globalThis.PMECompose = { composeGame, fit, wrap, drawFitted, drawLine, drawPhoto };
})();
