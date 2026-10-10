#!/usr/bin/env node
// Migración del juego actual (final3) a pme-game/1 (T0.4 de PLAN-CREADOR.md).
//
// Entradas:
//   templates/final3/template.json, texts.json, i18n-es.json, i18n-en.json
//   games/final3/_dump.json   (tools/game/dump-demo.py: Q, SECDEF, SUS_EXTRA, LIMITS, WEAK, EJEMPLO*)
// Salida:
//   games/final3/game.json
//
// Las reglas replican la demo (demo/src.html, mkField e isRequiredField):
//   tipo    = plantilla «image» → photo; multi → multi; num → number; long → long;
//             NOMBRE_… → name; el resto → text.
//   requerido = todo menos APODO_* y *_ALIAS (y OTRO, que la demo no pregunta aparte).
//   cap     = LIMITS[campo] || q.max || tope de la plantilla || 70 (solo textos).
//
// Lo que la demo calculaba en el motor se declara como mecánica (T2.1 y siguientes):
// las casillas (ticks), la ficha nombre+alias (join) y el icono de la app (initial).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TPL = path.join(ROOT, 'templates', 'final3');
const GAME_DIR = path.join(ROOT, 'games', 'final3');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

// Las columnas de tick de la página 4 (TICK_BOX, TICK_HALF de tools/pme-compose-core.js).
const TICK_BOX = [
  { x: 9.95, y: 55.86 }, { x: 9.95, y: 58.52 }, { x: 9.95, y: 61.25 }, { x: 9.95, y: 63.58 }, { x: 9.95, y: 65.92 },
];
const TICK_HALF = 0.6;

// Etiqueta de «Otro» en la revisión de la demo (tabla de etiquetas, demo/src.html).
const OTRO_LABEL = { es: 'Otro', en: 'Other' };

const isRequired = (id) => !(/^APODO_/.test(id) || /_ALIAS$/.test(id) || id === 'OTRO');

function fieldFrom(id, q, tpl) {
  const type = tpl && tpl.type === 'image' ? 'photo'
    : q.multi ? 'multi'
    : q.num ? 'number'
    : q.long ? 'long'
    : /^NOMBRE_/.test(id) ? 'name'
    : 'text';
  const f = { type, required: isRequired(id), q: q.q };
  if (type === 'multi') {
    f.allowOther = true;
    f.otherField = 'OTRO';
    f.options = q.options;
  } else if (type === 'number') {
    if (q.min !== undefined) f.min = q.min;
    if (q.max !== undefined) f.max = q.max;
  } else if (type !== 'photo') {
    f.cap = q.cap;
  }
  if (q.desc) f.desc = q.desc;
  if (q.ej) f.ej = q.ej;
  return f;
}

function main() {
  const tpl = read(path.join(TPL, 'template.json'));
  const texts = read(path.join(TPL, 'texts.json'));
  const i18n = { es: read(path.join(TPL, 'i18n-es.json')), en: read(path.join(TPL, 'i18n-en.json')) };
  const dump = read(path.join(GAME_DIR, '_dump.json'));
  const { Q, SECDEF, LIMITS, WEAK, SUS_EXTRA } = dump;

  // Campos de la demo: Q ya incluye SUS_EXTRA (la demo lo fusiona al cargar).
  const tplById = new Map(tpl.fields.map((f) => [f.id, f]));
  const fields = {};
  for (const id of Object.keys(Q)) {
    const q = Object.assign({}, Q[id]);
    if (q.multi) q.options = WEAK;
    q.cap = LIMITS[id] || q.max || (tplById.get(id) || {}).maxLength || 70;
    fields[id] = fieldFrom(id, q, tplById.get(id));
  }
  fields.OTRO = { type: 'text', required: false, cap: LIMITS.OTRO, q: OTRO_LABEL };
  const title = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const game = {
    schema: 'pme-game/1',
    id: 'final3',
    version: '1.0.0',
    status: 'borrador',
    name: { es: title(i18n.es['regalo-robado']), en: title(i18n.en['regalo-robado']) },
    languages: ['es', 'en'],
    background: { kind: 'pdf', file: '../../Final3-Clean.pdf' },
    template: tpl,
    texts,
    i18n,
    fields,
    form: {
      sections: SECDEF.map((s) => {
        const sec = { id: s.id, title: s.title };
        if (s.hint) sec.hint = s.hint;
        sec.nameField = s.nameField;
        sec.photoField = s.photoField;
        sec.fields = s.fields;
        return sec;
      }),
    },
    mechanics: [
      { type: 'ticks', page: 'p4', params: { field: 'DEBILIDAD', half: TICK_HALF, boxes: TICK_BOX } },
      { type: 'join', page: 'p4', derives: ['NOMBRE_CUMPLE_FICHA'], params: { name: 'NOMBRE_CUMPLE', alias: 'B_ALIAS', target: 'NOMBRE_CUMPLE_FICHA' } },
      { type: 'initial', page: 'p16', derives: ['S8_ICON_1', 'S8_ICON_2', 'S8_ICON_3', 'S8_ICON_4'],
        params: { map: { APP_1: 'S8_ICON_1', APP_2: 'S8_ICON_2', APP_3: 'S8_ICON_3', APP_4: 'S8_ICON_4' } } },
    ],
    examples: [1, 2, 3].map((n) => {
      const es = n === 1 ? dump.EJEMPLO : dump['EJEMPLO' + n];
      const en = n === 1 ? dump.EJEMPLO_EN : dump['EJEMPLO' + n + '_EN'];
      // Fotos de ejemplo: mismo criterio que tools/qa/parity.py (retrato-<sufijo>.jpg).
      // Rutas relativas a la carpeta del juego, como el fondo.
      const photos = {};
      for (const fid of ['FOTO_CUMPLE', ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => 'FOTO_' + i)]) {
        photos[fid] = '../../assets/retratos/retrato-' + fid.slice('FOTO_'.length) + '.jpg';
      }
      return { id: String(n), values: { es, en }, photos };
    }),
    solutions: [
      { id: 'tiras-p9', page: 'p9', dependsOn: ['TEST_LUGAR', 'TEST_RESULTADO'],
        how: { es: 'Ordenar las tiras para leer el resultado del test', en: 'Put the strips in order to read the test result' } },
    ],
  };

  // Comprobaciones de la propia migración (no sustituyen a validate.mjs).
  const sinSeccion = Object.keys(fields).filter((id) => !SECDEF.some((s) => s.fields.includes(id)) && id !== 'OTRO');
  const multis = Object.keys(fields).filter((id) => fields[id].type === 'multi');
  if (sinSeccion.length) throw new Error('campos sin sección: ' + sinSeccion.join(', '));
  if (SECDEF.length !== 9 || game.examples.length !== 3) throw new Error('forma inesperada de SECDEF o ejemplos');
  if (multis.join() !== 'DEBILIDAD') throw new Error('multi inesperado: ' + multis.join());

  fs.writeFileSync(path.join(GAME_DIR, 'game.json'), JSON.stringify(game, null, 1) + '\n', 'utf8');
  console.log(`game.json: ${Object.keys(fields).length} campos, ${game.form.sections.length} secciones, ${game.examples.length} ejemplos`);
}

main();
