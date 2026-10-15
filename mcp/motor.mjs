// Motor de composición para el servidor MCP (T6.1). Usa el mismo motor que compose.js y la demo
// (tools/pme-compose-core.js), con las mismas fuentes (tools/game/fuentes.cjs) y el mismo kit.
// ROOT es la carpeta del motor: el repositorio de código, o `.pme/` en la copia para el repositorio de
// juegos (ver tools/build-mcp-bundle.py). PME_KIT cambia el manifiesto del kit (pruebas).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Ancla para resolver pdf-lib y fontkit: tools/node_modules (repo) o .pme/node_modules (copia).
const require = createRequire(path.join(ROOT, 'tools', 'game', 'fuentes.cjs'));

export function manifiestoDelKit() {
  return process.env.PME_KIT ? path.resolve(process.env.PME_KIT) : path.join(ROOT, 'assets', 'kit', 'manifest.json');
}

let motor = null;
/** Carga el motor una vez: pdf-lib y fontkit como globales, mecánicas y pme-compose-core. */
export function cargarMotor() {
  if (motor) return motor;
  globalThis.PDFLib = require('pdf-lib');
  globalThis.fontkit = require('@pdf-lib/fontkit');
  require(path.join(ROOT, 'mechanics', 'index.js'));
  require(path.join(ROOT, 'tools', 'pme-compose-core.js'));
  motor = globalThis.PMECompose;
  return motor;
}

/** Manifiesto de arte con el que se compone y se valida: PME_KIT si se da (un kit o una colección), y si no, todo
 *  el arte de la biblioteca (tools/biblioteca/indice.mjs), con los ficheros en ruta absoluta. */
export async function arteDisponible() {
  if (process.env.PME_KIT) {
    const file = manifiestoDelKit();
    const m = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { manifiesto: m, dir: path.dirname(file), nombre: file };
  }
  const { arteCombinado, rutaBiblioteca } = await import(path.join(ROOT, 'tools', 'biblioteca', 'indice.mjs'));
  return { manifiesto: arteCombinado(), dir: '/', nombre: `la biblioteca (${rutaBiblioteca()})` };
}

/** Piezas de arte que usa el juego: id → { kind, bytes } (como espera composeGame). */
async function piezasDelKit(game) {
  const usadas = new Set();
  for (const p of game.template.pages) for (const c of [...(p.layers || []), ...(p.topLayers || [])]) usadas.add(c.asset);
  const assets = {};
  if (!usadas.size) return assets;
  const { manifiesto, dir, nombre } = await arteDisponible();
  const { indicePiezas } = require(path.join(ROOT, 'tools', 'game', 'kit.cjs'));
  const piezas = indicePiezas(manifiesto);
  for (const id of usadas) {
    const p = piezas.get(id);
    if (!p) throw new Error(`la pieza «${id}» no está en ${nombre}`);
    const f = path.resolve(dir, p.file);
    assets[id] = { kind: /\.pdf$/i.test(f) ? 'pdf' : 'png', bytes: fs.readFileSync(f) };
  }
  return assets;
}

/**
 * Compone un ejemplo (o valores vacíos si example es null) del juego en `lang`.
 * dir: carpeta del juego (fondo PDF y fotos de ejemplo). watermark: texto de marca de agua o null.
 * Devuelve { bytes, warns }.
 */
export async function componerJuego(game, { dir, lang, example = null, watermark = null }) {
  const PC = cargarMotor();
  const { toEngineDeps } = await import(path.join(ROOT, 'tools', 'game', 'load.mjs'));
  const { FUENTES, resolverFuentes } = require(path.join(ROOT, 'tools', 'game', 'fuentes.cjs'));
  const deps = toEngineDeps(game, lang);
  let values = {};
  let photosPaths = {};
  if (example !== null) {
    const ex = (game.examples || []).find((e) => e.id === String(example));
    if (!ex) throw new Error(`el juego «${game.id}» no tiene el ejemplo ${example}`);
    if (!ex.values[lang]) throw new Error(`el ejemplo ${example} no tiene texto en «${lang}»`);
    values = ex.values[lang];
    photosPaths = ex.photos || {};
  }
  /* F1.3b: todos los PDF de fondo (el del juego y los de cada página) y las piezas de arte del kit. */
  const ficheros = [...new Set([game.background.file, ...deps.template.pages.map((p) => p.bgFile)].filter(Boolean))];
  const bgFiles = Object.fromEntries(ficheros.map((f) => [f, fs.readFileSync(path.resolve(dir, f))]));
  const bgBytes = game.background.kind === 'pdf' ? bgFiles[game.background.file] : null;
  const assets = await piezasDelKit({ template: deps.template });

  const fonts = {};
  for (const k of Object.keys(FUENTES)) {
    fonts[k] = { bytes: fs.readFileSync(FUENTES[k].file), subset: FUENTES[k].subset };
  }
  const photos = {};
  for (const [campo, ruta] of Object.entries(photosPaths)) {
    photos[campo] = { bytes: fs.readFileSync(path.resolve(dir, ruta)), format: /\.png$/i.test(ruta) ? 'png' : 'jpg' };
  }
  return PC.composeGame({
    bgBytes, bgFiles, assets, fuentes: resolverFuentes(), fonts, template: deps.template, fixed: deps.fixed, i18n: deps.i18n, i18nAll: deps.i18nAll,
    lang, values, photos, mechanics: deps.mechanics, fields: deps.fields, theme: deps.theme, watermark,
  });
}
