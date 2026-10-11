#!/usr/bin/env node
/* Fase 2 (línea de comandos): compone el PDF final con el MISMO motor que la
   demo del navegador. El motor está en tools/pme-compose-core.js; este fichero
   solo lee los ficheros, carga pdf-lib y fontkit y escribe el PDF.

   Uso: node tools/compose.js --game games/final3 --example 3 --lang es|en --out salidas/X.pdf
        [--values-file v.json] [--photos-file f.json]

   --game         carpeta del juego (o su game.json): plantilla, textos, mecánicas y fondo.
   --example      toma los valores y las fotos del ejemplo indicado.
   --values-file  { "NOMBRE_CUMPLE": "...", "FAMA": "...", ... }
   --photos-file  { "FOTO_1": "assets/retratos/retrato-1.jpg", ... } (JPG o PNG)
   --out y las rutas de --photos-file son relativas a la raíz del repo. */
const fs = require('fs');
const path = require('path');

/* El núcleo espera pdf-lib y fontkit como globales (igual que en el navegador). */
globalThis.PDFLib = require('pdf-lib');
globalThis.fontkit = require('@pdf-lib/fontkit');
require('../mechanics/index.js');
require('./pme-compose-core.js');
const { composeGame } = globalThis.PMECompose;

const ROOT = path.join(__dirname, '..');

/* Mismas fuentes que embebe build-demo.py. subset: false = embed completo
   (Caveat y pigpen: el subsetter rompe glifos). */
const { FUENTES: FONTS } = require('./game/fuentes.cjs');

function args() {
  const o = { lang: 'es', out: null, values: {}, photos: {}, noSubset: false,
    game: null, example: null, valuesGiven: false, photosGiven: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i];
    else if (a[i] === '--kit') o.kit = a[++i];
    else if (a[i] === '--example') o.example = a[++i];
    else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--values') { o.values = JSON.parse(a[++i]); o.valuesGiven = true; }
    else if (a[i] === '--values-file') { o.values = JSON.parse(fs.readFileSync(a[++i], 'utf8')); o.valuesGiven = true; }
    else if (a[i] === '--photos-file') { o.photos = JSON.parse(fs.readFileSync(a[++i], 'utf8')); o.photosGiven = true; }
    else if (a[i] === '--no-subset') o.noSubset = true;
  }
  return o;
}

/* Piezas de arte de las capas (T4.2): id → { kind, bytes }, leídas del manifiesto del kit (3.4). */
function cargarKit(manifiesto, game) {
  const file = path.resolve(ROOT, manifiesto || 'assets/kit/manifest.json');
  const piezas = new Map((JSON.parse(fs.readFileSync(file, 'utf8')).pieces || []).map((p) => [p.id, p]));
  const assets = {};
  for (const p of game.template.pages) {
    for (const capa of p.layers || []) {
      if (assets[capa.asset]) continue;
      const pieza = piezas.get(capa.asset);
      if (!pieza) throw new Error(`la pieza «${capa.asset}» no está en ${path.relative(ROOT, file)}`);
      const f = path.resolve(path.dirname(file), pieza.file);
      assets[capa.asset] = { kind: /\.pdf$/i.test(f) ? 'pdf' : 'png', bytes: fs.readFileSync(f) };
    }
  }
  return assets;
}

/* Fuentes del juego: game.json (--game). */
async function fromGame(o) {
  const { loadGame, toEngineDeps } = await import('./game/load.mjs');
  const file = path.resolve(ROOT, o.game);
  const game = loadGame(file);
  const gameDir = fs.statSync(file).isDirectory() ? file : path.dirname(file);
  const deps = toEngineDeps(game, o.lang);
  let values = {};
  let photosPaths = {};
  if (o.example !== null) {
    const ex = (game.examples || []).find((e) => e.id === String(o.example));
    if (!ex) throw new Error(`el juego «${game.id}» no tiene el ejemplo ${o.example}`);
    values = ex.values[o.lang] || {};
    photosPaths = ex.photos || {};
  }
  if (o.valuesGiven) values = o.values;
  /* --photos-file: rutas relativas a la raíz del repo; las del ejemplo, a la carpeta del juego. */
  if (o.photosGiven) photosPaths = Object.fromEntries(Object.entries(o.photos).map(([k, v]) => [k, path.resolve(ROOT, v)]));
  let bgBytes = null;
  let assets = {};
  if (game.background.kind === 'pdf') bgBytes = fs.readFileSync(path.resolve(gameDir, game.background.file));
  else if (game.background.kind === 'layers') assets = cargarKit(o.kit, game);
  else throw new Error(`fondo desconocido: ${game.background.kind}`);
  return { bgBytes, assets, template: deps.template, fixed: deps.fixed, i18n: deps.i18n, i18nAll: deps.i18nAll,
    mechanics: deps.mechanics, fields: deps.fields, values, photosPaths, resolvePhoto: (p) => path.resolve(gameDir, p) };
}

async function main() {
  const o = args();
  if (!o.out) { console.error('falta --out'); process.exit(1); }
  if (!o.game) { console.error('falta --game'); process.exit(1); }
  const src = await fromGame(o);

  const fonts = {};
  for (const k of Object.keys(FONTS)) {
    fonts[k] = {
      bytes: fs.readFileSync(FONTS[k].file),
      subset: o.noSubset ? false : FONTS[k].subset,
    };
  }
  const photos = {};
  for (const field of Object.keys(src.photosPaths)) {
    const p = src.photosPaths[field];
    photos[field] = { bytes: fs.readFileSync(src.resolvePhoto(p)), format: /\.png$/i.test(p) ? 'png' : 'jpg' };
  }

  const res = await composeGame({
    bgBytes: src.bgBytes, assets: src.assets,
    fonts, template: src.template, fixed: src.fixed, i18n: src.i18n, i18nAll: src.i18nAll, lang: o.lang,
    values: src.values, photos, mechanics: src.mechanics || [], fields: src.fields || {},
  });
  fs.writeFileSync(path.join(ROOT, o.out), res.bytes);
  const nFotos = Object.keys(src.photosPaths).length;
  console.log('OK', o.out, '| valores:', Object.keys(src.values).length, '| fotos:', nFotos,
    res.warns.length ? '| avisos: ' + res.warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
