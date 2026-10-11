// Editor de juegos, esqueleto (T5.1): lista de juegos, páginas de un juego y detalle de una página.
// Todo el texto de los juegos se escribe con textContent (los datos vienen de fuera).
import { crearAlmacenMemoria } from './store/memory.js';

// Juegos de la fase de pruebas: el juego final y el de prueba de capas.
const almacen = crearAlmacenMemoria(['../games/final3/game.json', '../tools/qa/fixtures/games/capas/game.json']);

const $ = (id) => document.getElementById(id);

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

let juegoActual = null;

async function mostrarJuegos() {
  const ul = $('juegos');
  try {
    const lista = await almacen.list();
    ul.replaceChildren(...lista.map((j) => boton(j.name?.es || j.id, j.id, false, () => abrirJuego(j.id))));
  } catch (e) { error(ul, e); }
}

async function abrirJuego(id) {
  const ul = $('juegos');
  for (const li of ul.children) li.querySelector('button').setAttribute('aria-current', String(li.querySelector('small').textContent === id));
  try {
    juegoActual = await almacen.load(id);
    mostrarPaginas();
  } catch (e) { error($('paginas'), e); }
}

function mostrarPaginas() {
  const pages = juegoActual.template.pages;
  $('paginas').replaceChildren(...pages.map((p, i) => {
    const capas = (p.layers || []).length;
    const sub = `${(p.slots || []).length} huecos · ${capas} capas`;
    return boton(p.title || p.id, sub, false, () => mostrarPagina(i));
  }));
  $('detalle').replaceChildren(Object.assign(document.createElement('p'), { className: 'vacio', textContent: 'Elige una página.' }));
}

function filaDL(dl, clave, valor) {
  const dt = document.createElement('dt'); dt.textContent = clave;
  const dd = document.createElement('dd'); dd.textContent = valor;
  dl.append(dt, dd);
}

function mostrarPagina(i) {
  const p = juegoActual.template.pages[i];
  [...$('paginas').children].forEach((li, k) => li.querySelector('button').setAttribute('aria-current', String(k === i)));
  const cont = $('detalle');
  const dl = document.createElement('dl');
  filaDL(dl, 'Identificador', p.id);
  filaDL(dl, 'Tamaño', juegoActual.template.pageSize);
  filaDL(dl, 'Huecos', String((p.slots || []).length));
  filaDL(dl, 'Capas', String((p.layers || []).length));
  const h = document.createElement('h3'); h.textContent = 'Capas';
  const capas = document.createElement('ul');
  for (const c of p.layers || []) {
    const li = document.createElement('li');
    li.textContent = `${c.asset} · x ${c.x} y ${c.y} · ${c.w} × ${c.h}${c.angle ? ` · ${c.angle}°` : ''}`;
    capas.append(li);
  }
  cont.replaceChildren(dl, h, capas);
}

mostrarJuegos();
