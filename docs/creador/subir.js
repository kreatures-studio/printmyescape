// Subir imágenes a la biblioteca desde el creador (F4.2): PNG, JPG o el PDF de una pieza del artista, de 5 MB como
// mucho. Como importar-arte.py: la pieza queda en un PDF de una página a su tamaño real (las imágenes, a 300 ppp como
// mucho y sin pasar de A3) más su miniatura PNG, en la colección «subidas» de biblioteca/arte (rama principal del
// repositorio privado). Pide nombre, categoría, etiquetas, autor humano y licencia; valida con las reglas de la
// biblioteca antes de escribir nada.

import { h } from './dom.js';
import { reglasArte, LICENCIAS_ARTE } from './tools/biblioteca/reglas.mjs';
import { pintarPDF } from './motor.js';

export const MAX_BYTES = 5 * 1024 * 1024;
const PPP = 300;
const MAX_LADO_PX = Math.round((420 / 25.4) * PPP); // A3 a 300 ppp
const MM_POR_PT = 25.4 / 72;
const COLECCION = 'subidas';
export const CATEGORIAS = ['fondo', 'marco', 'papel', 'dispositivo', 'objeto', 'icono', 'decoracion', 'ilustracion', 'puzzle'];
const slug = (t) => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

async function aBlob(canvas, tipo, calidad) {
  return new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
}
const bytesDe = async (blob) => new Uint8Array(await blob.arrayBuffer());

/** Imagen → { pdf, png (miniatura), anchoMm, altoMm }. */
async function desdeImagen(fichero) {
  const bitmap = await createImageBitmap(fichero);
  const escala = Math.min(1, MAX_LADO_PX / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * escala), hgt = Math.round(bitmap.height * escala);
  const lienzo = Object.assign(document.createElement('canvas'), { width: w, height: hgt });
  lienzo.getContext('2d').drawImage(bitmap, 0, 0, w, hgt);
  const esPng = fichero.type === 'image/png';
  const optimizada = await bytesDe(await aBlob(lienzo, esPng ? 'image/png' : 'image/jpeg', 0.9));
  const anchoPt = (w / PPP) * 72, altoPt = (hgt / PPP) * 72;
  const { PDFDocument } = globalThis.PDFLib;
  const doc = await PDFDocument.create();
  const img = esPng ? await doc.embedPng(optimizada) : await doc.embedJpg(optimizada);
  doc.addPage([anchoPt, altoPt]).drawImage(img, { x: 0, y: 0, width: anchoPt, height: altoPt });
  const mini = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(w * Math.min(1, 300 / Math.max(w, hgt)))), height: Math.max(1, Math.round(hgt * Math.min(1, 300 / Math.max(w, hgt)))) });
  mini.getContext('2d').drawImage(bitmap, 0, 0, mini.width, mini.height);
  return { pdf: await doc.save(), png: await bytesDe(await aBlob(mini, 'image/png')), anchoMm: anchoPt * MM_POR_PT, altoMm: altoPt * MM_POR_PT };
}

/** PDF de una página → el mismo PDF, su miniatura y su tamaño. */
async function desdePdf(fichero) {
  const bytes = new Uint8Array(await fichero.arrayBuffer());
  const doc = await globalThis.PDFLib.PDFDocument.load(bytes);
  if (doc.getPageCount() !== 1) throw new Error(`el PDF tiene ${doc.getPageCount()} páginas: hace falta una pieza por fichero`);
  const { width, height } = doc.getPage(0).getSize();
  const lienzo = document.createElement('canvas');
  await pintarPDF(bytes, lienzo, Math.min(300, Math.round(300 * width / Math.max(width, height))));
  return { pdf: bytes, png: await bytesDe(await aBlob(lienzo, 'image/png')), anchoMm: width * MM_POR_PT, altoMm: height * MM_POR_PT };
}

/** Diálogo de subida. Devuelve la entrada nueva de la biblioteca (con su colección) o null. */
export function abrirSubida(app) {
  return app.dialogo((cerrar) => {
    const fichero = h('input', { id: 'subir-fichero', type: 'file', accept: 'image/png,image/jpeg,application/pdf', required: true });
    const nombre = h('input', { id: 'subir-nombre', required: true, autocomplete: 'off' });
    const categoria = h('select', { id: 'subir-categoria' }, CATEGORIAS.map((c) => h('option', { value: c }, c)));
    const etiquetas = h('input', { id: 'subir-etiquetas', required: true, placeholder: 'misterio, kraft, foto', autocomplete: 'off' });
    const autor = h('input', { id: 'subir-autor', required: true, autocomplete: 'off', placeholder: 'Quién la dibujó' });
    const licencia = h('select', { id: 'subir-licencia' }, LICENCIAS_ARTE.map((l) => h('option', { value: l }, l === 'propia-estudio' ? 'Propia del estudio' : 'CC0 (dominio público)')));
    const estado = h('div', { role: 'status' });
    fichero.addEventListener('change', () => {
      const f = fichero.files[0];
      if (f && !nombre.value) nombre.value = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    });
    const enviar = async (e) => {
      e.preventDefault();
      const f = fichero.files[0];
      estado.replaceChildren();
      const mal = (t) => estado.replaceChildren(h('div', { class: 'mensaje error', role: 'alert' }, t));
      if (!f) return mal('Elige un fichero.');
      if (f.size > MAX_BYTES) return mal(`El fichero pesa ${(f.size / 1048576).toFixed(1)} MB: el máximo son 5 MB.`);
      const tags = [...new Set(etiquetas.value.split(',').map((t) => slug(t.trim())).filter(Boolean))];
      if (tags.length < 3 || tags.length > 6) return mal('Pon de 3 a 6 etiquetas, separadas por comas.');
      if (/^\s*$|por confirmar|pendiente|desconocid/i.test(autor.value)) return mal('Hace falta el nombre de quien hizo la pieza (sin arte hecho con IA).');
      estado.replaceChildren(h('p', { class: 'tenue' }, 'Preparando la pieza…'));
      try {
        const pieza = f.type === 'application/pdf' ? await desdePdf(f) : await desdeImagen(f);
        if (pieza.pdf.length > MAX_BYTES) return mal('Optimizada sigue pesando más de 5 MB: reduce la imagen.');
        const id = `${categoria.value}-${slug(nombre.value) || 'pieza'}`;
        let manifiesto;
        // La colección «subidas» se crea con la primera imagen (si ya existe, se lee entera: puede haber cambiado).
        const existe = (await app.almacen.colecciones('arte')).includes(COLECCION);
        // Si existe y no se puede leer, no se sigue: se perderían las piezas que ya tiene.
        manifiesto = existe ? JSON.parse(new TextDecoder().decode(await app.almacen.leerBiblioteca(`arte/${COLECCION}/manifest.json`)))
          : { schema: 'pme-biblioteca/1', tipo: 'arte', pieces: [] };
        const version = 1 + Math.max(0, ...manifiesto.pieces.filter((p) => p.id === id).map((p) => p.version));
        const base = `${id}-v${version}`;
        const entrada = { id, version, file: `piezas/${base}.pdf`, thumb: `piezas/${base}.png`, name: nombre.value.trim(), category: categoria.value, tags,
          widthMm: Math.round(pieza.anchoMm * 10) / 10, heightMm: Math.round(pieza.altoMm * 10) / 10, zones: [], license: licencia.value, author: autor.value.trim(),
          origin: { subida: f.name } };
        const nuevo = { ...manifiesto, pieces: [...manifiesto.pieces, entrada] };
        const { errores } = reglasArte(nuevo);
        if (errores.length) return mal(errores.join(' · '));
        await app.almacen.escribirBiblioteca(`arte/${COLECCION}/${entrada.file}`, pieza.pdf, `Biblioteca: pieza ${base}`);
        await app.almacen.escribirBiblioteca(`arte/${COLECCION}/${entrada.thumb}`, pieza.png, `Biblioteca: miniatura ${base}`);
        await app.almacen.escribirBiblioteca(`arte/${COLECCION}/manifest.json`, new TextEncoder().encode(JSON.stringify(nuevo, null, 2) + '\n'), `Biblioteca: ${base}`);
        app.biblioteca.anadir('arte', { ...entrada, coleccion: COLECCION });
        app.aviso(`Subida a la biblioteca: ${entrada.name} (${entrada.widthMm} × ${entrada.heightMm} mm)`, { tipo: 'bien' });
        cerrar({ ...entrada, coleccion: COLECCION });
      } catch (err) {
        mal(`No se pudo subir: ${err.message}`);
      }
    };
    return h('form', { class: 'dialogo', onsubmit: enviar },
      h('h2', {}, 'Subir una imagen a la biblioteca'),
      h('p', { class: 'tenue' }, 'PNG, JPG o el PDF de una pieza del artista, hasta 5 MB. Se guarda en vuestro repositorio privado y queda para todos los juegos.'),
      h('div', { class: 'campo' }, h('label', { for: 'subir-fichero' }, 'Fichero'), fichero),
      h('div', { class: 'campo' }, h('label', { for: 'subir-nombre' }, 'Nombre'), nombre),
      h('div', { class: 'rejilla-2' },
        h('div', { class: 'campo' }, h('label', { for: 'subir-categoria' }, 'Categoría'), categoria),
        h('div', { class: 'campo' }, h('label', { for: 'subir-licencia' }, 'Licencia'), licencia)),
      h('div', { class: 'campo' }, h('label', { for: 'subir-etiquetas' }, 'Etiquetas (3 a 6, separadas por comas)'), etiquetas),
      h('div', { class: 'campo' }, h('label', { for: 'subir-autor' }, 'Autor'), autor, h('span', { class: 'ayuda' }, 'Una persona o el estudio. No se admite arte generado con IA.')),
      estado,
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Subir')));
  });
}
