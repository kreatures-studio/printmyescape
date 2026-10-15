// Presupuestos del estudio: lista, editor visual y tarifas, con descarga en PDF o Excel. Se guardan en el repositorio
// de juegos (presupuestos/ de la rama principal), así el estudio, el cliente y Claude ven los mismos. Cálculos, PDF y
// Excel: tools/presupuesto/ (los mismos que usa Claude con sus herramientas de presupuestos).
//
// El editor enseña el escape al lado: las páginas del juego del presupuesto con el número de cada línea encima de
// donde va (anclas). Una línea se señala en el escape pulsando «Señalar» y después la página (si se pulsa una pieza
// de arte, la línea apunta a esa pieza y enseña su miniatura).

import { h, icono, enIdioma } from '../dom.js';
import { fuentesDelMotor } from '../fuentes.js';
import { componer, pintarPDF } from '../motor.js';
import {
  SECCIONES, ESTADOS, COLOR_SECCION, NIVELES, completarTarifas, conceptoDe, nivelesDe, nivelTexto, lineaDe, conComplejidad,
  totales, siguienteId, presupuestoNuevo, lineasDesdeJuego, lineasCambioDeTema, erroresDe, euros, horasTexto, hoy, marcas,
  piezasDeLinea,
} from '../tools/presupuesto/calculo.mjs';
import { presupuestoPdf } from '../tools/presupuesto/pdf.mjs';
import { presupuestoXlsx } from '../tools/presupuesto/xlsx.mjs';

const ANCHO_PAGINA = 196;

function estado(app) {
  return app.ui.presupuestos || (app.ui.presupuestos = { lista: null, tarifas: null, actual: null, sucio: false, juegos: {}, sel: null, senalando: null });
}

async function cargar(app, { forzar = false } = {}) {
  const st = estado(app);
  if (st.lista && st.tarifas && !forzar) return;
  const [lista, guardadas] = await Promise.all([app.almacen.listarPresupuestos(), app.almacen.leerTarifas()]);
  st.lista = lista.sort((a, b) => (b.id > a.id ? 1 : -1));
  st.tarifas = completarTarifas(guardadas);
  st.tarifasGuardadas = !!guardadas && guardadas.schema === st.tarifas.schema;
}

/** El juego de un presupuesto (pme-game/2) y su PDF compuesto (ejemplo normal), guardados por id. */
function juegoDe(app, id) {
  const st = estado(app);
  if (!id) return null;
  if (!st.juegos[id]) {
    st.juegos[id] = { estado: 'cargando', promesa: (async () => {
      const { game } = await app.almacen.load(id);
      const ejemplos = (game.examples || []).map((e) => e.id);
      const ejemplo = ejemplos.includes('2') ? '2' : (ejemplos[0] || null);
      const { bytes } = await componer({ juego: game, almacen: app.almacen, biblioteca: app.biblioteca, lang: game.languages[0], ejemplo });
      Object.assign(st.juegos[id], { estado: 'listo', game, bytes });
      return st.juegos[id];
    })().catch((e) => { Object.assign(st.juegos[id], { estado: 'error', error: e.message }); return st.juegos[id]; }) };
  }
  return st.juegos[id];
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
      st.sel = null;
      st.senalando = null;
    }
    return pintarEditor(raiz, app);
  }
  return pintarLista(raiz, app);
}

/* ---------------- Piezas visuales comunes ---------------- */

const colorDe = (seccion) => COLOR_SECCION[seccion] || COLOR_SECCION.otros;
const nombreSeccion = (id) => (SECCIONES.find((s) => s.id === id) || { nombre: id }).nombre;

/** Barra con el reparto del presupuesto por secciones, y su leyenda. */
function barraReparto(t, moneda, { leyenda = true } = {}) {
  return h('div', { class: 'reparto' },
    h('div', { class: 'barra', role: 'img', 'aria-label': t.porSeccion.map((s) => `${s.nombre} ${euros(s.importe, moneda)}`).join(', ') },
      t.porSeccion.map((s) => h('span', { style: { background: colorDe(s.id), flexGrow: String(Math.max(0.001, s.importe)) }, title: `${s.nombre}: ${euros(s.importe, moneda)}` }))),
    leyenda ? h('div', { class: 'leyenda' }, t.porSeccion.map((s) => h('span', {},
      h('i', { style: { background: colorDe(s.id) } }), `${s.nombre} `, h('strong', {}, euros(s.importe, moneda)),
      h('span', { class: 'tenue' }, ` · ${t.base ? Math.round((s.importe / t.base) * 100) : 0} %`)))) : null);
}

const chapa = (n, seccion, extra = {}) => h('span', { class: 'chapa', style: { background: colorDe(seccion) }, ...extra }, String(n));

/* ---------------- Lista ---------------- */

function pintarLista(raiz, app) {
  const st = estado(app);
  const tarjetas = st.lista.map((p) => {
    const t = totales(p);
    return h('a', { class: 'tarjeta-presupuesto', href: `#/presupuestos/${encodeURIComponent(p.id)}`, 'data-presupuesto': p.id },
      h('div', { class: 'cabeza' }, h('span', { class: 'numero' }, p.id),
        h('span', { class: `pastilla ${p.estado === 'aceptado' ? 'verde' : p.estado === 'rechazado' ? 'error' : ''}` }, ESTADOS[p.estado] || p.estado)),
      h('div', { class: 'titulo' }, p.titulo || '—'),
      h('div', { class: 'tenue' }, [(p.cliente && p.cliente.nombre) || 'Sin cliente', p.juego, p.fecha].filter(Boolean).join(' · ')),
      barraReparto(t, st.tarifas.moneda, { leyenda: false }),
      h('div', { class: 'pie' }, h('span', { class: 'tenue' }, `${t.lineas.length} línea${t.lineas.length === 1 ? '' : 's'} · ${horasTexto(t.horas)}`),
        h('strong', { class: 'total' }, euros(t.total, st.tarifas.moneda))));
  });
  raiz.replaceChildren(h('div', { class: 'inicio presupuestos' },
    h('section', {},
      h('div', { class: 'titulo-bloque' }, h('h1', {}, 'Presupuestos'),
        h('div', { class: 'relleno' }),
        h('a', { class: 'boton', href: '#/presupuestos/tarifas' }, 'Tarifas'),
        h('button', { class: 'boton primario', type: 'button', onclick: () => nuevo(app) }, icono('mas', { color: '#FFFFFF', tam: 18 }), 'Nuevo presupuesto')),
      h('p', { class: 'sub' }, 'Props, maquetación, game design y programación, con el escape al lado para ver dónde va cada cosa. Se descargan en PDF o en Excel. También se piden a Claude: «Hazme un presupuesto para…».'),
      !st.tarifasGuardadas ? h('div', { class: 'info' }, 'Se usan las tarifas del estudio de partida. Si cambian, ajustadlas en ', h('a', { href: '#/presupuestos/tarifas' }, 'Tarifas'), '.') : null,
      st.lista.length ? h('div', { class: 'rejilla-presupuestos' }, tarjetas)
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
      h('div', { class: 'campo' }, h('label', { for: 'pres-juego' }, 'Juego'), jue, h('span', { class: 'ayuda' }, 'Con un juego, el presupuesto lo enseña al lado y se puede señalar dónde va cada línea.')),
      h('div', { class: 'campo' }, h('label', { for: 'pres-empezar' }, 'Empezar'), emp),
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
  p.actualizado = new Date().toISOString();
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
  const campo = (id, etiqueta, ctl) => h('div', { class: 'campo' }, h('label', { for: id }, etiqueta), ctl);
  const entrada = (id, valor, alCambiar, extra = {}) => h('input', { id, value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, e.target.value)), ...extra });
  const numero = (id, valor, alCambiar, extra = {}) => entrada(id, valor, (x, v) => alCambiar(x, v === '' ? 0 : Number(String(v).replace(',', '.'))), { type: 'number', step: 'any', min: 0, ...extra });
  const opcionesConcepto = (sel) => SECCIONES.filter((s) => tf.conceptos.some((c) => c.seccion === s.id)).map((s) => h('optgroup', { label: s.nombre },
    tf.conceptos.filter((c) => c.seccion === s.id).map((c) => h('option', { value: c.id, selected: c.id === sel }, c.nombre))));
  const j = juegoDe(app, p.juego);
  const game = j && j.estado === 'listo' ? j.game : null;

  // ---- Tarjetas de las líneas, por secciones
  const grupos = t.porSeccion.map((s) => h('section', { class: 'grupo-lineas', 'data-seccion': s.id },
    h('div', { class: 'cabeza-grupo', style: { borderColor: colorDe(s.id) } },
      h('span', { class: 'punto', style: { background: colorDe(s.id) } }), h('strong', {}, s.nombre),
      h('span', { class: 'tenue' }, `${horasTexto(s.horas)}`), h('span', { class: 'relleno' }), h('strong', {}, euros(s.importe, tf.moneda))),
    s.lineas.map((l) => tarjetaLinea(app, raiz, l, { tf, cambiar, numero, opcionesConcepto, game }))));

  const nuevoConcepto = h('select', { id: 'pres-nuevo-concepto', 'aria-label': 'Concepto de la línea nueva' }, opcionesConcepto('prop'));
  const anadirDelJuego = async (modo) => {
    try {
      const g = (await app.almacen.load(p.juego)).game;
      const nuevas = modo === 'tema' ? lineasCambioDeTema(tf, g, (g.theme && g.theme.name) || '') : lineasDesdeJuego(tf, g);
      if (!nuevas.length) { app.aviso('El juego no tiene nada «A presupuestar».'); return; }
      cambiar((x) => { x.lineas.push(...nuevas); });
    } catch (e) { app.aviso(`No se pudo leer el juego: ${e.message}`, { tipo: 'error' }); }
  };

  const izquierda = h('div', { class: 'col-lineas' },
    h('details', { class: 'datos-presupuesto', open: !p.titulo || !(p.cliente && p.cliente.nombre) ? true : null },
      h('summary', {}, h('strong', {}, 'Datos del presupuesto'), h('span', { class: 'tenue' }, ` · ${(p.cliente && p.cliente.nombre) || 'sin cliente'} · ${p.fecha || ''} · válido ${p.validez || 30} días`)),
      h('div', { class: 'rejilla-datos' },
        campo('pres-titulo', 'Título', entrada('pres-titulo', p.titulo, (x, v) => { x.titulo = v; })),
        campo('pres-estado', 'Estado', h('select', { id: 'pres-estado', onchange: (e) => cambiar((x) => { x.estado = e.target.value; }) },
          Object.entries(ESTADOS).map(([v, n]) => h('option', { value: v, selected: p.estado === v }, n)))),
        campo('pres-cliente', 'Cliente', entrada('pres-cliente', p.cliente && p.cliente.nombre, (x, v) => { x.cliente = { ...(x.cliente || {}), nombre: v }; })),
        campo('pres-contacto', 'Contacto', entrada('pres-contacto', p.cliente && p.cliente.contacto, (x, v) => { x.cliente = { ...(x.cliente || {}), contacto: v }; }, { placeholder: 'Correo o teléfono' })),
        campo('pres-fecha', 'Fecha', entrada('pres-fecha', p.fecha, (x, v) => { x.fecha = v || hoy(); }, { type: 'date' })),
        campo('pres-validez', 'Validez (días)', numero('pres-validez', p.validez, (x, v) => { x.validez = v; })),
        campo('pres-juego', 'Juego', h('select', { id: 'pres-juego', onchange: (e) => cambiar((x) => { x.juego = e.target.value || null; }) },
          h('option', { value: '' }, 'Ninguno'),
          (app.juegos || []).map((g) => h('option', { value: g.id, selected: g.id === p.juego }, `${enIdioma(g.name)} (${g.id})`)),
          p.juego && !(app.juegos || []).some((g) => g.id === p.juego) ? h('option', { value: p.juego, selected: true }, p.juego) : null))),
      campo('pres-descripcion', 'Qué incluye (sale al principio del presupuesto)', h('textarea', { id: 'pres-descripcion', rows: 3, value: p.descripcion || '', onchange: (e) => cambiar((x) => { x.descripcion = e.target.value; }) }))),
    grupos.length ? grupos : h('div', { class: 'vacio' }, 'Sin líneas todavía. Añade la primera abajo.'),
    h('div', { class: 'anadir-linea' },
      nuevoConcepto,
      h('button', { class: 'boton', type: 'button', 'data-anadir-linea': '1', onclick: () => cambiar((x) => { const l = lineaDe(tf, nuevoConcepto.value); x.lineas.push(l); st.sel = l.id; }) }, icono('mas', { tam: 16 }), 'Añadir línea'),
      p.juego ? h('button', { class: 'boton', type: 'button', onclick: () => anadirDelJuego('presupuestar') }, 'Lo «A presupuestar» del juego') : null,
      p.juego ? h('button', { class: 'boton', type: 'button', onclick: () => anadirDelJuego('tema') }, 'Un cambio de tema') : null),
    h('section', { class: 'pie-presupuesto' },
      h('div', { class: 'columna-condiciones' },
        campo('pres-condiciones', 'Condiciones', h('textarea', { id: 'pres-condiciones', rows: 5, value: p.condiciones || '', onchange: (e) => cambiar((x) => { x.condiciones = e.target.value; }) })),
        h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: !!p.mostrarHoras, onchange: (e) => cambiar((x) => { x.mostrarHoras = e.target.checked; }) }), ' Mostrar las horas en el PDF')),
      h('div', { class: 'totales', 'data-total': t.total },
        h('div', {}, h('span', {}, 'Base'), h('strong', {}, euros(t.base, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-gestion' }, 'Coordinación y gestión (%)'), numero('pres-gestion', p.gestion, (x, v) => { x.gestion = v; }, { class: 'corto' }), h('span', {}, euros(t.gestion, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-descuento' }, 'Descuento (%)'), numero('pres-descuento', p.descuento, (x, v) => { x.descuento = v; }, { class: 'corto' }), h('span', {}, euros(-t.descuento, tf.moneda))),
        h('div', {}, h('span', {}, 'Base imponible'), h('strong', {}, euros(t.imponible, tf.moneda))),
        h('div', {}, h('label', { for: 'pres-iva' }, 'IVA (%)'), numero('pres-iva', p.iva, (x, v) => { x.iva = v; }, { class: 'corto' }), h('span', {}, euros(t.iva, tf.moneda))),
        h('div', { class: 'total' }, h('span', {}, 'Total'), h('strong', {}, euros(t.total, tf.moneda))))));

  const derecha = panelEscape(app, raiz, p, j);

  raiz.replaceChildren(h('div', { class: 'presupuesto-visual' },
    h('div', { class: 'barra-presupuesto' },
      h('a', { href: '#/presupuestos', class: 'boton-icono', 'aria-label': 'Volver a los presupuestos' }, icono('atras', { tam: 18 })),
      h('div', { class: 'titulos' }, h('h1', {}, `${p.id}${p.titulo ? ` · ${p.titulo}` : ''}`),
        h('span', { class: 'tenue', 'data-prueba': 'estado-presupuesto' }, st.sucio ? 'Cambios sin guardar' : 'Guardado')),
      h('div', { class: 'relleno' }),
      h('button', { class: 'boton primario', type: 'button', disabled: !st.sucio, 'data-guardar': '1', onclick: () => guardar(app, raiz) }, 'Guardar'),
      h('button', { class: 'boton', type: 'button', 'data-vista-cliente': '1', onclick: () => vistaCliente(app) }, icono('ojo', { tam: 16 }), 'Como lo verá el cliente'),
      h('button', { class: 'boton', type: 'button', 'data-pdf': '1', onclick: () => descargar(app, 'pdf') }, 'PDF'),
      h('button', { class: 'boton', type: 'button', 'data-excel': '1', onclick: () => descargar(app, 'xlsx') }, 'Excel'),
      h('button', { class: 'boton', type: 'button', onclick: () => duplicar(app) }, 'Duplicar'),
      h('button', { class: 'boton', type: 'button', onclick: () => borrar(app) }, 'Borrar')),
    h('div', { class: 'resumen-presupuesto' },
      h('div', { class: 'cifra-total' }, h('span', {}, 'Total con IVA'), h('strong', { 'data-prueba': 'total-presupuesto' }, euros(t.total, tf.moneda)),
        h('span', { class: 'tenue' }, `${horasTexto(t.horas)} · ${t.lineas.length} línea${t.lineas.length === 1 ? '' : 's'}`)),
      barraReparto(t, tf.moneda)),
    h('div', { class: 'cuerpo-presupuesto' }, izquierda, derecha)));
  if (j && j.estado === 'cargando') j.promesa.then(() => { if (app.ruta.sub === p.id && st.actual === p) pintarEditor(raiz, app); });
  pintarPaginasDelPanel(app, derecha, p, j);
}

/** Tarjeta de una línea: número y color de su sección, miniatura de la pieza, concepto, complejidad, cuentas y anclas. */
function tarjetaLinea(app, raiz, l, { tf, cambiar, numero, opcionesConcepto, game }) {
  const st = estado(app);
  const p = st.actual;
  const i = p.lineas.findIndex((x) => x.id === l.id);
  const c = conceptoDe(tf, l.concepto);
  const niveles = nivelesDe(c);
  const refs = piezasDeLinea(l, game);
  const mini = h('div', { class: 'mini' }, refs.length ? null : h('span', { class: 'inicial', style: { color: colorDe(l.seccion) } }, (c ? c.nombre : '?').slice(0, 1)));
  if (refs.length) {
    const pieza = app.biblioteca.buscar('arte', refs[0]);
    if (pieza) app.biblioteca.miniatura(pieza).then((url) => { mini.prepend(h('img', { src: url, alt: pieza.name })); }, () => {});
    if (refs.length > 1) mini.append(h('span', { class: 'mas' }, `+${refs.length - 1}`));
  }
  const paginasDe = [...new Set((l.anclas || []).map((a) => a.pagina))];
  const seleccionada = st.sel === l.id;
  const senalando = st.senalando === l.id;
  return h('article', { class: `tarjeta-linea${seleccionada ? ' sel' : ''}`, 'data-linea': l.id, style: { borderLeftColor: colorDe(l.seccion) },
    onclick: (e) => { if (e.target.closest('input, select, textarea, button')) return; st.sel = seleccionada ? null : l.id; pintarEditor(raiz, app); } },
    h('div', { class: 'lado' }, chapa(l.n, l.seccion), mini),
    h('div', { class: 'contenido' },
      h('div', { class: 'fila-concepto' },
        h('select', { 'aria-label': 'Concepto', onchange: (e) => cambiar((x) => { const n = lineaDe(tf, e.target.value, { descripcion: x.lineas[i].descripcion, complejidad: x.lineas[i].complejidad || 'media', cantidad: x.lineas[i].cantidad, id: x.lineas[i].id }); if (x.lineas[i].anclas) n.anclas = x.lineas[i].anclas; x.lineas[i] = n; }) }, opcionesConcepto(l.concepto)),
        niveles.length ? h('div', { class: 'niveles', role: 'group', 'aria-label': 'Complejidad' }, niveles.map((n) => h('button', {
          type: 'button', 'aria-pressed': l.complejidad === n.id ? 'true' : 'false', title: `${nivelTexto(c, n.id)}: ${c.niveles[n.id]} h`,
          onclick: () => cambiar((x) => { x.lineas[i] = conComplejidad(tf, x.lineas[i], n.id); }) }, nivelTexto(c, n.id)))) : null,
        h('button', { class: 'boton-icono quitar', type: 'button', 'aria-label': 'Quitar la línea', title: 'Quitar la línea', onclick: () => cambiar((x) => { x.lineas.splice(i, 1); }) }, icono('basura', { tam: 16 }))),
      h('textarea', { 'aria-label': 'Descripción', rows: 2, placeholder: c && c.ayuda ? c.ayuda : 'Qué es', value: l.descripcion || '', onchange: (e) => cambiar((x) => { x.lineas[i].descripcion = e.target.value; }) }),
      h('div', { class: 'cuentas' },
        numero(`can-${l.id}`, l.cantidad, (x, v) => { x.lineas[i].cantidad = v; }, { 'aria-label': 'Cantidad', class: 'corto' }), h('span', { class: 'tenue' }, c ? c.unidad : ''),
        h('span', { class: 'op' }, '×'), numero(`hor-${l.id}`, l.horas, (x, v) => { x.lineas[i].horas = v; }, { 'aria-label': 'Horas por unidad', class: 'corto' }), h('span', { class: 'tenue' }, 'h'),
        h('span', { class: 'op' }, '×'), numero(`tar-${l.id}`, l.tarifa, (x, v) => { x.lineas[i].tarifa = v; }, { 'aria-label': 'Tarifa por hora', class: 'corto' }), h('span', { class: 'tenue' }, '€/h'),
        h('span', { class: 'relleno' }), h('strong', { class: 'importe', 'data-importe': l.importe }, euros(l.importe, tf.moneda))),
      p.juego ? h('div', { class: 'anclas' },
        paginasDe.map((pg) => h('span', { class: 'chip-ancla' }, `Página ${pg.replace('p', '')}`,
          h('button', { type: 'button', 'aria-label': `Quitar la marca de la página ${pg.replace('p', '')}`, onclick: () => cambiar((x) => { x.lineas[i].anclas = (x.lineas[i].anclas || []).filter((a) => a.pagina !== pg); if (!x.lineas[i].anclas.length) delete x.lineas[i].anclas; }) }, '×'))),
        h('button', { class: `boton pequeno${senalando ? ' activo' : ''}`, type: 'button', 'data-senalar': l.id,
          onclick: () => { st.senalando = senalando ? null : l.id; st.sel = l.id; pintarEditor(raiz, app); } }, senalando ? 'Pulsa en una página… (cancelar)' : 'Señalar en el escape')) : null));
}

/* ---------------- El escape al lado ---------------- */

function panelEscape(app, raiz, p, j) {
  const st = estado(app);
  if (!p.juego) {
    return h('aside', { class: 'col-escape' }, h('div', { class: 'vacio' }, 'Elige el juego en «Datos del presupuesto» para verlo aquí y señalar dónde va cada línea.'));
  }
  const lineaSen = st.senalando ? totales(p).lineas.find((l) => l.id === st.senalando) : null;
  return h('aside', { class: `col-escape${st.senalando ? ' senalando' : ''}`, 'aria-label': 'El escape' },
    h('div', { class: 'cabeza-escape' }, h('strong', {}, 'El escape'), h('span', { class: 'tenue' }, p.juego)),
    lineaSen ? h('div', { class: 'aviso-senalar' }, chapa(lineaSen.n, lineaSen.seccion), ' Pulsa en la página donde va. Si pulsas una pieza, la línea apunta a esa pieza.') : null,
    h('div', { class: 'paginas-escape', 'data-paginas-escape': '1' }, h('p', { class: 'tenue' }, j && j.estado === 'error' ? `No se pudo componer el juego: ${j.error}` : 'Componiendo el juego…')));
}

/** Pinta (o reutiliza) las páginas del juego en el panel y pone encima las marcas de las líneas. */
async function pintarPaginasDelPanel(app, panel, p, j) {
  const st = estado(app);
  const caja = panel.querySelector('[data-paginas-escape]');
  if (!caja || !j || j.estado !== 'listo') return;
  // Las páginas pintadas se guardan con el juego: al repintar el editor no se vuelven a componer ni a dibujar.
  if (!j.figuras) {
    j.figuras = j.game.pages.map((pg, k) => {
      const canvas = h('canvas', { 'aria-label': `Página ${k + 1}` });
      const capa = h('div', { class: 'capa-marcas' });
      const hoja = h('div', { class: 'hoja-escape', 'data-pagina': pg.id }, canvas, capa);
      return { pid: pg.id, canvas, capa, hoja, fig: h('figure', {}, hoja, h('figcaption', {}, `Página ${k + 1}${pg.title ? ` · ${pg.title}` : ''}`)), pintada: false };
    });
    (async () => { for (let k = 0; k < j.figuras.length; k++) { await pintarPDF(j.bytes, j.figuras[k].canvas, ANCHO_PAGINA, k + 1); j.figuras[k].pintada = true; } caja.dataset.listo = '1'; j.listo = true; })();
  } else if (j.listo) caja.dataset.listo = '1';
  caja.replaceChildren(...j.figuras.map((f) => f.fig));
  const mk = marcas(p, j.game);
  for (const f of j.figuras) {
    f.hoja.onclick = (e) => senalar(app, e, f.pid, j.game);
    f.capa.replaceChildren(...mk.filter((m) => m.pagina === f.pid).map((m) => chapa(m.n, m.seccion, {
      class: `chapa marca${st.sel === m.linea ? ' sel' : ''}`, 'data-marca': m.linea, title: lineaTexto(p, m.linea),
      style: { background: colorDe(m.seccion), left: `${m.x}%`, top: `${m.y}%` },
      onclick: (e) => { e.stopPropagation(); if (st.senalando) return senalar(app, e, f.pid, j.game); st.sel = m.linea; app.repintar(); requestAnimationFrame(() => { const c = document.querySelector(`[data-linea="${m.linea}"]`); if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' }); }); },
    })));
  }
}

function lineaTexto(p, id) {
  const l = totales(p).lineas.find((x) => x.id === id);
  const st = p && l ? l : null;
  return st ? `${l.n}. ${l.descripcion || l.concepto}` : '';
}

/** Con «Señalar» activo, una pulsación sobre una página pone el ancla de la línea (en la pieza de arte pulsada, si hay). */
function senalar(app, e, pid, game) {
  const st = estado(app);
  if (!st.senalando) return;
  const r = e.currentTarget.getBoundingClientRect ? e.currentTarget.closest('.hoja-escape').getBoundingClientRect() : null;
  if (!r) return;
  const x = ((e.clientX - r.left) / r.width) * 100, y = ((e.clientY - r.top) / r.height) * 100;
  const pg = game.pages.find((q) => q.id === pid);
  // La pieza de arte más pequeña bajo el punto (los fondos de página entera no cuentan).
  const bajo = (pg.elements || []).filter((el) => el.kind === 'art' && !(el.w >= 90 && el.h >= 90) && x >= el.x && x <= el.x + el.w && y >= el.y && y <= el.y + el.h)
    .sort((a, b) => a.w * a.h - b.w * b.h)[0];
  const ancla = bajo ? { pagina: pid, elemento: bajo.id } : { pagina: pid, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  const p = st.actual;
  const linea = p.lineas.find((l) => l.id === st.senalando);
  if (!linea) { st.senalando = null; return; }
  linea.anclas = [...(linea.anclas || []), ancla];
  st.senalando = null;
  st.sucio = true;
  app.repintar();
}

/* ---------------- Guardar, descargar, vista del cliente ---------------- */

/** Al salir de un presupuesto con cambios, se guardan (si están completos). */
export async function guardarPresupuestoPendiente(app) {
  const st = app.ui.presupuestos;
  if (st && st.actual && st.sucio) await guardar(app, null);
}

async function guardar(app, raiz) {
  const st = estado(app);
  const errores = erroresDe(st.actual);
  if (errores.length) { app.aviso('No se ha guardado', { tipo: 'error', lista: errores }); return false; }
  st.actual.actualizado = new Date().toISOString();
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

/** PDF del presupuesto con las miniaturas de sus piezas y, si tiene juego, el anexo «Dónde va cada cosa». */
async function pdfDe(app) {
  const st = estado(app);
  const p = st.actual;
  const f = await fuentesDelMotor();
  const j = juegoDe(app, p.juego);
  if (j && j.estado === 'cargando') await j.promesa;
  const game = j && j.estado === 'listo' ? j.game : null;
  const miniaturas = {};
  for (const l of p.lineas) {
    for (const ref of piezasDeLinea(l, game)) {
      const pieza = app.biblioteca.buscar('arte', ref);
      if (pieza && !miniaturas[ref]) { try { miniaturas[ref] = await app.biblioteca.bytes('arte', pieza.coleccion, pieza.thumb); } catch { /* sin miniatura */ } }
    }
  }
  return presupuestoPdf(p, st.tarifas, { PDFLib: globalThis.PDFLib, fontkit: globalThis.fontkit, fuentes: { regular: f.opensans.bytes, bold: f.opensansBold.bytes, titular: f.anton.bytes },
    miniaturas, juego: game, juegoPdf: game ? j.bytes : null });
}

async function descargar(app, formato) {
  const st = estado(app);
  const p = st.actual;
  try {
    if (formato === 'pdf') bajar(await pdfDe(app), nombreFichero(p, 'pdf'), 'application/pdf');
    else bajar(presupuestoXlsx(p, st.tarifas), nombreFichero(p, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } catch (e) { app.aviso(`No se pudo preparar el fichero: ${e.message}`, { tipo: 'error' }); }
}

/** El PDF tal como lo recibe el cliente, página a página. */
async function vistaCliente(app) {
  const caja = h('div', { class: 'vista-cliente', 'data-vista-cliente-paginas': '1' }, h('p', { class: 'tenue' }, 'Preparando el PDF…'));
  let bytes = null;
  app.dialogo((cerrar) => h('div', { class: 'dialogo' },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } }, h('h2', {}, 'Como lo verá el cliente'), h('div', { class: 'relleno' }),
      h('button', { class: 'boton', type: 'button', onclick: () => bytes && bajar(bytes, nombreFichero(estado(app).actual, 'pdf'), 'application/pdf') }, 'Descargar el PDF'),
      h('button', { class: 'boton primario', type: 'button', onclick: () => cerrar(true) }, 'Cerrar')),
    caja), { ancho: true });
  try {
    bytes = await pdfDe(app);
    const doc = await globalThis.PDFLib.PDFDocument.load(bytes);
    const n = doc.getPageCount();
    const lienzos = Array.from({ length: n }, (_, k) => h('canvas', { 'aria-label': `Hoja ${k + 1}` }));
    caja.replaceChildren(...lienzos);
    for (let k = 0; k < n; k++) await pintarPDF(bytes, lienzos[k], 560, k + 1);
    caja.dataset.listo = String(n);
  } catch (e) { caja.replaceChildren(h('div', { class: 'mensaje error' }, `No se pudo preparar: ${e.message}`)); }
}

async function duplicar(app) {
  const st = estado(app);
  const copia = { ...structuredClone(st.actual), id: siguienteId(st.lista.map((x) => x.id)), fecha: hoy(), estado: 'borrador', titulo: `${st.actual.titulo} (copia)`, actualizado: new Date().toISOString() };
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
  const leerNum = (v) => Number(String(v).replace(',', '.'));
  const num = (valor, alCambiar, extra = {}) => h('input', { type: 'number', step: 'any', min: 0, class: 'corto', value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, e.target.value === '' ? null : (leerNum(e.target.value) || 0))), ...extra });
  const txt = (valor, alCambiar, extra = {}) => h('input', { value: valor ?? '', onchange: (e) => cambiar((x) => alCambiar(x, e.target.value)), ...extra });
  const perfiles = Object.entries(tf.perfiles);
  const precio = (c, nivel) => euros((nivel ? c.niveles[nivel] : c.horas) * ((tf.perfiles[c.perfil] || {}).tarifa || 0), tf.moneda);
  raiz.replaceChildren(h('div', { class: 'inicio presupuestos' },
    h('div', { class: 'titulo-bloque' },
      h('a', { href: '#/presupuestos', class: 'boton-icono', 'aria-label': 'Volver a los presupuestos' }, icono('atras', { tam: 18 })),
      h('h1', {}, 'Tarifas'),
      h('span', { class: 'tenue' }, st.tarifasSucias ? 'Cambios sin guardar' : st.tarifasGuardadas ? 'Guardadas' : 'Tarifas del estudio de partida (sin guardar)'),
      h('div', { class: 'relleno' }),
      h('button', { class: 'boton', type: 'button', onclick: () => { st.tarifasBorrador = null; st.tarifasSucias = false; pintarTarifas(raiz, app); } }, 'Descartar cambios'),
      h('button', { class: 'boton primario', type: 'button', 'data-guardar-tarifas': '1', disabled: !st.tarifasSucias && st.tarifasGuardadas, onclick: async () => {
        try { await app.almacen.guardarTarifas(tf); } catch (e) { app.aviso(`No se pudieron guardar: ${e.message}`, { tipo: 'error' }); return; }
        st.tarifas = structuredClone(tf); st.tarifasGuardadas = true; st.tarifasSucias = false; app.aviso('Tarifas guardadas', { tipo: 'bien' }); pintarTarifas(raiz, app);
      } }, 'Guardar tarifas')),
    h('p', { class: 'sub' }, 'Cada concepto tiene sus horas por nivel de complejidad (o unas horas fijas); el precio es horas × la tarifa de su perfil. Los presupuestos ya hechos no cambian: guardan sus horas y tarifas.'),
    h('section', { class: 'rejilla-tarifas' },
      h('div', {},
        h('h2', {}, 'Tarifa por hora'),
        h('table', { class: 'tabla-lineas' }, h('tbody', {}, perfiles.map(([id, pf]) => h('tr', {},
          h('td', {}, h('span', { class: 'punto', style: { background: colorDe(id) } }), ' ', txt(pf.nombre, (x, v) => { x.perfiles[id].nombre = v; }, { 'aria-label': `Nombre del perfil ${id}` })),
          h('td', {}, num(pf.tarifa, (x, v) => { x.perfiles[id].tarifa = v || 0; }, { 'aria-label': `Tarifa de ${pf.nombre}`, 'data-tarifa': id })), h('td', {}, '€/h')))))),
      h('div', {},
        h('h2', {}, 'Por defecto'),
        h('table', { class: 'tabla-lineas' }, h('tbody', {},
          h('tr', {}, h('td', {}, 'IVA'), h('td', {}, num(tf.iva, (x, v) => { x.iva = v || 0; }, { 'aria-label': 'IVA' })), h('td', {}, '%')),
          h('tr', {}, h('td', {}, 'Coordinación y gestión'), h('td', {}, num(tf.gestion, (x, v) => { x.gestion = v || 0; }, { 'aria-label': 'Gestión' })), h('td', {}, '%')))))),
    h('section', {},
      h('h2', {}, 'Conceptos'),
      h('table', { class: 'tabla-lineas tabla-conceptos' },
        h('thead', {}, h('tr', {}, ['Concepto', 'Sección', 'Perfil', 'Unidad', 'Horas fijas', ...NIVELES.map((n) => n.nombre), 'Qué incluye', ''].map((x) => h('th', {}, x)))),
        h('tbody', {}, tf.conceptos.map((c, i) => h('tr', { 'data-concepto': c.id },
          h('td', {}, txt(c.nombre, (x, v) => { x.conceptos[i].nombre = v; }, { 'aria-label': 'Nombre del concepto' })),
          h('td', {}, h('select', { 'aria-label': 'Sección', onchange: (e) => cambiar((x) => { x.conceptos[i].seccion = e.target.value; }) }, SECCIONES.map((s) => h('option', { value: s.id, selected: s.id === c.seccion }, s.nombre)))),
          h('td', {}, h('select', { 'aria-label': 'Perfil', onchange: (e) => cambiar((x) => { x.conceptos[i].perfil = e.target.value; }) }, perfiles.map(([id, pf]) => h('option', { value: id, selected: id === c.perfil }, pf.nombre)))),
          h('td', {}, txt(c.unidad, (x, v) => { x.conceptos[i].unidad = v; }, { 'aria-label': 'Unidad', class: 'corto' })),
          h('td', {}, c.niveles ? h('span', { class: 'tenue' }, 'por nivel') : [num(c.horas, (x, v) => { x.conceptos[i].horas = v || 0; }, { 'aria-label': 'Horas' }), h('div', { class: 'ayuda-linea' }, precio(c))]),
          NIVELES.map((n) => h('td', {}, num(c.niveles ? c.niveles[n.id] : null, (x, v) => {
            const k = x.conceptos[i];
            k.niveles = { ...(k.niveles || {}) };
            if (v === null) delete k.niveles[n.id]; else k.niveles[n.id] = v;
            if (!Object.keys(k.niveles).length) delete k.niveles;
          }, { 'aria-label': `Horas ${n.nombre}`, placeholder: '—' }), c.niveles && c.niveles[n.id] !== undefined ? h('div', { class: 'ayuda-linea' }, precio(c, n.id)) : null)),
          h('td', {}, h('textarea', { rows: 2, 'aria-label': 'Qué incluye', value: c.ayuda || '', onchange: (e) => cambiar((x) => { x.conceptos[i].ayuda = e.target.value; }) })),
          h('td', {}, h('button', { class: 'boton-icono', type: 'button', 'aria-label': 'Quitar el concepto', onclick: () => cambiar((x) => { x.conceptos.splice(i, 1); }) }, icono('basura', { tam: 16 }))))))),
      h('button', { class: 'boton', type: 'button', onclick: () => cambiar((x) => { x.conceptos.push({ id: `concepto-${Date.now().toString(36)}`, seccion: 'arte', perfil: 'arte', nombre: 'Concepto nuevo', unidad: 'unidad', horas: 1, ayuda: '' }); }) }, icono('mas', { tam: 16 }), 'Añadir concepto')),
    h('section', { class: 'rejilla-datos' },
      h('div', { class: 'campo' }, h('label', { for: 'tar-estudio' }, 'Estudio (cabecera del PDF)'), txt(tf.estudio.nombre, (x, v) => { x.estudio.nombre = v; }, { id: 'tar-estudio' })),
      h('div', { class: 'campo' }, h('label', { for: 'tar-datos' }, 'Datos del estudio (CIF, dirección, correo)'), txt(tf.estudio.datos, (x, v) => { x.estudio.datos = v; }, { id: 'tar-datos' }))),
    h('div', { class: 'campo' }, h('label', { for: 'tar-condiciones' }, 'Condiciones de los presupuestos nuevos'),
      h('textarea', { id: 'tar-condiciones', rows: 4, value: tf.condiciones || '', onchange: (e) => cambiar((x) => { x.condiciones = e.target.value; }) }))));
}

void nombreSeccion;
