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
