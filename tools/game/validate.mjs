#!/usr/bin/env node
// Validador de juegos pme-game/1 (T0.3 de PLAN-CREADOR.md).
//
// Uso: node tools/game/validate.mjs <carpeta|game.json> [--submit]
//   Código 0 si no hay errores; 1 si hay alguno (se listan todos).
//   --submit exige lo necesario para enviar al estudio (contrato 3.6): al menos
//   una solución y un tope (cap) en los campos de texto.
//
// Comprueba el esquema (schema/pme-game-1.schema.json) y, después, lo que el
// esquema no puede expresar: campos de cada sección, slots de la plantilla,
// idiomas completos y mecánicas que citan páginas existentes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { loadGame } from './load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = path.join(HERE, '..', '..', 'schema', 'pme-game-1.schema.json');
const TEXT_TYPES = new Set(['name', 'text', 'long']);

/** Errores de esquema (ajv), uno por línea, con la ruta del dato. */
export function schemaErrors(game) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(JSON.parse(fs.readFileSync(SCHEMA, 'utf8')));
  if (validate(game)) return [];
  return validate.errors.map((e) => `esquema ${e.instancePath || '/'}: ${e.message}`);
}

/** Comprobaciones cruzadas: lo que el esquema no puede expresar. */
export function crossErrors(game, { submit = false } = {}) {
  const errs = [];
  const langs = Array.isArray(game.languages) ? game.languages : [];
  const fields = game.fields && typeof game.fields === 'object' ? game.fields : {};
  const pages = Array.isArray(game.template && game.template.pages) ? game.template.pages : [];
  const sections = Array.isArray(game.form && game.form.sections) ? game.form.sections : [];
  const mechanics = Array.isArray(game.mechanics) ? game.mechanics : [];

  // Campos derivados: declarados por la mecánica que los calcula (contrato 3.1).
  const derived = new Set();
  for (const m of mechanics) for (const f of m.derives || []) derived.add(f);

  const needLangs = (obj, where) => {
    if (!obj) return;
    for (const l of langs) if (!obj[l]) errs.push(`${where}: falta el texto en «${l}»`);
  };

  // Idiomas completos en preguntas, ayudas, opciones, nombres y soluciones.
  for (const [id, f] of Object.entries(fields)) {
    needLangs(f.q, `fields/${id}/q`);
    if (f.desc) needLangs(f.desc, `fields/${id}/desc`);
    (f.options || []).forEach((o, i) => needLangs(o, `fields/${id}/options/${i}`));
    if (submit && TEXT_TYPES.has(f.type) && !f.cap) errs.push(`fields/${id}: falta cap (obligatorio para enviar)`);
  }
  needLangs(game.name, 'name');
  for (const s of sections) {
    needLangs(s.title, `form/${s.id}/title`);
    if (s.hint) needLangs(s.hint, `form/${s.id}/hint`);
  }
  (game.solutions || []).forEach((s) => needLangs(s.how, `solutions/${s.id}/how`));

  // Secciones: cada campo existe y aparece en una sola sección.
  const enSeccion = new Map();
  for (const s of sections) {
    for (const id of s.fields || []) {
      if (!fields[id]) errs.push(`form/${s.id}: el campo «${id}» no existe en fields`);
      else if (enSeccion.has(id)) errs.push(`form/${s.id}: el campo «${id}» ya está en la sección «${enSeccion.get(id)}»`);
      else enSeccion.set(id, s.id);
    }
    for (const key of ['nameField', 'photoField']) {
      if (s[key] && !fields[s[key]]) errs.push(`form/${s.id}: ${key} «${s[key]}» no existe en fields`);
      else if (s[key] && !(s.fields || []).includes(s[key])) errs.push(`form/${s.id}: ${key} «${s[key]}» no está entre los campos de la sección`);
    }
  }

  // Otro (multi): el campo de texto que guarda la respuesta «Otro» debe existir.
  for (const [id, f] of Object.entries(fields)) {
    if (f.allowOther && !fields[f.otherField]) errs.push(`fields/${id}: otherField «${f.otherField}» no existe en fields`);
  }

  // Mecánicas: su página existe; no pueden derivar un campo que ya es un campo real.
  const pageIds = new Set(pages.map((p) => p.id));
  mechanics.forEach((m, i) => {
    if (!pageIds.has(m.page)) errs.push(`mechanics/${i} (${m.type}): la página «${m.page}» no existe en template.pages`);
    for (const f of m.derives || []) {
      if (fields[f]) errs.push(`mechanics/${i} (${m.type}): «${f}» deriva un campo que ya está en fields`);
    }
  });

  // Plantilla: cada slot apunta a un campo o a un derivado; cada página es única; cada texto tiene su clave.
  const ids = new Set();
  for (const p of pages) {
    if (ids.has(p.id)) errs.push(`template/pages: la página «${p.id}» está repetida`);
    ids.add(p.id);
    for (const sl of p.slots || []) {
      if (!fields[sl.field] && !derived.has(sl.field)) {
        errs.push(`template/pages/${p.id}: el slot «${sl.field}» no es un campo ni un derivado de una mecánica`);
      }
    }
  }
  for (const t of game.texts || []) {
    // El motor usa el número de página como índice (pi + 1), no el id de la página.
    if (!(t.page >= 1 && t.page <= pages.length)) errs.push(`texts/${t.key}: la página ${t.page} no existe (hay ${pages.length})`);
    for (const l of langs) {
      const dict = (game.i18n && game.i18n[l]) || {};
      if (!(t.key in dict)) errs.push(`texts/${t.key} (página ${t.page}): falta la clave en i18n «${l}»`);
    }
  }

  // Ejemplos: los valores son campos conocidos, en idiomas del juego; las fotos, campos de tipo photo.
  (game.examples || []).forEach((ex) => {
    for (const l of Object.keys(ex.values || {})) {
      if (!langs.includes(l)) errs.push(`examples/${ex.id}: el idioma «${l}» no está en languages`);
      for (const id of Object.keys(ex.values[l] || {})) {
        if (!fields[id] && !derived.has(id)) errs.push(`examples/${ex.id}: el valor de «${id}» no es un campo`);
      }
    }
    for (const id of Object.keys(ex.photos || {})) {
      if (!fields[id] || fields[id].type !== 'photo') errs.push(`examples/${ex.id}: la foto de «${id}» no es un campo photo`);
    }
  });

  // Soluciones: la página y los campos citados existen.
  (game.solutions || []).forEach((s) => {
    if (s.page && !pageIds.has(s.page)) errs.push(`solutions/${s.id}: la página «${s.page}» no existe`);
    for (const id of s.dependsOn || []) {
      if (!fields[id] && !derived.has(id)) errs.push(`solutions/${s.id}: depende de «${id}», que no existe`);
    }
  });
  if (submit && !(game.solutions || []).length) errs.push('falta al menos una solución (obligatoria para enviar)');

  return errs;
}

export function validateGame(game, opts = {}) {
  const errs = schemaErrors(game);
  // Las comprobaciones cruzadas solo tienen sentido si la forma básica es correcta.
  if (!errs.length) errs.push(...crossErrors(game, opts));
  return errs;
}

function main() {
  const args = process.argv.slice(2);
  const submit = args.includes('--submit');
  const target = args.find((a) => !a.startsWith('--'));
  if (!target) {
    console.error('Uso: node tools/game/validate.mjs <carpeta|game.json> [--submit]');
    process.exit(2);
  }
  let game;
  try {
    game = loadGame(target);
  } catch (e) {
    console.log(`ERROR no se puede leer ${target}: ${e.message}`);
    process.exit(1);
  }
  const errs = validateGame(game, { submit });
  for (const e of errs) console.log('ERROR ' + e);
  console.log(errs.length ? `${errs.length} error(es) en ${target}` : `OK ${target}${submit ? ' (listo para enviar)' : ''}`);
  process.exit(errs.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
