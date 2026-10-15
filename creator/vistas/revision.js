// Revisar (F4.4): lo que hizo Claude (sus resúmenes de cambios, write_change_summary), parte por parte del juego:
// cada página, el formulario, los ejemplos y los puzzles. El cliente la ve, la marca como revisada (game.review)
// y le deja notas a Claude (game.notes), que las lee la próxima vez (read_notes) y las marca hechas.

import { h, enIdioma, haceCuanto } from '../dom.js';
import { componer, pintarPDF } from '../motor.js';
import { paginaDe } from '../validar.js';
import { selectoresVista, nombresDeEjemplos, listaY } from './comun.js';
import { sugerenciasDe, cajaSugerencia } from './sugerencias.js';
import { nuevo as nuevoPresupuesto } from './presupuestos.js';

const OTRAS = [['formulario', 'Formulario'], ['ejemplos', 'Ejemplos'], ['puzzles', 'Puzzles y soluciones']];

export function pintarRevision(raiz, app) {
  const g = app.juego;
  const ejemplos = nombresDeEjemplos(g);
  const ui = app.ui.revision || (app.ui.revision = { item: null, lang: g.languages[0], ejemplo: ejemplos[1] ? ejemplos[1].id : (ejemplos[0] ? ejemplos[0].id : null) });
  if (!g.pages) { raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'vacio' }, 'Este juego está en el formato antiguo. Duplícalo desde la biblioteca para revisarlo aquí.'))); return; }
  const items = [...g.pages.map((p, i) => ({ id: p.id, nombre: `${i + 1} · ${p.title || 'Sin título'}`, pagina: p })), ...OTRAS.map(([id, nombre]) => ({ id, nombre }))];
  if (app.ruta.sub && items.some((x) => x.id === app.ruta.sub)) ui.item = app.ruta.sub;
  if (!items.some((x) => x.id === ui.item)) ui.item = items[0] && items[0].id;
  if (!g.languages.includes(ui.lang)) ui.lang = g.languages[0];
  const item = items.find((x) => x.id === ui.item);

  raiz.replaceChildren(
    banda(app, items),
    h('div', { class: 'trabajo', style: { minHeight: 'auto' } },
      columnaCambios(app, ui, items),
      h('section', { class: 'mesa', 'aria-label': item ? `Revisar ${item.nombre}` : 'Revisar' }, item ? centro(app, ui, item) : null),
      item ? detalle(app, ui, item) : null));
}

const revisado = (g, id) => !!(g.review && g.review.items && g.review.items[id]);
const sinVer = (g) => Math.max(0, (g.changes || []).length - ((g.review && g.review.changes) || 0));

function banda(app, items) {
  const g = app.juego;
  const cambios = g.changes || [];
  const ultimo = cambios[cambios.length - 1];
  const pendientes = sinVer(g);
  const hechos = items.filter((x) => revisado(g, x.id)).length;
  const notasPend = (g.notes || []).filter((n) => !n.done).length;
  return h('div', { class: 'banda-revision' },
    h('div', { style: { flex: '1 1 420px' } },
      h('div', { class: 'titulo' }, !cambios.length ? 'Claude aún no ha dejado cambios en este juego' : pendientes ? `Claude hizo ${pendientes === 1 ? 'un cambio' : `${pendientes} cambios`} sin revisar` : 'Has visto todos los cambios de Claude'),
      h('div', { class: 'texto' }, ultimo ? `Último: ${haceCuanto(ultimo.date)}. Revisa cada parte y márcala; puedes editarla o dejarle una nota a Claude.` : 'Cuando Claude trabaje en el juego, aquí verás qué cambió.'),
      pendientes && !app.soloLectura ? h('button', { class: 'boton contorno-claude pequeno', type: 'button', style: { marginTop: '10px' },
        onclick: () => app.cambiar('Cambios de Claude vistos', (copia) => { copia.review = { ...(copia.review || {}), changes: (copia.changes || []).length }; }) }, 'Marcar los cambios como vistos') : null),
    h('div', { class: 'cifras' },
      cifra(`${hechos} / ${items.length}`, 'revisados', 'cifra-revisados'),
      cifra(String(app.validacion.errores.length), 'errores'),
      cifra(String(app.validacion.avisos.length), 'avisos'),
      cifra(String(sugerenciasDe(g).length), sugerenciasDe(g).length === 1 ? 'sugerencia' : 'sugerencias', 'cifra-sugerencias'),
      cifra(String(notasPend), notasPend === 1 ? 'nota para Claude' : 'notas para Claude')));
}

const cifra = (valor, rotulo, prueba = null) => h('div', { class: 'cifra', 'data-prueba': prueba }, h('div', { class: 'valor' }, valor), h('div', { class: 'rotulo' }, rotulo));

/* ---------------- Columna izquierda ---------------- */

function columnaCambios(app, ui, items) {
  const g = app.juego;
  const cambios = [...(g.changes || [])].map((c, i) => ({ ...c, i })).reverse();
  const vistos = (g.review && g.review.changes) || 0;
  const lista = h('div', { class: 'lista-revision' }, items.map((x) => {
    const hoja = x.pagina ? h('span', { style: { width: '34px', height: '48px', background: '#FFFFFF', border: '1px solid var(--borde)', borderRadius: '3px', overflow: 'hidden', flex: '0 0 auto' }, 'data-mini': x.id }) : null;
    return h('button', { type: 'button', class: 'item-revision', 'data-item': x.id, 'aria-current': x.id === ui.item ? 'true' : 'false', onclick: () => { ui.item = x.id; app.navegar(app.rutaJuego('revisar', x.id)); } },
      hoja, h('span', {}, x.nombre), h('span', { class: `estado ${revisado(g, x.id) ? 'hecho' : 'pendiente'}` }, revisado(g, x.id) ? 'Revisada' : x.id === ui.item ? 'Abierta' : 'Pendiente'));
  }));
  queueMicrotask(() => miniaturas(app, ui, lista));
  const avisos = app.validacion.avisos;
  const sugerencias = sugerenciasDe(g);
  const presupuestar = (g.changes || []).flatMap((c) => (c.presupuestar || []).map((texto) => ({ texto, fecha: c.date })));
  return h('aside', { class: 'columna lateral ancha', 'aria-label': 'Cambios de Claude' },
    h('div', { class: 'etiqueta-seccion' }, `Partes del juego · ${items.length}`),
    lista,
    sugerencias.length ? [h('div', { class: 'etiqueta-seccion' }, `Sugerencias de Claude · ${sugerencias.length}`),
      sugerencias.map((s) => h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, cajaSugerencia(app, s, { compacta: true }),
        h('a', { href: s.field ? app.rutaJuego('formulario', s.field) : app.rutaJuego('paginas', s.page), style: { fontSize: '13px', fontWeight: 600 } }, s.field ? 'Ver la pregunta' : 'Ver en la página')))] : null,
    presupuestar.length ? [h('div', { class: 'etiqueta-seccion' }, `A presupuestar · ${presupuestar.length}`),
      h('div', { class: 'lista-revision', 'data-prueba': 'presupuestar' }, presupuestar.map((x) => h('div', { class: 'mensaje' }, x.texto, h('span', { class: 'tenue', style: { display: 'block', fontSize: '12px' } }, x.fecha)))),
      h('button', { class: 'boton pequeno', type: 'button', 'data-presupuestar': '1', onclick: () => nuevoPresupuesto(app, { juego: g.id, empezar: 'presupuestar', titulo: `${enIdioma(g.name)}: cambios a presupuestar` }) }, 'Hacer un presupuesto con esto')] : null,
    h('div', { class: 'etiqueta-seccion' }, `Cambios de Claude · ${cambios.length}`),
    cambios.length ? h('div', { class: 'lista-revision', style: { gap: '8px' } }, cambios.slice(0, 8).map((c) => h('details', { class: 'cambio', open: c.i >= vistos && c.i === cambios[0].i ? true : null },
      h('summary', { style: { cursor: 'pointer' } }, h('span', { class: 'fecha' }, `${c.date}${c.i >= vistos ? ' · nuevo' : ''}`), h('br', {}), h('span', {}, primeraLinea(c.text))),
      primeraLinea(c.text) !== c.text ? h('div', { style: { whiteSpace: 'pre-wrap', fontSize: '13px', marginTop: '6px' } }, c.text) : null,
      (c.notes || []).length ? h('span', { class: 'pastilla verde', style: { alignSelf: 'flex-start' } }, `Atiende ${c.notes.length === 1 ? 'una nota' : `${c.notes.length} notas`}`) : null)))
      : h('span', { class: 'tenue', style: { fontSize: '13px' } }, 'Ninguno todavía.'),
    avisos.length ? [h('div', { class: 'etiqueta-seccion' }, `Avisos · ${avisos.length}`),
      avisos.slice(0, 5).map((m) => h('div', { class: 'mensaje' }, m))] : null);
}

const primeraLinea = (t) => { const l = String(t).split('\n')[0]; return l.length > 110 ? `${l.slice(0, 107)}…` : l; };

const cacheMini = new Map();
async function miniaturas(app, ui, lista) {
  const g = app.juego;
  for (const hoja of lista.querySelectorAll('[data-mini]')) {
    const p = g.pages.find((x) => x.id === hoja.dataset.mini);
    if (!p) continue;
    const clave = JSON.stringify([p, g.i18n, ui.lang, ui.ejemplo, (g.puzzles || []).length]);
    try {
      let bytes = cacheMini.get(clave);
      if (!bytes) { ({ bytes } = await componer({ juego: g, almacen: app.almacen, biblioteca: app.biblioteca, lang: ui.lang, ejemplo: ui.ejemplo, paginas: [p.id] })); cacheMini.set(clave, bytes); }
      if (!hoja.isConnected) return;
      const c = h('canvas', {});
      await pintarPDF(bytes, c, 34);
      hoja.replaceChildren(c);
    } catch { /* la miniatura no es imprescindible */ }
  }
}

/* ---------------- Centro ---------------- */

function centro(app, ui, item) {
  const g = app.juego;
  if (item.pagina) {
    const canvas = h('canvas', { 'aria-label': `Vista previa de la página ${g.pages.indexOf(item.pagina) + 1}`, style: { boxShadow: 'var(--sombra)', background: '#FFFFFF' } });
    const estado = h('p', { class: 'tenue', role: 'status' }, 'Componiendo…');
    componer({ juego: g, almacen: app.almacen, biblioteca: app.biblioteca, lang: ui.lang, ejemplo: ui.ejemplo, paginas: [item.pagina.id] })
      .then(async ({ bytes }) => { if (!canvas.isConnected) return; await pintarPDF(bytes, canvas, 520); estado.remove(); canvas.dataset.listo = '1'; })
      .catch((e) => { estado.textContent = `No se pudo componer: ${e.message}`; });
    return [h('div', { class: 'barra-mesa', role: 'group', 'aria-label': 'Ver con' }, h('span', { class: 'tenue' }, 'Ver con el ejemplo'), selectoresVista(app, ui)), estado, canvas];
  }
  const caja = (...hijos) => h('div', { style: { alignSelf: 'stretch', background: 'var(--superficie)', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '760px', width: '100%', margin: '0 auto' } }, ...hijos);
  if (item.id === 'formulario') {
    return caja(h('h2', {}, 'Formulario'),
      h('p', { class: 'tenue', style: { margin: 0 } }, `${g.form.sections.length} secciones y ${Object.keys(g.fields).length} preguntas.`),
      g.form.sections.map((s, i) => h('div', { class: 'cambio' }, h('strong', {}, `${i + 1} · ${enIdioma(s.title, ui.lang)}`),
        h('ul', { style: { margin: 0, paddingLeft: '18px' } }, s.fields.map((c) => h('li', {}, enIdioma((g.fields[c] || {}).q, ui.lang) || c, ' ', h('code', { class: 'tenue' }, c), (g.fields[c] || {}).cap ? h('span', { class: 'tenue' }, ` · tope ${g.fields[c].cap}`) : null))))),
      h('a', { class: 'boton', href: app.rutaJuego('formulario'), style: { alignSelf: 'flex-start' } }, 'Abrir el formulario'));
  }
  if (item.id === 'ejemplos') {
    const ejemplos = nombresDeEjemplos(g);
    const campos = Object.keys(g.fields).filter((c) => g.fields[c].type !== 'photo');
    return caja(h('h2', {}, 'Ejemplos'),
      h('p', { class: 'tenue', style: { margin: 0 } }, ejemplos.length ? `Los ejemplos ${listaY(ejemplos.map((e) => e.nombre.toLowerCase()))} rellenan la vista previa y las pruebas. El largo tiene que llegar a los topes.` : 'Aún no hay ejemplos.'),
      ejemplos.length ? h('div', { style: { overflowX: 'auto' } }, h('table', { style: { borderCollapse: 'collapse', fontSize: '13px', width: '100%' } },
        h('thead', {}, h('tr', {}, h('th', { style: celda(true) }, 'Pregunta'), ejemplos.map((e) => h('th', { style: celda(true) }, e.nombre)))),
        h('tbody', {}, campos.map((c) => h('tr', {}, h('td', { style: celda() }, h('code', {}, c)),
          ejemplos.map((e) => h('td', { style: celda() }, String((((g.examples.find((x) => x.id === e.id) || {}).values || {})[ui.lang] || {})[c] || '—')))))))) : null,
      h('a', { class: 'boton', href: app.rutaJuego('formulario'), style: { alignSelf: 'flex-start' } }, 'Cambiar los ejemplos en el formulario'));
  }
  return caja(h('h2', {}, 'Puzzles y soluciones'),
    (g.puzzles || []).length ? (g.puzzles || []).map((z) => h('div', { class: 'cambio' }, h('strong', {}, z.name || z.id),
      z.solution ? h('div', { class: 'solucion', style: { fontSize: '14px' } }, enIdioma(z.solution, ui.lang)) : null,
      (z.hints || []).length ? h('span', { class: 'tenue' }, `${z.hints.length} pista${z.hints.length === 1 ? '' : 's'}`) : null)) : h('div', { class: 'vacio' }, 'Este juego no tiene puzzles.'),
    h('a', { class: 'boton', href: app.rutaJuego('puzzles'), style: { alignSelf: 'flex-start' } }, 'Abrir puzzles y soluciones'));
}

const celda = (cabeza = false) => ({ textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid var(--borde)', fontWeight: cabeza ? 600 : 400, verticalAlign: 'top' });

/* ---------------- Detalle ---------------- */

function detalle(app, ui, item) {
  const g = app.juego;
  const ro = app.soloLectura;
  const hecho = revisado(g, item.id);
  const p = item.pagina;
  const numero = p ? g.pages.indexOf(p) + 1 : null;
  const notas = (g.notes || []).filter((n) => n.page === item.id);
  // Cambios de Claude que hablan de esta página (por su id, «p3», o por su título).
  const menciones = p ? (g.changes || []).filter((c) => new RegExp(`\\b${p.id}\\b`).test(c.text) || (p.title && c.text.includes(p.title))) : [];
  const errores = p ? app.validacion.errores.filter((m) => paginaDe(m) === p.id) : [];
  const puzzles = p ? p.elements.filter((e) => e.kind === 'puzzle').map((e) => (g.puzzles || []).find((z) => z.id === e.puzzle)).filter(Boolean) : [];
  const nota = h('textarea', { id: 'nota-claude', rows: 4, disabled: ro, placeholder: p ? 'Por ejemplo: que el número de la factura se vea más, en rojo.' : 'Qué quieres que Claude cambie aquí.' });
  return h('aside', { class: 'columna propiedades detalle', 'aria-label': 'Detalle' },
    h('div', { class: 'prop-cabeza' }, h('div', { class: 'tipo' }, p ? `Página ${numero}${p.from ? ' · de la biblioteca' : ''}` : 'Parte del juego'), h('div', { class: 'nombre' }, p ? (p.title || 'Sin título') : item.nombre)),
    errores.length ? h('div', { class: 'mensajes' }, errores.map((m) => h('div', { class: 'mensaje error' }, m))) : null,
    p ? sugerenciasDe(g).filter((s) => s.page === p.id).map((s) => cajaSugerencia(app, s, { compacta: true })) : null,
    puzzles.map((z) => h('div', { class: 'info claude' }, h('strong', {}, `Puzzle: ${z.name || z.id}`),
      z.solution ? h('span', {}, h('strong', {}, 'Solución: '), enIdioma(z.solution, ui.lang)) : null,
      (z.needs || []).length ? h('span', { style: { fontSize: '13px' } }, `Usa: ${listaY(z.needs.map((n) => n.field))}.`) : null)),
    menciones.length ? h('div', { class: 'info claude' }, h('strong', {}, 'Lo que dijo Claude'),
      menciones.slice(-3).map((c) => h('span', { style: { fontSize: '13px', whiteSpace: 'pre-wrap' } }, `${c.date}: ${extracto(c.text, p)}`))) : null,
    notas.length ? h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, 'Notas'), notas.map((n) => h('div', { class: `nota${n.done ? ' hecha' : ''}`, 'data-nota': n.id || '' },
      h('div', { style: { fontSize: '12px', marginBottom: '4px' } }, `${n.date || ''}${n.author ? ` · ${n.author}` : ''} · ${n.done ? 'hecha por Claude' : 'pendiente'}`),
      h('div', {}, n.text),
      !n.done && !ro ? h('button', { class: 'boton pequeno', type: 'button', style: { marginTop: '6px' }, onclick: () => { const i = g.notes.indexOf(n); app.cambiar('Quitar la nota', (copia) => { copia.notes.splice(i, 1); }); } }, 'Quitar') : null))) : null,
    ro ? null : h('div', { class: 'campo' }, h('label', { for: 'nota-claude' }, 'Nota para Claude'), nota,
      h('span', { class: 'ayuda' }, 'Queda guardada con el juego. Claude la lee la próxima vez que trabaje en él.'),
      h('button', { class: 'boton contorno-claude', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => guardarNota(app, item, nota.value) }, 'Guardar nota')),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      ro ? null : h('button', { class: hecho ? 'boton' : 'boton primario', type: 'button', 'aria-pressed': hecho ? 'true' : 'false',
        onclick: () => marcar(app, ui, item, !hecho) }, hecho ? 'Quitar «revisada»' : 'Marcar como revisada'),
      h('a', { class: 'boton', href: p ? app.rutaJuego('paginas', p.id) : app.rutaJuego(item.id === 'puzzles' ? 'puzzles' : 'formulario') }, p ? 'Editar la página' : 'Editar')));
}

function extracto(texto, p) {
  const linea = String(texto).split('\n').find((l) => new RegExp(`\\b${p.id}\\b`).test(l) || (p.title && l.includes(p.title)));
  return linea ? linea.replace(/^[-*•]\s*/, '') : primeraLinea(texto);
}

async function guardarNota(app, item, texto) {
  const t = texto.trim();
  if (!t) { app.aviso('Escribe la nota antes de guardarla.'); return; }
  const r = await app.cambiar('Nota para Claude', (g) => {
    g.notes = g.notes || [];
    const n = Math.max(0, ...g.notes.map((x) => Number(String(x.id || '').replace(/^n/, '')) || 0)) + 1;
    g.notes.push({ id: `n${n}`, text: t, page: item.id, author: 'cliente', date: new Date().toISOString().slice(0, 10), done: false });
  });
  if (r !== null) app.aviso('Nota guardada para Claude.', { tipo: 'bien' });
}

async function marcar(app, ui, item, valor) {
  const r = await app.cambiar(valor ? `Revisada: ${item.nombre}` : `Sin revisar: ${item.nombre}`, (g) => {
    g.review = { ...(g.review || {}), items: { ...((g.review && g.review.items) || {}) } };
    if (valor) g.review.items[item.id] = true; else delete g.review.items[item.id];
  });
  if (r === null || !valor) return;
  // Al marcar una, se abre la siguiente sin revisar.
  const g = app.juego;
  const orden = [...g.pages.map((p) => p.id), ...OTRAS.map(([id]) => id)];
  const siguiente = orden.slice(orden.indexOf(item.id) + 1).concat(orden).find((id) => !revisado(g, id));
  if (siguiente && siguiente !== item.id) app.navegar(app.rutaJuego('revisar', siguiente));
}

