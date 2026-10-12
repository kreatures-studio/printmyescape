// Índice de la biblioteca para el servidor MCP y las herramientas (F3.1 de PLAN-CREADOR-2.md).
// La biblioteca vive en <raíz del motor>/biblioteca, o donde diga PME_BIBLIOTECA. Nunca se publica (PLAN §1.2).
//
//   colecciones(tipo)        → [{ nombre, dir, manifest }] de biblioteca/<tipo>/<colección>/manifest.json
//   entradas(tipo)           → todas las entradas del tipo, cada una con su colección y carpeta
//   buscar(tipo, ref)        → la entrada de «id@versión» (o de «id»: la versión más alta), o null
//   arteCombinado()          → una colección de arte virtual con todas las piezas (ficheros en ruta absoluta), para
//                              el motor y el validador; si un id@versión se repite entre colecciones, gana la primera
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TIPOS = { arte: 'arte', pagina: 'paginas', seccion: 'secciones', puzzle: 'puzzles' };

export function rutaBiblioteca() {
  return process.env.PME_BIBLIOTECA ? path.resolve(process.env.PME_BIBLIOTECA) : path.join(ROOT, 'biblioteca');
}

export function colecciones(tipo) {
  if (!TIPOS[tipo]) throw new Error(`tipo de biblioteca desconocido: «${tipo}» (${Object.keys(TIPOS).join(', ')})`);
  const base = path.join(rutaBiblioteca(), TIPOS[tipo]);
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base).sort()
    .filter((n) => fs.existsSync(path.join(base, n, 'manifest.json')))
    .map((n) => ({ nombre: n, dir: path.join(base, n), manifest: JSON.parse(fs.readFileSync(path.join(base, n, 'manifest.json'), 'utf8')) }));
}

export function entradas(tipo) {
  return colecciones(tipo).flatMap((c) => c.manifest.pieces.map((p) => ({ ...p, coleccion: c.nombre, dir: c.dir })));
}

/** «id@versión» → { id, version } (version null si no se indica). */
export function partirRef(ref) {
  const m = /^(.+?)(?:@(\d+))?$/.exec(String(ref));
  return { id: m[1], version: m[2] ? Number(m[2]) : null };
}

export function buscar(tipo, ref) {
  const { id, version } = partirRef(ref);
  const candidatas = entradas(tipo).filter((e) => e.id === id && (version === null || e.version === version));
  if (!candidatas.length) return null;
  return candidatas.reduce((a, b) => (b.version > a.version ? b : a));
}

export function arteCombinado() {
  const vistas = new Set();
  const pieces = [];
  for (const e of entradas('arte')) {
    const clave = `${e.id}@${e.version}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    const { coleccion, dir, ...pieza } = e;
    pieces.push({ ...pieza, file: path.join(dir, pieza.file), thumb: pieza.thumb && path.join(dir, pieza.thumb), coleccion });
  }
  return { schema: 'pme-biblioteca/1', tipo: 'arte', pieces };
}
