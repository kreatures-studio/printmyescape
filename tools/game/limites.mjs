#!/usr/bin/env node
// Capacidad y límite de cada campo de texto (contrato 3.1 de PLAN-CREADOR.md). Sustituye a
// tools/limits.cjs y tools/apply-limits.py (obsoletos: dependían de Chrome de Windows).
//
// Uso: node tools/game/limites.mjs <carpeta|game.json> [--json]
//   capacidad = caracteres que caben en el hueco (en todos sus huecos y en todos los idiomas,
//               se toma el mínimo), medidos con fieldFits del motor: el mismo ajuste que el PDF.
//   capacidadW = lo mismo con la letra W (la más ancha): el peor caso de la prueba de humo.
//   límite    = min(cap, capacidad × 0,75, capacidadW). Los nombres: min(cap, capacidad, capacidadW).
//   Un cap que no cabe (cap > límite sin el margen) se avisa en el informe.
//   Decisión a (T3.3): la W entra en el límite; los campos que la W limita bajan su cap en
//   tools/game/migrate-final3.mjs (CAP_W) para que la demo no acepte más de lo que cabe.
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
function muestraDe(k, game, conW) {
  const campo = game.fields[k];
  const n = campo.cap || 400;
  if (conW) return 'W'.repeat(n);
  const base = ((campo.type === 'name' ? MUESTRA.name : MUESTRA.text) + ' ').repeat(10).trim();
  return base.slice(0, n);
}

/** Caracteres que caben en los huecos de un campo, con texto(n) como contenido del campo. */
function capacidadCon(id, campo, slots, game, map, texto, conW) {
  const { fieldFits } = cargarMotor();
  const transforms = globalThis.PMETransforms || {};
  let capacidad = Infinity;
  for (const lang of game.languages) {
    const cabe = (n) => {
      const t0 = texto(n);
      return slots.every(({ s, mech }) => {
        let t = t0;
        if (mech) {
          const vals = {};
          for (const k of entradasDe(mech, game)) if (k !== id) vals[k] = muestraDe(k, game, conW);
          vals[id] = t0;
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
  return capacidad;
}

/** Capacidad y límite de cada campo de texto del juego. Devuelve { [campo]: {...} }. */
export async function medirLimites(game) {
  cargarMotor();
  const map = await fuentesIncrustadas();
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
    const capacidad = capacidadCon(id, campo, slots, game, map, (n) => base.slice(0, n).trim(), false);
    const capacidadW = capacidadCon(id, campo, slots, game, map, (n) => 'W'.repeat(n), true);
    const tope = campo.type === 'name' ? capacidad : Math.floor(capacidad * 0.75);
    const cap = campo.cap;
    const limite = Math.min(cap === undefined ? Infinity : cap, tope, capacidadW);
    const notas = [];
    if (cap !== undefined && cap > tope) notas.push(`el cap (${cap}) no cabe: el límite real es ${tope}`);
    if (cap !== undefined && capacidadW < Math.min(cap, tope)) notas.push(`con W caben ${capacidadW}: el cap baja a ${capacidadW}`);
    out[id] = { capacidad, capacidadW, cap: cap ?? null, limite, nota: notas.join('; ') };
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
