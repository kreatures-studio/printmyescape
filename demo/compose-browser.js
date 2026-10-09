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
  /* Líneas posicionales: si la caja trae sus líneas originales y el texto
     cabe en ellas, cada línea se dibuja en su sitio exacto (sin reflujo).
     Si sobran palabras o alguna no cabe, se usa el apilado clásico. */
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
          drawLine(page, degrees, ops, ln.text, p.x, p.y, size, font, color, ln.hs, angle);
        });
        return r.warn;
      }
    }
  }
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
    let useSpread = lines.length > 1 && spread >= lh * 0.9 && !opt.tight;
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
    const firstBase = (opt.baseY !== undefined && lines.length === 1)
      ? opt.baseY : (opt.vTop && lines.length === 1) ? topBase : cy + totalH / 2 - size * 0.95;
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
        const dyb = Math.abs(y0 - g.base);
        if (dyb < Math.max(size, g.size) * 0.8 && g.x0 >= boxPt.x - 1 && g.x0 < boxPt.x + boxPt.w &&
            (g.bestDy === undefined || dyb < g.bestDy)) { g.bestDy = dyb; g.matchedY = y0; }
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
      /* La columna del glifo queda a la DERECHA del origen para -90
         (ver probe): se compensa a la izquierda para centrar la tinta.
         Para +90, al revés. */
      const x0 = down ? colC - size * 0.35 : colC + size * 0.35;
      const y0 = down
        ? (opt.vStart ? boxPt.yTop : boxPt.yTop - (boxPt.h - span) / 2)
        : boxPt.yTop - boxPt.h + (boxPt.h - span) / 2;
      /* SIN pivot: (x0, y0) ya está en el marco rotado (el pivot lo
         rotaría dos veces y amontona las columnas). */
      drawLine(page, degrees, ops, ln, x0, y0, size, font, color, hs[i], angle);
    });
  }
  return r.warn;
}

/* Foto con ajuste "cover" (sin deformar) recortada al marco rotado. */
function drawPhoto(page, ops, im, iw, ih, b, angle, degrees) {
    const fw = b.w, fh = b.h;
  const cx = b.x + b.w / 2, cy = b.yTop - b.h / 2;
  const th = ((angle || 0) * Math.PI) / 180;
  const c = Math.cos(th), si = Math.sin(th);
  const sc = Math.max(fw / iw, fh / ih);
  const dw = iw * sc, dh = ih * sc;
  /* Origen de la imagen (rotada sobre su esquina) para que su centro
     coincida con el del marco. */
  const x0 = cx - (dw * c - dh * si) / 2, y0 = cy - (dw * si + dh * c) / 2;
  const fx = cx - fw / 2, fy = cy - fh / 2;
  /* esquinas del marco girado alrededor de SU CENTRO (no de la esquina inferior) */
  const corner = (u, v) => ({ x: cx + (u - fw / 2) * c - (v - fh / 2) * si,
    y: cy + (u - fw / 2) * si + (v - fh / 2) * c });
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

/* Saneado de entradas: solo texto que las fuentes del PDF pueden dibujar.
   Fuera: emojis, controles, marcas invisibles, alfabetos no latinos. Longitud acotada. */
const CLEAN_BAD = /[^\t\n\u0020-\u007E\u00A0-\u024F\u20AC\u2013\u2014\u2018\u2019\u201C\u201D\u2026\u00BF\u00A1]/g;
const CLEAN_MAX = 400;
function cleanText(s, multiline) {
  let t = String(s == null ? '' : s).normalize('NFC').replace(/\r/g, '').replace(CLEAN_BAD, '');
  if (multiline) {
    t = t.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  } else {
    t = t.replace(/\s+/g, ' ').trim();
  }
  return t.slice(0, CLEAN_MAX);
}
function cleanValues(values) {
  const out = {};
  Object.keys(values || {}).forEach((k) => {
    const v = values[k];
    out[k] = typeof v === 'string' ? cleanText(v, k === 'B_NOTES' || k === 'B_INFO') : v;
  });
  return out;
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
  const { bgBytes, fonts, template, fixed, i18n, photos, onProgress } = deps;
  const values = cleanValues(deps.values);
  const tick = onProgress || (() => {});
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const bgDoc = await PDFDocument.load(bgBytes);
  const ff = {};
  for (const k of Object.keys(fonts)) {
    ff[k] = await out.embedFont(fonts[k].bytes, { subset: fonts[k].subset !== false });
  }
  /* La familia extraída manda: manuscritas a Caveat (Bold solo si el
     artista la marcó Bold), titulares a Anton Regular y las Bold del
     artista a OpenSans-Bold. OpenSans/Myriad Regular van en regular. */
  /* Textos manuscritos: Caveat ~1,65x mas estrecha que Segoe Script. */
  const SCRIPT_K = 1.65;
  const isScriptFam = (family) => !family || /caveat|script|hand|myriad/i.test(family);
  const ptSize = (family, pct, PW) => (pct / 100) * PW * (isScriptFam(family) ? SCRIPT_K : 1);
  const pickFont = (family, size) => {
    void size;
    const f = family || '';
    if (/pigpen|runes/i.test(f)) return 'runes';
    if (/myriad/i.test(f)) return 'caveatBold';
    if (/caveat|script|hand/i.test(f)) return /bold|black/i.test(f) ? 'caveatBold' : 'caveat';
    if (/anton|display/i.test(f)) return 'anton';
    if (/bold|black/i.test(f)) return 'opensansBold';
    return 'opensans';
  };
  /* Factura: typewriter monoespaciada (cifras y columnas legibles). */
  const MONO = { factura: 1, concepto: 1, cant: 1, 'precio-unit': 1, importe: 1, cliente: 1 };
  const MONO_R = /vibrador|1-000|no-2025|^1-9$/;
  const pickFontFor = (f) => {
    if (MONO[f.key]) return 'courierBold';
    if (MONO_R.test(f.key)) return 'courier';
    return pickFont(f.fontFamily, f.size);
  };
  const warns = [];
  /* Reflow por línea: igual que en Node (valores dentro de la frase). */
  const FLOW_GAP_MAX = 5;
  const flowPairOk = (segs) => {
    if (segs.length !== 2) return false;
    const ids = segs.map((g) => ((g.ref.field || '').toUpperCase()));
    const m0 = /^(NOMBRE|APODO)_(\d+)$/.exec(ids[0] || '');
    const m1 = /^(NOMBRE|APODO)_(\d+)$/.exec(ids[1] || '');
    return !!(m0 && m1 && m0[2] === m1[2] && m0[1] !== m1[1]);
  };
  const buildFlowGroups = (tpl, fixed, pi) => {
    const items = [];
    for (const f of fixed) {
      if (f.page !== pi + 1 || Math.abs(f.angle || 0) >= 45) continue;
    /* numeros de pildora (chips): no entran en el reflow, se quedan en su sitio */
    if (/^\d+$/.test(String(f.es || '').trim())) continue;
      const multi = /\n/.test(f.es || '');
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
      /* Orden de lectura por centro (caja ancha puede empezar a la
         izquierda pero leerse después) */
      ln.items.sort((a, b) => ((a.x0 + a.x1) - (b.x0 + b.x1)));
      if (ln.items.some((it) => it.kind === 'm')) continue;
      const angs = ln.items.map((it) => it.ref.angle || 0);
      if (Math.max(...angs) - Math.min(...angs) > 12) continue;
      const gx0 = Math.min(...ln.items.map((it) => it.x0));
      const gx1 = Math.max(...ln.items.map((it) => it.x1));
      const gy0 = Math.min(...ln.items.map((it) => it.ref.y));
      const gy1 = Math.max(...ln.items.map((it) => it.ref.y + it.ref.h));
      const clash = multiBands.some((mb) => gx0 < mb.x1 && gx1 > mb.x0 &&
        gy0 < mb.bot - 0.3 && gy1 > mb.top + 0.3);
      if (clash) continue;
      let cur = [ln.items[0]];
      const flush = () => {
        const hasS = cur.some((it) => it.kind === 's');
        const hasF = cur.some((it) => it.kind === 'f');
        if (cur.length >= 2 && hasS && (hasF || flowPairOk(cur))) {
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
  };
  const cleanFlowText = (s) => String(s || '').replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?%)\]}])/g, '$1').replace(/([(\[{])\s+/g, '$1').trim();
  const drawFlowGroup = (bpg, gr, textOf, valOf, PW2, PH2) => {
    const runs = [];
    for (const g of gr) {
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
    const x0 = Math.min(...gr.map((g) => g.x0)) / 100 * PW2;
    const x1 = Math.max(...gr.map((g) => g.x1)) / 100 * PW2;
    const yT = Math.min(...gr.map((g) => g.ref.y)) / 100;
    const yB = Math.max(...gr.map((g) => g.ref.y + g.ref.h)) / 100;
    const yTop = PH2 - yT * PH2, boxH = (yB - yT) * PH2, maxW = x1 - x0;
    const fonts = runs.map((r) => ff[pickFont(r.fam, r.size)]);
    const floorHs = Math.min(0.6, ...runs.map((r) => (r.hsMax > 0 ? r.hsMax : 1)));
    let scale = 1, laid = null;
    for (;;) {
      const words = [];
      runs.forEach((r, ri) => {
        const sz = ptSize(r.fam, r.size, PW2) * scale;
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
          const lbl = (gr.find((g) => g.kind === 'f') || {}).ref;
          warns.push(((lbl && lbl.key) || (gr[0].ref.field || 'flujo')) + ': encogido');
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
    const angle = (gr[0].ref.angle || 0);
    const rad = (angle * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const ccx = (x0 + x1) / 2, ccy = yTop - boxH / 2;
    let pen = xx;
    for (const w of laid.words) {
      pen += (w.gap || 0) * laid.hs;
      const px = ccx + (pen - ccx) * c - (base - ccy) * s;
      const py = ccy + (pen - ccx) * s + (base - ccy) * c;
      drawLine(bpg, degrees, ops, w.w, px, py, w.sz, w.f, hex(w.color, rgb), laid.hs, angle);
      pen += w.nat * laid.hs;
    }
  };
  /* Runas pigpen (p10): igual que en Node. */
  const RUNE_INK = rgb(0.27, 0.06, 0.08);
  const RUNE_BG = rgb(0.85, 0.77, 0.64);
  const PIG_WALLS = { A: 'RB', B: 'LRB', C: 'LB', D: 'TRB', E: 'LRTB', F: 'TLB', G: 'TR', H: 'TLR', I: 'TL' };
  const PIG_CELLS = { A: [0,0], B: [1,0], C: [2,0], D: [0,1], E: [1,1], F: [2,1], G: [0,2], H: [1,2], I: [2,2] };
  const PIG_X = { S: [[[0,0],[0.5,0.5]], [[1,0],[0.5,0.5]]], T: [[[0,0],[0.5,0.5]], [[0,1],[0.5,0.5]]],
    U: [[[1,0],[0.5,0.5]], [[1,1],[0.5,0.5]]], V: [[[0,1],[0.5,0.5]], [[1,1],[0.5,0.5]]] };
  const normRunes = (s) => (s || '').toUpperCase().replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I').replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[^A-Z ]/g, '').replace(/ +/g, ' ').trim();
  const runeInfo = (ch) => {
    if (PIG_WALLS[ch]) return { walls: PIG_WALLS[ch], cell: PIG_CELLS[ch], dot: false };
    if ('JKLMNOPQR'.indexOf(ch) >= 0) { const b = 'ABCDEFGHI'['JKLMNOPQR'.indexOf(ch)]; return { walls: PIG_WALLS[b], cell: PIG_CELLS[b], dot: true }; }
    if (PIG_X[ch]) return { xsegs: PIG_X[ch], dot: false };
    if ('WXYZ'.indexOf(ch) >= 0) return { xsegs: PIG_X['STUV'['WXYZ'.indexOf(ch)]], dot: true };
    return null;
  };
  const runeWrap = (text, max) => {
    const words = String(text || '').split(' ').filter(Boolean);
    const out = [];
    let cur = '';
    for (const w of words) {
      if (!cur) cur = w;
      else if ((cur + ' ' + w).length <= max) cur += ' ' + w;
      else { out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out;
  };
  const drawRunes = (page, text, cx, cy, cell, maxW) => {
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
        thickness: Math.max(0.45, cell * 0.04), color: RUNE_INK });
      const g = runeInfo(it.ch);
      if (g.xsegs) {
        g.xsegs.forEach((s) => seg(s[0][0], s[0][1], s[1][0], s[1][1]));
        if (g.dot) page.drawCircle({ x: ox + cell / 2, y: oy + cell / 2, size: cell * 0.11, color: RUNE_INK });
      } else {
        const c = g.cell[0] / 3, r = g.cell[1] / 3, q = 1 / 3;
        if (g.walls.indexOf('L') >= 0) seg(c, r, c, r + q);
        if (g.walls.indexOf('R') >= 0) seg(c + q, r, c + q, r + q);
        if (g.walls.indexOf('T') >= 0) seg(c, r, c + q, r);
        if (g.walls.indexOf('B') >= 0) seg(c, r + q, c + q, r + q);
        if (g.dot) page.drawCircle({ x: ox + (c + q / 2) * cell, y: oy + (1 - r - q / 2) * cell, size: cell * 0.11, color: RUNE_INK });
      }
    }
  };
  /* Alias junto al nombre (la plantilla no trae huecos de alias). */
  const slotVal = (field) => {
    if (field === 'S2_SECRET_LOVE') {
      const nv = normRunes(values.S2_SECRET_LOVE || '');
      return nv ? 'TE QUIERO ' + nv : '';
    }
    let v = String(values[field] || '').replace(/[ \t]+/g, ' ')
      .split('\n').map((l) => l.trim()).join('\n').trim();
    /* debilidad multiple: 'a||b||Otro: x' -> 'a / b' (el Otro va en OTRO), igual que en Node */
    if (field === 'DEBILIDAD' && v.indexOf('||') >= 0) {
      v = v.split('||').filter((x) => x && !/^Otro:/.test(x)).join(' / ');
    }
    let a = '';
    if (field === 'NOMBRE_CUMPLE') a = values.B_ALIAS || '';
    else {
      const m = /^NOMBRE_([1-8])$/.exec(field || '');
      if (m) a = values['S' + m[1] + '_ALIAS'] || '';
    }
    a = (a || '').trim();
    if (a && v) return v + ' "' + a + '"';
    /* APODO_N lleva su coma (el fijo "," se pierde al extraer): sin apodo, nada */
    if (/^APODO_[1-8]$/.exec(field || '')) return v ? ', ' + v : v;
    /* S8_ICON_N: inicial del nombre de la app (no se pregunta, se deriva) */
    {
      const mi = /^S8_ICON_([1-4])$/.exec(field || '');
      if (mi) {
        const av = (values['APP_' + mi[1]] || '').trim();
        const mc = /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF0-9]/.exec(av);
        return mc ? mc[0].toUpperCase() : '';
      }
    }
    return v;
  };
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
    /* Caja + sus líneas originales en puntos (dibujo posicional). */
    const withLines = (f) => {
      const bp = box(f);
      bp.lines = ((f && f.lines) || []).map(box);
      return bp;
    };
    /* fondo de la nota cifrada (p10): tapa el ejemplo del artista */
    if (template.pages[pi].id === 'p10') {
      const rx = (v) => (v / 100) * PW, ry = (v) => PH - (v / 100) * PH;
      bg.drawRectangle({ x: rx(8), y: ry(90.5), width: rx(90.5) - rx(8), height: ry(37.5) - ry(90.5), color: RUNE_BG });
    }
    const pageFixed = fixed.filter((x) => x.page === pi + 1);
    const baseOverride = new Map();
    const textOf = (f) => (i18n[f.key] !== undefined ? i18n[f.key] : f.es);
    const flowGroups = buildFlowGroups(template, fixed, pi);
    const sibBoxes = pageFixed.filter((x) => !x._flow).map((x) => {
      const bb = box(x);
      return { ref: x, top: bb.yTop, bot: bb.yTop - bb.h, h: bb.h };
    });
    /* Fotos primero (debajo de textos). Bleed 2.5pt para tapar el marco rosa. */
    for (const s of template.pages[pi].slots) {
      const fld = template.fields.find((x) => x.id === s.field);
      if (!fld || fld.type !== 'image') continue;
      const b0 = box(s);
      const b = { x: b0.x - 2.5, w: b0.w + 5, yTop: b0.yTop + 2.5, h: b0.h + 5 };
      const ph = photos[s.field];
      if (!ph) {
        bg.drawRectangle({ x: b.x, y: b.yTop - b.h, width: b.w, height: b.h, color: rgb(0.85, 0.85, 0.85) });
        continue;
      }
      const im = ph.format === 'png' ? await out.embedPng(ph.bytes) : await out.embedJpg(ph.bytes);
      const iw = im.width || 100, ih = im.height || 100;
      drawPhoto(bg, ops, im, iw, ih, b, s.angle || 0, degrees);
    }
    /* Columnas giradas (angulo entre -135 y -45, se leen de arriba abajo): un
       valor seguido de un fijo en la misma columna ("Sabemos que [NOMBRE], estaba").
       El valor empieza pegado a su caja y el fijo que sigue se desplaza justo tras el valor. */
    const colShift = new Map();
    const colLeft = new Set();
    {
      const cols = [];
      for (const s of template.pages[pi].slots) {
        const fld = template.fields.find((x) => x.id === s.field);
        if (!fld || fld.type !== 'text' || s._flow) continue;
        if (!((s.angle || 0) < -45 && (s.angle || 0) > -135)) continue;
        const val = String(slotVal(s.field) || '').replace(/\s*\n\s*/g, ' ').trim();
        if (!val) continue;
        const bb = box(s);
        const sfont = ff[pickFont(s.fontFamily || 'caveat', s.size)];
        const ssize0 = ptSize(s.fontFamily, s.size, PW);
        const sr = fit(sfont, val, bb, ssize0,
          { single: true, targetHs: s.xscale || 1, angle: s.angle || 0, grow: (s.w || 0) < 10 ? 2.5 : 1 });
        const len = (sfont.widthOfTextAtSize(val, sr.size) || 0) * (sr.hs[0] || 1);
        cols.push({ s, bb, len, size: sr.size });
      }
      for (const c of cols) {
        for (const f of pageFixed) {
          if (f._flow || !((f.angle || 0) < -45 && (f.angle || 0) > -135)) continue;
          if (c.s.size > 3 || Math.abs((f.size || 0) - (c.s.size || 0)) > 0.2) continue;
          const fb = box(f);
          const ov = Math.min(c.bb.x + c.bb.w, fb.x + fb.w) - Math.max(c.bb.x, fb.x);
          if (ov < 0.8 * Math.min(c.bb.w, fb.w)) continue;
          if (!(fb.yTop < c.bb.yTop - 0.5 && fb.yTop > c.bb.yTop - c.bb.h - c.size * 0.8)) continue;
          const newTop = c.bb.yTop - c.len - c.size * 0.3;
          if (newTop <= fb.yTop) continue;
          const nh = newTop - (fb.yTop - fb.h);
          if (nh < fb.h * 0.6) continue;
          colShift.set(f, { yTop: newTop, h: nh });
          colLeft.add(c.s);
        }
      }
    }
    const fixedBox = (f) => {
      const bp = withLines(f);
      const o = colShift.get(f);
      if (o) { bp.yTop = o.yTop; bp.h = o.h; }
      return bp;
    };
    for (const f of pageFixed) {
      if (f._flow) continue;
      const str = textOf(f);
      const font = ff[pickFontFor(f)];
      const size0 = ptSize(f.fontFamily, f.size, PW);
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
          if (!fld || fld.type !== 'text' || s._flow) continue;
          const val = (s.wrap ? slotVal(s.field) : slotVal(s.field).replace(/\s*\n\s*/g, ' ').trim());
          if (!val || val.indexOf('\n') >= 0) continue;
          if (((s.angle || 0) > 45 || (s.angle || 0) < -45)) continue;
          const sfont = ff[pickFont(s.fontFamily || 'caveat', s.size)];
          const ssize0 = ptSize(s.fontFamily, s.size, PW);
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
            x0: vx0, x1: vx0 + ink, base: cy2 - sr.size * 0.45, ref: s,
            size: sr.size, angle: s.angle || 0,
          });
        }
      }
      if (drawFitted(bg, degrees, ops, font, str, fixedBox(f), size0, hex(f.color, rgb), f.align || 'left',
          { targetHs: f.xscale, angle: f.angle || 0, lockSize: use, inline, vStart: colShift.has(f),
            siblings: sibBoxes.filter((s) => s.ref !== f) })) {
        warns.push(`${f.key}: encogido fuerte`);
      }
      /* el nombre intercalado toma la línea base de la frase donde va */
      for (const g of inline) if (g.matchedY !== undefined) baseOverride.set(g.ref, g.matchedY);
    }
    for (const s of template.pages[pi].slots) {
      const fld = template.fields.find((x) => x.id === s.field);
      if (!fld) continue;
      if (fld.type === 'text') {
        if (s._flow) continue;
        const val = (s.wrap ? slotVal(s.field) : slotVal(s.field).replace(/\s*\n\s*/g, ' ').trim());
        if (!val) continue;
        const font = ff[pickFont(s.fontFamily || 'caveat', s.size)];
        if (drawFitted(bg, degrees, ops, font, val, box(s), ptSize(s.fontFamily, s.size, PW),
            hex(s.color || '#000000', rgb), s.align || 'left',
            { single: !s.wrap, targetHs: s.xscale || 1, angle: s.angle || 0,
              grow: (s.w || 0) < 10 ? 2.5 : 1, baseY: baseOverride.get(s), vStart: colLeft.has(s), vTop: !!s.vTop, tight: !!s.tight })) {
          warns.push(`${s.field}: valor encogido`);
        }
      }
    }
    /* Reflow por línea: igual que en Node. */
    for (const gr of flowGroups) {
      drawFlowGroup(bg, gr, textOf, (fid) => slotVal(fid), PW, PH);
    }
    /* Nota cifrada (p10): igual que en Node. */
    tick((pi + 1) / n);
  }
  /* Hoja de recortes: igual que en Node (tiras permutadas sobre la página). */
  if (template.shuffle) {
    const sh = template.shuffle;
    const pix = template.pages.findIndex((p) => p.id === sh.page);
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
        np.pushOperators(ops.pushGraphicsState(),
          ops.moveTo(dx0, yB), ops.lineTo(dx1, yB), ops.lineTo(dx1, yT), ops.lineTo(dx0, yT),
          ops.closePath(), ops.clip(), ops.endPath());
        np.drawPage(emb, { x: dx0 - sx0, y: 0, width: PW2, height: PH2 });
        np.pushOperators(ops.popGraphicsState());
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
  return { bytes: await out.save(), warns };
}

  /* ¿Cabe el texto en su hueco sin encogerse más del 15 %? Mismo ajuste que el PDF. */
  function fieldFits(slot, text, fontMap, PW, PH) {
    /* mismas reglas que pickFont / ptSize de composeGame (ámbitos distintos) */
    const fam = slot.fontFamily || 'caveat';
    let key = 'opensans';
    if (/pigpen|runes/i.test(fam)) key = 'runes';
    else if (/myriad/i.test(fam)) key = 'caveatBold';
    else if (/caveat|script|hand/i.test(fam)) key = /bold|black/i.test(fam) ? 'caveatBold' : 'caveat';
    else if (/anton|display/i.test(fam)) key = 'anton';
    else if (/bold|black/i.test(fam)) key = 'opensansBold';
    const font = fontMap[key];
    if (!font) return true;
    const bb = { x: (slot.x / 100) * PW, w: (slot.w / 100) * PW,
      yTop: PH - (slot.y / 100) * PH, h: (slot.h / 100) * PH };
    const scale = /caveat|script|hand|myriad/i.test(fam) ? 1.65 : 1;
    const r = fit(font, text, bb, (slot.size / 100) * PW * scale,
      { single: !slot.wrap, targetHs: slot.xscale || 1, angle: slot.angle || 0,
        grow: (slot.w || 0) < 10 ? 2.5 : 1 });
    return !r.warn;
  }
globalThis.PMECompose = { composeGame, fit, wrap, drawFitted, drawLine, drawPhoto, fieldFits };
})();
