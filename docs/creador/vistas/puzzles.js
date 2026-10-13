// Puzzles y soluciones (F4): la ficha de cada puzzle del juego (nombre, dificultad, edad, minutos), su solución y sus
// pistas en cada idioma, los textos que dibuja (puzzles de contenido) y los datos del comprador que lee (puzzles de
// datos). Se añaden del catálogo de la biblioteca o se crean de contenido; se quitan con su bloque en las páginas.

import { h, icono, enIdioma } from '../dom.js';
import { grupoIdiomas, listaY } from './comun.js';
import { claveDeTexto } from '../tools/game/operaciones.mjs';

const NOMBRE_MECANICA = { ticks: 'casillas marcadas', join: 'letras unidas', prefix: 'prefijo', strips: 'tiras recortables', 'runes-panel': 'panel de runas', initial: 'iniciales' };

export function pintarPuzzles(raiz, app) {
  const g = app.juego;
  const ui = app.ui.puzzles || (app.ui.puzzles = { lang: g.languages[0] });
  if (!g.pages) { raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'vacio' }, 'Este juego está en el formato antiguo. Duplícalo desde la biblioteca para editarlo aquí.'))); return; }
  const puzzles = g.puzzles || [];
  raiz.replaceChildren(h('div', { class: 'inicio', style: { gap: '22px', maxWidth: '1040px' } },
    h('div', { class: 'titulo-bloque', style: { marginBottom: 0, justifyContent: 'space-between' } },
      h('div', {}, h('h1', { style: { fontSize: '32px' } }, 'Puzzles y soluciones'),
        h('p', { class: 'sub', style: { fontSize: '15px' } }, puzzles.length ? `${puzzles.length} puzzle${puzzles.length === 1 ? '' : 's'}. La solución y las pistas salen en la hoja de quien dirige el juego y en la revisión del estudio.` : 'Este juego aún no tiene puzzles.')),
      app.soloLectura ? null : h('div', { class: 'filtros' },
        h('button', { class: 'boton', type: 'button', onclick: () => delCatalogo(app) }, icono('mas', { tam: 18 }), 'Del catálogo'),
        h('button', { class: 'boton', type: 'button', onclick: () => nuevoDeContenido(app, ui) }, icono('mas', { tam: 18 }), 'Puzzle de contenido nuevo'))),
    puzzles.map((z) => tarjetaPuzzle(app, ui, z)),
    (g.solutions || []).length ? solucionesDePaginas(app) : null));
}

function dondeEsta(g, idPuzzle) {
  const paginas = [];
  g.pages.forEach((p, i) => { if (p.elements.some((e) => e.kind === 'puzzle' && e.puzzle === idPuzzle)) paginas.push({ id: p.id, numero: i + 1 }); });
  return paginas;
}

function tarjetaPuzzle(app, ui, z) {
  const g = app.juego;
  const ro = app.soloLectura;
  const datos = z.kind === 'datos';
  const donde = dondeEsta(g, z.id);
  const cambiar = (desc, changes) => app.cambiar(desc, (copia) => app.ops.actualizarPuzzle(copia, { puzzle: z.id, changes }));
  const num = (clave, rotulo, min, max) => h('div', { class: 'campo', style: { width: '130px' } }, h('label', { for: `pz-${z.id}-${clave}` }, rotulo),
    h('input', { id: `pz-${z.id}-${clave}`, type: 'number', min, max, value: z[clave] ?? '', disabled: ro,
      onchange: (e) => cambiar(rotulo, { [clave]: e.target.value === '' ? null : Math.round(Number(e.target.value)) }) }));
  const pistas = z.hints || [];
  return h('article', { class: 'tarjeta-puzzle', 'data-puzzle': z.id, 'aria-label': `Puzzle ${z.name || z.id}` },
    h('div', { class: 'cabeza' },
      h('h3', {}, z.name || z.id),
      h('div', { class: 'filtros' },
        h('span', { class: datos ? 'pastilla aviso' : 'pastilla verde' }, datos ? `Con datos del comprador · ${NOMBRE_MECANICA[z.mechanic] || z.mechanic}` : 'De contenido'),
        z.from ? h('span', { class: 'pastilla' }, `Catálogo: ${z.from}`) : null,
        donde.length ? donde.map((p) => h('a', { class: 'pastilla', href: app.rutaJuego('paginas', p.id) }, `Página ${p.numero}`)) : h('span', { class: 'pastilla error' }, 'No está en ninguna página'))),
    h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' } },
      h('div', { class: 'campo', style: { flex: '1 1 240px' } }, h('label', { for: `pz-${z.id}-nombre` }, 'Nombre (para el estudio)'),
        h('input', { id: `pz-${z.id}-nombre`, value: z.name || '', disabled: ro, onchange: (e) => { const v = e.target.value.trim(); if (v) cambiar('Nombre del puzzle', { name: v }); } })),
      num('difficulty', 'Dificultad (1–5)', 1, 5), num('minAge', 'Edad mínima', 3, 99), num('minutes', 'Minutos', 1, 240)),
    h('div', { class: 'solucion' },
      grupoIdiomas(app, { id: `pz-${z.id}-sol`, rotulo: 'Solución', valor: z.solution, obligatorio: !datos, multilinea: true, filas: 3,
        ayuda: datos ? 'Este puzzle se calcula con los datos del comprador: la solución exacta cambia en cada juego. Explica cómo se resuelve.' : null,
        alGuardar: (v) => cambiar('Solución', { solution: v }) })),
    h('div', { class: 'campo' }, h('span', { class: 'rotulo' }, `Pistas · ${pistas.length}`),
      pistas.map((p, i) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start' } },
        h('div', { style: { flex: 1 } }, grupoIdiomas(app, { id: `pz-${z.id}-pista-${i}`, rotulo: `Pista ${i + 1}`, valor: p, obligatorio: true, multilinea: true,
          alGuardar: (v) => cambiar('Pista', { hints: pistas.map((x, k) => (k === i ? v : x)) }) })),
        ro ? null : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', paddingTop: '24px' } },
          h('button', { class: 'boton-icono', type: 'button', 'aria-label': `Subir la pista ${i + 1}`, disabled: i === 0, onclick: () => cambiar('Ordenar las pistas', { hints: mover(pistas, i, i - 1) }) }, icono('arriba', { tam: 16 })),
          h('button', { class: 'boton-icono', type: 'button', 'aria-label': `Bajar la pista ${i + 1}`, disabled: i === pistas.length - 1, onclick: () => cambiar('Ordenar las pistas', { hints: mover(pistas, i, i + 1) }) }, icono('abajo', { tam: 16 })),
          h('button', { class: 'boton-icono', type: 'button', 'aria-label': `Quitar la pista ${i + 1}`, onclick: () => cambiar('Quitar la pista', { hints: pistas.length > 1 ? pistas.filter((_, k) => k !== i) : null }) }, icono('basura', { tam: 16 }))))),
      ro ? null : h('button', { class: 'boton pequeno', type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => {
        const t = await pedirTextos(app, 'Pista nueva', 'Pista', 'De la más suave a la que casi da la respuesta.');
        if (t) cambiar('Pista nueva', { hints: [...pistas, t] });
      } }, icono('mas', { tam: 16 }), 'Añadir pista')),
    datos ? datosQueLee(app, ui, z) : textosDelPuzzle(app, ui, z),
    ro ? null : h('div', { class: 'filtros' }, h('button', { class: 'boton pequeno peligro', type: 'button', onclick: () => quitar(app, z) }, icono('basura', { tam: 16 }), 'Quitar el puzzle')));
}

const mover = (xs, de, a) => { const c = [...xs]; const [x] = c.splice(de, 1); c.splice(a, 0, x); return c; };

function datosQueLee(app, ui, z) {
  const g = app.juego;
  const necesita = (z.needs || []).map((n) => n.field);
  return h('div', { class: 'info aviso' },
    h('strong', {}, 'Lee del formulario'),
    necesita.length ? h('ul', { class: 'lista-simple' }, necesita.map((c) => h('li', {}, h('span', {}, g.fields[c] ? enIdioma(g.fields[c].q, ui.lang) : c, ' ', h('code', { class: 'tenue' }, c)),
      g.fields[c] ? h('a', { href: app.rutaJuego('formulario', c) }, 'Ver la pregunta') : h('span', {}, 'falta en el formulario')))) : h('span', {}, 'Nada'),
    (z.derives || []).length ? h('span', { style: { fontSize: '13px' } }, `Calcula ${listaY(z.derives)}, que se puede poner en las páginas como un campo más.`) : null,
    h('span', { style: { fontSize: '13px' } }, 'Su dibujo ocupa la página entera y lo pinta el motor. Para cambiar su mecánica, pídeselo a Claude o al estudio.'));
}

function textosDelPuzzle(app, ui, z) {
  const g = app.juego;
  const textos = ((z.page && z.page.elements) || []).filter((e) => e.kind === 'text');
  if (!textos.length) return null;
  const vistos = new Set();
  return h('details', { class: 'campo' }, h('summary', { style: { fontWeight: 600, cursor: 'pointer' } }, `Textos que dibuja · ${textos.length}`),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' } },
      textos.filter((e) => !vistos.has(e.key) && vistos.add(e.key)).map((e) => grupoIdiomas(app, {
        id: `pz-${z.id}-t-${e.id}`, rotulo: `Texto ${e.id.replace(`${z.id}-`, '')}${e.fontFamily ? ` · ${e.fontFamily}` : ''}`, obligatorio: true,
        valor: Object.fromEntries(g.languages.map((l) => [l, (g.i18n[l] || {})[e.key] || ''])),
        alGuardar: (v) => app.cambiar('Texto del puzzle', (copia) => { for (const l of copia.languages) copia.i18n[l][e.key] = v[l]; }) })),
      h('span', { class: 'ayuda' }, 'Para mover o cambiar sus piezas, edita la página donde está o pídeselo a Claude.')));
}

function pedirTextos(app, titulo, rotulo, explicacion = null, multilinea = true) {
  const langs = app.juego.languages;
  return app.dialogo((cerrar) => {
    const entradas = langs.map((l) => (multilinea ? h('textarea', { id: `dlg-${l}`, rows: 3, required: true }) : h('input', { id: `dlg-${l}`, required: true, autocomplete: 'off' })));
    return h('form', { class: 'dialogo', onsubmit: (e) => { e.preventDefault(); cerrar(Object.fromEntries(langs.map((l, i) => [l, entradas[i].value.trim()]))); } },
      h('h2', {}, titulo), explicacion ? h('p', { class: 'tenue' }, explicacion) : null,
      langs.map((l, i) => h('div', { class: 'campo' }, h('label', { for: `dlg-${l}` }, `${rotulo} · ${l.toUpperCase()}`), entradas[i])),
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Añadir')));
  });
}

async function quitar(app, z) {
  const donde = dondeEsta(app.juego, z.id);
  const ok = await app.dialogo((cerrar) => h('div', { class: 'dialogo' }, h('h2', {}, '¿Quitar el puzzle?'),
    h('p', {}, `Se quita «${z.name || z.id}» del juego${donde.length ? ` y de ${donde.length === 1 ? 'la página' : 'las páginas'} ${listaY(donde.map((p) => String(p.numero)))}` : ''}. Se puede deshacer.`),
    (z.derives || []).length ? h('p', { class: 'tenue' }, `Si las páginas usan lo que calcula (${listaY(z.derives)}), no se podrá quitar hasta quitar esos huecos.`) : null,
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'), h('button', { class: 'boton peligro', type: 'button', onclick: () => cerrar(true) }, 'Quitar'))));
  if (ok) await app.cambiar('Quitar el puzzle', (g) => app.ops.quitarPuzzle(g, { puzzle: z.id }));
}

/** Un puzzle del catálogo va en una página nueva (los de datos ocupan la página entera). */
async function delCatalogo(app) {
  const g = app.juego;
  const usados = new Set((g.puzzles || []).map((z) => z.from).filter(Boolean));
  const catalogo = app.biblioteca.entradas('puzzle');
  const elegido = await app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('h2', {}, 'Añadir un puzzle del catálogo'),
    h('p', { class: 'tenue' }, 'Se añade en una página nueva, después de la última. Si lee preguntas que el juego no tiene, primero hay que traer su sección en el formulario.'),
    catalogo.length ? h('div', { class: 'lista-insertar', style: { maxHeight: '55vh', overflow: 'auto' } }, catalogo.map((z) => {
      const faltan = (z.needs || []).map((n) => n.field).filter((c) => !g.fields[c]);
      return h('button', { type: 'button', 'data-puzzle-bib': `${z.id}@${z.version}`, onclick: () => cerrar(z) },
        h('span', {}, z.name, h('br', {}), h('span', { class: 'codigo' }, `${z.kind === 'datos' ? `datos · ${NOMBRE_MECANICA[z.mechanic] || z.mechanic}` : 'contenido'} · ${z.coleccion}${faltan.length ? ` · falta ${faltan.join(', ')}` : ''}`)),
        h('span', { class: 'tenue', style: { fontSize: '12px' } }, usados.has(`${z.id}@${z.version}`) ? 'ya está' : ''));
    })) : h('div', { class: 'vacio' }, 'El catálogo está vacío.'),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'))));
  if (!elegido) return;
  const ref = `${elegido.id}@${elegido.version}`;
  let idPuzzle = elegido.id.replace(/^puzzle-/, ''), n = 2;
  while ((g.puzzles || []).some((z) => z.id === idPuzzle)) idPuzzle = `${elegido.id.replace(/^puzzle-/, '')}-${n++}`;
  const r = await app.cambiar(`Puzzle del catálogo: ${elegido.name}`, (copia) => {
    const pag = app.ops.insertarPagina(copia, { title: elegido.name });
    const res = app.ops.anadirPuzzle(copia, { page: pag.resultado.page, from: ref, puzzle_id: idPuzzle });
    // Un puzzle de datos con solución (las tiras, por ejemplo) se resuelve con lo que el comprador escribió: sus
    // respuestas se imprimen dentro de la zona del puzzle. Se ponen ya, una debajo de otra; luego se colocan a mano.
    if (elegido.kind === 'datos' && elegido.solution) {
      huecosDeRespuestas(copia, elegido).forEach((el, i) => app.ops.anadirElemento(copia, { page: pag.resultado.page, element: el, index: i }));
    }
    return { resultado: { ...res, page: pag.resultado.page }, copias: pag.copias };
  });
  if (r) {
    app.aviso(`Puzzle «${elegido.name}» añadido en una página nueva.`, { tipo: 'bien' });
    app.navegar(app.rutaJuego('paginas', r.page));
  }
}

/** Huecos para las respuestas que lee un puzzle de datos, apilados dentro de su zona (params x0…x1, y0…y1). */
function huecosDeRespuestas(g, z) {
  const p = z.params || {};
  const caja = [p.x0, p.x1, p.y0, p.y1].every((v) => typeof v === 'number') ? { x: p.x0, y: p.y0, w: p.x1 - p.x0, h: p.y1 - p.y0 } : { x: 10, y: 20, w: 80, h: 60 };
  const necesita = (z.needs || []).filter((n) => g.fields[n.field] && g.fields[n.field].type !== 'photo');
  const pesos = necesita.map((n) => (g.fields[n.field].type === 'long' ? 4 : 1));
  const total = pesos.reduce((a, b) => a + b, 0) || 1;
  const margen = Math.min(4, caja.w * 0.05);
  let y = caja.y + caja.h * 0.1;
  const alto = caja.h * 0.8;
  const r2 = (v) => Math.round(v * 100) / 100;
  return necesita.map((n, i) => {
    const h = (alto * pesos[i]) / total;
    const el = { kind: 'field', field: n.field, x: r2(caja.x + margen), y: r2(y), w: r2(caja.w - 2 * margen), h: r2(h * 0.9), size: 2.4, color: '#1F3B5C', fontFamily: 'Caveat Bold', align: 'center', angle: 0,
      ...(g.fields[n.field].type === 'long' ? { wrap: true, tight: true } : {}) };
    y += h;
    return el;
  });
}

async function nuevoDeContenido(app, ui) {
  const g = app.juego;
  const langs = g.languages;
  const datos = await app.dialogo((cerrar) => {
    const nombre = h('input', { id: 'pz-nuevo-nombre', required: true, autocomplete: 'off' });
    const pagina = h('select', { id: 'pz-nuevo-pagina' }, g.pages.map((p, i) => h('option', { value: p.id }, `Página ${i + 1}${p.title ? ` · ${p.title}` : ''}`)));
    const enunciado = langs.map((l) => h('textarea', { id: `pz-nuevo-en-${l}`, rows: 2, required: true }));
    const solucion = langs.map((l) => h('textarea', { id: `pz-nuevo-sol-${l}`, rows: 2, required: true }));
    return h('form', { class: 'dialogo', onsubmit: (e) => {
      e.preventDefault();
      cerrar({ nombre: nombre.value.trim(), pagina: pagina.value, enunciado: Object.fromEntries(langs.map((l, i) => [l, enunciado[i].value.trim()])), solucion: Object.fromEntries(langs.map((l, i) => [l, solucion[i].value.trim()])) });
    } },
    h('h2', {}, 'Puzzle de contenido nuevo'),
    h('p', { class: 'tenue' }, 'Un puzzle que no depende de los datos del comprador (un acertijo, un código). Se crea con su enunciado en una caja de la página; luego se le añaden imágenes y textos en la página.'),
    h('div', { class: 'campo' }, h('label', { for: 'pz-nuevo-nombre' }, 'Nombre (para el estudio)'), nombre),
    g.pages.length ? h('div', { class: 'campo' }, h('label', { for: 'pz-nuevo-pagina' }, 'En qué página'), pagina) : h('div', { class: 'mensaje error' }, 'Primero añade una página.'),
    langs.map((l, i) => h('div', { class: 'campo' }, h('label', { for: `pz-nuevo-en-${l}` }, `Enunciado · ${l.toUpperCase()}`), enunciado[i])),
    langs.map((l, i) => h('div', { class: 'campo' }, h('label', { for: `pz-nuevo-sol-${l}` }, `Solución · ${l.toUpperCase()}`), solucion[i])),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit', disabled: !g.pages.length }, 'Crear')));
  });
  if (!datos) return;
  let id = claveDeTexto(datos.nombre) || 'puzzle', n = 2;
  while ((g.puzzles || []).some((z) => z.id === id)) id = `${claveDeTexto(datos.nombre) || 'puzzle'}-${n++}`;
  const r = await app.cambiar(`Puzzle nuevo: ${datos.nombre}`, (copia) => app.ops.anadirPuzzle(copia, {
    page: datos.pagina, box: { x: 10, y: 35, w: 80, h: 30 },
    puzzle: { id, kind: 'contenido', name: datos.nombre, solution: datos.solucion,
      page: { elements: [{ kind: 'text', texts: datos.enunciado, x: 5, y: 5, w: 90, h: 30, size: 2.6, color: '#1B2420', fontFamily: 'Open Sans', angle: 0 }] } } }));
  if (r) { if (app.ui.paginas) app.ui.paginas.sel = r.element; app.navegar(app.rutaJuego('paginas', datos.pagina)); }
}

function solucionesDePaginas(app) {
  const g = app.juego;
  return h('section', { class: 'tarjeta-puzzle', 'aria-label': 'Soluciones de las páginas' },
    h('h3', {}, 'Otras soluciones'),
    h('p', { class: 'tenue', style: { margin: 0 } }, 'Soluciones que no van con un puzzle (las heredadas de juegos antiguos).'),
    g.solutions.map((s, i) => grupoIdiomas(app, { id: `sol-${s.id}`, rotulo: `${s.id}${s.page ? ` · página ${g.pages.findIndex((p) => p.id === s.page) + 1}` : ''}`, valor: s.how, obligatorio: true, multilinea: true,
      alGuardar: (v) => app.cambiar('Solución', (copia) => { copia.solutions[i].how = v; }) })));
}
