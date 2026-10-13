// Formulario (F4.3): las secciones y las preguntas que contesta el comprador, con sus ejemplos (corto, normal y
// largo), y al lado cómo lo verá el comprador. Se crean secciones y campos nuevos o se traen de la biblioteca
// (tools/game/operaciones.mjs, como las herramientas de Claude). Cada cambio se valida antes de aceptarlo.

import { h, icono, enIdioma } from '../dom.js';
import { grupoIdiomas, nombresDeEjemplos, selectoresVista, dondeSale, listaY } from './comun.js';
import { claveDeTexto } from '../../tools/game/operaciones.mjs';

const TIPOS = [['text', 'Texto corto'], ['long', 'Texto largo'], ['name', 'Nombre'], ['number', 'Número'], ['photo', 'Foto'], ['choice', 'Una opción'], ['multi', 'Varias opciones']];
const NOMBRE_TIPO = Object.fromEntries(TIPOS);
const CON_TOPE = new Set(['name', 'text', 'long']);
const TOPE_INICIAL = { name: 12, text: 40, long: 200 };
const ID_CAMPO = /^[A-Za-z][A-Za-z0-9_.]*$/;
const MAX_FOTO = 5 * 1024 * 1024;

export function pintarFormulario(raiz, app) {
  const g = app.juego;
  const ui = app.ui.formulario || (app.ui.formulario = { seccion: null, campo: null, lang: g.languages[0], ejemplo: nombresDeEjemplos(g)[1] ? nombresDeEjemplos(g)[1].id : (nombresDeEjemplos(g)[0] || {}).id ?? null });
  if (!g.form) { raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'vacio' }, 'Este juego está en el formato antiguo. Duplícalo desde la biblioteca para editarlo aquí.'))); return; }
  const secciones = g.form.sections;
  // Enlace directo a un campo (desde las propiedades de la página): abre su sección.
  let enfocar = false;
  if (app.ruta.sub && g.fields[app.ruta.sub] && ui.rutaVista !== app.ruta.sub) {
    ui.rutaVista = app.ruta.sub;
    enfocar = true;
    ui.campo = app.ruta.sub;
    const s = secciones.find((x) => x.fields.includes(app.ruta.sub));
    if (s) ui.seccion = s.id;
  }
  if (!secciones.some((s) => s.id === ui.seccion)) ui.seccion = secciones[0] ? secciones[0].id : null;
  if (!g.languages.includes(ui.lang)) ui.lang = g.languages[0];
  if (ui.ejemplo !== null && !(g.examples || []).some((e) => e.id === ui.ejemplo)) ui.ejemplo = (g.examples || [])[0] ? g.examples[0].id : null;
  const seccion = secciones.find((s) => s.id === ui.seccion) || null;
  if (ui.campo && !(seccion && seccion.fields.includes(ui.campo))) ui.campo = null;

  raiz.replaceChildren(h('div', { class: 'trabajo' },
    columnaSecciones(app, ui),
    h('section', { class: 'editor-seccion', 'aria-label': seccion ? `Sección ${enIdioma(seccion.title, ui.lang)}` : 'Formulario' },
      seccion ? editorSeccion(app, ui, seccion) : h('div', { class: 'vacio' }, 'El formulario aún no tiene secciones. Crea una o trae una de la biblioteca.')),
    vistaComprador(app, ui, seccion)));
  if (enfocar) {
    const tarjeta = raiz.querySelector(`.tarjeta-campo[data-campo="${CSS.escape(ui.campo)}"]`);
    if (tarjeta) tarjeta.scrollIntoView({ block: 'start' });
  }
}

/* ---------------- Secciones ---------------- */

function columnaSecciones(app, ui) {
  const g = app.juego;
  const secciones = g.form.sections;
  let arrastrada = null;
  const lista = h('div', { class: 'secciones-lista', role: 'list' }, secciones.map((s, i) => h('button', {
    type: 'button', role: 'listitem', class: 'seccion-item', 'aria-current': s.id === ui.seccion ? 'true' : 'false', draggable: app.soloLectura ? null : 'true', 'data-seccion': s.id,
    onclick: () => { ui.seccion = s.id; ui.campo = null; app.repintar(); },
    ondragstart: (e) => { arrastrada = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', s.id); e.currentTarget.classList.add('arrastrando'); },
    ondragend: (e) => e.currentTarget.classList.remove('arrastrando'),
    ondragover: (e) => { if (arrastrada !== null) e.preventDefault(); },
    ondrop: (e) => { e.preventDefault(); if (arrastrada !== null && arrastrada !== i) moverSeccion(app, arrastrada, i); arrastrada = null; },
  }, h('span', {}, `${i + 1} · ${enIdioma(s.title, ui.lang) || s.id}`), h('span', { class: 'n' }, String(s.fields.length)))));
  const enJuego = new Set(secciones.map((s) => s.id));
  const reutilizables = app.biblioteca.entradas('seccion').filter((e) => !enJuego.has(e.section.id));
  return h('aside', { class: 'columna lateral', 'aria-label': 'Secciones del formulario' },
    h('div', { class: 'etiqueta-seccion' }, app.soloLectura ? 'Secciones' : 'Secciones · arrastra para ordenar'),
    lista,
    app.soloLectura ? null : h('button', { class: 'boton', type: 'button', onclick: () => nuevaSeccion(app, ui) }, icono('mas', { tam: 18 }), 'Sección nueva'),
    app.soloLectura ? null : h('div', { class: 'info', style: { background: 'var(--superficie-2)', color: 'var(--tinta)', border: '1px solid var(--borde)' } },
      h('strong', {}, 'Reutilizar una sección'),
      h('span', { class: 'tenue', style: { fontSize: '13px' } }, 'Copia sus preguntas con topes, ayudas y ejemplos.'),
      reutilizables.length ? reutilizables.map((e) => h('button', { type: 'button', class: 'boton pequeno', 'data-seccion-bib': `${e.id}@${e.version}`, style: { justifyContent: 'flex-start', textAlign: 'left' },
        onclick: () => reutilizarSeccion(app, ui, e) }, h('span', {}, e.name, ' · ', h('span', { class: 'tenue' }, e.coleccion))))
        : h('span', { class: 'tenue', style: { fontSize: '13px' } }, 'No hay más secciones en la biblioteca.')));
}

async function moverSeccion(app, de, a) {
  await app.cambiar('Ordenar las secciones', (g) => { const [s] = g.form.sections.splice(de, 1); g.form.sections.splice(a, 0, s); });
}

async function reutilizarSeccion(app, ui, entrada) {
  const nuevos = Object.keys(entrada.fieldDefs).filter((c) => !app.juego.fields[c]);
  const r = await app.cambiar(`Sección de la biblioteca: ${entrada.name}`, (g) => app.ops.insertarSeccion(g, { from: `${entrada.id}@${entrada.version}` }));
  if (r) {
    ui.seccion = r.section;
    ui.campo = null;
    app.aviso(`Sección «${entrada.name}» añadida con ${nuevos.length} preguntas${r.examples.length ? ' y sus ejemplos' : ''}.`, { tipo: 'bien' });
    app.repintar();
  }
}

function dialogoTextos(app, { titulo, explicacion, rotulo, boton, extra = null }) {
  const langs = app.juego.languages;
  return app.dialogo((cerrar) => {
    const entradas = langs.map((l) => h('input', { id: `dlg-${l}`, required: true, autocomplete: 'off' }));
    const extraNodo = extra ? extra() : null;
    return h('form', { class: 'dialogo', onsubmit: (e) => { e.preventDefault(); cerrar({ textos: Object.fromEntries(langs.map((l, i) => [l, entradas[i].value.trim()])), extra: extraNodo && extraNodo.valor ? extraNodo.valor() : null }); } },
      h('h2', {}, titulo),
      explicacion ? h('p', { class: 'tenue' }, explicacion) : null,
      langs.map((l, i) => h('div', { class: 'campo' }, h('label', { for: `dlg-${l}` }, `${rotulo} · ${l.toUpperCase()}`), entradas[i])),
      extraNodo ? extraNodo.nodo : null,
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, boton)));
  });
}

async function nuevaSeccion(app, ui) {
  const r = await dialogoTextos(app, { titulo: 'Sección nueva', explicacion: 'Una sección es un paso del formulario del comprador (por ejemplo, «Sobre la víctima»).', rotulo: 'Título', boton: 'Crear' });
  if (!r) return;
  const base = claveDeTexto(r.textos[app.juego.languages[0]]) || 'seccion';
  let id = base, n = 2;
  while (app.juego.form.sections.some((s) => s.id === id)) id = `${base}-${n++}`;
  const ok = await app.cambiar('Sección nueva', (g) => { g.form.sections.push({ id, title: r.textos, fields: [] }); });
  if (ok !== null) { ui.seccion = id; ui.campo = null; app.repintar(); }
}

function editorSeccion(app, ui, s) {
  const g = app.juego;
  const i = g.form.sections.indexOf(s);
  const ro = app.soloLectura;
  const actualizar = (desc, fn) => app.cambiar(desc, (copia) => fn(copia.form.sections.find((x) => x.id === s.id), copia));
  const camposSeccion = s.fields.filter((c) => g.fields[c]);
  const selectorDe = (clave, rotulo, filtro) => h('div', { class: 'campo' }, h('label', { for: `sec-${clave}` }, rotulo),
    h('select', { id: `sec-${clave}`, disabled: ro, onchange: (e) => actualizar(rotulo, (sx) => { if (e.target.value) sx[clave] = e.target.value; else delete sx[clave]; }) },
      h('option', { value: '' }, 'Ninguno'),
      camposSeccion.filter((c) => filtro(g.fields[c])).map((c) => h('option', { value: c, selected: s[clave] === c }, `${enIdioma(g.fields[c].q, ui.lang)} (${c})`))));
  return [
    h('div', { style: { display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' } },
      h('div', { style: { flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: '12px' } },
        grupoIdiomas(app, { id: 'sec-titulo', rotulo: 'Título de la sección', valor: s.title, obligatorio: true, alGuardar: (v) => actualizar('Título de la sección', (sx) => { sx.title = v; }) }),
        grupoIdiomas(app, { id: 'sec-ayuda', rotulo: 'Explicación bajo el título (opcional)', valor: s.hint, multilinea: true,
          alGuardar: (v) => actualizar('Explicación de la sección', (sx) => { if (v) sx.hint = v; else delete sx.hint; }) })),
      h('div', { style: { flex: '0 1 240px', display: 'flex', flexDirection: 'column', gap: '10px' } },
        s.from ? h('span', { class: 'pastilla claude' }, `De la biblioteca: ${s.from}`) : null,
        h('span', { class: 'pastilla' }, resumenSeccion(g, s)),
        selectorDe('nameField', 'Pregunta con su nombre', (d) => d.type === 'name'),
        selectorDe('photoField', 'Pregunta con su foto', (d) => d.type === 'photo'),
        ro ? null : h('div', { class: 'filtros' },
          h('button', { class: 'boton pequeno', type: 'button', disabled: i === 0, onclick: () => moverSeccion(app, i, i - 1) }, icono('arriba', { tam: 16 }), 'Antes'),
          h('button', { class: 'boton pequeno', type: 'button', disabled: i === g.form.sections.length - 1, onclick: () => moverSeccion(app, i, i + 1) }, icono('abajo', { tam: 16 }), 'Después'),
          h('button', { class: 'boton pequeno peligro', type: 'button', onclick: () => quitarSeccion(app, ui, s) }, icono('basura', { tam: 16 }), 'Quitar')))),
    s.fields.length ? s.fields.map((c) => (c === ui.campo ? editorCampo(app, ui, s, c) : tarjetaCampo(app, ui, c)))
      : h('div', { class: 'vacio' }, 'Esta sección aún no tiene preguntas.'),
    ro ? null : h('div', { class: 'filtros' },
      h('button', { class: 'boton', type: 'button', onclick: () => nuevoCampo(app, ui, s) }, icono('mas', { tam: 18 }), 'Pregunta nueva'),
      h('button', { class: 'boton', type: 'button', onclick: () => traerCampo(app, ui, s) }, 'Traer una pregunta de la biblioteca')),
  ];
}

function resumenSeccion(g, s) {
  const tipos = s.fields.map((c) => g.fields[c] && g.fields[c].type);
  const partes = [];
  if (tipos.includes('name')) partes.push('nombre');
  if (tipos.includes('photo')) partes.push('foto');
  const otras = tipos.filter((t) => t && t !== 'name' && t !== 'photo').length;
  if (otras) partes.push(`${otras} pregunta${otras === 1 ? '' : 's'} más`);
  return partes.length ? `Pide ${listaY(partes)}` : 'Sin preguntas';
}

async function quitarSeccion(app, ui, s) {
  const g = app.juego;
  const usados = s.fields.filter((c) => dondeSale(g, c).length);
  if (usados.length) {
    app.aviso('No se puede quitar la sección: sus preguntas salen en las páginas', { tipo: 'error', lista: usados.map((c) => `${c}: ${dondeSale(g, c).map((p) => `página ${p.numero}`).join(', ')}`) });
    return;
  }
  const ok = await confirmar(app, '¿Quitar la sección?', `Se quita «${enIdioma(s.title, ui.lang)}» con sus ${s.fields.length} preguntas y sus ejemplos. Se puede deshacer.`, 'Quitar');
  if (!ok) return;
  if (await app.cambiar('Quitar la sección', (copia) => {
    copia.form.sections = copia.form.sections.filter((x) => x.id !== s.id);
    for (const c of s.fields) borrarCampo(copia, c);
  }) !== null) { ui.seccion = null; ui.campo = null; app.repintar(); }
}

function confirmar(app, titulo, texto, boton) {
  return app.dialogo((cerrar) => h('div', { class: 'dialogo' }, h('h2', {}, titulo), h('p', {}, texto),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'), h('button', { class: 'boton peligro', type: 'button', onclick: () => cerrar(true) }, boton))));
}

/* ---------------- Campos ---------------- */

function resumenCampo(g, c) {
  const d = g.fields[c];
  if (!d) return 'No existe en el juego';
  const partes = [NOMBRE_TIPO[d.type] || d.type, d.required ? (d.type === 'photo' ? 'obligatoria' : 'obligatorio') : 'opcional'];
  if (d.cap) partes.push(`tope ${d.cap}`);
  if (d.options) partes.push(`${d.options.length} opciones${d.allowOther ? ' y «Otro»' : ''}`);
  const donde = dondeSale(g, c);
  partes.push(donde.length ? `sale en ${donde.length === 1 ? 'la página' : 'las páginas'} ${listaY(donde.map((p) => String(p.numero)))}` : 'no sale en ninguna página');
  return partes.join(' · ');
}

function tarjetaCampo(app, ui, c) {
  const g = app.juego;
  const d = g.fields[c] || {};
  return h('button', { type: 'button', class: 'tarjeta-campo', 'data-campo': c, 'aria-expanded': 'false', onclick: () => { ui.campo = c; app.repintar(); } },
    h('span', { class: 'pregunta' }, enIdioma(d.q, ui.lang) || c),
    h('span', { class: 'resumen' }, resumenCampo(g, c)),
    h('code', { class: 'codigo' }, c));
}

function editorCampo(app, ui, s, c) {
  const g = app.juego;
  const d = g.fields[c];
  const ro = app.soloLectura;
  const pre = `campo-${c}`;
  const cambiarDef = (desc, fn) => app.cambiar(desc, (copia) => fn(copia.fields[c], copia));
  const partes = [
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start' } },
      h('div', {}, h('div', { class: 'pregunta' }, enIdioma(d.q, ui.lang) || c), h('div', { class: 'resumen' }, resumenCampo(g, c))),
      h('button', { class: 'boton pequeno', type: 'button', 'aria-label': 'Cerrar la pregunta', onclick: () => { ui.campo = null; app.repintar(); } }, 'Cerrar')),
    grupoIdiomas(app, { id: `${pre}-q`, rotulo: 'Pregunta', valor: d.q, obligatorio: true, alGuardar: (v) => cambiarDef('Pregunta', (dx) => { dx.q = v; }) }),
    grupoIdiomas(app, { id: `${pre}-desc`, rotulo: 'Ayuda bajo la pregunta (opcional)', valor: d.desc, alGuardar: (v) => cambiarDef('Ayuda de la pregunta', (dx) => { if (v) dx.desc = v; else delete dx.desc; }) }),
    d.type !== 'photo' ? grupoIdiomas(app, { id: `${pre}-ej`, rotulo: 'Respuesta de ejemplo, en cursiva (opcional)', valor: d.ej, alGuardar: (v) => cambiarDef('Respuesta de ejemplo', (dx) => { if (v) dx.ej = v; else delete dx.ej; }) }) : null,
    h('fieldset', { class: 'campo', style: { border: 0, margin: 0, padding: 0 } }, h('legend', { class: 'rotulo', style: { fontWeight: 600, marginBottom: '8px' } }, 'Tipo de respuesta'),
      h('div', { class: 'filtros' }, TIPOS.map(([t, n]) => h('button', { type: 'button', disabled: ro, 'aria-pressed': d.type === t ? 'true' : 'false', onclick: () => d.type !== t && cambiarTipo(app, c, t) }, n)))),
    h('div', { style: { display: 'flex', gap: '14px', alignItems: 'flex-end', flexWrap: 'wrap' } },
      CON_TOPE.has(d.type) ? h('div', { class: 'campo', style: { width: '120px' } }, h('label', { for: `${pre}-cap` }, 'Tope (letras)'),
        h('input', { id: `${pre}-cap`, type: 'number', min: 1, max: 2000, value: d.cap || '', disabled: ro,
          onchange: (e) => { const v = Math.round(Number(e.target.value)); cambiarDef('Tope', (dx) => { if (v > 0) dx.cap = v; else delete dx.cap; }); } })) : null,
      d.type === 'number' ? [
        h('div', { class: 'campo', style: { width: '110px' } }, h('label', { for: `${pre}-min` }, 'Mínimo'), h('input', { id: `${pre}-min`, type: 'number', value: d.min ?? '', disabled: ro, onchange: (e) => cambiarDef('Mínimo', (dx) => { if (e.target.value === '') delete dx.min; else dx.min = Number(e.target.value); }) })),
        h('div', { class: 'campo', style: { width: '110px' } }, h('label', { for: `${pre}-max` }, 'Máximo'), h('input', { id: `${pre}-max`, type: 'number', value: d.max ?? '', disabled: ro, onchange: (e) => cambiarDef('Máximo', (dx) => { if (e.target.value === '') delete dx.max; else dx.max = Number(e.target.value); }) }))] : null,
      cabeInfo(g, c),
      h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!d.required, disabled: ro, onchange: (e) => cambiarDef('Obligatoria', (dx) => { dx.required = e.target.checked; }) }), 'Obligatoria')),
    d.options ? editorOpciones(app, ui, c, d) : null,
    d.type === 'multi' ? h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!d.allowOther, disabled: ro, onchange: (e) => alternarOtro(app, s, c, e.target.checked) }),
      'Permitir «Otro» (el comprador escribe su respuesta)', d.otherField ? h('code', { class: 'tenue' }, ` → ${d.otherField}`) : null) : null,
    editorEjemplos(app, ui, c, d),
    h('div', { class: 'campo' }, h('label', { for: `${pre}-codigo` }, 'Código para el artista'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        h('input', { id: `${pre}-codigo`, value: c, disabled: ro, style: { maxWidth: '260px', fontFamily: 'ui-monospace, monospace' }, autocomplete: 'off',
          onchange: (e) => renombrar(app, ui, c, e.target.value.trim()) }),
        h('span', { class: 'ayuda' }, 'En el PDF del artista se escribe entre corchetes, [', c, ']. Si lo cambias, cámbialo también en su PDF.'))),
    ro ? null : h('div', { class: 'filtros' },
      h('button', { class: 'boton pequeno', type: 'button', disabled: s.fields.indexOf(c) === 0, onclick: () => moverCampo(app, s, c, -1) }, icono('arriba', { tam: 16 }), 'Antes'),
      h('button', { class: 'boton pequeno', type: 'button', disabled: s.fields.indexOf(c) === s.fields.length - 1, onclick: () => moverCampo(app, s, c, 1) }, icono('abajo', { tam: 16 }), 'Después'),
      h('button', { class: 'boton pequeno peligro', type: 'button', onclick: () => quitarCampo(app, ui, s, c) }, icono('basura', { tam: 16 }), 'Quitar la pregunta')),
  ];
  return h('div', { class: 'tarjeta-campo', 'data-campo': c, 'aria-current': 'true', style: { cursor: 'default', gap: '14px' } }, partes);
}

/** Lo que ocupa el ejemplo más largo frente al tope. */
function cabeInfo(g, c) {
  const d = g.fields[c];
  if (!CON_TOPE.has(d.type)) return null;
  const largos = (g.examples || []).flatMap((e) => Object.values(e.values || {}).map((v) => String((v || {})[c] || '').length));
  const maximo = largos.length ? Math.max(...largos) : 0;
  const donde = dondeSale(g, c);
  return h('div', { class: 'tenue', style: { fontSize: '13px', flex: '1 1 200px' } },
    maximo ? `El ejemplo más largo tiene ${maximo} letras. ` : 'Aún no hay ejemplos. ',
    donde.length ? 'Comprueba en la página con el ejemplo «Largo» que entra sin encoger: ' : null,
    donde.map((p, i) => [i ? ', ' : '', h('a', { href: `#/juego/${encodeURIComponent(g.id)}/paginas/${p.id}` }, `página ${p.numero}`)]));
}

function editorOpciones(app, ui, c, d) {
  const ro = app.soloLectura;
  const langs = app.juego.languages;
  const cambiar = (desc, fn) => app.cambiar(desc, (copia) => fn(copia.fields[c].options));
  return h('fieldset', { class: 'campo', style: { border: 0, margin: 0, padding: 0 } }, h('legend', { style: { fontWeight: 600, marginBottom: '8px' } }, 'Opciones'),
    h('div', { class: 'opciones-lista' }, d.options.map((o, i) => h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
      langs.map((l) => h('input', { 'aria-label': `Opción ${i + 1} · ${l.toUpperCase()}`, value: o[l] || '', disabled: ro, style: { flex: 1 },
        onchange: (e) => { const v = e.target.value.trim(); if (v) cambiar('Opción', (ops) => { ops[i][l] = v; }); else app.aviso('Una opción no puede quedar vacía: quítala con la papelera.', { tipo: 'error' }); } })),
      ro ? null : h('button', { class: 'boton-icono', type: 'button', 'aria-label': `Quitar la opción ${i + 1}`, disabled: d.options.length <= 1, onclick: () => cambiar('Quitar opción', (ops) => { ops.splice(i, 1); }) }, icono('basura', { tam: 16 }))))),
    ro ? null : h('button', { class: 'boton pequeno', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => cambiar('Opción nueva', (ops) => {
      ops.push(Object.fromEntries(langs.map((l) => [l, `${l === 'en' ? 'Option' : 'Opción'} ${ops.length + 1}`])));
    }) }, icono('mas', { tam: 16 }), 'Añadir opción'));
}

function editorEjemplos(app, ui, c, d) {
  const g = app.juego;
  const ro = app.soloLectura;
  const ejemplos = nombresDeEjemplos(g);
  if (!ejemplos.length) {
    return h('div', { class: 'info aviso' }, h('strong', {}, 'Faltan los ejemplos'),
      h('span', { style: { fontSize: '13px' } }, 'Hacen falta tres (corto, normal y largo) para la vista previa, las pruebas y enviar al estudio.'),
      ro ? null : h('button', { class: 'boton pequeno', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => app.cambiar('Crear los ejemplos', (copia) => {
        copia.examples = ['1', '2', '3'].map((id) => ({ id, values: Object.fromEntries(copia.languages.map((l) => [l, {}])) }));
      }) }, 'Crear los tres ejemplos'));
  }
  const cambiarValor = (idEj, l, v) => app.cambiar('Ejemplo', (copia) => {
    const ej = copia.examples.find((e) => e.id === idEj);
    ej.values = ej.values || {};
    ej.values[l] = ej.values[l] || {};
    if (v === '') delete ej.values[l][c]; else ej.values[l][c] = v;
  });
  if (d.type === 'photo') {
    return h('fieldset', { class: 'campo', style: { border: 0, margin: 0, padding: 0 } }, h('legend', { style: { fontWeight: 600, marginBottom: '8px' } }, 'Fotos de ejemplo (para la vista previa)'),
      h('div', { class: 'rejilla-2', style: { gridTemplateColumns: `repeat(${Math.min(3, ejemplos.length)}, minmax(0, 1fr))` } }, ejemplos.map((e) => {
        const ej = g.examples.find((x) => x.id === e.id);
        const ruta = ej.photos && ej.photos[c];
        const entrada = h('input', { type: 'file', accept: 'image/jpeg,image/png', id: `${c}-foto-${e.id}`, disabled: ro, onchange: (ev) => subirFotoEjemplo(app, e.id, c, ev.target.files[0]) });
        return h('div', { class: 'campo' }, h('label', { for: `${c}-foto-${e.id}` }, e.nombre), ruta ? h('span', { class: 'ayuda' }, ruta) : h('span', { class: 'ayuda' }, 'Sin foto'), entrada);
      })));
  }
  return h('fieldset', { class: 'campo', style: { border: 0, margin: 0, padding: 0 } },
    h('legend', { style: { fontWeight: 600, marginBottom: '8px' } }, 'Ejemplos (se usan en la vista previa y en las pruebas)'),
    g.languages.map((l) => h('div', { style: { display: 'grid', gridTemplateColumns: `${g.languages.length > 1 ? '34px ' : ''}repeat(${ejemplos.length}, minmax(0, 1fr))`, gap: '8px', alignItems: 'end', marginBottom: '6px' } },
      g.languages.length > 1 ? h('span', { class: 'tenue', style: { paddingBottom: '10px' } }, l.toUpperCase()) : null,
      ejemplos.map((e) => {
        const ej = g.examples.find((x) => x.id === e.id);
        const valor = ((ej.values || {})[l] || {})[c] || '';
        return h('label', { style: { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' } }, `${e.nombre}${d.cap ? ` (${valor.length}/${d.cap})` : ''}`,
          h('input', { value: valor, disabled: ro, 'aria-label': `Ejemplo ${e.nombre.toLowerCase()} · ${l.toUpperCase()}`, onchange: (ev) => cambiarValor(e.id, l, ev.target.value.trim()) }));
      }))),
    d.type === 'multi' ? h('span', { class: 'ayuda' }, 'Varias opciones: sepáralas con || (por ejemplo «Llegar tarde||Otro: Roncar»).') : null);
}

async function subirFotoEjemplo(app, idEj, c, fichero) {
  if (!fichero) return;
  if (fichero.size > MAX_FOTO) { app.aviso('La foto pesa más de 5 MB.', { tipo: 'error' }); return; }
  const ext = fichero.type === 'image/png' ? 'png' : 'jpg';
  const ruta = `fotos/ejemplo-${idEj}-${c}.${ext}`.toLowerCase();
  try {
    await app.almacen.escribirFichero(app.juego.id, ruta, new Uint8Array(await fichero.arrayBuffer()), `Foto de ejemplo ${ruta}`, { sobrescribir: true });
    const { olvidarFichero } = await import('../motor.js');
    olvidarFichero(app.juego.id, ruta);
    fotos.delete(`${app.juego.id}/${ruta}`);
  } catch (e) { app.aviso(`No se pudo subir la foto: ${e.message}`, { tipo: 'error' }); return; }
  await app.cambiar('Foto de ejemplo', (copia) => { const ej = copia.examples.find((e) => e.id === idEj); ej.photos = { ...(ej.photos || {}), [c]: ruta }; });
}

async function cambiarTipo(app, c, tipo) {
  await app.cambiar(`Tipo: ${NOMBRE_TIPO[tipo]}`, (g) => {
    const d = g.fields[c];
    const antes = d.type;
    d.type = tipo;
    if (!(tipo === 'choice' || tipo === 'multi')) delete d.options;
    else if (!d.options) d.options = [1, 2].map((n) => Object.fromEntries(g.languages.map((l) => [l, `${l === 'en' ? 'Option' : 'Opción'} ${n}`])));
    if (tipo !== 'multi') { delete d.allowOther; delete d.otherField; }
    if (tipo !== 'number') { delete d.min; delete d.max; }
    if (!CON_TOPE.has(tipo)) delete d.cap;
    else if (!d.cap) d.cap = TOPE_INICIAL[tipo];
    if (tipo === 'photo') delete d.ej;
    // Los ejemplos de un tipo que ya no vale se quitan (una foto no es un texto, y al revés).
    for (const ej of g.examples || []) {
      if (tipo === 'photo' || antes === 'photo') for (const l of Object.keys(ej.values || {})) delete ej.values[l][c];
      if (tipo !== 'photo' && ej.photos) delete ej.photos[c];
    }
    // Una foto se imprime como foto; un texto, como hueco de texto.
    for (const p of g.pages) {
      for (const el of p.elements) {
        if (el.field !== c) continue;
        if (tipo === 'photo' && el.kind === 'field') throw new Error(`la pregunta sale como texto en la página ${g.pages.indexOf(p) + 1}: quítala de ahí antes de hacerla foto`);
        if (tipo !== 'photo' && el.kind === 'photo') throw new Error(`la pregunta sale como foto en la página ${g.pages.indexOf(p) + 1}: quítala de ahí antes de cambiarle el tipo`);
      }
    }
    for (const s of g.form.sections) if (s.photoField === c && tipo !== 'photo') delete s.photoField;
    for (const s of g.form.sections) if (s.nameField === c && tipo !== 'name') delete s.nameField;
  });
}

async function alternarOtro(app, s, c, activar) {
  await app.cambiar(activar ? 'Permitir «Otro»' : 'Sin «Otro»', (g) => {
    const d = g.fields[c];
    if (!activar) { delete d.allowOther; delete d.otherField; return; }
    let id = `${c}_OTRO`, n = 2;
    while (g.fields[id]) id = `${c}_OTRO${n++}`;
    g.fields[id] = { type: 'text', required: false, cap: 40, q: Object.fromEntries(g.languages.map((l) => [l, l === 'en' ? 'Other' : 'Otro'])) };
    d.allowOther = true;
    d.otherField = id;
    const sx = g.form.sections.find((x) => x.id === s.id);
    sx.fields.splice(sx.fields.indexOf(c) + 1, 0, id);
  });
}

async function moverCampo(app, s, c, d) {
  await app.cambiar('Ordenar las preguntas', (g) => {
    const f = g.form.sections.find((x) => x.id === s.id).fields;
    const i = f.indexOf(c);
    f.splice(i, 1);
    f.splice(i + d, 0, c);
  });
}

function idDeCampo(g, texto) {
  const base = String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/^¿|\?$/g, '')
    .replace(/\b(COMO|CUAL|CUALES|QUE|QUIEN|SE|ES|SU|SUS|EL|LA|LOS|LAS|DE|DEL|UN|UNA|LLAMA|WHAT|IS|THE|THEIR|HIS|HER|OF|A)\b/g, ' ')
    .replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').split('_').filter(Boolean).slice(0, 3).join('_') || 'CAMPO';
  const inicio = /^[A-Z]/.test(base) ? base : `C_${base}`;
  let id = inicio, n = 2;
  while (g.fields[id]) id = `${inicio}_${n++}`;
  return id;
}

async function nuevoCampo(app, ui, s) {
  let tipo = 'text';
  const r = await dialogoTextos(app, { titulo: 'Pregunta nueva', explicacion: 'Lo que lee el comprador en el formulario. Luego se elige dónde sale en las páginas.', rotulo: 'Pregunta', boton: 'Crear',
    extra: () => {
      const sel = h('select', { id: 'dlg-tipo', onchange: (e) => { tipo = e.target.value; } }, TIPOS.map(([t, n]) => h('option', { value: t }, n)));
      return { nodo: h('div', { class: 'campo' }, h('label', { for: 'dlg-tipo' }, 'Tipo de respuesta'), sel) };
    } });
  if (!r) return;
  const id = idDeCampo(app.juego, r.textos[app.juego.languages[0]]);
  const def = { type: tipo, required: true, q: r.textos };
  if (CON_TOPE.has(tipo)) def.cap = TOPE_INICIAL[tipo];
  if (tipo === 'choice' || tipo === 'multi') def.options = [1, 2].map((n) => Object.fromEntries(app.juego.languages.map((l) => [l, `${l === 'en' ? 'Option' : 'Opción'} ${n}`])));
  const ok = await app.cambiar('Pregunta nueva', (g) => {
    g.fields[id] = def;
    g.form.sections.find((x) => x.id === s.id).fields.push(id);
  });
  if (ok !== null) { ui.campo = id; app.repintar(); }
}

async function traerCampo(app, ui, s) {
  const g = app.juego;
  const opciones = [];
  for (const e of app.biblioteca.entradas('seccion')) {
    for (const [c, d] of Object.entries(e.fieldDefs)) {
      if (!g.fields[c] && !(d.allowOther && g.fields[d.otherField])) opciones.push({ c, d, e });
    }
  }
  const elegido = await app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('h2', {}, 'Traer una pregunta de la biblioteca'),
    h('p', { class: 'tenue' }, 'Se copia con su tipo, tope, ayuda, opciones y los ejemplos que tenga.'),
    opciones.length ? h('div', { class: 'lista-insertar', style: { maxHeight: '50vh', overflow: 'auto' } }, opciones.map((o) => h('button', { type: 'button', onclick: () => cerrar(o) },
      h('span', {}, enIdioma(o.d.q, ui.lang), h('br', {}), h('span', { class: 'codigo' }, `${o.c} · ${NOMBRE_TIPO[o.d.type]} · ${o.e.name}`)))))
      : h('div', { class: 'vacio' }, 'No hay preguntas en la biblioteca que este juego no tenga ya.'),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'))));
  if (!elegido) return;
  const { c, d, e } = elegido;
  const ok = await app.cambiar(`Pregunta de la biblioteca: ${c}`, (copia) => {
    const sx = copia.form.sections.find((x) => x.id === s.id);
    const traer = [c, ...(d.allowOther ? [d.otherField] : [])];
    for (const id of traer) {
      copia.fields[id] = structuredClone(e.fieldDefs[id]);
      sx.fields.push(id);
    }
    // Los ejemplos de esas preguntas, en los ejemplos con el mismo id.
    for (const ej of e.examples || []) {
      const destino = (copia.examples || []).find((x) => x.id === ej.id);
      if (!destino) continue;
      for (const l of copia.languages) {
        for (const id of traer) {
          const v = ((ej.values || {})[l] || {})[id];
          if (v !== undefined) { destino.values[l] = destino.values[l] || {}; destino.values[l][id] = v; }
        }
      }
    }
  });
  if (ok !== null) { ui.campo = c; app.repintar(); }
}

/** Quita un campo de todo el juego (definición, secciones y ejemplos). No mira las páginas: eso se comprueba antes. */
function borrarCampo(g, c) {
  delete g.fields[c];
  for (const s of g.form.sections) {
    s.fields = s.fields.filter((x) => x !== c);
    if (s.nameField === c) delete s.nameField;
    if (s.photoField === c) delete s.photoField;
  }
  for (const ej of g.examples || []) {
    for (const l of Object.keys(ej.values || {})) delete ej.values[l][c];
    if (ej.photos) delete ej.photos[c];
  }
}

async function quitarCampo(app, ui, s, c) {
  const g = app.juego;
  const donde = dondeSale(g, c);
  if (donde.length) {
    app.aviso(`No se puede quitar: «${c}» sale en ${donde.map((p) => `la página ${p.numero}`).join(', ')}. Quítala antes de ahí.`, { tipo: 'error', ms: 8000 });
    return;
  }
  const padre = Object.entries(g.fields).find(([, d]) => d.otherField === c);
  if (padre) { app.aviso(`No se puede quitar: es la respuesta «Otro» de ${padre[0]}. Desmarca «Otro» allí.`, { tipo: 'error' }); return; }
  const ok = await confirmar(app, '¿Quitar la pregunta?', `Se quita «${enIdioma(g.fields[c].q, ui.lang)}» y sus ejemplos. Se puede deshacer.`, 'Quitar');
  if (!ok) return;
  if (await app.cambiar('Quitar la pregunta', (copia) => {
    const otro = copia.fields[c].otherField;
    borrarCampo(copia, c);
    if (otro && !dondeSale(copia, otro).length) borrarCampo(copia, otro);
  }) !== null) { ui.campo = null; app.repintar(); }
}

/** Cambia el código de un campo en todo el juego. */
async function renombrar(app, ui, viejo, nuevo) {
  if (nuevo === viejo) return;
  if (!ID_CAMPO.test(nuevo)) { app.aviso('El código empieza por una letra y lleva solo letras sin acentos, números, _ o punto.', { tipo: 'error' }); app.repintar(); return; }
  if (app.juego.fields[nuevo]) { app.aviso(`Ya hay una pregunta con el código ${nuevo}.`, { tipo: 'error' }); app.repintar(); return; }
  const ok = await app.cambiar(`Código ${viejo} → ${nuevo}`, (g) => {
    g.fields = Object.fromEntries(Object.entries(g.fields).map(([k, v]) => [k === viejo ? nuevo : k, v]));
    for (const d of Object.values(g.fields)) if (d.otherField === viejo) d.otherField = nuevo;
    for (const s of g.form.sections) {
      s.fields = s.fields.map((x) => (x === viejo ? nuevo : x));
      if (s.nameField === viejo) s.nameField = nuevo;
      if (s.photoField === viejo) s.photoField = nuevo;
    }
    const enElementos = (els) => { for (const e of els || []) if (e.field === viejo) e.field = nuevo; };
    for (const p of g.pages) enElementos(p.elements);
    for (const z of g.puzzles || []) {
      if (z.page) enElementos(z.page.elements);
      for (const n of z.needs || []) if (n.field === viejo) n.field = nuevo;
      if (z.params) z.params = JSON.parse(JSON.stringify(z.params).replaceAll(`"${viejo}"`, `"${nuevo}"`));
    }
    for (const s of g.solutions || []) if (s.dependsOn) s.dependsOn = s.dependsOn.map((x) => (x === viejo ? nuevo : x));
    for (const ej of g.examples || []) {
      for (const l of Object.keys(ej.values || {})) {
        if (viejo in ej.values[l]) { ej.values[l][nuevo] = ej.values[l][viejo]; delete ej.values[l][viejo]; }
      }
      if (ej.photos && viejo in ej.photos) { ej.photos[nuevo] = ej.photos[viejo]; delete ej.photos[viejo]; }
    }
  });
  if (ok !== null) { ui.campo = nuevo; app.repintar(); } else app.repintar();
}

/* ---------------- Así lo verá el comprador ---------------- */

const fotos = new Map(); // `${id}/${ruta}` → URL del blob
async function urlDeFoto(app, ruta) {
  const clave = `${app.juego.id}/${ruta}`;
  if (!fotos.has(clave)) {
    const bytes = await app.almacen.leerFichero(app.juego.id, ruta);
    fotos.set(clave, URL.createObjectURL(new Blob([bytes], { type: /\.png$/i.test(ruta) ? 'image/png' : 'image/jpeg' })));
  }
  return fotos.get(clave);
}

function vistaComprador(app, ui, s) {
  const g = app.juego;
  const total = g.form.sections.length;
  const i = s ? g.form.sections.indexOf(s) : -1;
  const l = ui.lang;
  const ej = ui.ejemplo === null ? null : (g.examples || []).find((e) => e.id === ui.ejemplo);
  const valores = (ej && ej.values && ej.values[l]) || {};
  const pregunta = (c) => {
    const d = g.fields[c];
    if (!d) return null;
    // La respuesta «Otro» se ve dentro de su pregunta de varias opciones.
    if (Object.values(g.fields).some((x) => x.otherField === c)) return null;
    const v = valores[c] || '';
    const id = `comprador-${c}`;
    const marca = d.required ? null : h('span', { class: 'tenue', style: { fontWeight: 400 } }, ' (opcional)');
    const ayuda = [d.desc ? h('span', { class: 'tenue', style: { fontSize: '13px' } }, enIdioma(d.desc, l)) : null, d.ej ? h('span', { class: 'ej' }, enIdioma(d.ej, l)) : null];
    if (d.type === 'photo') {
      const img = h('img', { alt: 'Foto de ejemplo', style: { width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '10px', display: 'none' } });
      const ruta = ej && ej.photos && ej.photos[c];
      if (ruta) urlDeFoto(app, ruta).then((u) => { img.src = u; img.style.display = 'block'; }, () => {});
      return h('div', { class: 'pregunta-c' }, h('span', { style: { fontWeight: 600 } }, enIdioma(d.q, l), marca), ayuda,
        h('div', { style: { border: '2px dashed var(--borde)', borderRadius: '12px', padding: '10px', textAlign: 'center', color: 'var(--tenue)' } }, img, ruta ? 'Cambiar foto' : 'Subir foto'));
    }
    if (d.type === 'choice' || d.type === 'multi') {
      const marcadas = String(v).split('||').map((x) => x.trim()).filter(Boolean);
      const otro = marcadas.find((x) => /^(Otro|Other):/i.test(x));
      return h('fieldset', { class: 'pregunta-c', style: { border: 0, margin: 0, padding: 0 } }, h('legend', { style: { fontWeight: 600, marginBottom: '6px' } }, enIdioma(d.q, l), marca), ayuda,
        h('div', { class: 'opciones-lista' }, d.options.map((o, k) => h('label', { class: 'casilla' },
          h('input', { type: d.type === 'multi' ? 'checkbox' : 'radio', name: id, tabindex: '-1', checked: marcadas.includes(enIdioma(o, l)), onclick: (e) => e.preventDefault() }), enIdioma(o, l) || `Opción ${k + 1}`)),
        d.allowOther ? h('label', { class: 'casilla' }, h('input', { type: 'checkbox', tabindex: '-1', checked: !!otro, onclick: (e) => e.preventDefault() }), l === 'en' ? 'Other' : 'Otro',
          otro ? h('span', { class: 'tenue' }, `: ${otro.replace(/^[^:]*:\s*/, '')}`) : null) : null));
    }
    const largo = d.type === 'long';
    return h('div', { class: 'pregunta-c' }, h('label', { for: id }, enIdioma(d.q, l), marca), ayuda,
      largo ? h('textarea', { id, rows: 3, readonly: true, class: 'entrada' }, v) : h('input', { id, class: 'entrada', readonly: true, value: v, inputmode: d.type === 'number' ? 'numeric' : null }),
      d.cap ? h('span', { class: 'tenue', style: { fontSize: '12px', alignSelf: 'flex-end' } }, `${String(v).length} / ${d.cap}`) : null);
  };
  return h('aside', { class: 'vista-comprador', 'aria-label': 'Así lo verá el comprador' },
    h('div', { class: 'etiqueta-seccion' }, 'Así lo verá el comprador'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, selectoresVista(app, ui)),
    s ? h('div', { class: 'movil' },
      h('div', { class: 'paso' }, l === 'en' ? `Step ${i + 1} of ${total}` : `Paso ${i + 1} de ${total}`),
      h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--hundido)' } }, h('div', { style: { height: '100%', width: `${Math.round(((i + 1) / total) * 100)}%`, background: 'var(--verde)', borderRadius: '3px' } })),
      h('h3', {}, enIdioma(s.title, l)),
      s.hint ? h('p', { class: 'tenue', style: { margin: 0, fontSize: '14px' } }, enIdioma(s.hint, l)) : null,
      s.fields.map(pregunta),
      h('div', { class: 'boton primario', 'aria-hidden': 'true', style: { cursor: 'default' } }, i + 1 < total ? (l === 'en' ? 'Next' : 'Siguiente') : (l === 'en' ? 'Review' : 'Revisar'))) : null,
    h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Con los datos del ejemplo elegido. El formulario real de la tienda puede cambiar un poco de aspecto.'));
}
