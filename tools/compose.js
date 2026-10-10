#!/usr/bin/env node
/* Fase 2 (línea de comandos): compone el PDF final con el MISMO motor que la
   demo del navegador. El motor está en tools/pme-compose-core.js; este fichero
   solo lee los ficheros, carga pdf-lib y fontkit y escribe el PDF.

   Uso: node tools/compose.js --tpl templates/final3 --bg Final3-Clean.pdf --lang es|en
        --out salidas/X.pdf [--values-file v.json] [--photos-file f.json] [--no-subset]

        node tools/compose.js --game games/final3 --example 3 --lang es|en --out salidas/X.pdf
        (T0.5: el juego sale de game.json; --example toma valores y fotos del ejemplo)

   --values-file  { "NOMBRE_CUMPLE": "...", "FAMA": "...", ... }
   --photos-file  { "FOTO_1": "ruta/a/foto.jpg", ... }  (JPG o PNG)
   --tpl, --bg, --out y las rutas de --photos-file son relativas a la raíz del repo. */
const fs = require('fs');
const path = require('path');

/* El núcleo espera pdf-lib y fontkit como globales (igual que en el navegador). */
globalThis.PDFLib = require('pdf-lib');
globalThis.fontkit = require('@pdf-lib/fontkit');
require('./pme-compose-core.js');
const { composeGame } = globalThis.PMECompose;

const ROOT = path.join(__dirname, '..');

/* Mismas fuentes que embebe build-demo.py. subset: false = embed completo
   (Caveat y pigpen: el subsetter rompe glifos). */
const FONTS = {
  runes: { file: '../assets/fonts/PigpenRunes.ttf', subset: false },
  caveatBold: { file: '../assets/fonts/Caveat-Bold.ttf', subset: false },
  caveat: { file: '../assets/fonts/Caveat-Regular.ttf', subset: false },
  anton: { file: '../assets/fonts/Anton-Regular.ttf', subset: true },
  opensans: { file: '../assets/fonts/OpenSans-Regular.ttf', subset: true },
  opensansBold: { file: '../assets/fonts/OpenSans-Bold.ttf', subset: true },
  courier: { file: '../assets/fonts/CourierPrime-Regular.ttf', subset: true },
  courierBold: { file: '../assets/fonts/CourierPrime-Bold.ttf', subset: true },
};

function args() {
  const o = { lang: 'es', out: null, values: {}, photos: {}, tpl: 'templates/final3', bg: 'Final3-Clean.pdf', noSubset: false,
    game: null, example: null, valuesGiven: false, photosGiven: false, tplGiven: false, bgGiven: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--game') o.game = a[++i];
    else if (a[i] === '--example') o.example = a[++i];
    else if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--values') { o.values = JSON.parse(a[++i]); o.valuesGiven = true; }
    else if (a[i] === '--values-file') { o.values = JSON.parse(fs.readFileSync(a[++i], 'utf8')); o.valuesGiven = true; }
    else if (a[i] === '--photos-file') { o.photos = JSON.parse(fs.readFileSync(a[++i], 'utf8')); o.photosGiven = true; }
    else if (a[i] === '--tpl') { o.tpl = a[++i]; o.tplGiven = true; }
    else if (a[i] === '--bg') { o.bg = a[++i]; o.bgGiven = true; }
    else if (a[i] === '--no-subset') o.noSubset = true;
  }
  return o;
}

/* Fuentes del juego: game.json (--game) o templates/ + valores sueltos (--tpl, modo antiguo). */
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
  if (o.photosGiven) photosPaths = o.photos;
  if (game.background.kind !== 'pdf') throw new Error('este fondo no es un PDF: el CLI aún no sabe componer capas');
  const bgBytes = fs.readFileSync(path.resolve(gameDir, game.background.file));
  return { bgBytes, template: deps.template, fixed: deps.fixed, i18n: deps.i18n, i18nAll: deps.i18nAll,
    values, photosPaths, resolvePhoto: (p) => path.resolve(gameDir, p) };
}

function fromTemplates(o) {
  const tplDir = path.join(ROOT, o.tpl);
  const tpl = JSON.parse(fs.readFileSync(path.join(tplDir, 'template.json'), 'utf8'));
  const fixed = JSON.parse(fs.readFileSync(path.join(tplDir, 'texts.json'), 'utf8'));
  const i18n = JSON.parse(fs.readFileSync(path.join(tplDir, `i18n-${o.lang}.json`), 'utf8'));
  /* Todos los idiomas: el tamaño se bloquea por caja al mínimo común, para que
     la misma línea mida lo mismo en todos los idiomas (igual que en la demo). */
  const i18nAll = {};
  fs.readdirSync(tplDir)
    .filter((f) => /^i18n-.*\.json$/.test(f))
    .forEach((f) => { i18nAll[f.slice(5, -5)] = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8')); });
  return { bgBytes: fs.readFileSync(path.join(ROOT, o.bg)), template: tpl, fixed, i18n, i18nAll,
    values: o.values, photosPaths: o.photos, resolvePhoto: (p) => path.join(ROOT, p) };
}

async function main() {
  const o = args();
  if (!o.out) { console.error('falta --out'); process.exit(1); }
  if (o.game && o.tplGiven) { console.error('usa --game o --tpl, no los dos'); process.exit(1); }
  const src = o.game ? await fromGame(o) : fromTemplates(o);

  const fonts = {};
  for (const k of Object.keys(FONTS)) {
    fonts[k] = {
      bytes: fs.readFileSync(path.join(__dirname, FONTS[k].file)),
      subset: o.noSubset ? false : FONTS[k].subset,
    };
  }
  const photos = {};
  for (const field of Object.keys(src.photosPaths)) {
    const p = src.photosPaths[field];
    photos[field] = { bytes: fs.readFileSync(src.resolvePhoto(p)), format: /\.png$/i.test(p) ? 'png' : 'jpg' };
  }

  const res = await composeGame({
    bgBytes: src.bgBytes,
    fonts, template: src.template, fixed: src.fixed, i18n: src.i18n, i18nAll: src.i18nAll, lang: o.lang,
    values: src.values, photos,
  });
  fs.writeFileSync(path.join(ROOT, o.out), res.bytes);
  const nFotos = Object.keys(src.photosPaths).length;
  console.log('OK', o.out, '| valores:', Object.keys(src.values).length, '| fotos:', nFotos,
    res.warns.length ? '| avisos: ' + res.warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
