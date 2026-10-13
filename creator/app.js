// Creador de juegos (F4 de PLAN-CREADOR-2.md): sustituye al editor antiguo. Pantallas de la maqueta aprobada:
// inicio y biblioteca, diseñar página, formulario, puzzles, vista previa y revisión de lo que hizo Claude.
//
// Los juegos son pme-game/2 en el repositorio privado de juegos (almacén de GitHub, con el token del cliente) o en
// memoria (?almacen=memoria: pruebas y demostración). La lógica de edición es la misma que la de las herramientas de
// Claude (tools/game/operaciones.mjs) y cada cambio se valida antes de aceptarlo con las mismas reglas: lo que guarda
// el creador siempre se puede seguir editando desde Claude Code, y al revés.

import { crearAlmacenMemoria } from './store/memory.js';
import { crearAlmacenGitHub } from './store/github.js';
import { cargarBiblioteca, TIPOS } from './biblioteca.js';
import { cargarRegistro } from './fuentes.js';
import { validar } from './validar.js';
import { crearOperaciones } from '../tools/game/operaciones.mjs';
import { h, icono, enIdioma, haceCuanto, ESTADOS } from './dom.js';
import { pintarInicio } from './vistas/inicio.js';
import { pintarPaginas } from './vistas/paginas.js';
import { pintarFormulario } from './vistas/formulario.js';
import { pintarPuzzles } from './vistas/puzzles.js';
import { pintarPrevia } from './vistas/previa.js';
import { pintarRevision } from './vistas/revision.js';

const CLAVE_TOKEN = 'pme-token';
const CLAVE_REPO = 'pme-repo';
const PARAMS = new URLSearchParams(location.search);
const GUARDAR_MS = Number(PARAMS.get('guardar')) || 2500;
const SONDEO_MS = Number(PARAMS.get('sondeo')) || 20000;
const MAX_DESHACER = 150;
// Juegos del almacén en memoria (pruebas y demostración local).
const FUENTES_MEMORIA = ['../ensayos/f3/cumple-mision-secreta/game.json', '../games/final3/game.json'];

const leerSesion = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
const guardarSesion = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* sin sessionStorage: se pedirá de nuevo */ } };
const $ = (id) => document.getElementById(id);
/** replaceChildren sin los huecos (null/false), que el DOM escribiría como texto. */
const poner = (el, ...hijos) => el.replaceChildren(...hijos.flat().filter((x) => x !== null && x !== undefined && x !== false));

/** Estado del creador. Las vistas lo reciben entero (app) y piden los cambios con app.cambiar(). */
const app = {
  almacen: null, biblioteca: null, registro: null, ops: null,
  juegos: [], juego: null, rev: null, validacion: { errores: [], avisos: [] },
  pila: [], sucio: false, guardando: false, guardadoEn: null, novedades: false,
  ruta: { vista: 'inicio' },
  ui: {}, // estado de cada vista (página abierta, elemento seleccionado, idioma, ejemplo…)
};

/* ---------------- Avisos flotantes y diálogos ---------------- */

app.aviso = function aviso(texto, { tipo = '', lista = null, ms = 5000 } = {}) {
  const el = h('div', { class: `aviso-flotante ${tipo}` }, texto, lista && lista.length ? h('ul', {}, lista.slice(0, 6).map((x) => h('li', {}, x))) : null);
  $('avisos').append(el);
  setTimeout(() => el.remove(), ms + (lista ? 3000 : 0));
};

/** Abre el diálogo con un contenido; devuelve una promesa que resuelve con lo que pase a cerrar(valor). */
app.dialogo = function dialogo(construir, { ancho = false } = {}) {
  const d = $('dialogo');
  d.className = ancho ? 'ancho' : '';
  return new Promise((resolve) => {
    const cerrar = (valor) => { d.close(); resolve(valor); };
    d.replaceChildren(construir(cerrar));
    d.onclose = () => resolve(undefined);
    d.showModal();
  });
};

/* ---------------- Cambios: validar, deshacer, guardar ---------------- */

function revalidar() {
  app.validacion = validar(app.juego, { biblioteca: app.biblioteca, registro: app.registro });
}

/**
 * Aplica un cambio sobre una copia del juego. fn(copia) puede devolver un resultado; si lanza, el cambio no se hace.
 * Si el cambio añade errores del validador, se rechaza (como las herramientas de Claude). copias: ficheros de la
 * biblioteca que hay que llevar a la carpeta del juego (los devuelven las operaciones).
 */
app.cambiar = async function cambiar(descripcion, fn) {
  if (!app.juego || app.soloLectura) return null;
  const antes = app.juego;
  const copia = structuredClone(antes);
  let r;
  try {
    r = await fn(copia);
  } catch (e) {
    app.aviso(`No se ha hecho: ${e.message}`, { tipo: 'error', lista: Array.isArray(e.detalles) ? e.detalles : null });
    return null;
  }
  const despues = validar(copia, { biblioteca: app.biblioteca, registro: app.registro });
  const nuevos = despues.errores.filter((e) => !app.validacion.errores.includes(e));
  if (nuevos.length) {
    app.aviso(`No se ha hecho «${descripcion}»: dejaría el juego con errores`, { tipo: 'error', lista: nuevos });
    return null;
  }
  const copias = r && r.copias;
  if (copias && copias.length) {
    try {
      for (const c of copias) {
        const bytes = await app.biblioteca.bytes(c.tipo, c.coleccion, c.rel);
        await app.almacen.escribirFichero(app.juego.id, c.destino, bytes, `Copiar ${c.destino} de la biblioteca`, { sobrescribir: false });
      }
    } catch (e) {
      app.aviso(`No se ha hecho: no se pudo copiar un fichero de la biblioteca (${e.message})`, { tipo: 'error' });
      return null;
    }
  }
  app.pila.push({ juego: antes, descripcion });
  if (app.pila.length > MAX_DESHACER) app.pila.shift();
  app.juego = copia;
  app.validacion = despues;
  marcarSucio(descripcion);
  repintar();
  return r && Object.prototype.hasOwnProperty.call(r, 'resultado') ? r.resultado : r;
};

app.deshacer = function deshacer() {
  const ultimo = app.pila.pop();
  if (!ultimo) return;
  app.juego = ultimo.juego;
  revalidar();
  marcarSucio(`Deshacer: ${ultimo.descripcion}`);
  app.aviso(`Deshecho: ${ultimo.descripcion}`);
  repintar();
};

let temporizador = null;
let ultimaDescripcion = '';
function marcarSucio(descripcion) {
  app.sucio = true;
  ultimaDescripcion = descripcion;
  clearTimeout(temporizador);
  temporizador = setTimeout(guardar, GUARDAR_MS);
  pintarCabecera();
}

async function guardar() {
  if (!app.sucio || app.guardando || !app.juego) return;
  app.guardando = true;
  pintarCabecera();
  try {
    const { rev } = await app.almacen.save(app.juego.id, app.juego, app.rev, `Creador: ${ultimaDescripcion}`);
    app.rev = rev;
    app.sucio = false;
    app.guardadoEn = new Date();
  } catch (e) {
    if (e.code === 'conflict') { app.novedades = true; app.aviso('Hay una versión más nueva del juego (quizá de Claude). Tus últimos cambios no se han guardado: recarga para verla.', { tipo: 'error', ms: 9000 }); }
    else app.aviso(`No se pudo guardar: ${e.message}`, { tipo: 'error' });
  } finally {
    app.guardando = false;
    pintarCabecera();
  }
}
app.guardarYa = async () => { clearTimeout(temporizador); await guardar(); };

/** Recarga el juego desde el almacén (tras un aviso de versión nueva). */
app.recargar = async function recargar() {
  const { game, rev } = await app.almacen.load(app.juego.id);
  app.juego = game;
  app.rev = rev;
  app.sucio = false;
  app.novedades = false;
  app.pila = [];
  revalidar();
  repintar();
};

setInterval(async () => {
  if (!app.juego || app.sucio || app.guardando || app.novedades) return;
  try {
    if ((await app.almacen.latestRev(app.juego.id)) !== app.rev) { app.novedades = true; pintarCabecera(); }
  } catch { /* sin red: se intenta en el siguiente sondeo */ }
}, SONDEO_MS);

window.addEventListener('beforeunload', (e) => { if (app.sucio) { guardar(); e.preventDefault(); } });
document.addEventListener('keydown', (e) => {
  const enCampo = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !enCampo) { e.preventDefault(); app.deshacer(); }
});

/* ---------------- Navegación ---------------- */

function leerRuta() {
  const partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (partes[0] === 'juego' && partes[1]) return { vista: partes[2] || 'paginas', id: partes[1], sub: partes[3] || null };
  return { vista: 'inicio' };
}
app.navegar = (hash) => { if (location.hash === hash) repintar(); else location.hash = hash; };
app.rutaJuego = (vista, sub = null) => `#/juego/${encodeURIComponent(app.juego.id)}/${vista}${sub ? `/${encodeURIComponent(sub)}` : ''}`;

async function alCambiarRuta() {
  const ruta = leerRuta();
  if (app.sucio && (!ruta.id || !app.juego || ruta.id !== app.juego.id)) await app.guardarYa();
  app.ruta = ruta;
  if (ruta.id && (!app.juego || app.juego.id !== ruta.id)) {
    try {
      const { game, rev } = await app.almacen.load(ruta.id);
      app.juego = game;
      app.rev = rev;
      app.pila = [];
      app.sucio = false;
      app.novedades = false;
      app.ui = {};
      app.soloLectura = game.schema !== 'pme-game/2' || game.status !== 'borrador';
      revalidar();
    } catch (e) {
      app.aviso(`No se pudo abrir el juego: ${e.message}`, { tipo: 'error' });
      location.hash = '#/';
      return;
    }
  }
  if (!ruta.id) { app.juego = null; app.juegos = await app.almacen.list().catch(() => []); }
  repintar();
}
window.addEventListener('hashchange', alCambiarRuta);

/* ---------------- Cabecera ---------------- */

function pintarCabecera() {
  const cab = $('cabecera');
  if (!app.almacen) { cab.replaceChildren(marca()); return; }
  if (!app.juego) {
    poner(cab, marca(),
      h('nav', { class: 'nav', 'aria-label': 'Principal' },
        h('a', { href: '#/', 'aria-current': app.ruta.vista === 'inicio' ? 'page' : null }, 'Biblioteca'),
        h('a', { href: './guia-token.html', target: '_blank', rel: 'noopener' }, 'Ayuda')),
      h('div', { class: 'relleno' }),
      h('span', { class: 'repo-chip' }, app.almacen.tipo === 'memoria' ? 'Demostración (sin guardar en GitHub)' : `Repositorio ${leerSesion(CLAVE_REPO) || ''}`),
      app.almacen.tipo === 'github' ? h('button', { class: 'boton pequeno', type: 'button', onclick: salir }, 'Salir') : null);
    return;
  }
  const g = app.juego;
  const porRevisar = Math.max(0, (g.changes || []).length - ((g.review && g.review.changes) || 0));
  const estado = app.soloLectura
    ? (g.schema !== 'pme-game/2' ? 'Formato antiguo: solo lectura (duplícalo para editarlo)' : `${ESTADOS[g.status] || g.status}: solo lectura`)
    : app.guardando ? 'Guardando…' : app.sucio ? 'Cambios sin guardar' : app.guardadoEn ? `Borrador · guardado ${haceCuanto(app.guardadoEn)}` : 'Borrador';
  const enlace = (vista, texto, extra = null, clase = '') => h('a', { href: app.rutaJuego(vista), class: clase, 'aria-current': app.ruta.vista === vista ? 'page' : null }, texto, extra);
  poner(cab,
    h('a', { href: '#/', class: 'boton-icono', 'aria-label': 'Volver a la biblioteca', style: { background: 'var(--verde)', borderColor: 'var(--verde)' } }, icono('atras', { color: '#FFFFFF', tam: 18 })),
    h('div', { class: 'juego-titulo' }, h('span', { class: 'nombre' }, enIdioma(g.name)), h('span', { class: 'estado', 'data-prueba': 'estado-guardado' }, estado)),
    h('nav', { class: 'nav', 'aria-label': 'Partes del juego' },
      enlace('paginas', 'Páginas'), enlace('formulario', 'Formulario'), enlace('puzzles', 'Puzzles y soluciones'), enlace('previa', 'Vista previa'),
      enlace('revisar', 'Revisar', porRevisar ? h('span', { class: 'contador' }, String(porRevisar)) : null, 'revisar')),
    h('div', { class: 'relleno' }),
    app.novedades ? h('button', { class: 'boton contorno-claude', type: 'button', onclick: () => app.recargar() }, 'Hay cambios nuevos: recargar') : null,
    app.validacion.errores.length ? h('a', { class: 'pastilla error', href: app.rutaJuego('previa') }, `${app.validacion.errores.length} errores`) : null,
    !app.soloLectura ? h('button', { class: 'boton', type: 'button', disabled: !app.pila.length, onclick: () => app.deshacer(), title: 'Deshacer (Ctrl+Z)' }, icono('deshacer', { tam: 18 }), 'Deshacer') : null,
    !app.soloLectura ? h('button', { class: 'boton primario', type: 'button', onclick: enviarAlEstudio }, 'Enviar al estudio') : null);
}

function marca() {
  return h('a', { class: 'marca', href: '#/' },
    h('span', { class: 'logo' }, icono('llave', { color: '#FFFFFF', tam: 20 })),
    h('span', { class: 'nombre' }, 'PrintMyEscape ', h('span', {}, 'Creador')));
}

async function enviarAlEstudio() {
  await app.guardarYa();
  const v = validar(app.juego, { biblioteca: app.biblioteca, registro: app.registro, submit: true });
  if (v.errores.length) {
    app.aviso('Aún no se puede enviar: hay que corregir esto', { tipo: 'error', lista: v.errores, ms: 9000 });
    app.navegar(app.rutaJuego('previa'));
    return;
  }
  const nota = await app.dialogo((cerrar) => {
    const ta = h('textarea', { rows: 4, id: 'nota-envio' });
    return h('form', { class: 'dialogo', method: 'dialog', onsubmit: (e) => { e.preventDefault(); cerrar(ta.value.trim() || 'Juego listo para revisar.'); } },
      h('h2', {}, 'Enviar al estudio'),
      h('p', { class: 'tenue' }, 'El estudio recibe el juego para revisarlo y prepararlo. Mientras, ya no se puede editar aquí.'),
      h('div', { class: 'campo' }, h('label', { for: 'nota-envio' }, 'Nota para el estudio (opcional)'), ta),
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Enviar')));
  });
  if (!nota) return;
  try {
    const g = { ...app.juego, status: 'enviado' };
    const { rev } = await app.almacen.save(g.id, g, app.rev, 'Enviar al estudio');
    app.juego = g;
    app.rev = rev;
    app.soloLectura = true;
    const { url } = await app.almacen.submit(g.id, nota);
    app.aviso(`Enviado al estudio: ${url}`, { tipo: 'bien', ms: 9000 });
    repintar();
  } catch (e) {
    app.aviso(`No se pudo enviar: ${e.message}`, { tipo: 'error' });
  }
}

/* ---------------- Pantallas ---------------- */

const VISTAS = { paginas: pintarPaginas, formulario: pintarFormulario, puzzles: pintarPuzzles, previa: pintarPrevia, revisar: pintarRevision };

function repintar() {
  pintarCabecera();
  const principal = $('principal');
  if (!app.almacen) return;
  if (!app.juego) { pintarInicio(principal, app); return; }
  const vista = VISTAS[app.ruta.vista] || pintarPaginas;
  vista(principal, app);
}
app.repintar = repintar;

/* ---------------- Entrada ---------------- */

function salir() {
  guardarSesion(CLAVE_TOKEN, null);
  location.hash = '#/';
  location.reload();
}

function pintarEntrada(mensaje = '') {
  const repo = h('input', { id: 'repo', class: 'entrada', placeholder: 'estudio/juegos', value: leerSesion(CLAVE_REPO) || '', autocomplete: 'off', required: true });
  const token = h('input', { id: 'token', class: 'entrada', type: 'password', autocomplete: 'off', required: true });
  $('principal').replaceChildren(h('form', { class: 'entrada-caja', onsubmit: (e) => { e.preventDefault(); entrar(repo.value.trim(), token.value.trim()); } },
    h('h1', {}, 'Entrar al creador'),
    h('p', { class: 'tenue' }, 'El creador trabaja sobre vuestro repositorio privado de juegos en GitHub. Hace falta un token de acceso: se guarda solo en esta pestaña y se borra al cerrarla.'),
    mensaje ? h('div', { class: 'mensaje error', role: 'alert' }, mensaje) : null,
    h('div', { class: 'campo' }, h('label', { for: 'repo' }, 'Repositorio (propietario/nombre)'), repo),
    h('div', { class: 'campo' }, h('label', { for: 'token' }, 'Token de acceso'), token,
      h('span', { class: 'ayuda' }, '¿No tienes token? ', h('a', { href: './guia-token.html', target: '_blank', rel: 'noopener' }, 'Guía paso a paso para crearlo'), '.')),
    h('button', { class: 'boton primario', type: 'submit' }, 'Entrar')));
  pintarCabecera();
}

async function entrar(repoTexto, token) {
  const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repoTexto);
  if (!m) return pintarEntrada('El repositorio se escribe como propietario/nombre, por ejemplo estudio/juegos.');
  const almacen = crearAlmacenGitHub({ owner: m[1], repo: m[2], token });
  try {
    await almacen.list();
  } catch (e) {
    return pintarEntrada(e.code === 'auth' ? 'GitHub no acepta ese token: revisa que no haya caducado y que tenga acceso al repositorio.' : `No se pudo leer el repositorio: ${e.message}`);
  }
  guardarSesion(CLAVE_REPO, repoTexto);
  guardarSesion(CLAVE_TOKEN, token);
  await arrancar(almacen);
}

async function arrancar(almacen) {
  app.almacen = almacen;
  $('principal').replaceChildren(h('div', { class: 'inicio' }, h('p', { class: 'tenue' }, 'Cargando la biblioteca…')));
  [app.registro, app.biblioteca] = await Promise.all([cargarRegistro(), cargarBiblioteca(almacen)]);
  app.ops = crearOperaciones({ buscar: app.biblioteca.buscar, entradas: app.biblioteca.entradas });
  if (app.biblioteca.errores.length) app.aviso('Parte de la biblioteca no se ha podido leer', { tipo: 'error', lista: app.biblioteca.errores });
  await alCambiarRuta();
}

(async function inicio() {
  if (PARAMS.get('almacen') === 'memoria') {
    await arrancar(crearAlmacenMemoria(FUENTES_MEMORIA, { base: new URL('../biblioteca/', location.href).href, indice: '/__biblioteca' }));
    return;
  }
  const token = leerSesion(CLAVE_TOKEN);
  const repo = leerSesion(CLAVE_REPO);
  if (token && repo) {
    const m = /^([\w.-]+)\/([\w.-]+)$/.exec(repo);
    if (m) {
      const almacen = crearAlmacenGitHub({ owner: m[1], repo: m[2], token });
      try {
        await almacen.list();
      } catch (e) {
        if (e.code === 'auth') { guardarSesion(CLAVE_TOKEN, null); pintarEntrada('GitHub ya no acepta tu token (quizá ha caducado). Pega uno nuevo.'); return; }
      }
      await arrancar(almacen);
      return;
    }
  }
  pintarEntrada();
})();

export { app, TIPOS };
