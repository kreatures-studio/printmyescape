#!/usr/bin/env node
// Valida una colección de la biblioteca: esquema (ajv) y reglas (reglas.mjs).
// Uso: node tools/biblioteca/validar.mjs <carpeta de la colección>   (código 0 si no hay errores)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import Ajv2020 from 'ajv/dist/2020.js';
import { reglasArte, reglasPagina, reglasSeccion, reglasPuzzle } from './reglas.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'biblioteca-1.schema.json'), 'utf8'));
/** Registro de mecánicas del motor (mechanics/), para comprobar los puzzles de datos. */
const MECANICAS = createRequire(import.meta.url)(path.join(ROOT, 'mechanics', 'index.js'));

/** Errores de esquema y de reglas de una carpeta de colección. */
export function validarColeccion(carpeta) {
  const errores = [], avisos = [];
  const file = path.join(carpeta, 'manifest.json');
  if (!fs.existsSync(file)) return { errores: [`falta ${file}`], avisos };
  const coleccion = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ajv = new Ajv2020({ allErrors: true });
  const validar = ajv.compile(SCHEMA);
  if (!validar(coleccion)) {
    for (const e of validar.errors) errores.push(`esquema ${e.instancePath || '/'}: ${e.message}`);
    return { errores, avisos };
  }
  const existe = (rel) => fs.existsSync(path.resolve(carpeta, rel));
  if (coleccion.tipo === 'arte') {
    const r = reglasArte(coleccion, { existe });
    return { errores: [...errores, ...r.errores], avisos: [...avisos, ...r.avisos] };
  }
  if (coleccion.tipo === 'pagina') {
    // La página se valida contra el mismo formato que un juego (pme-game/2, definición «page»).
    const g2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'pme-game-2.schema.json'), 'utf8'));
    const validarPagina = ajv.compile({ $defs: g2.$defs, $ref: '#/$defs/page' });
    for (const p of coleccion.pieces) {
      if (!validarPagina(p.page)) for (const e of validarPagina.errors) errores.push(`esquema paginas/${p.id} page${e.instancePath}: ${e.message}`);
    }
    const r = reglasPagina(coleccion, { existe });
    return { errores: [...errores, ...r.errores], avisos: [...avisos, ...r.avisos] };
  }
  if (coleccion.tipo === 'seccion') {
    const g2 = JSON.parse(fs.readFileSync(path.join(ROOT, 'schema', 'pme-game-2.schema.json'), 'utf8'));
    const validarCampo = ajv.compile({ $defs: g2.$defs, $ref: '#/$defs/field' });
    for (const s of coleccion.pieces) {
      for (const [campo, def] of Object.entries(s.fieldDefs)) {
        if (!validarCampo(def)) for (const e of validarCampo.errors) errores.push(`esquema secciones/${s.id} campo ${campo}${e.instancePath}: ${e.message}`);
      }
    }
    const r = reglasSeccion(coleccion, { existe });
    return { errores: [...errores, ...r.errores], avisos: [...avisos, ...r.avisos] };
  }
  if (coleccion.tipo === 'puzzle') {
    const r = reglasPuzzle(coleccion, { mecanicas: MECANICAS });
    return { errores: [...errores, ...r.errores], avisos: [...avisos, ...r.avisos] };
  }
  return { errores: [...errores, `tipo «${coleccion.tipo}» sin reglas`], avisos };
}

function main() {
  const carpeta = process.argv[2];
  if (!carpeta) { console.error('uso: node tools/biblioteca/validar.mjs <carpeta de la colección>'); return 2; }
  const { errores, avisos } = validarColeccion(path.resolve(carpeta));
  for (const a of avisos) console.log(`AVISO ${a}`);
  for (const e of errores) console.log(`ERROR ${e}`);
  console.log(errores.length ? `NO VÁLIDA: ${errores.length} error(es)` : `VÁLIDA (${avisos.length} aviso(s))`);
  return errores.length ? 1 : 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
