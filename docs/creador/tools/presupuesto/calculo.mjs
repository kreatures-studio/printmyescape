// Presupuestos del estudio: tarifas, líneas y totales. Sin dependencias: lo usan el creador (navegador), el PDF, el
// Excel y las pruebas en Node.
//
// Tarifas (presupuestos/tarifas.json del repositorio de juegos; si no existe o es de otro formato, TARIFAS_INICIALES):
//   { schema: 'pme-tarifas/2', moneda, iva, gestion (%), perfiles: { id: { nombre, tarifa €/h } },
//     conceptos: [{ id, seccion, perfil, nombre, unidad, horas, niveles?: { sencilla, media, compleja, muy-compleja }
//     (horas de cada nivel de complejidad), ayuda }], condiciones, estudio: { nombre, datos } }
// Presupuesto (presupuestos/<id>.json):
//   { schema: 'pme-presupuesto/1', id: 'P-2026-001', fecha, validez (días), estado, titulo, cliente: { nombre, contacto },
//     juego (id o null), descripcion, lineas: [{ id, seccion, concepto, descripcion, complejidad, cantidad, horas,
//     tarifa, anclas? }], gestion (%), descuento (%), iva (%), condiciones, mostrarHoras, actualizado (ISO) }
//   anclas: dónde va la línea en el juego, para verla sobre sus páginas: [{ pagina: 'p3', elemento?: 'p3-e5', x?, y? }]
//   (x, y en % de la página; con elemento, el centro del elemento).
// Las horas y la tarifa de cada línea se copian del concepto al crearla y se pueden cambiar: el presupuesto guardado
// no cambia aunque luego cambien las tarifas.

export const SECCIONES = [
  { id: 'arte', nombre: 'Arte (props)' },
  { id: 'maquetacion', nombre: 'Maquetación' },
  { id: 'gamedesign', nombre: 'Game design' },
  { id: 'programacion', nombre: 'Programación' },
  { id: 'pruebas', nombre: 'Pruebas' },
  { id: 'otros', nombre: 'Otros' },
];

/** Color de cada sección (chapas, barras y marcas sobre las páginas). */
export const COLOR_SECCION = { arte: '#B5482E', maquetacion: '#1F5B4A', gamedesign: '#8A6A12', programacion: '#4338A8', pruebas: '#6B5B2E', otros: '#5E6863' };

export const ESTADOS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };

/** Niveles de complejidad (los props van de baja a muy alta; los puzzles, de sencillo a complejo). */
export const NIVELES = [
  { id: 'sencilla', nombre: 'Baja · sencillo' },
  { id: 'media', nombre: 'Media · medio' },
  { id: 'compleja', nombre: 'Alta · complejo' },
  { id: 'muy-compleja', nombre: 'Muy alta' },
];

/*
 * Tarifas del estudio (15-10-2026). Cada concepto tiene sus horas por nivel de complejidad; el precio es horas × la
 * tarifa del perfil. Se cambian en Presupuestos › Tarifas (o con Claude: set_rates).
 */
export const TARIFAS_INICIALES = {
  schema: 'pme-tarifas/2',
  moneda: 'EUR',
  iva: 21,
  gestion: 0,
  perfiles: {
    arte: { nombre: 'Arte (props)', tarifa: 30 },
    maquetacion: { nombre: 'Maquetación', tarifa: 30 },
    gamedesign: { nombre: 'Game design', tarifa: 30 },
    programacion: { nombre: 'Programación', tarifa: 50 },
  },
  conceptos: [
    { id: 'prop', seccion: 'arte', perfil: 'arte', nombre: 'Prop', unidad: 'prop', horas: 1,
      niveles: { sencilla: 0.5, media: 1, compleja: 2, 'muy-compleja': 2.5 },
      ayuda: 'Una pieza de arte. Baja: icono, viñeta, recoloreado. Media: objeto, nota, etiqueta. Alta: marco, dispositivo, personaje. Muy alta: ilustración o cuadro.' },
    { id: 'maquetacion', seccion: 'maquetacion', perfil: 'maquetacion', nombre: 'Maquetación', unidad: 'juego', horas: 5,
      ayuda: 'Montar las páginas del juego con sus piezas, textos y huecos, y comprobar que todo cabe.' },
    { id: 'gamedesign-puzzle', seccion: 'gamedesign', perfil: 'gamedesign', nombre: 'Game design de un puzzle', unidad: 'puzzle', horas: 3.5,
      niveles: { sencilla: 2, media: 3.5, compleja: 7 },
      ayuda: 'Idear el puzzle: mecánica, pistas, solución y cómo encaja en la historia.' },
    { id: 'gamedesign-testing', seccion: 'gamedesign', perfil: 'gamedesign', nombre: 'Game design: testing', unidad: 'prueba', horas: 3,
      ayuda: 'Jugar el escape impreso de principio a fin y ajustar lo que falle.' },
    { id: 'programacion-puzzle', seccion: 'programacion', perfil: 'programacion', nombre: 'Programación de un puzzle', unidad: 'puzzle', horas: 2,
      niveles: { sencilla: 1, media: 2, compleja: 3 },
      ayuda: 'Montarlo en el creador: mecánica, campos del formulario y solución. Sencillo: del catálogo; complejo: mecánica nueva.' },
    { id: 'programacion-ajustes', seccion: 'programacion', perfil: 'programacion', nombre: 'Programación: ajustes', unidad: 'ajuste', horas: 1,
      ayuda: 'Cambios pequeños: un campo, un tema de color, un texto calculado…' },
    { id: 'otro', seccion: 'otros', perfil: 'maquetacion', nombre: 'Otro trabajo', unidad: 'hora', horas: 1, ayuda: 'Cualquier otra tarea, por horas.' },
  ],
  condiciones: 'Validez del presupuesto: 30 días. Cada prop incluye boceto y dos rondas de cambios; los cambios '
    + 'adicionales se presupuestan aparte. Pago: 50 % al aceptar y 50 % a la entrega. Plazo orientativo: a convenir al '
    + 'aceptar. Las piezas de arte quedan en la biblioteca del estudio y el cliente tiene licencia de uso para este juego.',
  estudio: { nombre: 'Kreatures Studio', datos: '' },
};

const redondear = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, def = 0) => (Number.isFinite(Number(x)) ? Number(x) : def);

/** Tarifas completas: las guardadas sobre las iniciales (lo que falte se toma de las iniciales). Unas tarifas de otro
 *  formato (las de partida antiguas, con multiplicadores de complejidad) no se mezclan: se usan las iniciales. */
export function completarTarifas(t) {
  const b = structuredClone(TARIFAS_INICIALES);
  if (!t || t.schema !== b.schema) return b;
  return {
    ...b, ...t,
    perfiles: { ...b.perfiles, ...(t.perfiles || {}) },
    conceptos: Array.isArray(t.conceptos) && t.conceptos.length ? t.conceptos : b.conceptos,
    estudio: { ...b.estudio, ...(t.estudio || {}) },
  };
}

export const conceptoDe = (tarifas, id) => tarifas.conceptos.find((c) => c.id === id) || null;

/** Niveles de complejidad que tiene un concepto (los de su tabla, o ninguno si sus horas son fijas). */
export const nivelesDe = (c) => (c && c.niveles ? NIVELES.filter((n) => c.niveles[n.id] !== undefined) : []);

/** Horas de un concepto con una complejidad (la más cercana que tenga: «muy alta» en un puzzle es «complejo»). */
export function horasDe(c, complejidad = 'media') {
  if (!c) return 1;
  if (!c.niveles) return num(c.horas, 1);
  if (c.niveles[complejidad] !== undefined) return num(c.niveles[complejidad]);
  const orden = NIVELES.map((n) => n.id);
  const i = orden.indexOf(complejidad);
  const tiene = orden.filter((k) => c.niveles[k] !== undefined);
  const cercano = tiene.reduce((a, k) => (Math.abs(orden.indexOf(k) - i) < Math.abs(orden.indexOf(a) - i) ? k : a), tiene[0]);
  return num(c.niveles[cercano], num(c.horas, 1));
}

/** Nombre del nivel de una línea, en el lenguaje del concepto: «baja … muy alta» (props, con cuatro niveles) o
 *  «sencillo, medio, complejo» (puzzles). Vacío si el concepto no tiene niveles. */
export function nivelTexto(c, nivel) {
  if (!c || !c.niveles || !nivel) return '';
  const cuatro = c.niveles['muy-compleja'] !== undefined;
  return (cuatro ? { sencilla: 'baja', media: 'media', compleja: 'alta', 'muy-compleja': 'muy alta' } : { sencilla: 'sencillo', media: 'medio', compleja: 'complejo', 'muy-compleja': 'muy complejo' })[nivel] || nivel;
}

/** Nombre de una línea con su nivel, como lo dice el estudio: «Prop · complejidad alta», «Game design de un puzzle medio». */
export function nombreConNivel(c, nivel, id = '') {
  const nombre = c ? c.nombre : id;
  const nv = nivelTexto(c, nivel);
  if (!nv) return nombre;
  return /puzzle$/i.test(nombre) ? `${nombre} ${nv}` : `${nombre} · complejidad ${nv}`;
}

/** Nivel válido para un concepto (el pedido si lo tiene; si no, el más cercano; null si sus horas son fijas). */
function nivelPara(c, complejidad) {
  const ns = nivelesDe(c).map((n) => n.id);
  if (!ns.length) return null;
  if (ns.includes(complejidad)) return complejidad;
  const orden = NIVELES.map((n) => n.id);
  const i = orden.indexOf(complejidad);
  return ns.reduce((a, k) => (Math.abs(orden.indexOf(k) - i) < Math.abs(orden.indexOf(a) - i) ? k : a), ns[0]);
}

/** Línea nueva de un concepto (horas y tarifa copiadas de las tarifas). */
export function lineaDe(tarifas, conceptoId, { descripcion = '', complejidad = 'media', cantidad = 1, id = null } = {}) {
  const c = conceptoDe(tarifas, conceptoId) || conceptoDe(tarifas, 'otro') || tarifas.conceptos[0];
  const nivel = nivelPara(c, complejidad);
  const l = {
    id: id || `l${Math.random().toString(36).slice(2, 8)}`,
    seccion: c.seccion, concepto: c.id, descripcion, cantidad,
    horas: redondear(horasDe(c, nivel || 'media')), tarifa: num((tarifas.perfiles[c.perfil] || {}).tarifa, 30),
  };
  if (nivel) l.complejidad = nivel;
  return l;
}

/** Cambia la complejidad de una línea: sus horas pasan a las del concepto con esa complejidad. */
export function conComplejidad(tarifas, linea, complejidad) {
  const c = conceptoDe(tarifas, linea.concepto);
  const nivel = nivelPara(c, complejidad);
  if (!nivel) return { ...linea };
  return { ...linea, complejidad: nivel, horas: redondear(horasDe(c, nivel)) };
}

/** Importes: cada línea y los totales. Las líneas salen en el orden de las secciones, numeradas (n) desde 1. */
export function totales(p) {
  const orden = SECCIONES.map((s) => s.id);
  const ordenadas = [...(p.lineas || [])].map((l, i) => ({ l, i }))
    .sort((a, b) => (orden.indexOf(a.l.seccion || 'otros') - orden.indexOf(b.l.seccion || 'otros')) || a.i - b.i).map((x) => x.l);
  const lineas = ordenadas.map((l, k) => {
    const unidad = redondear(num(l.horas) * num(l.tarifa));
    return { ...l, n: k + 1, precioUnidad: unidad, importe: redondear(unidad * num(l.cantidad, 1)), horasTotal: redondear(num(l.horas) * num(l.cantidad, 1)) };
  });
  const porSeccion = SECCIONES.map((s) => {
    const ls = lineas.filter((l) => (l.seccion || 'otros') === s.id);
    return { ...s, lineas: ls, importe: redondear(ls.reduce((a, l) => a + l.importe, 0)), horas: redondear(ls.reduce((a, l) => a + l.horasTotal, 0)) };
  }).filter((s) => s.lineas.length);
  const base = redondear(lineas.reduce((a, l) => a + l.importe, 0));
  const gestion = redondear(base * num(p.gestion) / 100);
  const bruto = redondear(base + gestion);
  const descuento = redondear(bruto * num(p.descuento) / 100);
  const imponible = redondear(bruto - descuento);
  const iva = redondear(imponible * num(p.iva) / 100);
  return { lineas, porSeccion, base, gestion, bruto, descuento, imponible, iva, total: redondear(imponible + iva), horas: redondear(lineas.reduce((a, l) => a + l.horasTotal, 0)) };
}

/** Siguiente número libre del año: P-2026-001, P-2026-002… */
export function siguienteId(existentes, fecha = new Date()) {
  const anio = fecha.getFullYear();
  const usados = existentes.map((id) => new RegExp(`^P-${anio}-(\\d+)$`).exec(id)).filter(Boolean).map((m) => Number(m[1]));
  return `P-${anio}-${String((usados.length ? Math.max(...usados) : 0) + 1).padStart(3, '0')}`;
}

export const hoy = () => new Date().toISOString().slice(0, 10);

/** Presupuesto en blanco con las condiciones e IVA de las tarifas. */
export function presupuestoNuevo(tarifas, id, { titulo = '', juego = null, cliente = '' } = {}) {
  return {
    schema: 'pme-presupuesto/1', id, fecha: hoy(), validez: 30, estado: 'borrador', titulo, juego,
    cliente: { nombre: cliente, contacto: '' }, descripcion: '', lineas: [],
    gestion: num(tarifas.gestion, 0), descuento: 0, iva: num(tarifas.iva, 21), condiciones: tarifas.condiciones, mostrarHoras: false,
  };
}

/* Concepto que mejor encaja con un texto (las notas «A presupuestar» de Claude, en lenguaje natural). */
const PISTAS = [
  [/mec[aá]nica.*(compleja|tiras|cifrad|cuadr[ií]cula)|mec[aá]nica nueva/i, ['programacion-puzzle', 'compleja']],
  [/mec[aá]nica|programar|programaci[oó]n/i, ['programacion-puzzle', 'media']],
  [/campo (calculado|derivado)|c[aá]lculo|ajuste/i, ['programacion-ajustes', null]],
  [/ilustraci[oó]n|cuadro|escena/i, ['prop', 'muy-compleja']],
  [/personaje|retrato|dispositivo|m[oó]vil|tablet|tableta|monitor|pantalla|marco|polaroid|ficha/i, ['prop', 'compleja']],
  [/icono|s[ií]mbolo|vi[nñ]eta|recolor/i, ['prop', 'sencilla']],
  [/nota|papel|etiqueta|sobre\b|objeto|pieza|arte|dibujo|asset|prop\b/i, ['prop', 'media']],
  [/tema|paleta/i, ['programacion-ajustes', null]],
  [/game ?design|idear|dise[nñ]ar (el|un) puzzle/i, ['gamedesign-puzzle', 'media']],
  [/puzzle|prueba nueva|acertijo/i, ['gamedesign-puzzle', 'media']],
  [/maquet|p[aá]gina/i, ['maquetacion', null]],
  [/testing|prueba de juego|probar|playtest/i, ['gamedesign-testing', null]],
];
/** Concepto (y complejidad) que mejor encaja con un texto: { concepto, complejidad }. */
export function conceptoYNivel(texto) {
  for (const [re, [concepto, complejidad]] of PISTAS) if (re.test(texto)) return { concepto, complejidad: complejidad || 'media' };
  return { concepto: 'otro', complejidad: 'media' };
}
export function conceptoParaTexto(texto) { return conceptoYNivel(texto).concepto; }

/** Líneas desde lo que un juego tiene «A presupuestar» (changes[].presupuestar), una por nota. */
export function lineasDesdeJuego(tarifas, juego) {
  const notas = (juego.changes || []).flatMap((c) => c.presupuestar || []);
  return notas.map((t) => { const { concepto, complejidad } = conceptoYNivel(t); return lineaDe(tarifas, concepto, { descripcion: t, complejidad }); });
}

/** Piezas de arte distintas que usa un juego v2 (para presupuestar un cambio de tema). */
export function piezasDelJuego(juego) {
  const refs = new Set();
  const ver = (els) => { for (const e of els || []) if (e.kind === 'art') refs.add(e.ref); };
  for (const p of juego.pages || []) { ver(p.elements); if (p.background && p.background.kind === 'art') refs.add(p.background.ref); }
  for (const z of juego.puzzles || []) ver(z.page && z.page.elements);
  return [...refs];
}

/** Dónde sale por primera vez cada pieza de arte de un juego v2: { ref: { pagina, elemento } }. */
export function primeraApariciones(juego) {
  const out = {};
  for (const p of juego.pages || []) for (const e of p.elements || []) if (e.kind === 'art' && !out[e.ref]) out[e.ref] = { pagina: p.id, elemento: e.id };
  return out;
}

/** Líneas de un cambio de tema: aplicar la paleta, revisar cada pieza recoloreada (prop de complejidad baja, con su
 *  sitio en el juego) y probar el escape impreso. */
export function lineasCambioDeTema(tarifas, juego, nombreTema = '') {
  const piezas = piezasDelJuego(juego);
  const donde = primeraApariciones(juego);
  const out = [lineaDe(tarifas, 'programacion-ajustes', { descripcion: nombreTema ? `Aplicar la paleta «${nombreTema}» a todo el juego y ajustar contrastes` : 'Aplicar la paleta nueva a todo el juego y ajustar contrastes' })];
  if (piezas.length) {
    const l = lineaDe(tarifas, 'prop', { complejidad: 'sencilla', cantidad: piezas.length, descripcion: `Revisar y retocar las ${piezas.length} piezas recoloreadas` });
    l.anclas = piezas.filter((r) => donde[r]).map((r) => ({ pagina: donde[r].pagina, elemento: donde[r].elemento }));
    out.push(l);
  }
  out.push(lineaDe(tarifas, 'gamedesign-testing', { descripcion: 'Imprimir y comprobar colores y legibilidad en papel' }));
  return out;
}

/**
 * Marcas sobre las páginas del juego: [{ n, linea, seccion, pagina, indice (0…), x, y, ref }] (x, y en % de la página).
 * Las anclas de páginas o elementos que ya no existen no salen.
 */
export function marcas(p, juego) {
  if (!juego || !juego.pages) return [];
  const out = [];
  for (const l of totales(p).lineas) {
    for (const a of l.anclas || []) {
      const indice = juego.pages.findIndex((x) => x.id === a.pagina);
      if (indice < 0) continue;
      let x = Number(a.x), y = Number(a.y), ref = a.ref || null;
      if (a.elemento) {
        const e = juego.pages[indice].elements.find((el) => el.id === a.elemento);
        if (!e) continue;
        x = e.x + e.w / 2; y = e.y + e.h / 2;
        if (e.kind === 'art') ref = e.ref;
      }
      if (!Number.isFinite(x) || !Number.isFinite(y)) { x = 92; y = 6; }
      out.push({ n: l.n, linea: l.id, seccion: l.seccion || 'otros', pagina: a.pagina, indice, x: Math.max(2, Math.min(98, x)), y: Math.max(2, Math.min(98, y)), ref });
    }
  }
  return out;
}

/** Piezas de la biblioteca a las que apunta una línea (para su miniatura): refs id@versión, sin repetir. */
export function piezasDeLinea(linea, juego) {
  const refs = [];
  for (const a of linea.anclas || []) {
    let r = a.ref || null;
    if (!r && a.elemento && juego) {
      const pg = (juego.pages || []).find((x) => x.id === a.pagina);
      const e = pg && pg.elements.find((el) => el.id === a.elemento);
      if (e && e.kind === 'art') r = e.ref;
    }
    if (r && !refs.includes(r)) refs.push(r);
  }
  return refs;
}

/** Comprobaciones mínimas de un presupuesto (antes de guardarlo). Devuelve una lista de errores. */
export function erroresDe(p) {
  const e = [];
  if (!/^P-\d{4}-\d{3,}$/.test(p.id || '')) e.push('el número tiene que ser P-AAAA-NNN');
  if (!(p.titulo || '').trim()) e.push('falta el título');
  for (const [i, l] of (p.lineas || []).entries()) {
    if (!(num(l.cantidad) > 0)) e.push(`línea ${i + 1}: la cantidad tiene que ser mayor que 0`);
    if (!(num(l.horas) >= 0)) e.push(`línea ${i + 1}: horas no válidas`);
    if (!(num(l.tarifa) >= 0)) e.push(`línea ${i + 1}: tarifa no válida`);
    if (l.anclas !== undefined && !Array.isArray(l.anclas)) e.push(`línea ${i + 1}: anclas tiene que ser una lista`);
    for (const a of l.anclas || []) if (!a || !/^p\d+$/.test(a.pagina || '')) e.push(`línea ${i + 1}: cada ancla necesita su página (p1, p2…)`);
  }
  return e;
}

/** Importe con formato español: 1.234,50 € */
export function euros(x, moneda = 'EUR') {
  const s = (Math.round((Number(x) || 0) * 100) / 100).toFixed(2);
  const [ent, dec] = s.split('.');
  const neg = ent.startsWith('-');
  const digitos = neg ? ent.slice(1) : ent;
  const miles = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${neg ? '-' : ''}${miles},${dec} ${moneda === 'EUR' ? '€' : moneda}`;
}
export const horasTexto = (h) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`;
