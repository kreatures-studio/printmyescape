// Validación de colecciones de la biblioteca (F2.1 de PLAN-CREADOR-2.md). Sin Node: recibe el manifiesto ya
// leído y una función existe(ruta) para los ficheros, así que la usa también el creador web.
// Dos capas: el esquema (schema/biblioteca-1.schema.json, lo hace validar.mjs con ajv) y estas reglas.

/** Licencias que admite el estudio para piezas de arte: propias o de dominio público. */
export const LICENCIAS_ARTE = ['propia-estudio', 'CC0-1.0'];
/** Textos que no son un autor real. */
const AUTOR_PENDIENTE = /por confirmar|pendiente|desconocid|sin autor|todo|xxx/i;
const TOL = 0.01;

/** Reglas de una colección de arte. Devuelve { errores, avisos }. */
export function reglasArte(coleccion, { existe = null } = {}) {
  const errores = [], avisos = [];
  if (coleccion.tipo !== 'arte') return { errores: [`tipo «${coleccion.tipo}» no admitido todavía`], avisos };
  const vistas = new Set();
  for (const p of coleccion.pieces || []) {
    const r = `piezas/${p.id}`;
    if (vistas.has(`${p.id}@${p.version}`)) errores.push(`${r}: la versión ${p.version} de «${p.id}» está repetida`);
    vistas.add(`${p.id}@${p.version}`);
    if (!p.id.startsWith(p.category + '-')) errores.push(`${r}: el id debe empezar por la categoría «${p.category}-»`);
    if (!LICENCIAS_ARTE.includes(p.license)) errores.push(`${r}: la licencia «${p.license}» no está permitida (${LICENCIAS_ARTE.join(' o ')})`);
    if (!p.author || AUTOR_PENDIENTE.test(p.author)) errores.push(`${r}: falta el autor real («${p.author}»)`);
    if (!p.origin || !Object.keys(p.origin).length) errores.push(`${r}: falta el origen (de qué juego o de quién viene)`);
    for (const z of p.zones || []) {
      if (z.x < -TOL || z.y < -TOL || z.x + z.w > 100 + TOL || z.y + z.h > 100 + TOL) {
        errores.push(`${r}: la zona ${z.tipo} sale de la pieza`);
      }
    }
    if (existe) {
      if (!existe(p.file)) errores.push(`${r}: no existe el fichero «${p.file}»`);
      if (!existe(p.thumb)) errores.push(`${r}: no existe la miniatura «${p.thumb}»`);
    }
    if (p.status === 'reexportar') avisos.push(`${r}: pendiente de reexportar por el artista (no usar en juegos)`);
  }
  return { errores, avisos };
}

/** Textos que usa una página (kind text) y campos que usa (kind field y photo), recorriendo sus elementos. */
function usosDePagina(page) {
  const textos = new Set(), campos = new Set();
  for (const e of page.elements || []) {
    if (e.kind === 'text') textos.add(e.key);
    if (e.kind === 'field' || e.kind === 'photo') campos.add(e.field);
    if (e.kind === 'puzzle') { /* un puzzle se valida en su propia colección */ }
  }
  return { textos, campos };
}

/** Reglas de una colección de páginas (F2.5). Los elementos se validan antes, contra pme-game-2 (validar.mjs). */
export function reglasPagina(coleccion, { existe = null } = {}) {
  const errores = [], avisos = [];
  const vistas = new Set();
  for (const p of coleccion.pieces || []) {
    const r = `paginas/${p.id}`;
    if (vistas.has(`${p.id}@${p.version}`)) errores.push(`${r}: la versión ${p.version} está repetida`);
    vistas.add(`${p.id}@${p.version}`);
    const { textos, campos } = usosDePagina(p.page);
    for (const lang of p.languages) {
      const i18n = (p.i18n || {})[lang];
      if (!i18n) { errores.push(`${r}: faltan los textos en «${lang}»`); continue; }
      for (const k of textos) if (typeof i18n[k] !== 'string') errores.push(`${r}: falta el texto «${k}» en «${lang}»`);
    }
    const declarados = new Set(p.fields);
    for (const c of campos) if (!declarados.has(c)) errores.push(`${r}: usa el campo «${c}» sin declararlo en fields`);
    for (const c of declarados) if (!campos.has(c)) errores.push(`${r}: declara el campo «${c}» que la página no usa`);
    const fondo = p.page.background;
    if (!fondo) errores.push(`${r}: la página no tiene fondo (pon kind none si no lo necesita)`);
    else if (fondo.kind === 'pdf' && existe && !existe(fondo.file)) errores.push(`${r}: no existe el PDF de fondo «${fondo.file}»`);
  }
  return { errores, avisos };
}

/**
 * Reglas de una colección de puzzles de datos (F2.6). «mecanicas» es el registro de mecánicas
 * ({ nombre: { params: { required } } }), que lee validar.mjs de mechanics/. Un puzzle de datos
 * es una mecánica con sus parámetros: no lleva contenido propio (los de contenido vienen en F3).
 */
export function reglasPuzzle(coleccion, { mecanicas = {} } = {}) {
  const errores = [], avisos = [];
  const vistas = new Set();
  for (const z of coleccion.pieces || []) {
    const r = `puzzles/${z.id}`;
    if (vistas.has(`${z.id}@${z.version}`)) errores.push(`${r}: la versión ${z.version} está repetida`);
    vistas.add(`${z.id}@${z.version}`);
    if (z.kind !== 'datos') errores.push(`${r}: solo se admiten puzzles de datos por ahora («${z.kind}»)`);
    const m = mecanicas[z.mechanic];
    if (!m) { errores.push(`${r}: la mecánica «${z.mechanic}» no existe en mechanics/`); continue; }
    if (z.origin.mechanic !== z.mechanic) errores.push(`${r}: el origen dice «${z.origin.mechanic}» y la mecánica es «${z.mechanic}»`);
    if (z.id !== `puzzle-${z.mechanic}`) errores.push(`${r}: el id debe ser «puzzle-${z.mechanic}»`);
    for (const req of (m.params && m.params.required) || []) {
      if (!(req in z.params)) errores.push(`${r}: faltan los parámetros de «${z.mechanic}»: «${req}»`);
    }
    const derivados = new Set(z.derives || []);
    const leidos = new Set();
    for (const { field: c } of z.needs) {
      if (leidos.has(c)) errores.push(`${r}: el campo «${c}» está dos veces en needs`);
      leidos.add(c);
      if (derivados.has(c)) errores.push(`${r}: «${c}» es un campo que el propio puzzle calcula, no uno que necesite`);
    }
    if (z.status === 'reexportar') avisos.push(`${r}: pendiente de revisar (no usar en juegos)`);
  }
  return { errores, avisos };
}

/** Reglas de una colección de secciones (F2.5): cada campo tiene definición y los ejemplos solo usan sus campos.
 *  Admite además los campos «Otro» (otherField) de sus campos de opción múltiple, que no salen en el formulario. */
export function reglasSeccion(coleccion, { existe = null } = {}) {
  const errores = [], avisos = [];
  const vistas = new Set();
  for (const s of coleccion.pieces || []) {
    const r = `secciones/${s.id}`;
    if (vistas.has(`${s.id}@${s.version}`)) errores.push(`${r}: la versión ${s.version} está repetida`);
    vistas.add(`${s.id}@${s.version}`);
    const definidos = new Set(Object.keys(s.fieldDefs));
    const delFormulario = new Set(s.section.fields);
    for (const c of delFormulario) if (!definidos.has(c)) errores.push(`${r}: el campo «${c}» no tiene definición en fieldDefs`);
    const companeros = new Set([...delFormulario].map((c) => s.fieldDefs[c] && s.fieldDefs[c].otherField).filter(Boolean));
    for (const c of companeros) if (!definidos.has(c)) errores.push(`${r}: falta la definición de «${c}» (el «Otro» de otro campo)`);
    const campos = new Set([...delFormulario, ...companeros]);
    for (const c of definidos) if (!campos.has(c)) errores.push(`${r}: la definición «${c}» no está en los campos de la sección`);
    for (const extra of ['nameField', 'photoField']) {
      if (s.section[extra] && !campos.has(s.section[extra])) errores.push(`${r}: ${extra} «${s.section[extra]}» no está en la sección`);
    }
    for (const ej of s.examples) {
      for (const [campo, foto] of Object.entries(ej.photos || {})) {
        if (existe && !existe(foto)) errores.push(`${r}: no existe la foto «${foto}» del ejemplo «${ej.id}» (${campo})`);
      }
      for (const lang of Object.keys(ej.values)) {
        for (const c of Object.keys(ej.values[lang])) {
          if (!campos.has(c)) errores.push(`${r}: el ejemplo «${ej.id}» (${lang}) da valor a «${c}», que no es campo de la sección`);
        }
      }
    }
  }
  return { errores, avisos };
}
