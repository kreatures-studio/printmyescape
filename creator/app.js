// Editor de juegos. T5.1: lista de juegos, páginas y detalle. T5.2: entrada con token y almacén
// de GitHub. T5.3: lienzo de la página (huecos y capas), propiedades, deshacer y guardar.
// Con ?almacen=memoria se usa el almacén en memoria (pruebas y demostraciones).
import { crearAlmacenMemoria } from './store/memory.js';
import { crearAlmacenGitHub } from './store/github.js';
import { pintarPagina, pintarPropiedades } from './lienzo.js';

// Juegos del almacén en memoria (rutas relativas a esta página, en creator/).
const FUENTES_MEMORIA = ['../games/final3/game.json', '../tools/qa/fixtures/games/capas/game.json'];
const CLAVE_TOKEN = 'pme-token';
const CLAVE_REPO = 'pme-repo';
const MAX_DESHACER = 200;

let almacen = null;
let juegoActual = null;   // juego en edición (copia; se guarda con el almacén)
let revActual = null;     // rev leída: save() la exige
let paginaIdx = null;     // página abierta
let seleccion = null;     // hueco seleccionado en la página
let pila = [];            // páginas anteriores, para deshacer
let sucio = false;

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
    mostrarPaginas();
  } catch (e) { error($('paginas'), e); }
}

function mostrarPaginas() {
  const pages = juegoActual.template.pages;
  $('paginas').replaceChildren(...pages.map((p, i) => {
    const sub = `${(p.slots || []).length} huecos · ${(p.layers || []).length} capas`;
    return boton(p.title || p.id, sub, i === paginaIdx, () => abrirPagina(i));
  }));
}

function abrirPagina(i) {
  paginaIdx = i;
  seleccion = null;
  pintarEditor();
  mostrarPaginas();
}

/** Aplica un cambio sobre la página: guarda la anterior para deshacer. */
function cambiar(fn) {
  pila.push(structuredClone(juegoActual.template.pages));
  if (pila.length > MAX_DESHACER) pila.shift();
  fn(juegoActual.template.pages[paginaIdx]);
  sucio = true;
  pintarEditor();
}

function deshacer() {
  if (!pila.length) return;
  juegoActual.template.pages = pila.pop();
  sucio = pila.length > 0;
  seleccion = null;
  pintarEditor();
}

function marcar(texto) { $('estado').textContent = texto; }

function pintarEditor() {
  const pagina = juegoActual.template.pages[paginaIdx];
  const cont = $('detalle');
  const barra = document.createElement('div');
  barra.className = 'barra';
  const deshacerBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Deshacer', disabled: !pila.length });
  deshacerBtn.addEventListener('click', deshacer);
  const guardarBtn = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Guardar' });
  guardarBtn.addEventListener('click', guardar);
  const estado = Object.assign(document.createElement('span'), { id: 'estado', className: 'nota' });
  barra.append(deshacerBtn, guardarBtn, estado);

  const zona = document.createElement('div');
  zona.className = 'zona-lienzo';
  const propiedades = document.createElement('div');
  propiedades.className = 'propiedades-caja';
  const operaciones = {
    seleccion,
    alSeleccionar(k) { seleccion = k; pintarEditor(); },
    alMover(k, cambios) { cambiar((p) => Object.assign(p.slots[k], cambios)); },
    alRedimensionar(k, cambios) { cambiar((p) => Object.assign(p.slots[k], cambios)); },
  };
  pintarPagina(zona, pagina, operaciones);
  if (seleccion !== null && pagina.slots[seleccion]) {
    pintarPropiedades(propiedades, pagina.slots[seleccion], seleccion, (k, campo, valor) => {
      cambiar((p) => { p.slots[k][campo] = valor; });
    });
  } else {
    propiedades.append(Object.assign(document.createElement('p'), { className: 'nota', textContent: 'Elige un hueco para ver sus propiedades.' }));
  }
  const layout = document.createElement('div');
  layout.className = 'editor';
  layout.append(zona, propiedades);
  cont.replaceChildren(barra, layout);
  marcar(sucio ? 'Cambios sin guardar' : '');
}

async function guardar() {
  if (!juegoActual) return;
  try {
    const r = await almacen.save(juegoActual.id, juegoActual, revActual, `Editar la página ${juegoActual.template.pages[paginaIdx].id}`);
    revActual = r.rev;
    sucio = false;
    marcar('Guardado');
  } catch (e) {
    marcar(e.code === 'conflict' ? 'Hay cambios nuevos en el juego: recarga para verlos' : `No se guardó: ${e.message}`);
  }
}

document.addEventListener('keydown', (ev) => {
  if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'z' && !ev.target.matches('input, textarea')) {
    ev.preventDefault();
    deshacer();
  }
});

// Acceso de pruebas: el juego y el almacén en uso (solo lectura en la práctica).
window.pmeCreador = {
  get juego() { return juegoActual; },
  get almacen() { return almacen; },
  get sucio() { return sucio; },
};

// Arranque (al final: usa las funciones y constantes de arriba).
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
