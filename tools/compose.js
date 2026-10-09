#!/usr/bin/env node
/* Fase 2 (línea de comandos): compone el PDF final con el MISMO motor que la
   demo del navegador. El motor está en tools/pme-compose-core.js; este fichero
   solo lee los ficheros, carga pdf-lib y fontkit y escribe el PDF.

   Uso: node tools/compose.js --tpl templates/final3 --bg Final3-Clean.pdf --lang es|en
        --out salidas/X.pdf [--values-file v.json] [--photos-file f.json] [--no-subset]

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
  const o = { lang: 'es', out: null, values: {}, photos: {}, tpl: 'templates/final3', bg: 'Final3-Clean.pdf', noSubset: false };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--lang') o.lang = a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--values') o.values = JSON.parse(a[++i]);
    else if (a[i] === '--values-file') o.values = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
    else if (a[i] === '--photos-file') o.photos = JSON.parse(fs.readFileSync(a[++i], 'utf8'));
    else if (a[i] === '--tpl') o.tpl = a[++i];
    else if (a[i] === '--bg') o.bg = a[++i];
    else if (a[i] === '--no-subset') o.noSubset = true;
  }
  return o;
}

async function main() {
  const o = args();
  if (!o.out) { console.error('falta --out'); process.exit(1); }
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

  const fonts = {};
  for (const k of Object.keys(FONTS)) {
    fonts[k] = {
      bytes: fs.readFileSync(path.join(__dirname, FONTS[k].file)),
      subset: o.noSubset ? false : FONTS[k].subset,
    };
  }
  const photos = {};
  for (const field of Object.keys(o.photos)) {
    const p = o.photos[field];
    photos[field] = { bytes: fs.readFileSync(path.join(ROOT, p)), format: /\.png$/i.test(p) ? 'png' : 'jpg' };
  }

  const res = await composeGame({
    bgBytes: fs.readFileSync(path.join(ROOT, o.bg)),
    fonts, template: tpl, fixed, i18n, i18nAll, lang: o.lang,
    values: o.values, photos,
  });
  fs.writeFileSync(path.join(ROOT, o.out), res.bytes);
  console.log('OK', o.out, '| valores:', Object.keys(o.values).length, '| fotos:', Object.keys(o.photos).length,
    res.warns.length ? '| avisos: ' + res.warns.join('; ') : '| sin avisos');
}

main().catch((e) => { console.error('FALLO', e.message); process.exit(1); });
