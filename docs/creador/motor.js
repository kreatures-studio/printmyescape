// Motor en el navegador (F4): compone un juego v2 (o algunas de sus páginas) con el mismo motor que el servidor y
// la línea de órdenes (tools/pme-compose-core.js), y pinta páginas de un PDF en un <canvas> con pdf.js.
// El arte sale de la biblioteca (por el almacén) y los fondos y fotos, de la carpeta del juego.

import { aV1 } from './tools/game/v2.mjs';
import { plantillaParaMotor } from './tools/game/reglas.mjs';
import { cargarRegistro, fuentesDelMotor } from './fuentes.js';
import { medirCabida } from './tools/game/cabida.mjs';

const ficherosDelJuego = new Map(); // `${id}/${ruta}` → Promise<bytes>

function leerDelJuego(almacen, id, ruta) {
  const clave = `${id}/${ruta}`;
  if (!ficherosDelJuego.has(clave)) {
    const p = almacen.leerFichero(id, ruta);
    p.catch(() => ficherosDelJuego.delete(clave));
    ficherosDelJuego.set(clave, p);
  }
  return ficherosDelJuego.get(clave);
}
/** Olvida un fichero leído (p. ej. tras subir otro con la misma ruta). */
export function olvidarFichero(id, ruta) { ficherosDelJuego.delete(`${id}/${ruta}`); }

/**
 * Compone el juego. opciones: { juego, almacen, biblioteca, lang, ejemplo (id o null), paginas (ids o null = todas),
 * watermark, fotosLocales ({ campo: { bytes, format } }) }. Devuelve { bytes, warns }.
 */
export async function componer({ juego, almacen, biblioteca, lang, ejemplo = null, paginas = null, watermark = null, valores = null }) {
  const PC = globalThis.PMECompose;
  if (!PC) throw new Error('falta el motor en la página');
  const sub = paginas && juego.schema === 'pme-game/2' ? { ...juego, pages: juego.pages.filter((p) => paginas.includes(p.id)) } : juego;
  const v1 = sub.schema === 'pme-game/2' ? aV1(sub) : sub;
  const i18n = v1.i18n && v1.i18n[lang];
  if (!i18n) throw new Error(`el juego no tiene textos en «${lang}»`);
  const ex = ejemplo === null ? null : (v1.examples || []).find((e) => e.id === String(ejemplo));
  const values = valores || (ex && ex.values && ex.values[lang]) || {};

  const bgFiles = {};
  for (const f of new Set([v1.background && v1.background.file, ...v1.template.pages.map((p) => p.bgFile)].filter(Boolean))) {
    bgFiles[f] = await leerDelJuego(almacen, juego.id, f);
  }
  const bgBytes = v1.background && v1.background.kind === 'pdf' ? bgFiles[v1.background.file] : null;

  const assets = {};
  for (const p of v1.template.pages) {
    for (const capa of [...(p.layers || []), ...(p.topLayers || [])]) {
      if (assets[capa.asset]) continue;
      const pieza = biblioteca.buscar('arte', capa.asset);
      if (!pieza) throw new Error(`la pieza «${capa.asset}» no está en la biblioteca`);
      assets[capa.asset] = { kind: /\.pdf$/i.test(pieza.file) ? 'pdf' : 'png', bytes: await biblioteca.bytesDePieza(pieza) };
    }
  }

  const photos = {};
  for (const [campo, ruta] of Object.entries((ex && ex.photos) || {})) {
    try {
      photos[campo] = { bytes: await leerDelJuego(almacen, juego.id, ruta), format: /\.png$/i.test(ruta) ? 'png' : 'jpg' };
    } catch { /* sin la foto se pinta su recuadro gris, como en el motor */ }
  }

  const { resolver } = await cargarRegistro();
  const res = await PC.composeGame({
    bgBytes, bgFiles, assets, fuentes: resolver, fonts: await fuentesDelMotor(),
    template: plantillaParaMotor(v1), fixed: v1.texts, i18n, i18nAll: v1.i18n, lang, values, photos,
    mechanics: v1.mechanics || [], fields: v1.fields || {}, watermark,
  });
  return { bytes: res.bytes, warns: res.warns || [] };
}

let pdfjs = null;
async function pdfjsLib() {
  if (!pdfjs) {
    pdfjs = await import('./vendor/pdfjs/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  }
  return pdfjs;
}

/** Pinta la página `numero` (1…) del PDF en el canvas, a `anchoCss` píxeles de ancho. Devuelve el nº de páginas. */
export async function pintarPDF(bytes, canvas, anchoCss, numero = 1) {
  const lib = await pdfjsLib();
  const doc = await lib.getDocument({ data: bytes.slice(), isEvalSupported: false }).promise;
  try {
    const page = await doc.getPage(numero);
    const vp1 = page.getViewport({ scale: 1 });
    const escala = (anchoCss / vp1.width) * (window.devicePixelRatio || 1);
    const vp = page.getViewport({ scale: escala });
    canvas.width = Math.round(vp.width);
    canvas.height = Math.round(vp.height);
    canvas.style.width = `${anchoCss}px`;
    canvas.style.height = `${Math.round(anchoCss * vp1.height / vp1.width)}px`;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    return doc.numPages;
  } finally {
    doc.destroy();
  }
}

/* ---------------- Cabida de los campos (formulario) ---------------- */

let fuentesIncrustadas = null;
async function mapaDeFuentes() {
  if (!fuentesIncrustadas) {
    fuentesIncrustadas = (async () => {
      const { PDFDocument } = globalThis.PDFLib;
      const doc = await PDFDocument.create();
      doc.registerFontkit(globalThis.fontkit);
      const map = {};
      for (const [k, f] of Object.entries(await fuentesDelMotor())) map[k] = await doc.embedFont(f.bytes, { subset: f.subset });
      return map;
    })();
  }
  return fuentesIncrustadas;
}

/**
 * Cuántas letras caben de un campo en cada página donde sale (las mismas medidas que el PDF: fieldFits del motor).
 * Devuelve { capacidad, porPagina: { pid: n }, cap } o null si no es un campo de texto.
 */
export async function cabidaDe(juego, campo) {
  const v1 = juego.schema === 'pme-game/2' ? aV1(juego) : juego;
  const [fontMap, { resolver }] = await Promise.all([mapaDeFuentes(), cargarRegistro()]);
  const r = medirCabida({ ...v1, template: plantillaParaMotor(v1) }, { fieldFits: globalThis.PMECompose.fieldFits, fontMap, fuentes: resolver, campos: [campo] });
  return r[campo] || null;
}
