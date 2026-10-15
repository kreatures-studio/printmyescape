// Tema de color: cambia la paleta de todo el juego. Se mira qué colores tiene el juego (en sus páginas compuestas),
// se elige una paleta de partida o se ajusta color a color, y se ve el resultado antes de aplicarlo. Lo aplicado se
// guarda en el juego (game.theme) y lo usa el motor al componer: piezas, PDF de fondo, textos y color de página. Las
// piezas de la biblioteca no cambian, y se puede quitar el tema cuando se quiera.

import { h } from '../dom.js';
import { componer, pintarPDF } from '../motor.js';
import { PALETAS, paletaDeMuestras, asignarPaleta, rgbAHex } from '../../tools/game/paletas.mjs';
import { nuevo as nuevoPresupuesto } from './presupuestos.js';

const ANCHO_MUESTRA = 150; // px de ancho al leer los colores de cada página
const ANCHO_PREVIA = 220;
const MAX_PREVIA = 6;

export function pintarTema(raiz, app) {
  const g = app.juego;
  const ui = app.ui.tema || (app.ui.tema = { paleta: null, analizando: false, borrador: null, alcance: null });
  if (!ui.borrador) ui.borrador = g.theme ? structuredClone(g.theme) : { name: '', map: [] };
  if (ui.alcance === null) ui.alcance = (g.theme && g.theme.tolerance) || 22;
  const b = ui.borrador;

  const lista = h('div', { class: 'tema-colores', 'data-paleta': ui.paleta ? String(ui.paleta.length) : '' });
  const previa = h('div', { class: 'tema-previa', 'aria-live': 'polite' }, h('p', { class: 'tenue' }, 'Preparando la vista previa…'));
  const destino = (from) => ((b.map || []).find((m) => m.from === from) || {}).to || from;
  const fijar = (from, to) => {
    const m = (b.map || []).filter((x) => x.from !== from);
    if (to.toUpperCase() !== from.toUpperCase()) m.push({ from, to: to.toUpperCase() });
    b.map = m;
    b.preset = undefined;
    pintarTema(raiz, app);
  };

  if (ui.paleta) {
    lista.replaceChildren(...ui.paleta.map((c) => h('div', { class: 'tema-fila', 'data-color': c.hex },
      h('span', { class: 'muestra', style: { background: c.hex }, title: c.hex }),
      h('span', { class: 'flecha', 'aria-hidden': 'true' }, '→'),
      h('input', { type: 'color', value: destino(c.hex).toLowerCase(), 'aria-label': `Nuevo color para ${c.hex}`, disabled: app.soloLectura, onchange: (e) => fijar(c.hex, e.target.value) }),
      h('span', { class: 'tenue cifra' }, `${Math.max(1, Math.round(c.peso * 100))} %`),
      destino(c.hex) !== c.hex ? h('button', { class: 'boton pequeno', type: 'button', onclick: () => fijar(c.hex, c.hex), title: 'Dejar el color como estaba' }, 'Original') : null)));
  } else {
    lista.replaceChildren(h('p', { class: 'tenue' }, 'Mirando qué colores tiene el juego…'));
  }

  const aplicado = !!g.theme;
  const igual = JSON.stringify(normal(g.theme)) === JSON.stringify(normal({ ...b, tolerance: ui.alcance }));
  raiz.replaceChildren(h('div', { class: 'trabajo' },
    h('aside', { class: 'columna lateral ancha', 'aria-label': 'Tema de color' },
      h('h2', { style: { fontSize: '22px' } }, 'Tema de color'),
      h('p', { class: 'tenue', style: { margin: 0, fontSize: '14px' } }, 'Cambia los colores de todo el juego: piezas de arte, fondo, textos y color de las páginas. Las piezas de la biblioteca no cambian, y el tema se puede quitar cuando quieras.'),
      aplicado ? h('div', { class: 'info' }, `Este juego tiene el tema «${g.theme.name || 'sin nombre'}».`) : null,
      h('div', { class: 'etiqueta-seccion' }, 'Paletas de partida'),
      h('div', { class: 'tema-paletas' }, PALETAS.map((pal) => h('button', {
        type: 'button', class: 'tema-paleta', 'data-paleta-id': pal.id, 'aria-pressed': b.preset === pal.id ? 'true' : 'false', disabled: !ui.paleta || app.soloLectura,
        onclick: () => { ui.borrador = { name: pal.nombre, preset: pal.id, map: asignarPaleta(ui.paleta, pal.colores) }; pintarTema(raiz, app); },
      }, h('span', { class: 'franja' }, pal.colores.map((c) => h('span', { style: { background: c } }))), h('span', {}, pal.nombre)))),
      h('div', { class: 'etiqueta-seccion' }, 'Colores del juego → colores nuevos'),
      lista,
      h('div', { class: 'campo' },
        h('label', { for: 'tema-alcance' }, `Alcance: ${ui.alcance}`),
        h('input', { id: 'tema-alcance', type: 'range', min: 8, max: 40, step: 1, value: ui.alcance, disabled: app.soloLectura, onchange: (e) => { ui.alcance = Number(e.target.value); pintarTema(raiz, app); } }),
        h('span', { class: 'ayuda' }, 'Cuánto tiene que parecerse un color a uno de la paleta para cambiar con él. Más alto: cambian también los tonos cercanos (sombras, luces).')),
      h('div', { class: 'campo' },
        h('label', { for: 'tema-nombre' }, 'Nombre del tema'),
        h('input', { id: 'tema-nombre', value: b.name || '', disabled: app.soloLectura, onchange: (e) => { b.name = e.target.value; } })),
      h('div', { class: 'botones-columna' },
        h('button', { class: 'boton primario', type: 'button', 'data-aplicar-tema': '1', disabled: app.soloLectura || !(b.map || []).length || igual,
          onclick: () => app.cambiar(`Tema de color «${b.name || 'nuevo'}»`, (copia) => { copia.theme = normal({ ...b, tolerance: ui.alcance }); }) }, aplicado ? 'Aplicar los cambios del tema' : 'Aplicar el tema al juego'),
        aplicado ? h('button', { class: 'boton', type: 'button', 'data-quitar-tema': '1', disabled: app.soloLectura,
          onclick: async () => { await app.cambiar('Quitar el tema de color', (copia) => { delete copia.theme; }); ui.borrador = { name: '', map: [] }; pintarTema(raiz, app); } }, 'Quitar el tema') : null,
        h('button', { class: 'boton', type: 'button', disabled: !(b.map || []).length, onclick: () => nuevoPresupuesto(app, { juego: g.id, empezar: 'tema', titulo: `${(g.name && (g.name.es || Object.values(g.name)[0])) || g.id}: cambio de tema «${b.name || 'nuevo'}»`, tema: b.name }) }, 'Presupuestar este cambio')),
      h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Las fotos del comprador, las imágenes de mapa de bits (como las pantallas) y los degradados no cambian de color.')),
    h('section', { class: 'mesa', 'aria-label': 'Vista previa del tema' },
      h('div', { class: 'barra-mesa' }, h('strong', {}, (b.map || []).length ? 'Con el tema' : 'Sin tema'), h('span', { class: 'tenue' }, `Primeras ${Math.min(MAX_PREVIA, g.pages.length)} páginas`)),
      previa)));

  if (!ui.paleta && !ui.analizando) {
    ui.analizando = true;
    paletaDelJuego(app).then((p) => { ui.paleta = p; ui.analizando = false; if (app.ruta.vista === 'tema' && app.juego === g) pintarTema(raiz, app); })
      .catch((e) => { ui.analizando = false; lista.replaceChildren(h('div', { class: 'mensaje error' }, `No se pudieron leer los colores del juego: ${e.message}`)); });
  }
  pintarPrevia(app, ui, previa, { ...b, tolerance: ui.alcance });
}

/** Tema sin campos vacíos (para comparar y guardar). */
function normal(t) {
  if (!t) return null;
  const out = { name: t.name || '', map: (t.map || []).map((m) => ({ from: m.from.toUpperCase(), to: m.to.toUpperCase() })) };
  if (t.preset) out.preset = t.preset;
  if (t.tolerance && t.tolerance !== 22) out.tolerance = t.tolerance;
  return out;
}

/** Colores del juego: compone sus páginas sin tema ni ejemplo, las pinta pequeñas y cuenta los píxeles de cada color. */
async function paletaDelJuego(app) {
  const g = app.juego;
  const sinTema = { ...g };
  delete sinTema.theme;
  const { bytes } = await componer({ juego: sinTema, almacen: app.almacen, biblioteca: app.biblioteca, lang: g.languages[0], ejemplo: null });
  const muestras = {};
  const canvas = document.createElement('canvas');
  for (let i = 1; i <= g.pages.length; i++) {
    await pintarPDF(bytes, canvas, ANCHO_MUESTRA, i);
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    for (let k = 0; k < d.length; k += 4) {
      const hex = rgbAHex([d[k] / 255, d[k + 1] / 255, d[k + 2] / 255]);
      muestras[hex] = (muestras[hex] || 0) + 1;
    }
  }
  // Los colores de los textos también son del tema, aunque ocupen pocos píxeles.
  for (const p of g.pages) for (const e of p.elements || []) if (e.color) muestras[e.color.toUpperCase()] = (muestras[e.color.toUpperCase()] || 0) + 400;
  return paletaDeMuestras(muestras);
}

let turno = 0;
async function pintarPrevia(app, ui, caja, tema) {
  const yo = ++turno;
  const g = app.juego;
  const paginas = g.pages.slice(0, MAX_PREVIA).map((p) => p.id);
  const clave = JSON.stringify([g.pages.map((p) => p.id), tema, app.rev]);
  try {
    let bytes;
    if (ui.cachePrevia && ui.cachePrevia.clave === clave) bytes = ui.cachePrevia.bytes;
    else {
      const juego = { ...g, theme: (tema.map || []).length ? tema : undefined };
      ({ bytes } = await componer({ juego, almacen: app.almacen, biblioteca: app.biblioteca, lang: g.languages[0], ejemplo: null, paginas }));
      ui.cachePrevia = { clave, bytes };
    }
    if (yo !== turno || !caja.isConnected) return;
    const figuras = paginas.map((pid, i) => { const c = h('canvas', { 'aria-label': `Página ${i + 1}` }); return { c, fig: h('figure', { 'data-tema-previa': pid }, c, h('figcaption', {}, `Página ${i + 1}`)) }; });
    caja.replaceChildren(...figuras.map((f) => f.fig));
    for (let i = 0; i < figuras.length; i++) {
      if (yo !== turno || !caja.isConnected) return;
      await pintarPDF(bytes, figuras[i].c, ANCHO_PREVIA, i + 1);
    }
    caja.dataset.listo = '1';
  } catch (e) {
    if (caja.isConnected) caja.replaceChildren(h('div', { class: 'mensaje error' }, `No se pudo componer: ${e.message}`));
  }
}
