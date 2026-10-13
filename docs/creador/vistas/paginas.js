// Diseñar una página (F4.2): páginas del juego, insertar (imágenes, fondos, campos y páginas de la biblioteca), el
// lienzo y las propiedades del elemento elegido. El lienzo es la página que compone el motor (lo que se imprime) y,
// encima, una caja por elemento para elegirlo, moverlo y cambiarle el tamaño. Cada cambio pasa por las operaciones
// compartidas con Claude (tools/game/operaciones.mjs) y se valida antes de aceptarlo.

import { h, icono, enIdioma } from '../dom.js';
import { componer, pintarPDF, olvidarFichero } from '../motor.js';
import { abrirSubida } from '../subir.js';
import { sugerenciasDe, cajaSugerencia } from './sugerencias.js';
import { claveDeTexto, PAGINA_ENTERA } from '../tools/game/operaciones.mjs';

const ANCHO_PAGINA_PT = 595.28; // A4: el tamaño de letra (size) es % del ancho de la página
const COLORES = [['Tinta', '#1B2420'], ['Verde oscuro', '#12332B'], ['Marrón', '#3B2A20'], ['Rojo', '#9B2C22'], ['Blanco', '#FFFFFF']];
const NOMBRE_KIND = { text: 'Texto fijo', field: 'Hueco de texto', photo: 'Foto del comprador', art: 'Imagen', puzzle: 'Puzzle' };
const PASO = 0.5;

const pt = (size) => Math.round((size || 0) * ANCHO_PAGINA_PT / 100 * 10) / 10;
const desdePt = (p) => Math.round((p / ANCHO_PAGINA_PT) * 100 * 1000) / 1000;
const redondear = (v) => Math.round(v * 100) / 100;

const cajaCss = (c) => ({ left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%` });

/**
 * Dónde se edita: la página o, «por dentro», un puzzle de contenido colocado en ella (ui.dentro). Tiene la forma de
 * una página (id, elements, background…) más las operaciones sobre sus elementos; dentro de un puzzle los elementos
 * están en % de la caja del puzzle (aPagina / aLocal convierten) y la letra se escala con su ancho (escala).
 */
function contexto(app, ui, pagina) {
  const g = app.juego;
  const base = { id: pagina.id, title: pagina.title, background: pagina.background, from: pagina.from, real: pagina };
  const bloque = ui.dentro && ui.dentro.pagina === pagina.id ? pagina.elements.find((e) => e.id === ui.dentro.bloque && e.kind === 'puzzle') : null;
  const z = bloque && (g.puzzles || []).find((x) => x.id === bloque.puzzle && x.kind !== 'datos' && x.page);
  if (!z) {
    ui.dentro = null;
    return { ...base, elements: pagina.elements, caja: null, escala: 1,
      aPagina: (e) => e, aLocal: (p) => p,
      anadir: (copia, element, index) => app.ops.anadirElemento(copia, { page: pagina.id, element, index }),
      actualizar: (copia, id, changes) => app.ops.actualizarElemento(copia, { page: pagina.id, element: id, changes }),
      quitar: (copia, id) => app.ops.quitarElemento(copia, { page: pagina.id, element: id }),
      mover: (copia, id, index) => app.ops.moverElemento(copia, { page: pagina.id, element: id, index: Math.min(index, copia.pages.find((x) => x.id === pagina.id).elements.length - 1) }) };
  }
  const B = { x: bloque.x, y: bloque.y, w: bloque.w, h: bloque.h };
  // Cada cambio rehace la lista de elementos del puzzle con actualizarPuzzle (ids y textos se conservan).
  const conElementos = (copia, fn) => {
    const zz = copia.puzzles.find((x) => x.id === z.id);
    const els = structuredClone(zz.page.elements);
    const r = fn(els);
    app.ops.actualizarPuzzle(copia, { puzzle: z.id, changes: { page: { elements: els } } });
    return r;
  };
  return { ...base, elements: z.page.elements, caja: B, escala: B.w / 100, puzzle: z, bloque,
    aPagina: (e) => ({ x: B.x + (e.x * B.w) / 100, y: B.y + (e.y * B.h) / 100, w: (e.w * B.w) / 100, h: (e.h * B.h) / 100 }),
    aLocal: (p) => ({ x: ((p.x - B.x) / B.w) * 100, y: ((p.y - B.y) / B.h) * 100 }),
    anadir(copia, element, index) {
      const antes = new Set(copia.puzzles.find((x) => x.id === z.id).page.elements.map((e) => e.id));
      conElementos(copia, (els) => { els.splice(index === undefined || index === null ? els.length : index, 0, element); });
      return copia.puzzles.find((x) => x.id === z.id).page.elements.find((e) => !antes.has(e.id));
    },
    actualizar: (copia, id, changes) => conElementos(copia, (els) => {
      const el = els.find((e) => e.id === id);
      if (!el) throw new Error(`no hay pieza «${id}» en el puzzle`);
      const { texts, ...resto } = changes;
      Object.assign(el, resto);
      for (const [k, v] of Object.entries(resto)) if (v === null) delete el[k];
      if (texts) for (const l of copia.languages) if (typeof texts[l] === 'string') copia.i18n[l][el.key] = texts[l];
      return el;
    }),
    quitar: (copia, id) => conElementos(copia, (els) => { els.splice(els.findIndex((e) => e.id === id), 1); return { removed: id }; }),
    mover: (copia, id, index) => conElementos(copia, (els) => { const i = els.findIndex((e) => e.id === id); const [el] = els.splice(i, 1); els.splice(Math.min(index, els.length), 0, el); }),
  };
}

function entrarEnPuzzle(app, ui, bloque) {
  ui.dentro = { pagina: ui.pagina, bloque: bloque.id };
  ui.sel = null;
  app.repintar();
}

/** Propiedades cuando se está dentro de un puzzle sin pieza elegida. */
function propiedadesPuzzle(app, ui, ctx) {
  const z = ctx.puzzle;
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    h('div', { class: 'prop-cabeza' }, h('div', { class: 'tipo' }, 'Dentro del puzzle'), h('div', { class: 'nombre' }, z.name || z.id)),
    h('div', { class: 'info claude' }, h('span', { style: { fontSize: '13px' } }, `Sus piezas se miden en % de la caja del puzzle: si mueves el puzzle en la página, se mueven con él. ${ctx.elements.length} pieza${ctx.elements.length === 1 ? '' : 's'}.`)),
    h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Elige una pieza para cambiarla. Las imágenes, los textos y los campos que añadas ahora van dentro del puzzle.'),
    h('button', { class: 'boton', type: 'button', 'data-salir-puzzle': '1', onclick: () => { ui.dentro = null; ui.sel = ctx.bloque.id; app.repintar(); } }, 'Salir del puzzle'));
}

export function pintarPaginas(raiz, app) {
  const g = app.juego;
  const ui = app.ui.paginas || (app.ui.paginas = { sel: null, lang: g.languages[0], ejemplo: (g.examples || [])[0] ? g.examples[0].id : null, pestana: 'imagenes', etiqueta: '', ancho: 560, menuPagina: false });
  if (!g.pages) { raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'vacio' }, 'Este juego está en el formato antiguo. Duplícalo desde la biblioteca para editarlo aquí.'))); return; }
  const pidRuta = app.ruta.sub;
  if (pidRuta && g.pages.some((p) => p.id === pidRuta)) ui.pagina = pidRuta;
  if (!ui.pagina || !g.pages.some((p) => p.id === ui.pagina)) ui.pagina = g.pages[0] && g.pages[0].id;
  if (!g.languages.includes(ui.lang)) ui.lang = g.languages[0];
  if (ui.ejemplo && !(g.examples || []).some((e) => e.id === ui.ejemplo)) ui.ejemplo = (g.examples || [])[0] ? g.examples[0].id : null;
  const real = g.pages.find((p) => p.id === ui.pagina);
  const pagina = real ? contexto(app, ui, real) : null;
  if (pagina && ui.sel && !pagina.elements.some((e) => e.id === ui.sel)) ui.sel = null;

  raiz.replaceChildren(h('div', { class: 'trabajo' },
    columnaPaginas(app, ui),
    app.soloLectura ? null : columnaInsertar(app, ui, pagina),
    h('section', { class: 'mesa', 'aria-label': pagina ? `Página ${g.pages.indexOf(pagina) + 1}` : 'Sin páginas' },
      barraMesa(app, ui, pagina),
      pagina ? lienzo(app, ui, pagina) : h('div', { class: 'vacio' }, 'El juego no tiene páginas. Añade una en la columna de la izquierda.')),
    pagina ? columnaPropiedades(app, ui, pagina) : null));
}

/* ---------------- Columna de páginas ---------------- */

function columnaPaginas(app, ui) {
  const g = app.juego;
  const lista = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, g.pages.map((p, i) => {
    const hoja = h('span', { class: 'hoja', 'data-miniatura': p.id });
    const sug = sugerenciasDe(g).filter((s) => s.page === p.id).length;
    return h('button', { type: 'button', class: 'miniatura-pagina', 'aria-current': p.id === ui.pagina ? 'true' : 'false',
      'aria-label': `Página ${i + 1}: ${p.title || 'sin título'}${sug ? ` (${sug} sugerencia${sug === 1 ? '' : 's'} de Claude)` : ''}`,
      onclick: () => { ui.sel = null; app.navegar(app.rutaJuego('paginas', p.id)); } },
    h('span', { class: 'num' }, String(i + 1), sug ? h('span', { class: 'sugerida-marca', title: 'Sugerencias de Claude', 'aria-hidden': 'true' }, ' ✦') : null), hoja);
  }));
  queueMicrotask(() => pintarMiniaturas(app, ui, lista));
  return h('aside', { class: 'columna paginas', 'aria-label': 'Páginas del juego' },
    h('div', { class: 'etiqueta-seccion' }, 'Páginas'), lista,
    app.soloLectura ? null : h('div', { class: 'menu-flotante' },
      h('div', { class: 'titulo' }, 'Añadir página'),
      h('button', { type: 'button', onclick: () => anadirPagina(app, ui, {}) }, 'En blanco'),
      h('button', { type: 'button', onclick: () => { ui.pestana = 'paginas'; app.repintar(); } }, 'De la biblioteca'),
      ui.pagina ? h('button', { type: 'button', onclick: () => duplicarPagina(app, ui) }, 'Duplicar esta') : null,
      h('button', { type: 'button', onclick: () => paginaDesdePdf(app, ui) }, 'Desde un PDF del artista')));
}

const cacheMiniaturas = new Map(); // clave (página + idioma + ejemplo) → bytes del PDF
async function pintarMiniaturas(app, ui, lista) {
  const g = app.juego;
  for (const hoja of lista.querySelectorAll('[data-miniatura]')) {
    const p = g.pages.find((x) => x.id === hoja.dataset.miniatura);
    if (!p) continue;
    const clave = JSON.stringify([p, g.i18n, ui.lang, ui.ejemplo, (g.puzzles || []).length]);
    try {
      let bytes = cacheMiniaturas.get(clave);
      if (!bytes) {
        ({ bytes } = await componer({ juego: g, almacen: app.almacen, biblioteca: app.biblioteca, lang: ui.lang, ejemplo: ui.ejemplo, paginas: [p.id] }));
        cacheMiniaturas.set(clave, bytes);
      }
      if (!hoja.isConnected) return;
      const c = h('canvas', {});
      await pintarPDF(bytes, c, 92);
      hoja.replaceChildren(c);
    } catch { /* la miniatura no es imprescindible */ }
  }
}

async function anadirPagina(app, ui, { from = null, puzzles = [] } = {}) {
  const i = app.juego.pages.findIndex((p) => p.id === ui.pagina);
  const r = await app.cambiar(from ? `Página de la biblioteca (${from})` : 'Página en blanco',
    (g) => app.ops.insertarPagina(g, { from, puzzles, position: i >= 0 ? i + 2 : undefined }));
  if (r) { ui.sel = null; app.navegar(app.rutaJuego('paginas', r.page)); }
}

/** Página de la biblioteca: si faltan campos, propone traer la sección y los puzzles que los dan, en el mismo cambio. */
async function insertarDeBiblioteca(app, ui, entrada) {
  const g = app.juego;
  const calc = new Set([...(g.mechanics || []).flatMap((m) => m.derives || []), ...(g.puzzles || []).flatMap((z) => z.derives || [])]);
  const faltan = entrada.fields.filter((c) => !g.fields[c] && !calc.has(c));
  if (!faltan.length) return anadirPagina(app, ui, { from: `${entrada.id}@${entrada.version}` });
  const bib = app.biblioteca;
  // Primero lo de la misma colección que la página (sale del mismo juego); una sola fuente por campo.
  const mismaColeccion = (a, b) => (b.coleccion === entrada.coleccion) - (a.coleccion === entrada.coleccion);
  const puzzles = [];
  for (const c of faltan) {
    if (puzzles.some((z) => (z.derives || []).includes(c))) continue;
    const z = [...bib.actuales('puzzle')].sort(mismaColeccion).find((x) => (x.derives || []).includes(c) && !(g.puzzles || []).some((y) => y.from === `${x.id}@${x.version}`));
    if (z) puzzles.push(z);
  }
  const quedan = faltan.filter((c) => !puzzles.some((z) => (z.derives || []).includes(c)));
  const necesarios = [...new Set([...quedan, ...puzzles.flatMap((z) => z.needs.map((n) => n.field))])].filter((c) => !g.fields[c]);
  // Una sección entra si trae alguno de los campos que faltan y ninguno que el juego (o otra sección elegida) ya tenga.
  const secciones = [];
  const cubiertos = new Set();
  const candidatas = [...bib.actuales('seccion')].filter((s) => !g.form.sections.some((x) => x.id === s.section.id)).sort(mismaColeccion);
  for (const c of necesarios) {
    if (cubiertos.has(c)) continue;
    const s = candidatas.find((x) => x.fieldDefs[c] && !secciones.includes(x) && !Object.keys(x.fieldDefs).some((k) => cubiertos.has(k) || g.fields[k]));
    if (s) { secciones.push(s); Object.keys(s.fieldDefs).forEach((k) => cubiertos.add(k)); }
  }
  const sinOrigen = necesarios.filter((c) => !cubiertos.has(c));
  const ok = await app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('h2', {}, `«${entrada.name}» necesita más cosas`),
    h('p', {}, `Usa ${faltan.length} campo${faltan.length === 1 ? '' : 's'} que este juego aún no tiene: ${faltan.join(', ')}.`),
    secciones.length ? h('p', {}, 'Se traen con: ', h('strong', {}, secciones.map((s) => `la sección «${s.name}»`).join(', ')), puzzles.length ? ' y ' : '.', puzzles.length ? h('strong', {}, puzzles.map((z) => `el puzzle «${z.name}»`).join(', ')) : null) : null,
    sinOrigen.length ? h('div', { class: 'mensaje error' }, `Ninguna sección de la biblioteca trae: ${sinOrigen.join(', ')}. Créalos antes en el formulario.`) : null,
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'),
      !sinOrigen.length ? h('button', { class: 'boton primario', type: 'button', onclick: () => cerrar(true) }, 'Añadirlo todo') : null)));
  if (!ok) return;
  const i = g.pages.findIndex((p) => p.id === ui.pagina);
  const r = await app.cambiar(`Página de la biblioteca (${entrada.id}) con lo que necesita`, (copia) => {
    const copias = [];
    for (const s of secciones) if (!copia.form.sections.some((x) => x.id === s.section.id)) copias.push(...app.ops.insertarSeccion(copia, { from: `${s.id}@${s.version}` }).copias);
    const r2 = app.ops.insertarPagina(copia, { from: `${entrada.id}@${entrada.version}`, puzzles: puzzles.map((z) => `${z.id}@${z.version}`), position: i >= 0 ? i + 2 : undefined });
    return { resultado: r2.resultado, copias: [...copias, ...r2.copias] };
  });
  if (r) app.navegar(app.rutaJuego('paginas', r.page));
}

async function duplicarPagina(app, ui) {
  const r = await app.cambiar('Duplicar la página', (g) => {
    const i = g.pages.findIndex((p) => p.id === ui.pagina);
    const orig = g.pages[i];
    const id = `p${Math.max(0, ...g.pages.map((p) => Number(p.id.slice(1)) || 0)) + 1}`;
    const copia = structuredClone(orig);
    copia.id = id;
    copia.title = `${orig.title || 'Página'} (copia)`;
    delete copia.from;
    const datos = new Set((g.puzzles || []).filter((z) => z.kind === 'datos').map((z) => z.id));
    copia.elements = copia.elements.filter((e) => !(e.kind === 'puzzle' && datos.has(e.puzzle))).map((e) => {
      const el = { ...e, id: e.id.replace(/^p\d+-/, `${id}-`) };
      if (el.kind === 'text') el.key = app.ops.guardarTextos(g, Object.fromEntries(g.languages.map((l) => [l, g.i18n[l][e.key]])), `${e.key}-${id}`);
      return el;
    });
    g.pages.splice(i + 1, 0, copia);
    return { page: id };
  });
  if (r) app.navegar(app.rutaJuego('paginas', r.page));
}

async function paginaDesdePdf(app, ui, paraPagina = null) {
  const d = await app.dialogo((cerrar) => {
    const f = h('input', { id: 'pdf-fichero', type: 'file', accept: 'application/pdf', required: true });
    const n = h('input', { id: 'pdf-pagina', type: 'number', min: 1, value: 1 });
    return h('form', { class: 'dialogo', onsubmit: (e) => { e.preventDefault(); cerrar({ fichero: f.files[0], pagina: Number(n.value) || 1 }); } },
      h('h2', {}, paraPagina ? 'Fondo desde un PDF del artista' : 'Página desde un PDF del artista'),
      h('p', { class: 'tenue' }, 'La página del PDF queda de fondo; encima se ponen los textos, los campos y las imágenes. El PDF se guarda en la carpeta del juego, en vuestro repositorio privado.'),
      h('div', { class: 'campo' }, h('label', { for: 'pdf-fichero' }, 'PDF'), f),
      h('div', { class: 'campo' }, h('label', { for: 'pdf-pagina' }, 'Qué página del PDF'), n),
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Usar')));
  });
  if (!d || !d.fichero) return;
  if (d.fichero.size > 20 * 1024 * 1024) { app.aviso('El PDF pesa más de 20 MB: expórtalo más ligero.', { tipo: 'error' }); return; }
  const bytes = new Uint8Array(await d.fichero.arrayBuffer());
  let total;
  try { total = (await globalThis.PDFLib.PDFDocument.load(bytes)).getPageCount(); } catch (e) { app.aviso(`No es un PDF que se pueda leer: ${e.message}`, { tipo: 'error' }); return; }
  if (d.pagina > total) { app.aviso(`El PDF solo tiene ${total} páginas.`, { tipo: 'error' }); return; }
  const ruta = `fondos/${claveDeTexto(d.fichero.name.replace(/\.pdf$/i, ''))}.pdf`;
  await app.almacen.escribirFichero(app.juego.id, ruta, bytes, `Fondo ${ruta}`);
  olvidarFichero(app.juego.id, ruta);
  const fondo = { kind: 'pdf', file: ruta, page: d.pagina };
  if (paraPagina) {
    await app.cambiar('Fondo desde un PDF', (g) => { g.pages.find((p) => p.id === paraPagina).background = fondo; });
    return;
  }
  const i = app.juego.pages.findIndex((p) => p.id === ui.pagina);
  const r = await app.cambiar('Página desde un PDF', (g) => app.ops.insertarPagina(g, { background: fondo, title: d.fichero.name.replace(/\.pdf$/i, ''), position: i >= 0 ? i + 2 : undefined }));
  if (r) app.navegar(app.rutaJuego('paginas', r.page));
}

/* ---------------- Columna de insertar ---------------- */

function columnaInsertar(app, ui, pagina) {
  const pestanas = [['imagenes', 'Imágenes'], ['fondos', 'Fondos'], ['campos', 'Campos'], ['paginas', 'Páginas']];
  const cuerpo = { imagenes: insertarImagenes, fondos: insertarFondos, campos: insertarCampos, paginas: insertarPaginas }[ui.pestana] || insertarImagenes;
  return h('aside', { class: 'columna insertar', 'aria-label': 'Insertar' },
    h('div', { class: 'pestanas', role: 'tablist', 'aria-label': 'Qué insertar' },
      pestanas.map(([v, t]) => h('button', { type: 'button', role: 'tab', 'aria-selected': ui.pestana === v ? 'true' : 'false', onclick: () => { ui.pestana = v; app.repintar(); } }, t))),
    cuerpo(app, ui, pagina));
}

function insertarImagenes(app, ui, pagina) {
  const bib = app.biblioteca;
  const piezas = bib.actuales('arte').filter((p) => p.status !== 'reexportar' && (!ui.etiqueta || (p.tags || []).includes(ui.etiqueta)));
  const porColeccion = new Map();
  for (const p of piezas) { if (!porColeccion.has(p.coleccion)) porColeccion.set(p.coleccion, []); porColeccion.get(p.coleccion).push(p); }
  const orden = [...porColeccion.keys()].sort((a, b) => (a === 'subidas' ? -1 : b === 'subidas' ? 1 : a.localeCompare(b)));
  return [
    h('button', { type: 'button', class: 'zona-subir', onclick: async () => { const e = await abrirSubida(app); if (e && pagina) await anadirArte(app, ui, pagina, e); else app.repintar(); } },
      icono('subir', { tam: 24 }), h('strong', {}, 'Sube tus imágenes'), h('span', { style: { fontSize: '13px' } }, 'PNG, JPG o el PDF del artista (5 MB como mucho). Se guardan en vuestro repositorio privado.')),
    h('label', { class: 'campo' }, h('span', { class: 'oculto-visual' }, 'Etiqueta'),
      h('select', { onchange: (e) => { ui.etiqueta = e.target.value; app.repintar(); } }, h('option', { value: '' }, 'Todas las etiquetas'),
        bib.etiquetas('arte').map((t) => h('option', { value: t, selected: t === ui.etiqueta }, t)))),
    orden.map((c) => [
      h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } }, h('strong', {}, c === 'subidas' ? 'Tuyas' : c), h('span', { class: 'tenue', style: { fontSize: '13px' } }, String(porColeccion.get(c).length))),
      h('div', { class: 'galeria' }, porColeccion.get(c).map((p) => {
        const img = h('img', { alt: '' });
        bib.miniatura(p).then((u) => { img.src = u; }, () => {});
        return h('button', { type: 'button', class: 'pieza', draggable: 'true', 'data-pieza': `${p.id}@${p.version}`, title: `${p.name} · ${p.widthMm} × ${p.heightMm} mm`,
          ondragstart: (e) => { e.dataTransfer.setData('application/x-pme-pieza', `${p.id}@${p.version}`); e.dataTransfer.effectAllowed = 'copy'; },
          onclick: () => pagina && anadirArte(app, ui, pagina, p) }, img, h('span', { class: 'pie' }, p.name));
      }))]),
    h('p', { class: 'tenue', style: { fontSize: '13px' } }, 'Arrastra una imagen a la página, o púlsala para ponerla en el centro.')];
}

function insertarFondos(app, ui, pagina) {
  if (!pagina) return [];
  const bib = app.biblioteca;
  const fondos = bib.actuales('arte').filter((p) => p.status !== 'reexportar' && ['fondo', 'papel'].includes(p.category));
  const fijar = (fondo, texto) => app.cambiar(texto, (g) => {
    const p = g.pages.find((x) => x.id === pagina.id);
    p.background = fondo;
    if (fondo.kind === 'art') app.ops.prepararArte(g, p.background);
  });
  const color = pagina.background.kind === 'color' ? pagina.background.value : '#FFFFFF';
  return [
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Color de fondo'),
      h('div', { class: 'colores' }, ['#FFFFFF', '#F3E9D2', '#E3EEE9', '#ECEAFB', '#1B2420'].map((c) => h('button', { type: 'button', 'aria-label': `Fondo ${c}`, 'aria-pressed': pagina.background.kind === 'color' && color.toUpperCase() === c ? 'true' : 'false', style: { background: c }, onclick: () => fijar({ kind: 'color', value: c }, 'Color de fondo') })),
        h('input', { type: 'color', value: color, 'aria-label': 'Otro color', onchange: (e) => fijar({ kind: 'color', value: e.target.value.toUpperCase() }, 'Color de fondo') }))),
    h('button', { type: 'button', class: 'boton pequeno', onclick: () => fijar({ kind: 'none' }, 'Sin fondo') }, 'Sin fondo'),
    h('button', { type: 'button', class: 'boton pequeno', onclick: () => paginaDesdePdf(app, ui, pagina.id) }, 'Fondo desde un PDF del artista'),
    h('strong', {}, 'Papeles y fondos de la biblioteca'),
    h('div', { class: 'galeria' }, fondos.map((p) => {
      const img = h('img', { alt: '' });
      bib.miniatura(p).then((u) => { img.src = u; }, () => {});
      return h('button', { type: 'button', class: 'pieza', onclick: () => fijar({ kind: 'art', ref: `${p.id}@${p.version}` }, `Fondo: ${p.name}`) }, img, h('span', { class: 'pie' }, p.name));
    })),
    h('p', { class: 'tenue', style: { fontSize: '13px' } }, 'Un fondo de la biblioteca ocupa la página entera. Para ponerlo más pequeño, insértalo como imagen.')];
}

function insertarCampos(app, ui, pagina) {
  const g = app.juego;
  const campos = Object.entries(g.fields || {});
  const calc = [...new Set([...(g.mechanics || []).flatMap((m) => m.derives || []), ...(g.puzzles || []).flatMap((z) => z.derives || [])])];
  const usados = new Set(g.pages.flatMap((p) => p.elements.filter((e) => e.field).map((e) => e.field)));
  const fila = (id, def, calculado = false) => h('button', { type: 'button', draggable: 'true', 'data-campo': id,
    ondragstart: (e) => { e.dataTransfer.setData('application/x-pme-campo', id); },
    onclick: () => pagina && anadirCampo(app, ui, pagina, id) },
  h('span', {}, calculado ? `${id} (calculado)` : enIdioma(def.q, ui.lang) || id, h('br', {}), h('span', { class: 'codigo' }, `${id}${def && def.type ? ` · ${def.type}` : ''}`)),
  h('span', { class: 'tenue', style: { fontSize: '12px' } }, usados.has(id) ? 'en uso' : ''));
  return [
    h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Lo que el comprador escribe en el formulario. Pulsa un campo para ponerlo en la página.'),
    campos.length || calc.length ? h('div', { class: 'lista-insertar' }, campos.map(([id, def]) => fila(id, def)), calc.map((id) => fila(id, null, true)))
      : h('div', { class: 'vacio' }, 'Aún no hay campos.'),
    h('a', { class: 'boton pequeno', href: app.rutaJuego('formulario') }, 'Crear o cambiar campos en el formulario')];
}

function insertarPaginas(app, ui) {
  const bib = app.biblioteca;
  const paginas = bib.actuales('pagina');
  return [
    h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Páginas guardadas de otros juegos. Se copian después de la página abierta, con su fondo, textos y campos.'),
    paginas.length ? h('div', { class: 'lista-insertar' }, paginas.map((e) => h('button', { type: 'button', 'data-pagina-bib': `${e.id}@${e.version}`, onclick: () => insertarDeBiblioteca(app, ui, e) },
      h('span', {}, e.name, h('br', {}), h('span', { class: 'codigo' }, `${e.page.elements.length} elementos · ${e.fields.length} campos · ${e.coleccion}`)))))
      : h('div', { class: 'vacio' }, 'La biblioteca aún no tiene páginas.')];
}

/* ---------------- Añadir elementos ---------------- */

async function anadirArte(app, ui, pagina, pieza, punto = null) {
  // Dentro de un puzzle las medidas son % de su caja: la pieza conserva su tamaño real en la página.
  const w = Math.min(90, Math.max(5, (pieza.widthMm / 210) * 100 / (pagina.caja ? pagina.caja.w / 100 : 1)));
  const aspecto = (pieza.heightMm / 297) / (pieza.widthMm / 210) * (pagina.caja ? pagina.caja.w / pagina.caja.h : 1);
  if (punto) punto = pagina.aLocal(punto);
  const hh = w * aspecto;
  const x = punto ? punto.x - w / 2 : 50 - w / 2;
  const y = punto ? punto.y - hh / 2 : 50 - hh / 2;
  // El arte nuevo va encima del resto del arte, pero debajo de los textos (banda baja del motor).
  const primerTexto = pagina.elements.findIndex((e) => e.kind === 'text' || e.kind === 'field' || e.kind === 'photo');
  const el = await app.cambiar(`Imagen: ${pieza.name}`, (g) => pagina.anadir(g,
    { kind: 'art', ref: `${pieza.id}@${pieza.version}`, x: redondear(x), y: redondear(y), w: redondear(w) }, primerTexto >= 0 ? primerTexto : undefined));
  if (el) { ui.sel = el.id; app.repintar(); }
}

async function anadirCampo(app, ui, pagina, campo, punto = null) {
  const g = app.juego;
  const def = g.fields[campo];
  const foto = def && def.type === 'photo';
  const el = foto
    ? { kind: 'photo', field: campo, x: 35, y: 35, w: 30, h: 21, angle: 0 }
    : { kind: 'field', field: campo, x: 20, y: 45, w: 60, h: 5, size: 2.4, color: '#1B2420', fontFamily: 'Open Sans', angle: 0, ...(def && def.type === 'long' ? { wrap: true, h: 14 } : {}) };
  if (punto) { punto = pagina.aLocal(punto); el.x = redondear(Math.min(100 - el.w, Math.max(0, punto.x - el.w / 2))); el.y = redondear(Math.min(100 - el.h, Math.max(0, punto.y - el.h / 2))); }
  if (pagina.caja) el.size && (el.size = redondear(el.size / (pagina.caja.w / 100)));
  const nuevo = await app.cambiar(`Campo ${campo}`, (copia) => pagina.anadir(copia, el));
  if (nuevo) { ui.sel = nuevo.id; app.repintar(); }
}

async function anadirTexto(app, ui, pagina) {
  const textos = Object.fromEntries(app.juego.languages.map((l) => [l, l === 'es' ? 'Texto nuevo' : l === 'en' ? 'New text' : 'Texto nuevo']));
  const el = await app.cambiar('Texto fijo', (g) => pagina.anadir(g,
    { kind: 'text', texts: textos, x: 20, y: 10, w: 60, h: 6, size: redondear(3 / (pagina.caja ? pagina.caja.w / 100 : 1)), color: '#1B2420', fontFamily: 'Anton', angle: 0 }));
  if (el) { ui.sel = el.id; app.repintar(); }
}

async function elegirCampo(app, ui, pagina, soloFotos) {
  const g = app.juego;
  const campos = Object.entries(g.fields || {}).filter(([, d]) => (d.type === 'photo') === soloFotos);
  if (!campos.length) { app.aviso(soloFotos ? 'Aún no hay ninguna pregunta de foto: créala en el formulario.' : 'Aún no hay campos: créalos en el formulario.'); return; }
  const id = await app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('h2', {}, soloFotos ? 'Qué foto se pone' : 'Qué campo se pone'),
    h('div', { class: 'lista-insertar' }, campos.map(([cid, d]) => h('button', { type: 'button', onclick: () => cerrar(cid) }, h('span', {}, enIdioma(d.q, ui.lang), h('br', {}), h('span', { class: 'codigo' }, cid))))),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'))));
  if (id) await anadirCampo(app, ui, pagina, id);
}

/* ---------------- Barra y lienzo ---------------- */

function barraMesa(app, ui, pagina) {
  const g = app.juego;
  const ejemplos = (g.examples || []).map((e, i) => [e.id, ['Corto', 'Normal', 'Largo'][i] || `Ejemplo ${e.id}`]);
  return h('div', { class: 'barra-mesa' },
    pagina && pagina.caja ? h('div', { class: 'aviso-dentro', role: 'status' }, h('strong', {}, `Por dentro: «${pagina.puzzle.name || pagina.puzzle.id}»`),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => { ui.dentro = null; ui.sel = pagina.bloque.id; app.repintar(); } }, 'Salir del puzzle')) : null,
    pagina && !app.soloLectura ? h('div', { class: 'herramientas', role: 'group', 'aria-label': pagina.caja ? 'Añadir al puzzle' : 'Añadir a la página' },
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => anadirTexto(app, ui, pagina) }, 'Texto fijo'),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => elegirCampo(app, ui, pagina, false) }, 'Campo'),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => elegirCampo(app, ui, pagina, true) }, 'Foto'),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => { ui.pestana = 'imagenes'; app.repintar(); } }, 'Imagen'),
      pagina.caja ? null : h('button', { class: 'boton pequeno', type: 'button', onclick: () => { ui.pestana = 'fondos'; ui.sel = null; app.repintar(); } }, 'Fondo')) : null,
    h('div', { class: 'relleno' }),
    g.languages.length > 1 ? h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Idioma' }, g.languages.map((l) => h('button', { type: 'button', 'aria-pressed': ui.lang === l ? 'true' : 'false', onclick: () => { ui.lang = l; app.repintar(); } }, l.toUpperCase()))) : null,
    ejemplos.length ? h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Ejemplo' }, ejemplos.map(([id, t]) => h('button', { type: 'button', 'aria-pressed': ui.ejemplo === id ? 'true' : 'false', onclick: () => { ui.ejemplo = id; app.repintar(); } }, t)),
      h('button', { type: 'button', 'aria-pressed': ui.ejemplo === null ? 'true' : 'false', onclick: () => { ui.ejemplo = null; app.repintar(); } }, 'Vacío')) : null,
    h('label', { class: 'casilla' }, h('span', { class: 'tenue' }, 'Tamaño'),
      h('select', { 'aria-label': 'Tamaño del lienzo', onchange: (e) => { ui.ancho = Number(e.target.value); app.repintar(); } },
        [[440, 'Pequeño'], [560, 'Normal'], [720, 'Grande']].map(([v, t]) => h('option', { value: v, selected: ui.ancho === v }, t)))));
}

let turno = 0;
function lienzo(app, ui, pagina) {
  const ancho = ui.ancho;
  const alto = Math.round(ancho * 297 / 210);
  if (!ui.canvas) ui.canvas = h('canvas', { class: 'pintado' });
  const canvas = ui.canvas;
  if (!canvas.style.width) { canvas.width = ancho; canvas.height = alto; }
  const cargando = h('div', { class: 'cargando', hidden: true }, 'Componiendo…');
  const cajas = h('div', { class: 'capa-cajas' });
  const caja = h('div', { class: 'lienzo', style: { width: `${ancho}px`, height: `${alto}px` }, 'data-pagina': pagina.id,
    ondragover: (e) => { if ([...e.dataTransfer.types].some((t) => t.startsWith('application/x-pme-'))) e.preventDefault(); },
    ondrop: (e) => {
      e.preventDefault();
      const r = caja.getBoundingClientRect();
      const punto = { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
      const ref = e.dataTransfer.getData('application/x-pme-pieza');
      const campo = e.dataTransfer.getData('application/x-pme-campo');
      if (ref) { const p = app.biblioteca.buscar('arte', ref); if (p) anadirArte(app, ui, pagina, p, punto); }
      else if (campo) anadirCampo(app, ui, pagina, campo, punto);
    },
    onpointerdown: (e) => { if (e.target === caja || e.target === canvas || e.target === cajas) { ui.sel = null; app.repintar(); } } },
  canvas, cajas, cargando);
  pintarCajas(app, ui, pagina, cajas, ancho, alto);
  // Componer la página con el motor (lo último que se pidió gana).
  const mio = ++turno;
  const t = setTimeout(() => { if (mio === turno) cargando.hidden = false; }, 250);
  componer({ juego: app.juego, almacen: app.almacen, biblioteca: app.biblioteca, lang: ui.lang, ejemplo: ui.ejemplo, paginas: [pagina.id] })
    .then(({ bytes, warns }) => {
      if (mio !== turno) return null;
      // Un mismo canvas no admite dos pintados a la vez: se pintan en cola y solo el último pedido.
      ui.colaPintado = (ui.colaPintado || Promise.resolve()).catch(() => {}).then(async () => {
        if (mio !== turno) return;
        await pintarPDF(bytes, canvas, ancho);
        ui.avisosMotor = warns;
        caja.dataset.listo = '1';
      });
      return ui.colaPintado;
    })
    .catch((e) => { if (mio === turno) app.aviso(`No se pudo componer la página: ${e.message}`, { tipo: 'error' }); })
    .finally(() => { clearTimeout(t); if (mio === turno) cargando.hidden = true; });
  return caja;
}

function pintarCajas(app, ui, pagina, capa, ancho, alto) {
  const g = app.juego;
  const datos = new Set((g.puzzles || []).filter((z) => z.kind === 'datos').map((z) => z.id));
  if (pagina.caja) {
    const B = pagina.caja;
    capa.append(h('div', { class: 'marco-puzzle', 'aria-hidden': 'true', style: { left: `${B.x}%`, top: `${B.y}%`, width: `${B.w}%`, height: `${B.h}%` } },
      h('span', { class: 'chapa' }, `Dentro del puzzle «${pagina.puzzle.name || pagina.puzzle.id}»`)));
  }
  // Medidas del contenedor en píxeles (la página o la caja del puzzle): las cajas se arrastran en sus %.
  const anchoC = pagina.caja ? ancho * pagina.caja.w / 100 : ancho;
  const altoC = pagina.caja ? alto * pagina.caja.h / 100 : alto;
  for (const el of pagina.elements) {
    const esDatos = el.kind === 'puzzle' && datos.has(el.puzzle);
    const seleccionada = el.id === ui.sel;
    const sugerida = sugerenciasDe(g, { page: pagina.id, element: el.id }).length > 0;
    const div = h('div', { class: `caja ${el.kind}${seleccionada ? ' seleccionada' : ''}${esDatos ? ' puzzle-datos' : ''}${sugerida ? ' sugerida' : ''}`, 'data-elemento': el.id, tabindex: app.soloLectura ? null : '0',
      role: 'button', 'aria-label': `${NOMBRE_KIND[el.kind]}: ${etiquetaDe(app, el, ui.lang)}`, 'aria-pressed': seleccionada ? 'true' : 'false',
      style: { ...cajaCss(pagina.aPagina(el)), transform: el.angle ? `rotate(${el.angle}deg)` : null, pointerEvents: esDatos && !seleccionada ? 'none' : null } },
    h('span', { class: 'chapa' }, `${NOMBRE_KIND[el.kind]} · ${etiquetaDe(app, el, ui.lang)}`.slice(0, 48)),
    !app.soloLectura && !esDatos ? h('span', { class: 'asa', 'data-asa': '1', 'aria-hidden': 'true' }) : null);
    if (!app.soloLectura) {
      div.addEventListener('pointerdown', (e) => arrastrar(app, ui, pagina, el, div, e, anchoC, altoC));
      if (el.kind === 'puzzle' && !esDatos) div.addEventListener('dblclick', () => entrarEnPuzzle(app, ui, el));
      div.addEventListener('keydown', (e) => teclado(app, ui, pagina, el, e));
    } else div.addEventListener('click', () => { ui.sel = el.id; app.repintar(); });
    capa.append(div);
  }
  if (ui.sel) { const s = capa.querySelector(`[data-elemento="${CSS.escape(ui.sel)}"]`); if (s && !app.soloLectura) queueMicrotask(() => s.focus({ preventScroll: true })); }
}

function etiquetaDe(app, el, lang) {
  const g = app.juego;
  if (el.kind === 'text') return ((g.i18n[lang] || {})[el.key] || el.key || '').slice(0, 40);
  if (el.kind === 'field' || el.kind === 'photo') return el.field;
  if (el.kind === 'art') { const p = app.biblioteca.buscar('arte', el.ref); return p ? p.name : el.ref; }
  if (el.kind === 'puzzle') { const z = (g.puzzles || []).find((x) => x.id === el.puzzle); return z ? (z.name || z.id) : el.puzzle; }
  return el.id;
}

/** Arrastrar para mover (o, desde el asa, para cambiar el tamaño). Se aplica al soltar, con una sola operación. */
function arrastrar(app, ui, pagina, el, div, e, ancho, alto) {
  if (e.button !== 0) return;
  e.stopPropagation();
  if (ui.sel !== el.id) { ui.sel = el.id; app.repintar(); return; }
  const asa = e.target.dataset && e.target.dataset.asa;
  const x0 = e.clientX, y0 = e.clientY;
  const inicio = { x: el.x, y: el.y, w: el.w, h: el.h };
  const aspecto = el.h / el.w;
  const dentro = el.kind !== 'art';
  let cambio = null;
  div.setPointerCapture(e.pointerId);
  const mover = (ev) => {
    const dx = ((ev.clientX - x0) / ancho) * 100, dy = ((ev.clientY - y0) / alto) * 100;
    if (asa) {
      let w = Math.max(1, inicio.w + dx), hh = el.kind === 'art' && !ev.shiftKey ? w * aspecto : Math.max(1, inicio.h + dy);
      if (dentro) { w = Math.min(w, 100 - inicio.x); hh = Math.min(hh, 100 - inicio.y); }
      cambio = { w: redondear(w), h: redondear(hh) };
      Object.assign(div.style, cajaCss(pagina.aPagina({ ...inicio, ...cambio })));
    } else {
      let x = inicio.x + dx, y = inicio.y + dy;
      if (dentro) { x = Math.min(Math.max(0, x), 100 - inicio.w); y = Math.min(Math.max(0, y), 100 - inicio.h); }
      cambio = { x: redondear(x), y: redondear(y) };
      Object.assign(div.style, cajaCss(pagina.aPagina({ ...inicio, ...cambio })));
    }
  };
  const soltar = () => {
    div.removeEventListener('pointermove', mover);
    div.removeEventListener('pointerup', soltar);
    if (cambio) app.cambiar(asa ? 'Cambiar el tamaño' : 'Mover', (g) => pagina.actualizar(g, el.id, cambio));
  };
  div.addEventListener('pointermove', mover);
  div.addEventListener('pointerup', soltar);
}

function teclado(app, ui, pagina, el, e) {
  const flechas = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.sel = el.id; app.repintar(); return; }
  if (ui.sel !== el.id) return;
  if (flechas[e.key]) {
    e.preventDefault();
    const paso = e.shiftKey ? PASO * 4 : PASO;
    const [dx, dy] = flechas[e.key];
    let x = el.x + dx * paso, y = el.y + dy * paso;
    if (el.kind !== 'art') { x = Math.min(Math.max(0, x), 100 - el.w); y = Math.min(Math.max(0, y), 100 - el.h); }
    app.cambiar('Mover', (g) => pagina.actualizar(g, el.id, { x: redondear(x), y: redondear(y) }));
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    quitar(app, ui, pagina, el);
  } else if (e.key === 'Escape') { if (!ui.sel && ui.dentro) ui.dentro = null; ui.sel = null; app.repintar(); }
}

async function quitar(app, ui, pagina, el) {
  const ok = el.kind === 'puzzle'
    ? await app.cambiar('Quitar el puzzle', (g) => app.ops.quitarPuzzle(g, { puzzle: el.puzzle }))
    : await app.cambiar(`Quitar ${NOMBRE_KIND[el.kind].toLowerCase()}`, (g) => pagina.quitar(g, el.id));
  if (ok) { ui.sel = null; app.repintar(); }
}

/* ---------------- Propiedades ---------------- */

function columnaPropiedades(app, ui, pagina) {
  const el = ui.sel ? pagina.elements.find((e) => e.id === ui.sel) : null;
  const cambiarEl = (desc, changes) => app.cambiar(desc, (g) => pagina.actualizar(g, el.id, changes));
  const contenido = el ? propiedadesElemento(app, ui, pagina, el, cambiarEl) : pagina.caja ? propiedadesPuzzle(app, ui, pagina) : propiedadesPagina(app, ui, pagina.real);
  return h('aside', { class: 'columna propiedades', 'aria-label': 'Propiedades' }, contenido, capas(app, ui, pagina));
}

function numero(id, rotulo, valor, alCambiar, { paso = 0.1, sufijo = '', min = null, max = null } = {}) {
  return h('div', { class: 'campo' }, h('label', { for: id }, rotulo),
    h('input', { id, type: 'number', step: paso, value: valor, min, max, disabled: alCambiar ? null : true,
      onchange: (e) => { const v = Number(e.target.value); if (Number.isFinite(v)) alCambiar(v); } }),
    sufijo ? h('span', { class: 'ayuda' }, sufijo) : null);
}

function propiedadesPagina(app, ui, pagina) {
  const g = app.juego;
  const i = g.pages.indexOf(pagina);
  const ro = app.soloLectura;
  const fondo = pagina.background;
  const textoFondo = fondo.kind === 'color' ? `Color ${fondo.value}` : fondo.kind === 'pdf' ? `PDF ${fondo.file} (pág. ${fondo.page})`
    : fondo.kind === 'art' ? `Imagen ${(app.biblioteca.buscar('arte', fondo.ref) || {}).name || fondo.ref}` : 'Sin fondo';
  const mover = (d) => app.cambiar('Mover la página', (copia) => { const [p] = copia.pages.splice(i, 1); copia.pages.splice(i + d, 0, p); });
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    h('div', { class: 'prop-cabeza' }, h('div', { class: 'tipo' }, `Página ${i + 1}`), h('div', { class: 'nombre' }, pagina.title || 'Sin título')),
    h('div', { class: 'campo' }, h('label', { for: 'pag-titulo' }, 'Título (para el estudio)'),
      h('input', { id: 'pag-titulo', value: pagina.title || '', disabled: ro, onchange: (e) => app.cambiar('Título de la página', (copia) => { copia.pages[i].title = e.target.value; }) })),
    sugerenciasDe(g, { page: pagina.id }).map((s) => cajaSugerencia(app, s)),
    h('div', { class: 'info' }, h('strong', {}, 'Fondo'), h('span', {}, textoFondo)),
    pagina.from ? h('div', { class: 'info claude' }, h('strong', {}, 'Copiada de la biblioteca'), h('span', {}, pagina.from)) : null,
    ro ? null : h('div', { class: 'filtros' },
      h('button', { class: 'boton pequeno', type: 'button', disabled: i === 0, onclick: () => mover(-1) }, icono('arriba', { tam: 16 }), 'Antes'),
      h('button', { class: 'boton pequeno', type: 'button', disabled: i === g.pages.length - 1, onclick: () => mover(1) }, icono('abajo', { tam: 16 }), 'Después'),
      h('button', { class: 'boton pequeno peligro', type: 'button', onclick: async () => {
        const ok = await app.dialogo((cerrar) => h('div', { class: 'dialogo' }, h('h2', {}, '¿Quitar la página?'), h('p', {}, `Se quita «${pagina.title || `Página ${i + 1}`}» con todo lo que tiene. Se puede deshacer.`),
          h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'), h('button', { class: 'boton peligro', type: 'button', onclick: () => cerrar(true) }, 'Quitar'))));
        if (ok && await app.cambiar('Quitar la página', (copia) => { copia.pages.splice(i, 1); })) { ui.sel = null; app.navegar(app.rutaJuego('paginas')); }
      } }, icono('basura', { tam: 16 }), 'Quitar')),
    (ui.avisosMotor || []).length ? h('div', { class: 'info aviso' }, h('strong', {}, 'El motor avisa'), (ui.avisosMotor || []).slice(0, 4).map((w) => h('span', { style: { fontSize: '13px' } }, w))) : null,
    h('p', { class: 'tenue', style: { fontSize: '13px' } }, 'Elige un elemento en la página para cambiarlo. Con las flechas se mueve; con Supr se quita.'));
}

function propiedadesElemento(app, ui, pagina, el, cambiarEl) {
  const g = app.juego;
  const ro = app.soloLectura;
  const pre = `el-${el.id}`;
  const partes = [h('div', { class: 'prop-cabeza' }, h('div', { class: 'tipo' }, NOMBRE_KIND[el.kind]), h('div', { class: 'nombre' }, etiquetaDe(app, el, ui.lang) || el.id)),
    ...sugerenciasDe(g, { page: pagina.id, element: el.id }).map((s) => cajaSugerencia(app, s))];

  if (el.kind === 'text') {
    partes.push(...g.languages.map((l) => h('div', { class: 'campo' }, h('label', { for: `${pre}-t-${l}` }, `Texto (${l.toUpperCase()})`),
      h('textarea', { id: `${pre}-t-${l}`, rows: 3, disabled: ro, onchange: (e) => cambiarEl('Texto', { texts: { [l]: e.target.value } }) }, (g.i18n[l] || {})[el.key] || ''))));
  }
  if (el.kind === 'field' || el.kind === 'photo') {
    const opciones = Object.entries(g.fields).filter(([, d]) => (d.type === 'photo') === (el.kind === 'photo'));
    const calculados = el.kind === 'field' ? [...new Set([...(g.mechanics || []).flatMap((m) => m.derives || []), ...(g.puzzles || []).flatMap((z) => z.derives || [])])] : [];
    partes.push(h('div', { class: 'campo' }, h('label', { for: `${pre}-campo` }, 'Qué se imprime'),
      h('select', { id: `${pre}-campo`, disabled: ro, onchange: (e) => cambiarEl('Campo', { field: e.target.value }) },
        opciones.map(([id, d]) => h('option', { value: id, selected: id === el.field }, `${enIdioma(d.q, ui.lang) || id} (${id})`)),
        calculados.map((id) => h('option', { value: id, selected: id === el.field }, `${id} (calculado)`))),
      g.fields[el.field] ? h('a', { href: app.rutaJuego('formulario', el.field), style: { fontSize: '13px', fontWeight: 600 } }, 'Editar la pregunta del formulario') : null));
    if (el.kind === 'field') partes.push(cabida(app, ui, el));
  }
  if (el.kind === 'art') {
    const p = app.biblioteca.buscar('arte', el.ref);
    if (p) {
      const img = h('img', { alt: '', style: { width: '100%', maxHeight: '140px', objectFit: 'contain', background: 'var(--superficie-2)', borderRadius: '8px' } });
      app.biblioteca.miniatura(p).then((u) => { img.src = u; }, () => {});
      partes.push(img, h('div', { class: 'tenue', style: { fontSize: '13px' } }, `${p.widthMm} × ${p.heightMm} mm · ${p.author} · ${el.ref}`));
    }
    const primerTexto = pagina.elements.findIndex((e) => e.kind === 'text' || e.kind === 'field' || e.kind === 'photo');
    const idx = pagina.elements.indexOf(el);
    const encima = primerTexto >= 0 && idx > primerTexto;
    if (!pagina.caja) partes.push(h('div', { class: 'info' + (encima ? ' aviso' : '') }, h('strong', {}, encima ? 'Se imprime encima de los textos' : 'Se imprime debajo de los textos'),
      h('span', { style: { fontSize: '13px' } }, 'El motor pone el arte en dos capas: la que va antes del primer texto queda debajo; la de después, encima de todos.')),
    ro ? null : h('button', { class: 'boton pequeno', type: 'button', onclick: () => app.cambiar(encima ? 'Llevar debajo de los textos' : 'Traer encima de los textos',
      (copia) => pagina.mover(copia, el.id, encima ? Math.max(0, primerTexto) : Infinity)) },
    encima ? 'Llevar debajo de los textos' : 'Traer encima de los textos'));
  }
  if (el.kind === 'puzzle') {
    const z = (g.puzzles || []).find((x) => x.id === el.puzzle);
    partes.push(h('div', { class: 'info claude' }, h('strong', {}, z ? (z.kind === 'datos' ? 'Puzzle con datos del comprador' : 'Puzzle de contenido') : 'Puzzle'),
      h('span', { style: { fontSize: '13px' } }, z && z.kind === 'datos' ? 'Ocupa la página entera: sus coordenadas son las de la página de la que salió.' : 'Se mueve y se cambia de tamaño como una caja.')),
    z && z.kind !== 'datos' && !ro ? h('button', { class: 'boton pequeno claude', type: 'button', 'data-entrar': el.id, onclick: () => entrarEnPuzzle(app, ui, el) }, 'Editar por dentro') : null,
    h('a', { class: 'boton pequeno', href: app.rutaJuego('puzzles') }, 'Ficha, solución y pistas'));
  }

  if (el.kind === 'text' || el.kind === 'field') {
    const color = el.color || '#000000';
    partes.push(
      h('div', { class: 'campo' }, h('label', { for: `${pre}-fuente` }, 'Letra'),
        h('select', { id: `${pre}-fuente`, disabled: ro, onchange: (e) => cambiarEl('Letra', { fontFamily: e.target.value }) },
          app.registro.nombresDelCreador.some((n) => n.nombre === el.fontFamily) ? null : h('option', { value: el.fontFamily || '', selected: true }, `${el.fontFamily || '(por defecto)'} (de un juego antiguo)`),
          app.registro.nombresDelCreador.map((n) => h('option', { value: n.nombre, selected: n.nombre === el.fontFamily }, n.etiqueta)))),
      h('div', { class: 'rejilla-2' },
        numero(`${pre}-tam`, 'Tamaño (pt)', pt(el.size * pagina.escala), ro ? null : (v) => cambiarEl('Tamaño de letra', { size: redondear(desdePt(v) / pagina.escala * 1000) / 1000 }), { paso: 0.5, min: 3, max: 200 }),
        numero(`${pre}-giro`, 'Giro (°)', el.angle || 0, ro ? null : (v) => cambiarEl('Giro', { angle: v }), { paso: 1, min: -180, max: 180 })),
      h('fieldset', { class: 'campo', style: { border: 0, margin: 0, padding: 0 } }, h('legend', { class: 'rotulo', style: { marginBottom: '8px' } }, 'Color'),
        h('div', { class: 'colores' }, COLORES.map(([n, c]) => h('button', { type: 'button', 'aria-label': n, disabled: ro, 'aria-pressed': color.toUpperCase() === c ? 'true' : 'false', style: { background: c }, onclick: () => cambiarEl('Color', { color: c }) })),
          h('input', { type: 'color', value: color, disabled: ro, 'aria-label': 'Otro color', onchange: (e) => cambiarEl('Color', { color: e.target.value.toUpperCase() }) }))),
      h('div', { class: 'campo' }, h('label', { for: `${pre}-alin` }, 'Alineación'),
        h('select', { id: `${pre}-alin`, disabled: ro, onchange: (e) => cambiarEl('Alineación', { align: e.target.value === 'left' ? null : e.target.value }) },
          [['left', 'A la izquierda'], ['center', 'Centrado'], ['right', 'A la derecha']].map(([v, t]) => h('option', { value: v, selected: (el.align || 'left') === v }, t)))));
    if (el.kind === 'field') {
      const modo = el.transform === 'runes' ? 'runes' : el.upper ? 'upper' : 'tal';
      partes.push(h('div', { class: 'campo' }, h('label', { for: `${pre}-transf` }, 'Se imprime'),
        h('select', { id: `${pre}-transf`, disabled: ro, onchange: (e) => {
          const v = e.target.value;
          cambiarEl('Cómo se imprime', v === 'runes' ? { transform: 'runes', upper: null, fontFamily: 'Pigpen' } : v === 'upper' ? { upper: true, transform: null } : { upper: null, transform: null });
        } }, [['tal', 'Tal cual'], ['upper', 'En mayúsculas'], ['runes', 'En runas']].map(([v, t]) => h('option', { value: v, selected: modo === v }, t)))),
      h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!el.wrap, disabled: ro, onchange: (e) => cambiarEl('Varias líneas', { wrap: e.target.checked || null }) }), 'Puede ocupar varias líneas'),
      h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!el.vTop, disabled: ro, onchange: (e) => cambiarEl('Empezar arriba', { vTop: e.target.checked || null }) }), 'Empieza arriba de la caja'));
    } else {
      partes.push(h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!el.tight, disabled: ro, onchange: (e) => cambiarEl('Líneas juntas', { tight: e.target.checked || null }) }), 'Líneas juntas (no repartirlas en la caja)'));
    }
  }
  if (el.kind === 'photo' || el.kind === 'art') {
    partes.push(numero(`${pre}-giro`, 'Giro (°)', el.angle || 0, ro ? null : (v) => cambiarEl('Giro', { angle: v }), { paso: 1, min: -180, max: 180 }));
  }
  const datos = el.kind === 'puzzle' && ((g.puzzles || []).find((x) => x.id === el.puzzle) || {}).kind === 'datos';
  if (!datos) {
    partes.push(h('div', { class: 'rejilla-2' },
      numero(`${pre}-x`, pagina.caja ? 'X (% del puzzle)' : 'X (%)', el.x, ro ? null : (v) => cambiarEl('Posición', { x: v })),
      numero(`${pre}-y`, pagina.caja ? 'Y (% del puzzle)' : 'Y (%)', el.y, ro ? null : (v) => cambiarEl('Posición', { y: v })),
      numero(`${pre}-w`, 'Ancho (%)', el.w, ro ? null : (v) => cambiarEl('Tamaño', el.kind === 'art' ? { w: v, h: redondear(v * el.h / el.w) } : { w: v })),
      numero(`${pre}-h`, 'Alto (%)', el.h, ro ? null : (v) => cambiarEl('Tamaño', el.kind === 'art' ? { h: v, w: redondear(v * el.w / el.h) } : { h: v }))));
  }
  if (!ro) partes.push(h('button', { class: 'boton pequeno peligro', type: 'button', onclick: () => quitar(app, ui, pagina, el) }, icono('basura', { tam: 16 }), el.kind === 'puzzle' ? 'Quitar el puzzle' : pagina.caja ? 'Quitar del puzzle' : 'Quitar de la página'));
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } }, partes);
}

/** Lo que cabe: el tope del formulario y lo que ocupa el ejemplo más largo, con lo que dice el motor. */
function cabida(app, ui, el) {
  const g = app.juego;
  const def = g.fields[el.field];
  const largos = (g.examples || []).map((e) => String(((e.values || {})[ui.lang] || {})[el.field] || '').length);
  const maximo = largos.length ? Math.max(...largos) : 0;
  const encoge = (ui.avisosMotor || []).filter((w) => w.includes(el.field));
  return h('div', { class: `info${encoge.length ? ' aviso' : ''}` },
    h('strong', {}, def && def.cap ? `Tope del formulario: ${def.cap} caracteres` : def ? 'Sin tope en el formulario' : 'Campo calculado'),
    maximo ? h('span', { style: { fontSize: '13px' } }, `El ejemplo más largo ocupa ${maximo}.`) : null,
    encoge.length ? encoge.map((w) => h('span', { style: { fontSize: '13px' } }, w)) : h('span', { style: { fontSize: '13px' } }, 'Prueba el ejemplo «Largo» arriba para ver si entra sin encoger.'));
}

function capas(app, ui, pagina) {
  const n = (k) => pagina.elements.filter((e) => k.includes(e.kind)).length;
  return h('div', { class: 'capas-resumen' },
    h('strong', {}, pagina.caja ? 'Piezas del puzzle' : 'Capas de esta página'),
    h('div', { class: 'fila' }, h('span', {}, 'Textos y campos'), h('span', { class: 'tenue' }, String(n(['text', 'field'])))),
    h('div', { class: 'fila' }, h('span', {}, 'Fotos del comprador'), h('span', { class: 'tenue' }, String(n(['photo'])))),
    h('div', { class: 'fila' }, h('span', {}, 'Imágenes'), h('span', { class: 'tenue' }, String(n(['art'])))),
    n(['puzzle']) ? h('div', { class: 'fila' }, h('span', {}, 'Puzzles'), h('span', { class: 'tenue' }, String(n(['puzzle'])))) : null,
    h('details', {}, h('summary', {}, 'Todos los elementos, de abajo arriba'),
      h('div', { class: 'lista-capas' }, pagina.elements.map((e) => h('button', { type: 'button', 'aria-current': e.id === ui.sel ? 'true' : 'false', onclick: () => { ui.sel = e.id; app.repintar(); } },
        h('span', {}, etiquetaDe(app, e, ui.lang) || e.id), h('span', { class: 'tenue', style: { fontSize: '12px' } }, NOMBRE_KIND[e.kind]))))));
}

export { PAGINA_ENTERA };
