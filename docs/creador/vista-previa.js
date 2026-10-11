// Vista previa (T5.6): compone un ejemplo del juego en el navegador con el mismo motor que el CLI
// (tools/pme-compose-core.js) y le pone una marca de agua «VISTA PREVIA» con pdf-lib.
import { FUENTES } from './fuentes.js';

async function bytesDe(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`no se pudo leer ${url} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * Compone el ejemplo `ejemplo` (id) en `lang`. Usa el almacén para el fondo y las fotos del juego,
 * y el kit (kit.porId, kit.base) para las piezas de las capas. Devuelve { url, paginas, avisos }.
 */
export async function componerVistaPrevia({ juego, lang, ejemplo, almacen, kit }) {
  const PC = globalThis.PMECompose;
  const PDFLib = globalThis.PDFLib;
  if (!PC || !PDFLib) throw new Error('faltan el motor o pdf-lib en la página');
  const ex = (juego.examples || []).find((e) => e.id === String(ejemplo));
  if (!ex) throw new Error(`no hay un ejemplo ${ejemplo}`);
  const values = ex.values && ex.values[lang];
  if (!values) throw new Error(`el ejemplo ${ejemplo} no tiene texto en «${lang}»`);
  const i18n = juego.i18n && juego.i18n[lang];
  if (!i18n) throw new Error(`el juego no tiene textos en «${lang}»`);

  const fonts = {};
  for (const [k, f] of Object.entries(FUENTES)) {
    fonts[k] = { bytes: await bytesDe(new URL(f.file, location.href)), subset: f.subset };
  }

  let bgBytes = null;
  const assets = {};
  if (juego.background.kind === 'pdf') {
    bgBytes = await almacen.leerFichero(juego.id, juego.background.file);
  } else {
    for (const p of juego.template.pages) {
      for (const capa of p.layers || []) {
        if (assets[capa.asset]) continue;
        const pieza = kit && kit.porId.get(capa.asset);
        if (!pieza) throw new Error(`falta la pieza «${capa.asset}» del kit`);
        assets[capa.asset] = { kind: /\.pdf$/i.test(pieza.file) ? 'pdf' : 'png', bytes: await bytesDe(new URL(pieza.file, kit.base)) };
      }
    }
  }

  const photos = {};
  for (const [campo, ruta] of Object.entries(ex.photos || {})) {
    photos[campo] = { bytes: await almacen.leerFichero(juego.id, ruta), format: /\.png$/i.test(ruta) ? 'png' : 'jpg' };
  }

  const res = await PC.composeGame({
    bgBytes, assets, fonts, template: juego.template, fixed: juego.texts, i18n, i18nAll: juego.i18n,
    lang, values, photos, mechanics: juego.mechanics || [], fields: juego.fields || {},
  });

  const doc = await PDFLib.PDFDocument.load(res.bytes);
  const fuente = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
  for (const pagina of doc.getPages()) {
    const { width, height } = pagina.getSize();
    pagina.drawText('VISTA PREVIA', {
      x: width * 0.12, y: height * 0.42, size: 64, font: fuente,
      color: PDFLib.rgb(0.5, 0.5, 0.5), opacity: 0.25, rotate: PDFLib.degrees(35),
    });
  }
  const bytes = await doc.save();
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  return { url, paginas: doc.getPageCount(), avisos: res.warns || [] };
}
