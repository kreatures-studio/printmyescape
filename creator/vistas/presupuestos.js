// Presupuestos del estudio: lista, editor (líneas de arte, maquetación, programación y pruebas con sus horas y
// tarifas), tarifas y descarga en PDF o Excel. Se guardan en el repositorio de juegos (presupuestos/ de la rama
// principal), así el estudio y el cliente ven los mismos. Cálculos, PDF y Excel: tools/presupuesto/.

import { h, icono, enIdioma } from '../dom.js';
import { fuentesDelMotor } from '../fuentes.js';
import {
  SECCIONES, ESTADOS, completarTarifas, conceptoDe, lineaDe, conComplejidad, totales, siguienteId, presupuestoNuevo,
  lineasDesdeJuego, lineasCambioDeTema, erroresDe, euros, horasTexto, hoy,
} from '../../tools/presupuesto/calculo.mjs';
import { presupuestoPdf } from '../../tools/presupuesto/pdf.mjs';
import { presupuestoXlsx } from '../../tools/presupuesto/xlsx.mjs';

const COMPLEJIDADES = [['sencilla', 'Sencilla'], ['media', 'Media'], ['compleja', 'Compleja']];

function estado(app) {
  return app.ui.presupuestos || (app.ui.presupuestos = { lista: null, tarifas: null, actual: null, sucio: false, cargando: false });
}

async function cargar(app, { forzar = false } = {}) {
  const st = estado(app);
  if (st.lista && st.tarifas && !forzar) return;
  const [lista, guardadas] = await Promise.all([app.almacen.listarPresupuestos(), app.almacen.leerTarifas()]);
  st.lista = lista.sort((a, b) => (b.id > a.id ? 1 : -1));
  st.tarifas = completarTarifas(guardadas);
  st.tarifasGuardadas = !!guardadas;
}

/** Pantalla de presupuestos: lista (#/presupuestos), tarifas (…/tarifas) o un presupuesto (…/P-2026-001). */
export async function pintarPresupuestos(raiz, app) {
  const st = estado(app);
  const sub = app.ruta.sub;
  if (!st.lista || !st.tarifas) {
    raiz.replaceChildren(h('div', { class: 'inicio' }, h('p', { class: 'tenue' }, 'Cargando los presupuestos…')));
    try { await cargar(app); } catch (e) {
      raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'mensaje error' }, `No se pudieron leer los presupuestos: ${e.message}`)));
      return;
    }
  }
  if (sub === 'tarifas') return pintarTarifas(raiz, app);
  if (sub) {
    if (!st.actual || st.actual.id !== sub) {
      const p = st.lista.find((x) => x.id === sub);
      if (!p) { raiz.replaceChildren(h('div', { class: 'inicio' }, h('div', { class: 'mensaje error' }, `No hay un presupuesto ${sub}.`), h('a', { href: '#/presupuestos' }, 'Volver a los presupuestos'))); return; }
      st.actual = structuredClone(p);
      st.sucio = false;
    }
    return pintarEditor(raiz, app);
  }
  return pintarLista(raiz, app);
}

/* ---------------- Lista ---------------- */

function pintarLista(raiz, app) {
  const st = estado(app);
  const filas = st.lista.map((p) => {
    const t = totales(p);
    return h('tr', { 'data-presupuesto': p.id },
      h('td', {}, h('a', { href: `#/presupuestos/${encodeURIComponent(p.id)}` }, p.id)),
      h('td', {}, p.titulo || '—'),
      h('td', {}, (p.cliente && p.cliente.nombre) || '—'),
      h('td', {}, p.juego || '—'),
      h('td', {}, p.fecha || ''),
      h('td', {}, h('span', { class: `pastilla ${p.estado === 'aceptado' ? 'verde' : p.estado === 'rechazado' ? 'error' : ''}` }, ESTADOS[p.estado] || p.estado)),
      h('td', { class: 'num' }, euros(t.total, st.tarifas.moneda)));
  });
  raiz.replaceChildren(h('div', { class: 'inicio presupuestos' },
    h('section', {},
      h('div', { class: 'titulo-bloque' }, h('h1', {}, 'Presupuestos'),
        h('div', { class: 'relleno' }),
        h('a', { class: 'boton', href: '#/presupuestos/tarifas' }, 'Tarifas'),
        h('button', { class: 'boton primario', type: 'button', onclick: () => nuevo(app) }, icono('mas', { color: '#FFFFFF', tam: 18 }), 'Nuevo presupuesto')),
      h('p', { class: 'sub' }, 'Arte, maquetación, programación y pruebas, con las horas de cada pieza y vuestras tarifas. Se guardan en el repositorio de juegos y se descargan en PDF o en Excel.'),
      !st.tarifasGuardadas ? h('div', { class: 'info' }, 'Aún usáis las tarifas de partida (una referencia de mercado). Revisadlas en ', h('a', { href: '#/presupuestos/tarifas' }, 'Tarifas'), ' antes de enviar un presupuesto.') : null,
      st.lista.length
        ? h('table', { class: 'tabla-presupuestos' },
          h('thead', {}, h('tr', {}, ['Número', 'Título', 'Cliente', 'Juego', 'Fecha', 'Estado', 'Total'].map((x, i) => h('th', { class: i === 6 ? 'num' : null }, x)))),
          h('tbody', {}, filas))
        : h('div', { class: 'vacio' }, 'Todavía no hay presupuestos. Crea el primero con «Nuevo presupuesto».'))));
}

/** Diálogo de presupuesto nuevo: título, cliente, juego y con qué empezar. También lo usan Revisar y Tema. */
export async function nuevo(app, { juego = null, empezar = null, titulo = '', tema = '' } = {}) {
  const st = estado(app);
  await cargar(app);
  const juegos = app.juegos && app.juegos.length ? app.juegos : await app.almacen.list().catch(() => []);
  const datos = await app.dialogo((cerrar) => {
    const tit = h('input', { id: 'pres-titulo', value: titulo, required: true });
    const cli = h('input', { id: 'pres-cliente', placeholder: 'Nombre del cliente' });
    const jue = h('select', { id: 'pres-juego' }, h('option', { value: '' }, 'Ninguno'),
      juegos.map((j) => h('option', { value: j.id, selected: j.id === juego }, `${enIdioma(j.name)} (${j.id})`)));
    const emp = h('select', { id: 'pres-empezar' },
      h('option', { value: 'blanco', selected: !empezar || empezar === 'blanco' }, 'En blanco'),
      h('option', { value: 'presupuestar', selected: empezar === 'presupuestar' }, 'Con lo «A presupuestar» del juego'),
      h('option', { value: 'tema', selected: empezar === 'tema' }, 'Con un cambio de tema del juego'));
    return h('form', { class: 'dialogo', onsubmit: (e) => { e.preventDefault(); cerrar({ titulo: tit.value.trim(), cliente: cli.value.trim(), juego: jue.value || null, empezar: emp.value }); } },
      h('h2', {}, 'Nuevo presupuesto'),
      h('div', { class: 'campo' }, h('label', { for: 'pres-titulo' }, 'Título'), tit),
      h('div', { class: 'campo' }, h('label', { for: 'pres-cliente' }, 'Cliente'), cli),
      h('div', { class: 'campo' }, h('label', { for: 'pres-juego' }, 'Juego'), jue),
      h('div', { class: 'campo' }, h('label', { for: 'pres-empezar' }, 'Empezar'), emp,
        h('span', { class: 'ayuda' }, 'Las líneas se pueden cambiar después: concepto, complejidad, cantidad, horas y tarifa.')),
      h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Crear')));
  });
  if (!datos || !datos.titulo) return;
  const p = presupuestoNuevo(st.tarifas, siguienteId(st.lista.map((x) => x.id)), datos);
  if (datos.juego && datos.empezar !== 'blanco') {
    try {
      const g = app.juego && app.juego.id === datos.juego ? app.juego : (await app.almacen.load(datos.juego)).game;
      p.lineas = datos.empezar === 'tema' ? lineasCambioDeTema(st.tarifas, g, tema || (g.theme && g.theme.name) || '') : lineasDesdeJuego(st.tarifas, g);
      if (datos.empezar === 'presupuestar' && !p.lineas.length) app.aviso('El juego no tiene nada «A presupuestar»: el presupuesto empieza en blanco.');
    } catch (e) { app.aviso(`No se pudo leer el juego: ${e.message}`, { tipo: 'error' }); }
  }
  try {
    await app.almacen.guardarPresupuesto(p, `Presupuesto ${p.id}: ${p.titulo}`);
  } catch (e) { app.aviso(`No se pudo crear: ${e.message}`, { tipo: 'error' }); return; }
  st.lista.unshift(p);
  st.actual = structuredClone(p);
  st.sucio = false;
  app.navegar(`#/presupuestos/${encodeURIComponent(p.id)}`);
}

/* ---------------- Editor ---------------- */

function pintarEditor(raiz, app) {
  const st = estado(app);
  const p = st.actual;
  const tf = st.tarifas;
  const t = totales(p);
  const cambiar = (fn) => { fn(p); st.sucio = true; pintarEditor(raiz, app); };
  const campo = (id, etiqueta, ctl, ayuda = null) => h('div', { class: 'campo' }, h('label', { for: id }, etiqueta), ctl, ayuda ? h('span', { class: 'ayuda' }, ayuda) : null);
  const entrada = (id, valor, alCambiar, extra = {}) => h('input', { id, value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, e.target.value)), ...extra });
  const numero = (id, valor, alCambiar, extra = {}) => entrada(id, valor, (x, v) => alCambiar(x, v === '' ? 0 : Number(String(v).replace(',', '.'))), { type: 'number', step: 'any', min: 0, ...extra });
  const opcionesConcepto = (sel) => SECCIONES.map((s) => h('optgroup', { label: s.nombre },
    tf.conceptos.filter((c) => c.seccion === s.id).map((c) => h('option', { value: c.id, selected: c.id === sel }, c.nombre))));

  const filas = [];
  for (const s of t.porSeccion) {
    filas.push(h('tr', { class: 'seccion' }, h('td', { colspan: 8 }, s.nombre), h('td', { class: 'num' }, euros(s.importe, tf.moneda)), h('td', {})));
    for (const l of s.lineas) {
      const i = p.lineas.findIndex((x) => x.id === l.id);
      const c = conceptoDe(tf, l.concepto);
      filas.push(h('tr', { 'data-linea': l.id },
        h('td', {}, h('select', { 'aria-label': 'Concepto', onchange: (e) => cambiar((x) => { const n = lineaDe(tf, e.target.value, { descripcion: x.lineas[i].descripcion, complejidad: x.lineas[i].complejidad, cantidad: x.lineas[i].cantidad, id: x.lineas[i].id }); x.lineas[i] = n; }) }, opcionesConcepto(l.concepto)),
          c && c.ayuda ? h('div', { class: 'ayuda-linea' }, c.ayuda) : null),
        h('td', {}, h('textarea', { 'aria-label': 'Descripción', rows: 3, value: l.descripcion || '', onchange: (e) => cambiar((x) => { x.lineas[i].descripcion = e.target.value; }) })),
        h('td', {}, h('select', { 'aria-label': 'Complejidad', onchange: (e) => cambiar((x) => { x.lineas[i] = conComplejidad(tf, x.lineas[i], e.target.value); }) },
          COMPLEJIDADES.map(([v, n]) => h('option', { value: v, selected: (l.complejidad || 'media') === v }, n)))),
        h('td', {}, numero(`can-${l.id}`, l.cantidad, (x, v) => { x.lineas[i].cantidad = v; }, { 'aria-label': 'Cantidad', class: 'corto' }), h('div', { class: 'ayuda-linea' }, c ? c.unidad : '')),
        h('td', {}, numero(`hor-${l.id}`, l.horas, (x, v) => { x.lineas[i].horas = v; }, { 'aria-label': 'Horas por unidad', class: 'corto' })),
        h('td', {}, numero(`tar-${l.id}`, l.tarifa, (x, v) => { x.lineas[i].tarifa = v; }, { 'aria-label': 'Tarifa por hora', class: 'corto' })),
        h('td', { class: 'num' }, euros(l.precioUnidad, tf.moneda)),
        h('td', { class: 'num' }, horasTexto(l.horasTotal)),
        h('td', { class: 'num', 'data-importe': l.importe }, euros(l.importe, tf.moneda)),
        h('td', {}, h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Quitar la línea', title: 'Quitar la línea', onclick: () => cambiar((x) => { x.lineas.splice(i, 1); }) }, icono('basura', { tam: 16 })))));
    }
  }
  const nuevoConcepto = h('select', { id: 'pres-nuevo-concepto', 'aria-label': 'Concepto de la línea nueva' }, opcionesConcepto('objeto'));
  const juego = p.juego ? (app.juegos || []).find((j) => j.id === p.juego) : null;
  const anadirDelJuego = async (modo) => {
    try {
      const g = (await app.almacen.load(p.juego)).game;
      const nuevas = modo === 'tema' ? lineasCambioDeTema(tf, g, (g.theme && g.theme.name) || '') : lineasDesdeJuego(tf, g);
      if (!nuevas.length) { app.aviso('El juego no tiene nada «A presupuestar».'); return; }
      cambiar((x) => { x.lineas.push(...nuevas); });
    } catch (e) { app.aviso(`No se pudo leer el juego: ${e.message}`, { tipo: 'error' }); }
  };

  raiz.replaceChildren(h('div', { class: 'inicio presupuestos editor-presupuesto' },
    h('div', { class: 'titulo-bloque' },
      h('a', { href: '#/presupuestos', class: 'boton-icono', 'aria-label': 'Volver a los presupuestos' }, icono('atras', { tam: 18 })),
      h('h1', {}, `Presupuesto ${p.id}`),
      h('span', { class: 'tenue', 'data-prueba': 'estado-presupuesto' }, st.sucio ? 'Cambios sin guardar' : 'Guardado'),
      h('div', { class: 'relleno' }),
      h('button', { class: 'boton primario', type: 'button', disabled: !st.sucio, 'data-guardar': '1', onclick: () => guardar(app, raiz) }, 'Guardar'),
      h('button', { class: 'boton', type: 'button', 'data-pdf': '1', onclick: () => descargar(app, 'pdf') }, 'Descargar PDF'),
      h('button', { class: 'boton', type: 'button', 'data-excel': '1', onclick: () => descargar(app, 'xlsx') }, 'Descargar Excel'),
      h('button', { class: 'boton', type: 'button', onclick: () => duplicar(app) }, 'Duplicar'),
      h('button', { class: 'boton', type: 'button', onclick: () => borrar(app) }, 'Borrar')),

    h('section', { class: 'rejilla-datos' },
      campo('pres-titulo', 'Título', entrada('pres-titulo', p.titulo, (x, v) => { x.titulo = v; })),
      campo('pres-estado', 'Estado', h('select', { id: 'pres-estado', onchange: (e) => cambiar((x) => { x.estado = e.target.value; }) },
        Object.entries(ESTADOS).map(([v, n]) => h('option', { value: v, selected: p.estado === v }, n)))),
      campo('pres-cliente', 'Cliente', entrada('pres-cliente', p.cliente && p.cliente.nombre, (x, v) => { x.cliente = { ...(x.cliente || {}), nombre: v }; })),
      campo('pres-contacto', 'Contacto', entrada('pres-contacto', p.cliente && p.cliente.contacto, (x, v) => { x.cliente = { ...(x.cliente || {}), contacto: v }; }, { placeholder: 'Correo o teléfono' })),
      campo('pres-fecha', 'Fecha', entrada('pres-fecha', p.fecha, (x, v) => { x.fecha = v || hoy(); }, { type: 'date' })),
      campo('pres-validez', 'Validez (días)', numero('pres-validez', p.validez, (x, v) => { x.validez = v; })),
      campo('pres-juego', 'Juego', h('select', { id: 'pres-juego', onchange: (e) => cambiar((x) => { x.juego = e.target.value || null; }) },
        h('option', { value: '' }, 'Ninguno'),
        (app.juegos || []).map((j) => h('option', { value: j.id, selected: j.id === p.juego }, `${enIdioma(j.name)} (${j.id})`)),
        p.juego && !juego ? h('option', { value: p.juego, selected: true }, p.juego) : null))),
    campo('pres-descripcion', 'Qué incluye (sale al principio del presupuesto)', h('textarea', { id: 'pres-descripcion', rows: 3, value: p.descripcion || '', onchange: (e) => cambiar((x) => { x.descripcion = e.target.value; }) })),

    h('section', {},
      h('table', { class: 'tabla-lineas' },
        h('thead', {}, h('tr', {}, ['Concepto', 'Descripción', 'Complejidad', 'Cantidad', 'Horas/ud', '€/hora', 'Precio/ud', 'Horas', 'Importe', ''].map((x, i) => h('th', { class: i >= 6 && x ? 'num' : null }, x)))),
        h('tbody', {}, filas.length ? filas : h('tr', {}, h('td', { colspan: 10, class: 'tenue' }, 'Sin líneas todavía. Añade la primera abajo.')))),
      h('div', { class: 'anadir-linea' },
        nuevoConcepto,
        h('button', { class: 'boton', type: 'button', 'data-anadir-linea': '1', onclick: () => cambiar((x) => { x.lineas.push(lineaDe(tf, nuevoConcepto.value)); }) }, icono('mas', { tam: 16 }), 'Añadir línea'),
        p.juego ? h('button', { class: 'boton', type: 'button', onclick: () => anadirDelJuego('presupuestar') }, 'Añadir lo «A presupuestar» del juego') : null,
        p.juego ? h('button', { class: 'boton', type: 'button', onclick: () => anadirDelJuego('tema') }, 'Añadir un cambio de tema del juego') : null)),

    h('section', { class: 'pie-presupuesto' },
      h('div', { class: 'columna-condiciones' },
        campo('pres-condiciones', 'Condiciones', h('textarea', { id: 'pres-condiciones', rows: 6, value: p.condiciones || '', onchange: (e) => cambiar((x) => { x.condiciones = e.target.value; }) })),
        h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!p.mostrarHoras, onchange: (e) => cambiar((x) => { x.mostrarHoras = e.target.checked; }) }), ' Mostrar las horas en el PDF')),
      h('div', { class: 'totales', 'data-total': t.total },
        h('div', {}, h('span', {}, 'Base'), h('strong', {}, euros(t.base, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-gestion' }, 'Coordinación y gestión (%)'), numero('pres-gestion', p.gestion, (x, v) => { x.gestion = v; }, { class: 'corto' }), h('span', {}, euros(t.gestion, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-descuento' }, 'Descuento (%)'), numero('pres-descuento', p.descuento, (x, v) => { x.descuento = v; }, { class: 'corto' }), h('span', {}, euros(-t.descuento, tf.moneda))),
        h('div', {}, h('span', {}, 'Base imponible'), h('strong', {}, euros(t.imponible, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-iva' }, 'IVA (%)'), numero('pres-iva', p.iva, (x, v) => { x.iva = v; }, { class: 'corto' }), h('span', {}, euros(t.iva, tf.moneda))),
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('strong', { 'data-prueba': 'total-presupuesto' }, euros(t.total, tf.moneda))),
        h('div', { class: 'tenue' }, `${horasTexto(t.horas)} de trabajo estimadas`)))));
}

/** Al salir de un presupuesto con cambios, se guardan (si están completos). */
export async function guardarPresupuestoPendiente(app) {
  const st = app.ui.presupuestos;
  if (st && st.actual && st.sucio) await guardar(app, null);
}

async function guardar(app, raiz) {
  const st = estado(app);
  const errores = erroresDe(st.actual);
  if (errores.length) { app.aviso('No se ha guardado', { tipo: 'error', lista: errores }); return false; }
  try {
    await app.almacen.guardarPresupuesto(st.actual, `Presupuesto ${st.actual.id}: ${st.actual.titulo}`);
  } catch (e) { app.aviso(`No se pudo guardar: ${e.message}`, { tipo: 'error' }); return false; }
  const i = st.lista.findIndex((x) => x.id === st.actual.id);
  if (i >= 0) st.lista[i] = structuredClone(st.actual); else st.lista.unshift(structuredClone(st.actual));
  st.sucio = false;
  app.aviso(`Presupuesto ${st.actual.id} guardado`, { tipo: 'bien' });
  if (raiz) pintarEditor(raiz, app);
  return true;
}

function bajar(bytes, nombre, tipo) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
  const a = h('a', { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

const nombreFichero = (p, ext) => `${p.id}-${(p.titulo || 'presupuesto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}.${ext}`;

async function descargar(app, formato) {
  const st = estado(app);
  const p = st.actual;
  try {
    if (formato === 'pdf') {
      const f = await fuentesDelMotor();
      const bytes = await presupuestoPdf(p, st.tarifas, { PDFLib: globalThis.PDFLib, fontkit: globalThis.fontkit, fuentes: { regular: f.opensans.bytes, bold: f.opensansBold.bytes, titular: f.anton.bytes } });
      bajar(bytes, nombreFichero(p, 'pdf'), 'application/pdf');
    } else {
      bajar(presupuestoXlsx(p, st.tarifas), nombreFichero(p, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  } catch (e) { app.aviso(`No se pudo preparar el fichero: ${e.message}`, { tipo: 'error' }); }
}

async function duplicar(app) {
  const st = estado(app);
  const copia = { ...structuredClone(st.actual), id: siguienteId(st.lista.map((x) => x.id)), fecha: hoy(), estado: 'borrador', titulo: `${st.actual.titulo} (copia)` };
  try { await app.almacen.guardarPresupuesto(copia, `Presupuesto ${copia.id}: copia de ${st.actual.id}`); } catch (e) { app.aviso(`No se pudo duplicar: ${e.message}`, { tipo: 'error' }); return; }
  st.lista.unshift(copia);
  st.actual = structuredClone(copia);
  st.sucio = false;
  app.navegar(`#/presupuestos/${encodeURIComponent(copia.id)}`);
}

async function borrar(app) {
  const st = estado(app);
  const ok = await app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('h2', {}, `¿Borrar el presupuesto ${st.actual.id}?`),
    h('p', { class: 'tenue' }, 'Se quita del repositorio de juegos (queda en su historial).'),
    h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(false) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'button', onclick: () => cerrar(true) }, 'Borrar'))));
  if (!ok) return;
  try { await app.almacen.borrarPresupuesto(st.actual.id); } catch (e) { app.aviso(`No se pudo borrar: ${e.message}`, { tipo: 'error' }); return; }
  st.lista = st.lista.filter((x) => x.id !== st.actual.id);
  st.actual = null;
  app.navegar('#/presupuestos');
}

/* ---------------- Tarifas ---------------- */

function pintarTarifas(raiz, app) {
  const st = estado(app);
  const tf = st.tarifasBorrador || (st.tarifasBorrador = structuredClone(st.tarifas));
  const cambiar = (fn) => { fn(tf); st.tarifasSucias = true; pintarTarifas(raiz, app); };
  const num = (valor, alCambiar, extra = {}) => h('input', { type: 'number', step: 'any', min: 0, class: 'corto', value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, Number(String(e.target.value).replace(',', '.')) || 0)), ...extra });
  const txt = (valor, alCambiar, extra = {}) => h('input', { value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, e.target.value)), ...extra });
  const perfiles = Object.entries(tf.perfiles);
  raiz.replaceChildren(h('div', { class: 'inicio presupuestos' },
    h('div', { class: 'titulo-bloque' },
      h('a', { href: '#/presupuestos', class: 'boton-icono', 'aria-label': 'Volver a los presupuestos' }, icono('atras', { tam: 18 })),
      h('h1', {}, 'Tarifas'),
      h('span', { class: 'tenue' }, st.tarifasSucias ? 'Cambios sin guardar' : st.tarifasGuardadas ? 'Guardadas' : 'Tarifas de partida (sin guardar)'),
      h('div', { class: 'relleno' }),
      h('button', { class: 'boton', type: 'button', onclick: () => { st.tarifasBorrador = null; st.tarifasSucias = false; pintarTarifas(raiz, app); } }, 'Descartar cambios'),
      h('button', { class: 'boton primario', type: 'button', 'data-guardar-tarifas': '1', disabled: !st.tarifasSucias && st.tarifasGuardadas, onclick: async () => {
        try { await app.almacen.guardarTarifas(tf); } catch (e) { app.aviso(`No se pudieron guardar: ${e.message}`, { tipo: 'error' }); return; }
        st.tarifas = structuredClone(tf); st.tarifasGuardadas = true; st.tarifasSucias = false; app.aviso('Tarifas guardadas', { tipo: 'bien' }); pintarTarifas(raiz, app);
      } }, 'Guardar tarifas')),
    h('p', { class: 'sub' }, 'Cada concepto tiene las horas de una pieza de complejidad media; «sencilla» y «compleja» las multiplican. El precio de una línea es horas × tarifa del perfil. Los presupuestos ya hechos no cambian: guardan sus horas y tarifas.'),
    h('section', { class: 'rejilla-tarifas' },
      h('div', {},
        h('h2', {}, 'Tarifa por hora'),
        h('table', { class: 'tabla-lineas' }, h('tbody', {}, perfiles.map(([id, pf]) => h('tr', {},
          h('td', {}, txt(pf.nombre, (x, v) => { x.perfiles[id].nombre = v; }, { 'aria-label': `Nombre del perfil ${id}` })),
          h('td', {}, num(pf.tarifa, (x, v) => { x.perfiles[id].tarifa = v; }, { 'aria-label': `Tarifa de ${pf.nombre}`, 'data-tarifa': id })), h('td', {}, '€/h')))))),
      h('div', {},
        h('h2', {}, 'Complejidad'),
        h('table', { class: 'tabla-lineas' }, h('tbody', {}, COMPLEJIDADES.map(([k, n]) => h('tr', {}, h('td', {}, n),
          h('td', {}, num(tf.complejidad[k], (x, v) => { x.complejidad[k] = v; }, { 'aria-label': `Multiplicador ${n}` })), h('td', {}, '× horas')))))),
      h('div', {},
        h('h2', {}, 'Por defecto'),
        h('table', { class: 'tabla-lineas' }, h('tbody', {},
          h('tr', {}, h('td', {}, 'IVA'), h('td', {}, num(tf.iva, (x, v) => { x.iva = v; }, { 'aria-label': 'IVA' })), h('td', {}, '%')),
          h('tr', {}, h('td', {}, 'Coordinación y gestión'), h('td', {}, num(tf.gestion, (x, v) => { x.gestion = v; }, { 'aria-label': 'Gestión' })), h('td', {}, '%')))))),
    h('section', {},
      h('h2', {}, 'Conceptos'),
      h('table', { class: 'tabla-lineas' },
        h('thead', {}, h('tr', {}, ['Concepto', 'Sección', 'Perfil', 'Unidad', 'Horas (media)', 'Precio (media)', 'Qué incluye', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, tf.conceptos.map((c, i) => h('tr', { 'data-concepto': c.id },
          h('td', {}, txt(c.nombre, (x, v) => { x.conceptos[i].nombre = v; }, { 'aria-label': 'Nombre del concepto' })),
          h('td', {}, h('select', { 'aria-label': 'Sección', onchange: (e) => cambiar((x) => { x.conceptos[i].seccion = e.target.value; }) }, SECCIONES.map((s) => h('option', { value: s.id, selected: s.id === c.seccion }, s.nombre)))),
          h('td', {}, h('select', { 'aria-label': 'Perfil', onchange: (e) => cambiar((x) => { x.conceptos[i].perfil = e.target.value; }) }, perfiles.map(([id, pf]) => h('option', { value: id, selected: id === c.perfil }, pf.nombre)))),
          h('td', {}, txt(c.unidad, (x, v) => { x.conceptos[i].unidad = v; }, { 'aria-label': 'Unidad', class: 'corto' })),
          h('td', {}, num(c.horas, (x, v) => { x.conceptos[i].horas = v; }, { 'aria-label': 'Horas' })),
          h('td', { class: 'num' }, euros(c.horas * ((tf.perfiles[c.perfil] || {}).tarifa || 0), tf.moneda)),
          h('td', {}, h('textarea', { rows: 2, 'aria-label': 'Qué incluye', value: c.ayuda || '', onchange: (e) => cambiar((x) => { x.conceptos[i].ayuda = e.target.value; }) })),
          h('td', {}, h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Quitar el concepto', onclick: () => cambiar((x) => { x.conceptos.splice(i, 1); }) }, icono('basura', { tam: 16 }))))))),
      h('button', { class: 'boton', type: 'button', onclick: () => cambiar((x) => { x.conceptos.push({ id: `concepto-${Date.now().toString(36)}`, seccion: 'arte', perfil: 'ilustracion', nombre: 'Concepto nuevo', unidad: 'pieza', horas: 1, ayuda: '' }); }) }, icono('mas', { tam: 16 }), 'Añadir concepto')),
    h('section', { class: 'rejilla-datos' },
      h('div', { class: 'campo' }, h('label', { for: 'tar-estudio' }, 'Estudio (cabecera del PDF)'), txt(tf.estudio.nombre, (x, v) => { x.estudio.nombre = v; }, { id: 'tar-estudio' })),
      h('div', { class: 'campo' }, h('label', { for: 'tar-datos' }, 'Datos del estudio (CIF, dirección, correo)'), txt(tf.estudio.datos, (x, v) => { x.estudio.datos = v; }, { id: 'tar-datos' }))),
    h('div', { class: 'campo' }, h('label', { for: 'tar-condiciones' }, 'Condiciones de los presupuestos nuevos'),
      h('textarea', { id: 'tar-condiciones', rows: 4, value: tf.condiciones || '', onchange: (e) => cambiar((x) => { x.condiciones = e.target.value; }) }))));
}
