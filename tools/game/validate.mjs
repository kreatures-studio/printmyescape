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
  return [...v1Avisos, ...avisosDeFuentes(game), ...(v2 ? [...avisosV2(game), ...avisosDeTextos(game)] : [])];
}

/* F3.3 (lo encontró el ensayo): en un juego v2, (1) caracteres que la fuente de un texto o campo no tiene (saldrían
   como un recuadro vacío: p. ej. «→» en Open Sans) y (2) claves de i18n que ningún texto usa (set_texts con null las
   quita). Los campos se comprueban con los valores de los ejemplos. */
let fontkit = null;
const cacheFuentes = new Map();
function fuente(key) {
  if (!cacheFuentes.has(key)) {
    const { FUENTES } = createRequire(import.meta.url)('./fuentes.cjs');
    fontkit = fontkit || createRequire(import.meta.url)('@pdf-lib/fontkit');
    cacheFuentes.set(key, FUENTES[key] ? fontkit.create(fs.readFileSync(FUENTES[key].file)) : null);
  }
  return cacheFuentes.get(key);
}
function avisosDeTextos(game) {
  const avisos = [];
  const { resolverFuentes } = createRequire(import.meta.url)('./fuentes.cjs');
  const fuentes = resolverFuentes();
  const usadas = new Set();
  const faltan = (texto, familia) => {
    let key;
    try { key = fuentes.key(familia); } catch { return []; } // nombre no registrado: ya es un error
    const f = fuente(key);
    if (!f) return [];
    return [...new Set([...String(texto)].filter((c) => !/\s/.test(c) && !f.hasGlyphForCodePoint(c.codePointAt(0))))];
  };
  const recorrer = (elementos, ruta) => {
    for (const e of elementos || []) {
      if (e.kind === 'text') {
        usadas.add(e.key);
        for (const l of game.languages || []) {
          const malos = faltan(((game.i18n || {})[l] || {})[e.key] || '', e.fontFamily);
          if (malos.length) avisos.push(`${ruta}/${e.id}: el texto en «${l}» usa ${malos.map((c) => `«${c}»`).join(' ')}, que la fuente ${e.fontFamily || '(por defecto)'} no tiene (saldría un recuadro vacío)`);
        }
      } else if (e.kind === 'field') {
        for (const ej of game.examples || []) {
          for (const l of game.languages || []) {
            const malos = faltan((((ej.values || {})[l]) || {})[e.field] || '', e.fontFamily);
            if (malos.length) avisos.push(`${ruta}/${e.id}: el ejemplo ${ej.id} (${l}) de «${e.field}» usa ${malos.map((c) => `«${c}»`).join(' ')}, que la fuente ${e.fontFamily || '(por defecto)'} no tiene`);
          }
        }
      }
    }
  };
  for (const p of game.pages || []) recorrer(p.elements, `pages/${p.id}`);
  for (const z of game.puzzles || []) recorrer(z.page && z.page.elements, `puzzles/${z.id}`);
  for (const l of game.languages || []) {
    const sobran = Object.keys((game.i18n || {})[l] || {}).filter((k) => !usadas.has(k));
    if (sobran.length) avisos.push(`i18n/${l}: claves que ningún texto usa: ${sobran.join(', ')} (se quitan con set_texts y el valor null)`);
  }
  return avisos;
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

/** Comprobaciones cruzadas con los ficheros del disco (dir: carpeta del juego; kit: manifiesto).
 *  kitDatos: un manifiesto ya leído (p. ej. todo el arte de la biblioteca, tools/biblioteca/indice.mjs), con
 *  rutas de fichero absolutas; si se da, se usa en lugar de «kit». */
export function crossErrors(game, { submit = false, dir = null, codigos = null, kit = null, kitDatos = null } = {}) {
  const existe = dir ? (rel) => fs.existsSync(path.resolve(dir, rel)) : null;
  if (kitDatos) {
    const kitInfo = erroresKitDatos(kitDatos, (f) => fs.existsSync(f));
    return reglasCruzadas(game, { submit, existe, codigos, kit: kitInfo, kitForzado: false, kitNombre: 'el arte de la biblioteca' });
  }
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

async function main() {
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
  // Juegos v2 sin --kit: el arte sale de la biblioteca, como en el servidor MCP (PME_BIBLIOTECA, o biblioteca/ del
  // repositorio de juegos al que pertenece el juego, o la del repositorio de código).
  let kitDatos = null;
  if (!kit && game.schema === 'pme-game/2') {
    const delRepo = path.resolve(dir, '..', '..', 'biblioteca');
    if (!process.env.PME_BIBLIOTECA && fs.existsSync(delRepo)) process.env.PME_BIBLIOTECA = delRepo;
    const { arteCombinado } = await import('../biblioteca/indice.mjs');
    kitDatos = arteCombinado();
  }
  const errs = validateGame(game, { submit, dir, codigos, kit, kitDatos });
  for (const e of errs) console.log('ERROR ' + e);
  const avisos = avisosGame(game, { codigos });
  for (const a of avisos) console.log('AVISO ' + a);
  console.log(errs.length ? `${errs.length} error(es) en ${target}` : `OK ${target}${submit ? ' (listo para enviar)' : ''}${avisos.length ? ` · ${avisos.length} aviso(s)` : ''}`);
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
