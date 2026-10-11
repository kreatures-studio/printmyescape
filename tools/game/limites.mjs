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

const PW = 595.276, PH = 841.89; // A4, como la demo
const MAX = 400; // tope de saneado del motor (CLEAN_MAX)
const MUESTRA = {
  name: 'Mariana Jose Ana Luisa Carmen Rosa Lucia Elena Sofia Marta Irene Paula Nora',
  text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
};

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

/** Campos de entrada que usa una mecánica (mapa origen → derivado, o nombre + alias). */
function entradasDe(m, game) {
  const pr = m.params || {};
  const out = [];
  if (pr.map) out.push(...Object.keys(pr.map));
  if (pr.name) out.push(pr.name);
  if (pr.alias) out.push(pr.alias);
  return out.filter((k) => (game.fields || {})[k]);
}

/** Muestra de un campo que ocupa su tope (sus caracteres como mucho). */
function muestraDe(k, game) {
  const campo = game.fields[k];
  const base = ((campo.type === 'name' ? MUESTRA.name : MUESTRA.text) + ' ').repeat(10).trim();
  return campo.cap ? base.slice(0, campo.cap) : base;
}

/** Capacidad y límite de cada campo de texto del juego. Devuelve { [campo]: {...} }. */
export async function medirLimites(game) {
  const { fieldFits } = cargarMotor();
  const map = await fuentesIncrustadas();
  const transforms = globalThis.PMETransforms || {};
  const out = {};
  for (const [id, campo] of Object.entries(game.fields || {})) {
    if (!['name', 'text', 'long'].includes(campo.type)) continue;
    // Huecos que muestran el campo: los suyos y los derivados de una mecánica que lo usa
    // (APODO_n → APODO_n.PREF, nombre y alias → la ficha). Los demás campos de esa mecánica
    // entran con una muestra de su tope, así el derivado se mide en su peor caso.
    const slots = [];
    for (const p of game.template.pages) for (const s of p.slots || []) if (s.field === id) slots.push({ s, mech: null });
    for (const m of game.mechanics || []) {
      const pr = m.params || {};
      const entradas = [];
      if (pr.map) for (const o of Object.keys(pr.map)) if (o === id) entradas.push(pr.map[o]);
      if (pr.target && (pr.name === id || pr.alias === id)) entradas.push(pr.target);
      for (const destino of entradas) {
        for (const p of game.template.pages) for (const s of p.slots || []) if (s.field === destino) slots.push({ s, mech: m });
      }
    }
    if (!slots.length) {
      out[id] = { capacidad: null, cap: campo.cap ?? null, limite: null, nota: 'sin hueco en ninguna página' };
      continue;
    }
    const base = ((campo.type === 'name' ? MUESTRA.name : MUESTRA.text) + ' ').repeat(10);
    let capacidad = Infinity;
    for (const lang of game.languages) {
      const cabe = (n) => {
        const texto = base.slice(0, n).trim();
        return slots.every(({ s, mech }) => {
          let t = texto;
          if (mech) {
            const vals = {};
            for (const k of entradasDe(mech, game)) if (k !== id) vals[k] = muestraDe(k, game);
            vals[id] = texto;
            t = globalThis.PMEMechanics[mech.type].derive(vals, mech.params || {})[s.field];
          }
          if (s.transform) t = transforms[s.transform](t, s.params || {}, lang);
          return fieldFits(s, t, map, PW, PH);
        });
      };
      let c = 0;
      if (cabe(1)) {
        let lo = 1, hi = MAX;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi + 1) / 2);
          if (cabe(mid)) lo = mid; else hi = mid - 1;
        }
        c = lo;
      }
      capacidad = Math.min(capacidad, c);
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
