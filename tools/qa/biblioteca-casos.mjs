// Casos de la validación de colecciones de la biblioteca (F2.1 de PLAN-CREADOR-2.md).
// Cada caso toma la colección real de El regalo robado, cambia una cosa en su manifiesto y comprueba
// que el validador la rechaza (o solo avisa). Uso: node tools/qa/biblioteca-casos.mjs (código 0 si todo pasa).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validarColeccion } from '../biblioteca/validar.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REAL = path.join(ROOT, 'biblioteca', 'arte', 'el-regalo-robado');
const TMP = path.join(ROOT, 'tools', 'qa', 'salida-qa', 'biblioteca-casos');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const base = JSON.parse(fs.readFileSync(path.join(REAL, 'manifest.json'), 'utf8'));
const clon = () => structuredClone(base);
const pieza = (m, i = 0) => m.pieces[i];

const CASOS = [
  { nombre: 'colección real pasa sin avisos (ya no queda nada por reexportar)', tipo: 'ok', m: clon },
  { nombre: 'pieza por reexportar: aviso, no error', tipo: 'ok', avisos: 'pendiente de reexportar',
    m: () => { const m = clon(); pieza(m).status = 'reexportar'; return m; } },
  { nombre: 'pieza sin autor: error de esquema', tipo: 'error', espera: 'author',
    m: () => { const m = clon(); pieza(m).author = ''; return m; } },
  { nombre: 'pieza sin licencia: error', tipo: 'error', espera: "required property 'license'",
    m: () => { const m = clon(); delete pieza(m).license; return m; } },
  { nombre: 'licencia que no se admite: error', tipo: 'error', espera: 'licencia «All rights reserved» no está permitida',
    m: () => { const m = clon(); pieza(m).license = 'All rights reserved'; return m; } },
  { nombre: 'autor de relleno («por confirmar»): error', tipo: 'error', espera: 'falta el autor real',
    m: () => { const m = clon(); pieza(m).author = 'Por confirmar'; return m; } },
  { nombre: 'zona que sale de la pieza: error', tipo: 'error', espera: 'sale de la pieza',
    m: () => { const m = clon(); pieza(m).zones = [{ tipo: 'zona-foto', x: 80, y: 10, w: 30, h: 20 }]; return m; } },
  { nombre: 'fichero que no existe: error', tipo: 'error', espera: 'no existe el fichero',
    m: () => { const m = clon(); pieza(m).file = 'piezas/no-existe-v1.pdf'; return m; } },
  { nombre: 'dos etiquetas (mínimo 3): error de esquema', tipo: 'error', espera: 'must NOT have fewer',
    m: () => { const m = clon(); pieza(m).tags = ['misterio', 'kraft']; return m; } },
  { nombre: 'id que no empieza por la categoría: error', tipo: 'error', espera: 'debe empezar por la categoría',
    m: () => { const m = clon(); pieza(m).id = 'papel-x-marco'; pieza(m).category = 'marco'; return m; } },
  { nombre: 'misma versión de una pieza dos veces: error', tipo: 'error', espera: 'está repetida',
    m: () => { const m = clon(); m.pieces.push(structuredClone(pieza(m))); return m; } },
  { nombre: 'pieza descartada no entra en la colección (estado no admitido): error', tipo: 'error', espera: 'status',
    m: () => { const m = clon(); pieza(m).status = 'descartar'; return m; } },
];

let fallos = 0;
for (const [i, c] of CASOS.entries()) {
  const dir = path.join(TMP, `caso-${i}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(path.join(REAL, 'piezas'), path.join(dir, 'piezas'), 'dir');
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(c.m(), null, 2));
  const { errores, avisos } = validarColeccion(dir);
  let ok;
  if (c.tipo === 'ok') ok = errores.length === 0 && (c.avisos ? avisos.some((a) => a.includes(c.avisos)) : avisos.length === 0);
  else ok = errores.some((e) => e.includes(c.espera));
  if (!ok) fallos++;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${c.nombre}${ok ? '' : ' | errores: ' + JSON.stringify(errores.slice(0, 3))}`);
}
console.log(`\nRESUMEN: ${CASOS.length - fallos}/${CASOS.length} OK`);
process.exit(fallos ? 1 : 0);
