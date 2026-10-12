#!/usr/bin/env node
// Validador de juegos pme-game/1 (T0.3 de PLAN-CREADOR.md).
//
// Uso: node tools/game/validate.mjs <carpeta|game.json> [--submit] [--pdf-texto <pdf>] [--kit <manifest.json>]
//   Código 0 si no hay errores; 1 si hay alguno (se listan todos).
//   --submit exige lo necesario para enviar al estudio (contrato 3.6).
//
// Este fichero añade a las reglas de tools/game/reglas.mjs (compartidas con el editor) lo que
// necesita el sistema de ficheros y Node: el esquema (ajv), los ficheros del juego y del kit, y
// pdftotext para los códigos del PDF del artista.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadGame } from './load.mjs';
import { reglasCruzadas, erroresKitDatos, avisosGame as avisosV1, reglasV2, avisosV2 } from './reglas.mjs';
import { aV1 } from './v2.mjs';

export { erroresKitDatos };

/** Avisos (no bloquean). Un juego v2 se mira en su forma v1 equivalente. */
export function avisosGame(game, opts = {}) {
  const v2 = game.schema === 'pme-game/2';
  let v1Avisos = [];
  if (!v2) v1Avisos = avisosV1(game, opts);
  else { try { v1Avisos = avisosV1(aV1(game), opts); } catch { /* el error de conversión ya lo da validateGame */ } }
  return [...v1Avisos, ...avisosDeFuentes(game), ...(v2 ? avisosV2(game) : [])];
}

// Fuentes (F1.4): cada nombre fontFamily del juego, en cualquier forma (v1 o v2), debe estar en assets/fonts/registro.json.
const { nombreRegistrado, REGISTRO } = createRequire(import.meta.url)('./fuentes.cjs');
function fuentesDelJuego(game) {
  const usados = new Map(); // nombre → ruta de su primera aparición
  const walk = (o, ruta) => {
    if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${ruta}[${i}]`));
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'fontFamily') {
          const n = v == null ? '' : String(v);
          if (!usados.has(n)) usados.set(n, ruta || 'juego');
        } else walk(v, ruta ? `${ruta}.${k}` : k);
      }
    }
  };
  walk(game, '');
  return usados;
}
export function erroresDeFuentes(game) {
  return [...fuentesDelJuego(game)].filter(([n]) => !nombreRegistrado(n))
    .map(([n, ruta]) => `${ruta}: la fuente «${n}» no está en assets/fonts/registro.json (solo fuentes de Google Fonts registradas)`);
}
export function avisosDeFuentes(game) {
  return [...fuentesDelJuego(game)].filter(([n]) => nombreRegistrado(n)).flatMap(([n]) => {
    const f = REGISTRO.fuentes.find((x) => x.key === REGISTRO.nombres[n].key);
    return f && f.licencia === 'por confirmar' ? [`la fuente «${n}» (${f.familia}) tiene la licencia por confirmar`] : [];
  });
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const SCHEMAS = {
  'pme-game/1': path.join(ROOT, 'schema', 'pme-game-1.schema.json'),
  'pme-game/2': path.join(ROOT, 'schema', 'pme-game-2.schema.json'),
};
// Registro de mecánicas y transformaciones (las mismas que usa el motor en Node).
createRequire(import.meta.url)(path.join(ROOT, 'mechanics', 'index.js'));

/** Errores de esquema (ajv), uno por línea, con la ruta del dato. */
export function schemaErrors(game) {
  const ficheroEsquema = SCHEMAS[game && game.schema];
  if (!ficheroEsquema) return [`esquema: formato desconocido «${game && game.schema}» (pme-game/1 o pme-game/2)`];
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(ficheroEsquema, 'utf8')));
  if (validate(game)) return [];
  return validate.errors.map((e) => `esquema ${e.instancePath || '/'}: ${e.message}`);
}

/** Manifiesto del kit leído del disco: { errores, piezas } (o error si no es JSON). */
export function erroresKit(manifiesto) {
  let m;
  try { m = JSON.parse(fs.readFileSync(manifiesto, 'utf8')); } catch (e) {
    return { errores: [`kit: el manifiesto no es JSON válido (${e.message})`], piezas: new Map() };
  }
  const dirKit = path.dirname(manifiesto);
  return erroresKitDatos(m, (rel) => fs.existsSync(path.resolve(dirKit, rel)));
}

/** Comprobaciones cruzadas con los ficheros del disco (dir: carpeta del juego; kit: manifiesto). */
export function crossErrors(game, { submit = false, dir = null, codigos = null, kit = null } = {}) {
  const existe = dir ? (rel) => fs.existsSync(path.resolve(dir, rel)) : null;
  const manifiesto = kit || path.join(ROOT, 'assets', 'kit', 'manifest.json');
  const kitInfo = fs.existsSync(manifiesto) ? erroresKit(manifiesto) : null;
  return reglasCruzadas(game, { submit, existe, codigos, kit: kitInfo, kitForzado: !!kit, kitNombre: path.relative(ROOT, manifiesto) });
}

/** Códigos [CODIGO] de un PDF del artista (texto con pdftotext). */
export function codigosDePdf(pdf) {
  const r = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`pdftotext no pudo leer ${pdf}: ${r.stderr || r.error}`);
  const codigos = new Set();
  for (const m of r.stdout.matchAll(/\[([A-Za-z][A-Za-z0-9_.]*)\]/g)) codigos.add(m[1]);
  return [...codigos];
}

export function validateGame(game, opts = {}) {
  const errs = schemaErrors(game);
  // Las comprobaciones cruzadas solo tienen sentido si la forma básica es correcta.
  if (errs.length) return errs;
  errs.push(...erroresDeFuentes(game));
  if (game.schema === 'pme-game/2') {
    errs.push(...reglasV2(game));
    // Cada PDF de página debe existir (si se conoce la carpeta del juego).
    if (opts.dir) {
      for (const p of game.pages) {
        const f = p.background && p.background.kind === 'pdf' ? p.background.file : null;
        if (f && !fs.existsSync(path.resolve(opts.dir, f))) errs.push(`pages/${p.id}: no existe el PDF «${f}»`);
      }
    }
    let v1;
    try { v1 = aV1(game); } catch (e) { return [...errs, `pages: ${e.message}`]; }
    errs.push(...crossErrors(v1, opts));
    return errs;
  }
  errs.push(...crossErrors(game, opts));
  return errs;
}

function main() {
  const args = process.argv.slice(2);
  const submit = args.includes('--submit');
  const iPdf = args.indexOf('--pdf-texto');
  const pdfTexto = iPdf >= 0 ? args[iPdf + 1] : null;
  const iKit = args.indexOf('--kit');
  const kit = iKit >= 0 ? path.resolve(args[iKit + 1]) : null;
  const saltar = new Set([iPdf, iKit].filter((i) => i >= 0).map((i) => i + 1));
  const target = args.find((a, i) => !a.startsWith('--') && !saltar.has(i));
  if (!target) {
    console.error('Uso: node tools/game/validate.mjs <carpeta|game.json> [--submit] [--pdf-texto <texto-del-artista.pdf>] [--kit <manifest.json>]');
    process.exit(2);
  }
  let game;
  try {
    game = loadGame(target, { tal: true });
  } catch (e) {
    console.log(`ERROR no se puede leer ${target}: ${e.message}`);
    process.exit(1);
  }
  const dir = fs.statSync(path.resolve(target)).isDirectory() ? path.resolve(target) : path.dirname(path.resolve(target));
  let codigos = null;
  if (pdfTexto) {
    try { codigos = codigosDePdf(pdfTexto); } catch (e) { console.log(`ERROR ${e.message}`); process.exit(1); }
  }
  const errs = validateGame(game, { submit, dir, codigos, kit });
  for (const e of errs) console.log('ERROR ' + e);
  const avisos = avisosGame(game, { codigos });
  for (const a of avisos) console.log('AVISO ' + a);
  console.log(errs.length ? `${errs.length} error(es) en ${target}` : `OK ${target}${submit ? ' (listo para enviar)' : ''}${avisos.length ? ` · ${avisos.length} aviso(s)` : ''}`);
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
