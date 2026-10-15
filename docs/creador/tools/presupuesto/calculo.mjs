// Presupuestos del estudio: tarifas, líneas y totales. Sin dependencias: lo usan el creador (navegador), el PDF, el
// Excel y las pruebas en Node.
//
// Tarifas (presupuestos/tarifas.json del repositorio de juegos; si no existe, TARIFAS_INICIALES):
//   { schema: 'pme-tarifas/1', moneda, iva, gestion (%), perfiles: { id: { nombre, tarifa €/h } },
//     complejidad: { sencilla, media, compleja } (multiplica las horas), conceptos: [{ id, seccion, perfil, nombre,
//     unidad, horas (con complejidad media), ayuda }], condiciones, estudio: { nombre, datos } }
// Presupuesto (presupuestos/<id>.json):
//   { schema: 'pme-presupuesto/1', id: 'P-2026-001', fecha, validez (días), estado, titulo, cliente: { nombre, contacto },
//     juego (id o null), descripcion, lineas: [{ id, seccion, concepto, descripcion, complejidad, cantidad, horas,
//     tarifa }], gestion (%), descuento (%), iva (%), condiciones, mostrarHoras }
// Las horas y la tarifa de cada línea se copian del concepto al crearla y se pueden cambiar: el presupuesto guardado
// no cambia aunque luego cambien las tarifas.

export const SECCIONES = [
  { id: 'arte', nombre: 'Arte e ilustración' },
  { id: 'maquetacion', nombre: 'Diseño y maquetación' },
  { id: 'programacion', nombre: 'Programación' },
  { id: 'pruebas', nombre: 'Pruebas' },
  { id: 'otros', nombre: 'Otros' },
];

export const ESTADOS = { borrador: 'Borrador', enviado: 'Enviado', aceptado: 'Aceptado', rechazado: 'Rechazado' };

/*
 * Tarifas de partida, pensadas como lo haría una ilustradora que trabaja en vector para imprimir: cada pieza pasa por
 * boceto, línea, color y dos rondas de cambios, y se entrega en vector, preparada para el creador. Las horas son las
 * de una pieza de complejidad media; «sencilla» y «compleja» las multiplican. Son una referencia de mercado para un
 * estudio pequeño en España (2026): el estudio las ajusta en Presupuestos › Tarifas.
 */
export const TARIFAS_INICIALES = {
  schema: 'pme-tarifas/1',
  moneda: 'EUR',
  iva: 21,
  gestion: 10,
  perfiles: {
    ilustracion: { nombre: 'Ilustración', tarifa: 30 },
    diseno: { nombre: 'Diseño y maquetación', tarifa: 28 },
    programacion: { nombre: 'Programación', tarifa: 40 },
    pruebas: { nombre: 'Pruebas de juego', tarifa: 25 },
  },
  complejidad: { sencilla: 0.6, media: 1, compleja: 1.8 },
  conceptos: [
    { id: 'icono', seccion: 'arte', perfil: 'ilustracion', nombre: 'Icono', unidad: 'pieza', horas: 1.5, ayuda: 'Icono de app, símbolo o viñeta: una forma sencilla, en los colores del juego.' },
    { id: 'objeto', seccion: 'arte', perfil: 'ilustracion', nombre: 'Objeto o asset pequeño', unidad: 'pieza', horas: 3, ayuda: 'Lupa, regalo, sello, llave…: boceto, color y sombras.' },
    { id: 'papel', seccion: 'arte', perfil: 'ilustracion', nombre: 'Papel, nota o etiqueta', unidad: 'pieza', horas: 2, ayuda: 'Nota kraft, papel rasgado, etiqueta con clip: textura y pliegues.' },
    { id: 'marco', seccion: 'arte', perfil: 'ilustracion', nombre: 'Marco o ficha con hueco de foto', unidad: 'pieza', horas: 3, ayuda: 'Polaroid, ficha de sospechoso: con la zona útil marcada para la foto.' },
    { id: 'dispositivo', seccion: 'arte', perfil: 'ilustracion', nombre: 'Dispositivo con pantalla', unidad: 'pieza', horas: 7, ayuda: 'Móvil, tableta, monitor: carcasa, pantalla y elementos de interfaz.' },
    { id: 'personaje', seccion: 'arte', perfil: 'ilustracion', nombre: 'Personaje', unidad: 'pieza', horas: 8, ayuda: 'Retrato o figura de cuerpo entero, con expresión.' },
    { id: 'ilustracion', seccion: 'arte', perfil: 'ilustracion', nombre: 'Ilustración o cuadro', unidad: 'pieza', horas: 16, ayuda: 'Escena con personajes y fondo (como el cuadro de los perros jugando a las cartas).' },
    { id: 'fondo', seccion: 'arte', perfil: 'ilustracion', nombre: 'Fondo de página completa', unidad: 'pieza', horas: 6, ayuda: 'Fondo o composición que ocupa la página.' },
    { id: 'variacion', seccion: 'arte', perfil: 'ilustracion', nombre: 'Variación de una pieza existente', unidad: 'pieza', horas: 1, ayuda: 'Cambiar un detalle, la forma o el tamaño de una pieza de la biblioteca.' },
    { id: 'recolor', seccion: 'arte', perfil: 'ilustracion', nombre: 'Revisión de pieza recoloreada', unidad: 'pieza', horas: 0.25, ayuda: 'Cambio de tema: el creador recolorea solo; la ilustradora revisa cada pieza y retoca lo que no quede bien.' },
    { id: 'pagina-nueva', seccion: 'maquetacion', perfil: 'diseno', nombre: 'Página nueva', unidad: 'página', horas: 2.5, ayuda: 'Maquetada con piezas de la biblioteca, con sus textos y huecos.' },
    { id: 'pagina-ajuste', seccion: 'maquetacion', perfil: 'diseno', nombre: 'Ajuste de una página existente', unidad: 'página', horas: 0.75, ayuda: 'Mover, cambiar o quitar elementos; revisar que todo cabe.' },
    { id: 'textos', seccion: 'maquetacion', perfil: 'diseno', nombre: 'Textos de una página (ES/EN)', unidad: 'página', horas: 1, ayuda: 'Redacción y traducción, y comprobar que caben en sus huecos.' },
    { id: 'pregunta', seccion: 'maquetacion', perfil: 'diseno', nombre: 'Pregunta del formulario', unidad: 'pregunta', horas: 0.5, ayuda: 'Pregunta nueva con su tope, ayuda y ejemplos.' },
    { id: 'tema', seccion: 'maquetacion', perfil: 'diseno', nombre: 'Cambio de tema de color', unidad: 'juego', horas: 3, ayuda: 'Elegir la paleta, aplicarla en el creador y ajustar contrastes y legibilidad.' },
    { id: 'puzzle-catalogo', seccion: 'programacion', perfil: 'programacion', nombre: 'Puzzle del catálogo', unidad: 'puzzle', horas: 1, ayuda: 'La mecánica ya existe: configurarla, conectarla al formulario y comprobar la solución.' },
    { id: 'puzzle-contenido', seccion: 'programacion', perfil: 'programacion', nombre: 'Puzzle de contenido', unidad: 'puzzle', horas: 2.5, ayuda: 'Sin mecánica: textos, arte y solución montados en el creador.' },
    { id: 'mecanica-sencilla', seccion: 'programacion', perfil: 'programacion', nombre: 'Mecánica nueva sencilla', unidad: 'mecánica', horas: 6, ayuda: 'Una regla nueva del motor: iniciales, prefijos, casillas marcadas…' },
    { id: 'mecanica-compleja', seccion: 'programacion', perfil: 'programacion', nombre: 'Mecánica nueva compleja', unidad: 'mecánica', horas: 16, ayuda: 'Tiras recortables, cifrados, cuadrículas: con su validación y pruebas.' },
    { id: 'campo-derivado', seccion: 'programacion', perfil: 'programacion', nombre: 'Campo calculado', unidad: 'campo', horas: 2, ayuda: 'Un dato que sale de otros (una suma, una palabra cifrada…).' },
    { id: 'prueba-puzzle', seccion: 'pruebas', perfil: 'pruebas', nombre: 'Prueba de un puzzle', unidad: 'puzzle', horas: 0.75, ayuda: 'Imprimirlo y resolverlo en papel, con notas de lo que falla.' },
    { id: 'prueba-juego', seccion: 'pruebas', perfil: 'pruebas', nombre: 'Prueba completa del juego', unidad: 'juego', horas: 3, ayuda: 'Una partida de principio a fin con el juego impreso.' },
    { id: 'otro', seccion: 'otros', perfil: 'diseno', nombre: 'Otro trabajo', unidad: 'hora', horas: 1, ayuda: 'Cualquier otra tarea, por horas.' },
  ],
  condiciones: 'Validez del presupuesto: 30 días. Cada pieza de arte incluye boceto y dos rondas de cambios; los cambios '
    + 'adicionales se presupuestan aparte. Pago: 50 % al aceptar y 50 % a la entrega. Plazo orientativo: a convenir al '
    + 'aceptar. Las piezas de arte quedan en la biblioteca del estudio y el cliente tiene licencia de uso para este juego.',
  estudio: { nombre: 'Kreatures Studio', datos: '' },
};

const redondear = (x) => Math.round((Number(x) || 0) * 100) / 100;
const num = (x, def = 0) => (Number.isFinite(Number(x)) ? Number(x) : def);

/** Tarifas completas: las guardadas sobre las iniciales (lo que falte se toma de las iniciales). */
export function completarTarifas(t) {
  const b = structuredClone(TARIFAS_INICIALES);
  if (!t) return b;
  return {
    ...b, ...t,
    perfiles: { ...b.perfiles, ...(t.perfiles || {}) },
    complejidad: { ...b.complejidad, ...(t.complejidad || {}) },
    conceptos: Array.isArray(t.conceptos) && t.conceptos.length ? t.conceptos : b.conceptos,
    estudio: { ...b.estudio, ...(t.estudio || {}) },
  };
}

export const conceptoDe = (tarifas, id) => tarifas.conceptos.find((c) => c.id === id) || null;

/** Línea nueva de un concepto (horas y tarifa copiadas de las tarifas). */
export function lineaDe(tarifas, conceptoId, { descripcion = '', complejidad = 'media', cantidad = 1, id = null } = {}) {
  const c = conceptoDe(tarifas, conceptoId) || conceptoDe(tarifas, 'otro');
  const k = num(tarifas.complejidad[complejidad], 1);
  return {
    id: id || `l${Math.random().toString(36).slice(2, 8)}`,
    seccion: c.seccion, concepto: c.id, descripcion, complejidad, cantidad,
    horas: redondear(c.horas * k), tarifa: num((tarifas.perfiles[c.perfil] || {}).tarifa, 30),
  };
}

/** Cambia la complejidad de una línea: sus horas pasan a las del concepto con esa complejidad. */
export function conComplejidad(tarifas, linea, complejidad) {
  const c = conceptoDe(tarifas, linea.concepto);
  const k = num(tarifas.complejidad[complejidad], 1);
  return { ...linea, complejidad, horas: c ? redondear(c.horas * k) : linea.horas };
}

/** Importes: cada línea y los totales. */
export function totales(p) {
  const lineas = (p.lineas || []).map((l) => {
    const unidad = redondear(num(l.horas) * num(l.tarifa));
    return { ...l, precioUnidad: unidad, importe: redondear(unidad * num(l.cantidad, 1)), horasTotal: redondear(num(l.horas) * num(l.cantidad, 1)) };
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
  [/mec[aá]nica.*(compleja|tiras|cifrad|cuadr[ií]cula)/i, 'mecanica-compleja'],
  [/mec[aá]nica/i, 'mecanica-sencilla'],
  [/campo (calculado|derivado)|c[aá]lculo/i, 'campo-derivado'],
  [/ilustraci[oó]n|cuadro|escena/i, 'ilustracion'],
  [/personaje|retrato/i, 'personaje'],
  [/dispositivo|m[oó]vil|tablet|tableta|monitor|pantalla/i, 'dispositivo'],
  [/icono|s[ií]mbolo|vi[nñ]eta/i, 'icono'],
  [/marco|polaroid|ficha/i, 'marco'],
  [/nota|papel|etiqueta|sobre\b/i, 'papel'],
  [/fondo/i, 'fondo'],
  [/recolor|tema|paleta/i, 'tema'],
  [/p[aá]gina nueva/i, 'pagina-nueva'],
  [/p[aá]gina/i, 'pagina-ajuste'],
  [/puzzle de contenido/i, 'puzzle-contenido'],
  [/puzzle/i, 'puzzle-catalogo'],
  [/pregunta|formulario/i, 'pregunta'],
  [/traducci|textos?\b/i, 'textos'],
  [/prueba de juego|probar|playtest/i, 'prueba-juego'],
  [/pieza|arte|objeto|dibujo|asset/i, 'objeto'],
];
export function conceptoParaTexto(texto) {
  for (const [re, id] of PISTAS) if (re.test(texto)) return id;
  return 'otro';
}

/** Líneas desde lo que un juego tiene «A presupuestar» (changes[].presupuestar), una por nota. */
export function lineasDesdeJuego(tarifas, juego) {
  const notas = (juego.changes || []).flatMap((c) => c.presupuestar || []);
  return notas.map((t) => lineaDe(tarifas, conceptoParaTexto(t), { descripcion: t }));
}

/** Piezas de arte distintas que usa un juego v2 (para presupuestar un cambio de tema). */
export function piezasDelJuego(juego) {
  const refs = new Set();
  const ver = (els) => { for (const e of els || []) if (e.kind === 'art') refs.add(e.ref); };
  for (const p of juego.pages || []) { ver(p.elements); if (p.background && p.background.kind === 'art') refs.add(p.background.ref); }
  for (const z of juego.puzzles || []) ver(z.page && z.page.elements);
  return [...refs];
}

/** Líneas de un cambio de tema: el trabajo de diseño del tema, revisar cada pieza recoloreada y repasar las páginas. */
export function lineasCambioDeTema(tarifas, juego, nombreTema = '') {
  const piezas = piezasDelJuego(juego);
  const paginas = (juego.pages || []).length;
  const out = [lineaDe(tarifas, 'tema', { descripcion: nombreTema ? `Paleta «${nombreTema}» aplicada a todo el juego` : 'Paleta nueva aplicada a todo el juego' })];
  if (piezas.length) out.push(lineaDe(tarifas, 'recolor', { cantidad: piezas.length, descripcion: `${piezas.length} piezas de arte del juego: revisar y retocar las que no queden bien` }));
  if (paginas) out.push(lineaDe(tarifas, 'pagina-ajuste', { cantidad: paginas, complejidad: 'sencilla', descripcion: 'Repaso de cada página: contraste de textos y huecos' }));
  out.push(lineaDe(tarifas, 'prueba-juego', { complejidad: 'sencilla', descripcion: 'Imprimir y comprobar colores en papel' }));
  return out;
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
