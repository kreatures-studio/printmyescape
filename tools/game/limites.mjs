#!/usr/bin/env node
// Capacidad y límite de cada campo de texto (contrato 3.1 de PLAN-CREADOR.md). Sustituye a
// tools/limits.cjs y tools/apply-limits.py (obsoletos: dependían de Chrome de Windows).
//
// Uso: node tools/game/limites.mjs <carpeta|game.json> [--json]
//   capacidad = caracteres que caben en el hueco (en todos sus huecos y en todos los idiomas,
//               se toma el mínimo), medidos con fieldFits del motor: el mismo ajuste que el PDF.
//   límite    = min(cap, capacidad × 0,75). Los nombres: min(cap, capacidad).
//   Un cap que no cabe (cap > límite sin el margen) se avisa en el informe.
// No escribe el juego: el build y las pruebas leen el informe.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadGame } from './load.mjs';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { FUENTES } = require(path.join(HERE, 'fuentes.cjs'));

import { medirCabida, TIPOS_TEXTO } from './cabida.mjs';

let motor = null;
/** Carga el motor del navegador en Node (pdf-lib, fontkit, mecánicas y transformaciones). */
function cargarMotor() {
  if (motor) return motor;
  globalThis.PDFLib = require('pdf-lib');
  globalThis.fontkit = require('@pdf-lib/fontkit');
  require(path.join(HERE, '..', 'pme-compose-core.js'));
  require(path.join(HERE, '..', '..', 'mechanics', 'index.js'));
  motor = globalThis.PMECompose;
  return motor;
}

async function fuentesIncrustadas() {
  const doc = await globalThis.PDFLib.PDFDocument.create();
  doc.registerFontkit(globalThis.fontkit);
  const map = {};
  for (const k of Object.keys(FUENTES)) {
    map[k] = await doc.embedFont(fs.readFileSync(FUENTES[k].file), { subset: FUENTES[k].subset });
  }
  return map;
}

/** Capacidad y límite de cada campo de texto del juego (v1). Devuelve { [campo]: {...} }. */
export async function medirLimites(game) {
  const { fieldFits } = cargarMotor();
  const map = await fuentesIncrustadas();
  const cabida = medirCabida(game, { fieldFits, fontMap: map });
  const out = {};
  for (const [id, campo] of Object.entries(game.fields || {})) {
    if (!TIPOS_TEXTO.includes(campo.type)) continue;
    const { capacidad } = cabida[id];
    if (capacidad === null) {
      out[id] = { capacidad: null, cap: campo.cap ?? null, limite: null, nota: 'sin hueco en ninguna página' };
      continue;
    }
    const tope = campo.type === 'name' ? capacidad : Math.floor(capacidad * 0.75);
    const cap = campo.cap;
    const limite = cap === undefined ? tope : Math.min(cap, tope);
    const nota = cap !== undefined && cap > tope ? `el cap (${cap}) no cabe: el límite real es ${tope}` : '';
    out[id] = { capacidad, cap: cap ?? null, limite, nota };
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) { console.error('uso: node tools/game/limites.mjs <carpeta|game.json> [--json]'); process.exit(2); }
  const game = loadGame(target);
  const res = await medirLimites(game);
  if (args.includes('--json')) { console.log(JSON.stringify(res, null, 1)); return; }
  for (const [id, r] of Object.entries(res)) {
    const cap = r.cap === null ? '-' : String(r.cap);
    const lim = r.limite === null ? '-' : String(r.limite);
    console.log(`${id.padEnd(24)} capacidad ${String(r.capacidad ?? '-').padStart(4)}  cap ${cap.padStart(4)}  límite ${lim.padStart(4)}  ${r.nota}`.trimEnd());
  }
  const malos = Object.entries(res).filter(([, r]) => r.nota);
  console.log(malos.length ? `\n${malos.length} cap(s) que no caben` : '\nTodos los cap caben');
}

const esCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCLI) main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
