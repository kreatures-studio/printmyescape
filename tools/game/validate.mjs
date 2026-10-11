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
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { loadGame } from './load.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// Registro de mecánicas (mechanics/index.js, el mismo que usa el motor en Node).
const MECANICAS = createRequire(import.meta.url)(path.join(HERE, '..', '..', 'mechanics', 'index.js'));
const TRANSFORMS = globalThis.PMETransforms || {};
const ROOT = path.join(HERE, '..', '..');
const LICENCIAS_KIT = new Set(['CC0-1.0']); // contrato 3.4: en fase 1 solo CC0
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
/**
 * Manifiesto del kit (contrato 3.4): cada pieza tiene id único, tipo, fichero que existe,
 * licencia CC0-1.0 (fase 1), fuente y autor. Devuelve { errores, piezas: Map id → pieza }.
 */
export function erroresKit(manifiesto) {
  const errores = [];
  const piezas = new Map();
  let m;
  try { m = JSON.parse(fs.readFileSync(manifiesto, 'utf8')); } catch (e) {
    return { errores: [`kit: el manifiesto no es JSON válido (${e.message})`], piezas };
  }
  const dirKit = path.dirname(manifiesto);
  const TIPOS = new Set(['background', 'frame', 'photo-frame', 'decor', 'icon']);
  if (!Array.isArray(m.pieces)) return { errores: ['kit: falta la lista «pieces»'], piezas };
  for (const p of m.pieces) {
    const id = p.id || '(sin id)';
    if (!p.id) errores.push('kit: una pieza no tiene id');
    else if (piezas.has(p.id)) errores.push(`kit: la pieza «${p.id}» está repetida`);
    else piezas.set(p.id, p);
    if (!TIPOS.has(p.kind)) errores.push(`kit/${id}: kind debe ser ${[...TIPOS].join(' | ')}`);
    if (!p.file) errores.push(`kit/${id}: falta file`);
    else if (!fs.existsSync(path.resolve(dirKit, p.file))) errores.push(`kit/${id}: no existe el fichero «${p.file}»`);
    if (p.thumb && !fs.existsSync(path.resolve(dirKit, p.thumb))) errores.push(`kit/${id}: no existe la miniatura «${p.thumb}»`);
    if (!LICENCIAS_KIT.has(p.license)) errores.push(`kit/${id}: licencia no admitida («${p.license}»); en fase 1 solo CC0-1.0`);
    if (!p.source) errores.push(`kit/${id}: falta source`);
    if (!p.author) errores.push(`kit/${id}: falta author`);
  }
  return { errores, piezas };
}

export function crossErrors(game, { submit = false, dir = null, codigos = null, kit = null } = {}) {
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
    if (f.corta) needLangs(f.corta, `fields/${id}/corta`);
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
    const def = MECANICAS[m.type];
    if (!def) errs.push(`mechanics/${i} (${m.type}): mecánica desconocida`);
    for (const k of (def && def.params && def.params.required) || []) {
      if (!(m.params && k in m.params)) errs.push(`mechanics/${i} (${m.type}): falta el parámetro «${k}»`);
    }
    if (def && def.validate) {
      for (const e of def.validate(game, m)) errs.push(`mechanics/${i} (${m.type}) ${e.path}: ${e.message}`);
    }
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
      if (sl.transform !== undefined) {
        if (!TRANSFORMS[sl.transform]) errs.push(`template/pages/${p.id}: la transformación «${sl.transform}» no existe`);
        if (sl.transform === 'runes') {
          for (const l of langs) {
            if (!(sl.params && sl.params.prefix && typeof sl.params.prefix[l] === 'string')) {
              errs.push(`template/pages/${p.id}: el hueco «${sl.field}» (runes) necesita params.prefix.${l}`);
            }
          }
        }
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
      else if (dir && !fs.existsSync(path.resolve(dir, ex.photos[id]))) errs.push(`examples/${ex.id}: no existe la foto «${ex.photos[id]}» de «${id}»`);
    }
    for (const l of Object.keys(ex.values || {})) {
      for (const [id, v] of Object.entries(ex.values[l] || {})) {
        const cap = fields[id] && fields[id].cap;
        if (cap && String(v).length > cap) errs.push(`examples/${ex.id} (${l}): «${id}» tiene ${String(v).length} caracteres y el tope es ${cap}`);
      }
    }
  });

  // Fondo (T4.2): con PDF, el fichero tiene que existir y ninguna página lleva capas. Con «layers»,
  // cada página declara sus capas y cada capa es una pieza del kit (3.4) con licencia admitida.
  const kind = game.background && game.background.kind;
  if (kind === 'pdf' && dir && !fs.existsSync(path.resolve(dir, game.background.file))) {
    errs.push(`background: no existe el PDF «${game.background.file}»`);
  }
  if (kind === 'pdf') {
    for (const p of pages) if (p.layers) errs.push(`template/${p.id}: las capas solo van con background «layers»`);
  }
  if (kind === 'layers') {
    for (const p of pages) if (!Array.isArray(p.layers)) errs.push(`template/${p.id}: falta «layers» (fondo por capas; puede ser [])`);
  }
  const conCapas = pages.some((p) => Array.isArray(p.layers) && p.layers.length);
  if (kind === 'layers' || conCapas || kit) {
    const manifiesto = kit || path.join(ROOT, 'assets', 'kit', 'manifest.json');
    if (!fs.existsSync(manifiesto)) {
      errs.push(`background: no hay manifiesto del kit (${path.relative(ROOT, manifiesto)})`);
    } else {
      const { errores, piezas } = erroresKit(manifiesto);
      errs.push(...errores);
      for (const p of pages) {
        for (const capa of p.layers || []) {
          const pieza = piezas.get(capa.asset);
          if (!pieza) errs.push(`template/${p.id}: la pieza «${capa.asset}» no está en el kit`);
          else if (!LICENCIAS_KIT.has(pieza.license)) errs.push(`template/${p.id}: la pieza «${capa.asset}» tiene una licencia no admitida («${pieza.license}»)`);
          else if (!pieza.source || !pieza.author) errs.push(`template/${p.id}: la pieza «${capa.asset}» necesita source y author`);
          for (const k of ['x', 'y', 'w', 'h']) {
            if (typeof capa[k] !== 'number') errs.push(`template/${p.id}: la capa «${capa.asset}» necesita ${k}`);
          }
        }
      }
    }
  }

  // Códigos [CODIGO] del PDF del artista (opción codigos): cada uno tiene que ser un campo.
  for (const c of codigos || []) {
    if (!fields[c] && !derived.has(c)) errs.push(`PDF del artista: el código [${c}] no es un campo del juego`);
  }

  // Soluciones: la página y los campos citados existen.
  // La hoja de tiras es la mecánica «strips» (su validate comprueba perm); template.shuffle ya no existe.
  if (game.template && game.template.shuffle !== undefined) {
    errs.push('template/shuffle: ya no existe; la hoja de tiras es una mecánica «strips»');
  }
  const tiras = mechanics.filter((m) => m.type === 'strips');
  (game.solutions || []).forEach((s) => {
    if (s.page && !pageIds.has(s.page)) errs.push(`solutions/${s.id}: la página «${s.page}» no existe`);
    const page = pages.find((p) => p.id === s.page);
    for (const id of s.dependsOn || []) {
      if (!fields[id] && !derived.has(id)) errs.push(`solutions/${s.id}: depende de «${id}», que no existe`);
      if (!page) continue;
      const hueco = (page.slots || []).find((sl) => sl.field === id);
      if (!hueco) { errs.push(`solutions/${s.id}: no hay hueco de «${id}» en la página ${s.page}`); continue; }
      // Si la solución es la hoja de tiras de esa página, el hueco tiene que estar dentro de ella.
      for (const t of tiras.filter((m) => m.page === s.page)) {
        const sh = t.params || {};
        const dentro = hueco.x >= sh.x0 && hueco.x + hueco.w <= sh.x1 && hueco.y >= sh.y0 && hueco.y + hueco.h <= sh.y1;
        if (!dentro) errs.push(`solutions/${s.id}: el hueco de «${id}» está fuera de la hoja de tiras`);
      }
    }
  });
  if (submit && !(game.solutions || []).length) errs.push('falta al menos una solución (obligatoria para enviar)');
  if (submit) {
    // Contrato 3.6: tres ejemplos (corto, normal, largo) con texto en cada idioma.
    if ((game.examples || []).length < 3) errs.push('faltan ejemplos: hacen falta tres (corto, normal y largo) para enviar');
    for (const ex of game.examples || []) {
      for (const l of langs) if (!(ex.values && ex.values[l])) errs.push(`examples/${ex.id}: falta el ejemplo en «${l}» (obligatorio para enviar)`);
    }
  }

  return errs;
}

/** Avisos: no bloquean, pero conviene revisarlos (contrato 3.1 y T3.2). */
export function avisosGame(game, { codigos = null } = {}) {
  const avisos = [];
  const fields = game.fields || {};
  const enPagina = new Set();
  for (const p of (game.template && game.template.pages) || []) for (const s of p.slots || []) enPagina.add(s.field);
  const derivados = new Set();
  // Un campo también sale si una mecánica lo dibuja o lo usa para calcular un derivado.
  for (const m of game.mechanics || []) {
    for (const f of m.derives || []) derivados.add(f);
    const pr = m.params || {};
    for (const k of [pr.field, pr.name, pr.alias, ...Object.keys(pr.map || {})]) if (k) derivados.add(k);
  }
  for (const id of Object.keys(fields)) {
    if (!enPagina.has(id) && !derivados.has(id)) avisos.push(`el campo «${id}» no sale en ninguna página`);
  }
  if (codigos) {
    for (const id of Object.keys(fields)) if (!codigos.includes(id)) avisos.push(`el campo «${id}» no tiene código [${id}] en el PDF del artista`);
  }
  return avisos;
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
  if (!errs.length) errs.push(...crossErrors(game, opts));
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
    game = loadGame(target);
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
