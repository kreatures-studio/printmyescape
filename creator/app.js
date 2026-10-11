// Editor de juegos. T5.1: lista de juegos y páginas. T5.2: entrada con token y almacén de GitHub.
// T5.3: lienzo de la página (huecos y capas), propiedades, deshacer y guardar. T5.4: kit (soltar
// piezas añade capas). T5.5: formulario (secciones y campos) y mecánicas (params por clave).
// T5.6: validación con enlaces a lo que falla, vista previa (marca «VISTA PREVIA»), envío al estudio
// y aviso cuando otra versión del juego es más nueva (sondeo cada 15 s; ?sondeo=ms lo cambia).
// Con ?almacen=memoria se usa el almacén en memoria (pruebas y demostraciones).
import { crearAlmacenMemoria } from './store/memory.js';
import { crearAlmacenGitHub } from './store/github.js';
import { pintarPagina, pintarPropiedades } from './lienzo.js';
import { cargarKit, pintarKit } from './kit.js';
import { componerVistaPrevia } from './vista-previa.js';
import { reglasCruzadas, avisosGame } from '../tools/game/reglas.mjs';

// Juegos del almacén en memoria (rutas relativas a esta página, en creator/).
const FUENTES_MEMORIA = ['../games/final3/game.json', '../tools/qa/fixtures/games/capas/game.json'];
const CLAVE_TOKEN = 'pme-token';
const CLAVE_REPO = 'pme-repo';
const MAX_DESHACER = 200;
const SONDEO_MS = Number(new URLSearchParams(location.search).get('sondeo')) || 15000;
const TIPOS_CAMPO = ['name', 'text', 'long', 'number', 'photo', 'choice', 'multi'];
const TIPOS_CON_TOPE = ['name', 'text', 'long'];
// Manifiesto del kit: en la web, el de este repositorio; con ?kit= se cambia (pruebas).
const KIT_POR_DEFECTO = '../assets/kit/manifest.json';

let almacen = null;
let kit = null;            // { piezas, porId, base }
let juegoActual = null;    // juego en edición (copia; se guarda con el almacén)
let revActual = null;      // rev leída: save() la exige
let vista = 'paginas';     // 'paginas' | 'formulario' | 'mecanicas' | 'validar' | 'vista'
let paginaIdx = null;      // página abierta (vista páginas)
let seleccion = null;      // hueco seleccionado en la página
let seccionIdx = null;     // sección abierta (vista formulario)
let campoId = null;        // campo abierto (vista formulario)
let mecanicaIdx = null;    // mecánica abierta (vista mecánicas)
let pila = [];             // juegos anteriores, para deshacer
let sucio = false;
let novedades = false;     // hay una versión más nueva en el almacén (sondeo)
let previa = { lang: null, ejemplo: null, url: null, paginas: 0, avisos: [], error: null };
let envio = null;          // { url } tras enviar al estudio

const $ = (id) => document.getElementById(id);

function leerSesion(clave) {
  try { return sessionStorage.getItem(clave); } catch { return null; }
}
function guardarSesion(clave, valor) {
  try { valor === null ? sessionStorage.removeItem(clave) : sessionStorage.setItem(clave, valor); } catch { /* sin sessionStorage: se pedirá de nuevo */ }
}

function mostrarEntrada(mensaje) {
  $('principal').hidden = true;
  $('salir').hidden = true;
  $('entrada').hidden = false;
  $('repo').value = leerSesion(CLAVE_REPO) || '';
  $('entrada-error').hidden = !mensaje;
  $('entrada-error').textContent = mensaje || '';
}

function mostrarPrincipal() {
  $('entrada').hidden = true;
  $('principal').hidden = false;
  $('salir').hidden = false;
  mostrarJuegos();
  const url = new URLSearchParams(location.search).get('kit') || KIT_POR_DEFECTO;
  cargarKit(new URL(url, location.href).href)
    .then((k) => { kit = k; if (juegoActual && vista === 'paginas' && paginaIdx !== null) pintarDetalle(); })
    .catch((e) => { kit = null; marcar(`Kit: ${e.message}`); });
}

$('entrada').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const repo = $('repo').value.trim();
  const token = $('token').value.trim();
  const [owner, nombre] = repo.split('/');
  if (!owner || !nombre || !token) return mostrarEntrada('Hacen falta el repositorio y el token.');
  guardarSesion(CLAVE_REPO, repo);
  guardarSesion(CLAVE_TOKEN, token);
  $('token').value = '';
  almacen = crearAlmacenGitHub({ owner, repo: nombre, token });
  mostrarPrincipal();
});

$('salir').addEventListener('click', () => {
  guardarSesion(CLAVE_TOKEN, null);
  almacen = null;
  juegoActual = null;
  mostrarEntrada();
});

function boton(texto, sub, activo, alPulsar) {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = texto;
  b.setAttribute('aria-current', String(activo));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
  b.addEventListener('click', alPulsar);
  li.append(b);
  return li;
}

function error(donde, e) {
  const p = document.createElement('li');
  p.className = 'error';
  p.textContent = `Error: ${e.message}`;
  donde.replaceChildren(p);
}

function marcar(texto) { const e = $('estado'); if (e) e.textContent = texto; }

async function mostrarJuegos() {
  const ul = $('juegos');
  try {
    const lista = await almacen.list();
    ul.replaceChildren(...lista.map((j) => boton(j.name?.es || j.id, j.id, false, () => abrirJuego(j.id))));
  } catch (e) {
    if (e.code === 'auth') { guardarSesion(CLAVE_TOKEN, null); almacen = null; return mostrarEntrada(e.message); }
    error(ul, e);
  }
}

async function abrirJuego(id) {
  for (const li of $('juegos').children) li.querySelector('button').setAttribute('aria-current', String(li.querySelector('small').textContent === id));
  try {
    const { game, rev } = await almacen.load(id);
    juegoActual = game;
    revActual = rev;
    pila = [];
    sucio = false;
    novedades = false;
    envio = null;
    vista = 'paginas';
    paginaIdx = null; seleccion = null; seccionIdx = null; campoId = null; mecanicaIdx = null;
    liberarPrevia();
    mostrarVistas();
    mostrarLista();
    pintarDetalle();
  } catch (e) { error($('paginas'), e); }
}

/* ---- Vistas: páginas, formulario y mecánicas ---- */

function mostrarVistas() {
  for (const b of document.querySelectorAll('#vistas button')) {
    b.setAttribute('aria-pressed', String(b.dataset.vista === vista));
    b.disabled = !juegoActual;
  }
}

function cambiarVista(v) {
  vista = v;
  seleccion = null;
  mostrarVistas();
  mostrarLista();
  pintarDetalle();
}

for (const b of document.querySelectorAll('#vistas button')) {
  b.addEventListener('click', () => cambiarVista(b.dataset.vista));
}

/** Lista de la columna central según la vista. */
function mostrarLista() {
  const ul = $('paginas');
  if (!juegoActual) { ul.replaceChildren(); return; }
  if (vista === 'paginas') {
    ul.replaceChildren(...juegoActual.template.pages.map((p, i) => {
      const sub = `${(p.slots || []).length} huecos · ${(p.layers || []).length} capas`;
      return boton(p.title || p.id, sub, i === paginaIdx, () => { paginaIdx = i; seleccion = null; mostrarLista(); pintarDetalle(); });
    }));
  } else if (vista === 'formulario') {
    ul.replaceChildren(...juegoActual.form.sections.map((s, i) => {
      const titulo = s.title?.es || s.id;
      return boton(titulo, `${(s.fields || []).length} campos`, i === seccionIdx, () => { seccionIdx = i; campoId = null; mostrarLista(); pintarDetalle(); });
    }));
  } else if (vista === 'mecanicas') {
    ul.replaceChildren(...juegoActual.mechanics.map((m, i) => boton(m.type, `página ${m.page}`, i === mecanicaIdx,
      () => { mecanicaIdx = i; mostrarLista(); pintarDetalle(); })));
  } else {
    ul.replaceChildren();
  }
}

/** Contenido de la columna derecha: barra (deshacer, guardar, estado) y la vista abierta. */
function pintarDetalle() {
  const cont = $('detalle');
  const barra = document.createElement('div');
  barra.className = 'barra';
  const deshacerBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Deshacer', disabled: !pila.length });
  deshacerBtn.addEventListener('click', deshacer);
  const guardarBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Guardar' });
  guardarBtn.addEventListener('click', guardar);
  const estado = Object.assign(document.createElement('span'), { id: 'estado', className: 'nota' });
  estado.textContent = sucio ? 'Cambios sin guardar' : '';
  barra.append(deshacerBtn, guardarBtn, estado);
  if (novedades) barra.append(avisoNovedades());

  const cuerpo = document.createElement('div');
  if (!juegoActual) {
    cuerpo.append(nota('Elige un juego.'));
  } else if (vista === 'paginas') {
    if (paginaIdx === null) cuerpo.append(nota('Elige una página.'));
    else pintarEditorPagina(cuerpo);
  } else if (vista === 'formulario') {
    pintarFormulario(cuerpo);
  } else if (vista === 'mecanicas') {
    pintarMecanicas(cuerpo);
  } else if (vista === 'validar') {
    pintarValidacion(cuerpo);
  } else {
    pintarVistaPrevia(cuerpo);
  }
  cont.replaceChildren(barra, cuerpo);
}

function nota(texto) {
  return Object.assign(document.createElement('p'), { className: 'nota', textContent: texto });
}

/* ---- Cambios y deshacer (el juego entero: páginas, formulario y mecánicas) ---- */

function cambiar(fn) {
  pila.push(structuredClone(juegoActual));
  if (pila.length > MAX_DESHACER) pila.shift();
  fn(juegoActual);
  sucio = true;
  mostrarLista();
  pintarDetalle();
}

function deshacer() {
  if (!pila.length) return;
  juegoActual = pila.pop();
  sucio = pila.length > 0;
  seleccion = null;
  mostrarLista();
  pintarDetalle();
}

async function guardar() {
  if (!juegoActual) return;
  try {
    const r = await almacen.save(juegoActual.id, juegoActual, revActual, `Editar ${juegoActual.id}`);
    revActual = r.rev;
    sucio = false;
    marcar('Guardado');
  } catch (e) {
    marcar(e.code === 'conflict' ? 'Hay cambios nuevos en el juego: recarga para verlos' : `No se guardó: ${e.message}`);
  }
}

/* ---- Páginas: lienzo, propiedades y kit (T5.3, T5.4) ---- */

function paginaActual() { return juegoActual.template.pages[paginaIdx]; }

function pintarEditorPagina(cont) {
  const pagina = paginaActual();
  const zona = document.createElement('div');
  zona.className = 'zona-lienzo';
  const propiedades = document.createElement('div');
  propiedades.className = 'propiedades-caja';
  const operaciones = {
    seleccion,
    alSeleccionar(k) { seleccion = k; pintarDetalle(); },
    alMover(k, cambios) { cambiar((j) => Object.assign(j.template.pages[paginaIdx].slots[k], cambios)); },
    alRedimensionar(k, cambios) { cambiar((j) => Object.assign(j.template.pages[paginaIdx].slots[k], cambios)); },
    alSoltarPieza(id, xPct, yPct) { soltarPieza(id, xPct, yPct); },
  };
  pintarPagina(zona, pagina, operaciones);
  if (seleccion !== null && pagina.slots[seleccion]) {
    pintarPropiedades(propiedades, pagina.slots[seleccion], seleccion, (k, campo, valor) => {
      cambiar((j) => { j.template.pages[paginaIdx].slots[k][campo] = valor; });
    });
  } else {
    propiedades.append(nota('Elige un hueco para ver sus propiedades.'));
  }
  if (kit) {
    const panelKit = document.createElement('div');
    pintarKit(panelKit, kit);
    propiedades.append(panelKit);
  }
  const layout = document.createElement('div');
  layout.className = 'editor';
  layout.append(zona, propiedades);
  cont.append(layout);
}

/** Añade una capa con la pieza del kit, centrada en el punto soltado (solo en juegos de fondo por capas). */
function soltarPieza(id, xPct, yPct) {
  if (juegoActual.background?.kind !== 'layers') {
    return marcar('Este juego usa un PDF de fondo: pásalo a fondo por capas para añadir piezas.');
  }
  const pieza = kit && kit.porId.get(id);
  if (!pieza) return marcar(`No está en el kit: ${id}`);
  const w = Math.min(100, Math.round((pieza.widthMm / 210) * 10000) / 100);
  const h = Math.min(100, Math.round((pieza.heightMm / 297) * 10000) / 100);
  const x = Math.round(Math.min(Math.max(xPct - w / 2, 0), 100 - w) * 100) / 100;
  const y = Math.round(Math.min(Math.max(yPct - h / 2, 0), 100 - h) * 100) / 100;
  cambiar((j) => { const p = j.template.pages[paginaIdx]; p.layers = [...(p.layers || []), { asset: id, x, y, w, h }]; });
}

/* ---- Formulario: secciones y campos (T5.5) ---- */

function pintarFormulario(cont) {
  if (seccionIdx === null) { cont.append(nota('Elige una sección.')); return; }
  const seccion = juegoActual.form.sections[seccionIdx];
  const h = document.createElement('h3');
  h.textContent = seccion.title?.es || seccion.id;
  const lista = document.createElement('ul');
  lista.className = 'campos-seccion';
  for (const id of seccion.fields || []) {
    const li = document.createElement('li');
    const b = Object.assign(document.createElement('button'), { type: 'button', textContent: id });
    b.setAttribute('aria-current', String(id === campoId));
    b.addEventListener('click', () => { campoId = id; pintarDetalle(); });
    li.append(b);
    lista.append(li);
  }
  cont.append(h, lista);
  if (campoId && juegoActual.fields[campoId]) pintarCampo(cont, campoId);
  else cont.append(nota('Elige un campo para editarlo.'));
}

function pintarCampo(cont, id) {
  const campo = juegoActual.fields[id];
  const form = document.createElement('form');
  form.className = 'propiedades campo';
  const h = document.createElement('h3');
  h.textContent = `Campo ${id}`;

  // Cada control va con su etiqueta (htmlFor), para lectores de pantalla y para las pruebas.
  let n = 0;
  const fila = (texto, control) => {
    const label = document.createElement('label');
    label.textContent = texto;
    n += 1;
    control.id = `campo-${id}-${n}`;
    label.htmlFor = control.id;
    form.append(label, control);
    return control;
  };
  // Un cambio que no altera el valor no se registra ni vuelve a pintar (el navegador puede repetir el
  // evento «change» al quitar el control enfocado, y repintar dentro de otro repintado falla).
  const cambiarCampo = (fn, igual) => {
    if (igual && igual()) return;
    cambiar((j) => fn(j.fields[id]));
  };
  const actual = () => juegoActual.fields[id];

  const tipo = document.createElement('select');
  for (const t of TIPOS_CAMPO) tipo.append(new Option(t, t));
  tipo.value = campo.type;
  tipo.addEventListener('change', () => cambiarCampo((c) => { c.type = tipo.value; }, () => actual().type === tipo.value));
  fila('Tipo', tipo);

  const obligatorio = document.createElement('input');
  obligatorio.type = 'checkbox';
  obligatorio.checked = !!campo.required;
  obligatorio.addEventListener('change', () => cambiarCampo((c) => { c.required = obligatorio.checked; }, () => !!actual().required === obligatorio.checked));
  fila('Obligatorio', obligatorio);

  if (TIPOS_CON_TOPE.includes(campo.type)) {
    const cap = document.createElement('input');
    cap.type = 'number';
    cap.min = '1';
    cap.step = '1';
    cap.value = campo.cap ?? '';
    cap.addEventListener('change', () => { if (cap.value !== '') cambiarCampo((c) => { c.cap = Number(cap.value); }, () => actual().cap === Number(cap.value)); });
    fila('Tope de caracteres (cap)', cap);
  }

  for (const lang of juegoActual.languages) {
    const q = document.createElement('input');
    q.type = 'text';
    q.value = campo.q?.[lang] ?? '';
    q.addEventListener('change', () => cambiarCampo((c) => { c.q = { ...(c.q || {}), [lang]: q.value }; }, () => (actual().q?.[lang] ?? '') === q.value));
    fila(`Pregunta (${lang})`, q);
    const corta = document.createElement('input');
    corta.type = 'text';
    corta.value = campo.corta?.[lang] ?? '';
    corta.addEventListener('change', () => cambiarCampo((c) => { c.corta = { ...(c.corta || {}), [lang]: corta.value }; }, () => (actual().corta?.[lang] ?? '') === corta.value));
    fila(`Etiqueta corta (${lang})`, corta);
  }
  cont.append(h, form);
}

/* ---- Mecánicas: params por clave, validación de la mecánica (T5.5) ---- */

function pintarMecanicas(cont) {
  if (mecanicaIdx === null) { cont.append(nota('Elige una mecánica.')); return; }
  const m = juegoActual.mechanics[mecanicaIdx];
  const def = globalThis.PMEMechanics && globalThis.PMEMechanics[m.type];
  const h = document.createElement('h3');
  h.textContent = def ? (def.label?.es || m.type) : `Mecánica desconocida: ${m.type}`;
  cont.append(h, nota(`Tipo ${m.type} · página ${m.page}`));
  if (!def) return;

  // Claves: las obligatorias de la mecánica y las que ya tiene el juego. Cada una se edita como JSON.
  const obligatorias = (def.params && def.params.required) || [];
  const claves = [...new Set([...obligatorias, ...Object.keys(m.params || {})])];
  const form = document.createElement('form');
  form.className = 'propiedades mecanica';
  const errores = document.createElement('ul');
  errores.className = 'errores-mecanica';
  const controles = {};
  for (const clave of claves) {
    const label = document.createElement('label');
    label.htmlFor = `param-${clave}`;
    label.textContent = clave + (obligatorias.includes(clave) ? ' (obligatorio)' : '');
    const area = document.createElement('textarea');
    area.id = `param-${clave}`;
    area.rows = 2;
    const actual = m.params && clave in m.params ? m.params[clave] : undefined;
    // Texto plano para las cadenas (p. ej. field); JSON para el resto (listas, números, objetos).
    area.value = typeof actual === 'string' ? actual : actual === undefined ? '' : JSON.stringify(actual);
    controles[clave] = area;
    form.append(label, area);
  }
  const aplicar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Aplicar parámetros' });
  const aviso = Object.assign(document.createElement('p'), { className: 'error', hidden: true });
  aplicar.addEventListener('click', () => {
    const nuevos = {};
    for (const [clave, area] of Object.entries(controles)) {
      if (area.value.trim() === '') continue;
      const original = m.params ? m.params[clave] : undefined;
      if (typeof original === 'string') { nuevos[clave] = area.value.trim(); continue; }
      try { nuevos[clave] = JSON.parse(area.value); } catch {
        // Sin valor previo, un texto que no es JSON se toma como cadena.
        if (original === undefined) { nuevos[clave] = area.value.trim(); continue; }
        aviso.hidden = false;
        aviso.textContent = `«${clave}» no es JSON válido`;
        return;
      }
    }
    if (obligatorias.some((c) => !(c in nuevos))) {
      aviso.hidden = false;
      aviso.textContent = `faltan parámetros obligatorios: ${obligatorias.filter((c) => !(c in nuevos)).join(', ')}`;
      return;
    }
    cambiar((j) => { j.mechanics[mecanicaIdx].params = nuevos; });
  });
  form.append(aplicar);
  cont.append(form, aviso);

  // Validación de la propia mecánica con el juego actual (la misma que usa el validador).
  const problemas = typeof def.validate === 'function' ? def.validate(juegoActual, m) : [];
  if (problemas.length) {
    for (const e of problemas) {
      const li = document.createElement('li');
      li.className = 'error';
      li.textContent = e.message;
      errores.append(li);
    }
  } else {
    const li = document.createElement('li');
    li.className = 'nota';
    li.textContent = 'Sin problemas.';
    errores.append(li);
  }
  cont.append(errores);
}

/* ---- Validación y envío al estudio (T5.6) ---- */

/** Errores y avisos del juego, con las mismas reglas que el validador (la parte que no usa ficheros). */
function validarJuego() {
  const kitInfo = kit ? { errores: kit.errores, piezas: kit.porId } : null;
  return {
    errores: reglasCruzadas(juegoActual, { submit: true, kit: kitInfo, kitNombre: 'assets/kit/manifest.json' }),
    avisos: avisosGame(juegoActual),
  };
}

/** Dónde está lo que dice un mensaje del validador («fields/X/…», «mechanics/3 …», «template/p1: …»). */
function destinoDe(texto) {
  let m;
  if ((m = /^fields\/([^/:\s]+)/.exec(texto))) return { vista: 'formulario', campo: m[1] };
  if ((m = /^form\/([^/:\s]+)/.exec(texto))) return { vista: 'formulario', seccion: m[1] };
  if ((m = /^mechanics\/(\d+)/.exec(texto))) return { vista: 'mecanicas', mecanica: Number(m[1]) };
  if ((m = /^template\/pages\/([^/:\s]+)/.exec(texto)) || (m = /^template\/([^/:\s]+)/.exec(texto))) return { vista: 'paginas', pagina: m[1] };
  if ((m = /^el campo «([^»]+)»/.exec(texto))) return { vista: 'formulario', campo: m[1] };
  return null;
}

const indiceONull = (i) => (i >= 0 ? i : null);

/** Abre la vista y el elemento de un mensaje del validador. */
function irA(d) {
  if (d.vista === 'formulario') {
    if (d.campo) {
      seccionIdx = indiceONull(juegoActual.form.sections.findIndex((s) => (s.fields || []).includes(d.campo)));
      campoId = d.campo;
    } else {
      seccionIdx = indiceONull(juegoActual.form.sections.findIndex((s) => s.id === d.seccion));
      campoId = null;
    }
  } else if (d.vista === 'mecanicas') {
    mecanicaIdx = d.mecanica < juegoActual.mechanics.length ? d.mecanica : null;
  } else if (d.vista === 'paginas') {
    paginaIdx = indiceONull(juegoActual.template.pages.findIndex((p) => p.id === d.pagina));
    seleccion = null;
  }
  vista = d.vista;
  mostrarVistas();
  mostrarLista();
  pintarDetalle();
}

function listaProblemas(problemas, clase) {
  const ul = document.createElement('ul');
  ul.className = 'lista-problemas';
  for (const texto of problemas) {
    const li = document.createElement('li');
    li.className = clase;
    const d = destinoDe(texto);
    if (d) {
      const b = Object.assign(document.createElement('button'), { type: 'button', textContent: texto });
      b.addEventListener('click', () => irA(d));
      li.append(b);
    } else {
      li.textContent = texto;
    }
    ul.append(li);
  }
  return ul;
}

function pintarValidacion(cont) {
  const { errores, avisos } = validarJuego();
  const enviable = juegoActual.status === 'borrador' || juegoActual.status === 'enviado';
  cont.append(Object.assign(document.createElement('h3'), { textContent: 'Para enviar al estudio' }));
  if (errores.length) {
    cont.append(nota(`Faltan ${errores.length} cosa(s). Pulsa una para ir a ella.`), listaProblemas(errores, 'error'));
  } else {
    cont.append(nota('Sin errores: el juego cumple lo necesario para enviarlo.'));
  }
  if (avisos.length) {
    cont.append(Object.assign(document.createElement('h3'), { textContent: 'Avisos' }), listaProblemas(avisos, 'nota'));
  }

  const barra = document.createElement('div');
  barra.className = 'barra';
  const enviarBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Enviar al estudio' });
  enviarBtn.disabled = errores.length > 0 || !enviable || !!envio || !almacen;
  enviarBtn.addEventListener('click', enviarAlEstudio);
  barra.append(enviarBtn);
  cont.append(barra);
  if (!enviable) cont.append(nota(`Este juego ya está ${juegoActual.status}.`));
  if (envio) {
    const p = document.createElement('p');
    p.textContent = 'Enviado. Petición: ';
    if (/^https?:/.test(envio.url)) {
      const a = Object.assign(document.createElement('a'), { href: envio.url, target: '_blank', rel: 'noopener', textContent: 'abrir' });
      p.append(a);
    } else {
      p.append(envio.url);
    }
    cont.append(p);
  }
}

/** Marca el juego como enviado, lo guarda y abre la petición al estudio (contrato 3.6). */
async function enviarAlEstudio() {
  if (!juegoActual || envio) return;
  if (validarJuego().errores.length) { marcar('No se envía: faltan cosas (ver Validar)'); return pintarDetalle(); }
  const id = juegoActual.id;
  try {
    if (juegoActual.status === 'borrador') {
      juegoActual.status = 'enviado';
      try {
        const r = await almacen.save(id, juegoActual, revActual, `Enviar ${id} al estudio`);
        revActual = r.rev;
        sucio = false;
      } catch (e) {
        juegoActual.status = 'borrador';
        throw e;
      }
    }
    const s = await almacen.submit(id, `Juego ${id} listo para revisar`);
    envio = { url: s.url };
    marcar('Enviado al estudio');
  } catch (e) {
    marcar(e.code === 'conflict' ? 'Hay cambios nuevos en el juego: recarga antes de enviar' : `No se envió: ${e.message}`);
  }
  pintarDetalle();
}

/* ---- Vista previa (T5.6): el mismo motor que el CLI, con marca «VISTA PREVIA» ---- */

function liberarPrevia() {
  if (previa.url) URL.revokeObjectURL(previa.url);
  previa = { ...previa, url: null, paginas: 0, avisos: [], error: null };
}

function pintarVistaPrevia(cont) {
  const form = document.createElement('form');
  form.className = 'propiedades previa';
  const h = Object.assign(document.createElement('h3'), { textContent: 'Vista previa' });

  const selIdioma = document.createElement('select');
  selIdioma.id = 'previa-idioma';
  for (const l of juegoActual.languages) selIdioma.append(new Option(l, l));
  selIdioma.value = juegoActual.languages.includes(previa.lang) ? previa.lang : juegoActual.languages[0];
  const selEjemplo = document.createElement('select');
  selEjemplo.id = 'previa-ejemplo';
  for (const ex of juegoActual.examples || []) selEjemplo.append(new Option(`Ejemplo ${ex.id}`, ex.id));
  selEjemplo.value = (juegoActual.examples || []).some((e) => e.id === previa.ejemplo) ? previa.ejemplo : (juegoActual.examples?.[0]?.id ?? '');
  const etiqueta = (texto, control) => {
    const label = Object.assign(document.createElement('label'), { textContent: texto, htmlFor: control.id });
    form.append(label, control);
  };
  etiqueta('Idioma', selIdioma);
  etiqueta('Ejemplo', selEjemplo);

  const componer = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Componer vista previa' });
  form.append(componer);
  const estado = Object.assign(document.createElement('p'), { className: 'nota', id: 'previa-estado' });
  form.append(estado);

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!juegoActual.examples?.length) { estado.textContent = 'El juego no tiene ejemplos.'; return; }
    estado.textContent = 'Componiendo…';
    componer.disabled = true;
    const lang = selIdioma.value;
    const ejemplo = selEjemplo.value;
    try {
      const r = await componerVistaPrevia({ juego: juegoActual, lang, ejemplo, almacen, kit });
      liberarPrevia();
      previa = { lang, ejemplo, url: r.url, paginas: r.paginas, avisos: r.avisos, error: null };
    } catch (e) {
      liberarPrevia();
      previa = { ...previa, lang, ejemplo, error: e.message };
    }
    pintarDetalle();
  });

  cont.append(h, form);
  if (previa.error) {
    cont.append(Object.assign(document.createElement('p'), { className: 'error', textContent: `No se pudo componer: ${previa.error}` }));
    return;
  }
  if (previa.url) {
    cont.append(nota(`${previa.paginas} página(s) · ${previa.lang} · ejemplo ${previa.ejemplo} (con los cambios sin guardar)`));
    const marco = document.createElement('iframe');
    marco.className = 'previa-marco';
    marco.title = 'Vista previa del juego';
    marco.src = previa.url;
    cont.append(marco);
    if (previa.avisos.length) cont.append(listaProblemas(previa.avisos, 'nota'));
  }
}

/* ---- Sondeo: aviso si otra versión del juego es más nueva (T5.6) ---- */

async function comprobarNovedades() {
  if (!almacen || !juegoActual || novedades) return;
  try {
    const rev = await almacen.latestRev(juegoActual.id);
    if (rev && revActual && rev !== revActual) {
      novedades = true;
      const barra = document.querySelector('#detalle .barra');
      if (barra) barra.append(avisoNovedades());
    }
  } catch { /* sin red o sin permiso: se vuelve a probar en el siguiente sondeo */ }
}

function avisoNovedades() {
  const aviso = Object.assign(document.createElement('p'), { className: 'aviso-novedades', role: 'status' });
  aviso.append('Hay cambios nuevos en el juego: ');
  const recargar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'recargar' });
  recargar.addEventListener('click', () => abrirJuego(juegoActual.id));
  aviso.append(recargar, sucio ? ' (se descartan los cambios sin guardar)' : '');
  return aviso;
}

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.target.matches('input, textarea')) {
    ev.preventDefault();
    deshacer();
  }
});

// Acceso de pruebas: el juego y el almacén en uso.
window.pmeCreador = {
  get juego() { return juegoActual; },
  get almacen() { return almacen; },
  get sucio() { return sucio; },
  get novedades() { return novedades; },
  get envio() { return envio; },
};

// Arranque (al final: usa las funciones y constantes de arriba).
setInterval(comprobarNovedades, SONDEO_MS);
const params = new URLSearchParams(location.search);
if (params.get('almacen') === 'memoria') {
  almacen = crearAlmacenMemoria(FUENTES_MEMORIA);
  mostrarPrincipal();
} else {
  const token = leerSesion(CLAVE_TOKEN);
  const repo = leerSesion(CLAVE_REPO);
  if (token && repo && repo.includes('/')) {
    const [owner, nombre] = repo.split('/');
    almacen = crearAlmacenGitHub({ owner, repo: nombre, token });
    mostrarPrincipal();
  } else {
    mostrarEntrada();
  }
}
