#!/usr/bin/env node
// Guarda páginas y secciones de un juego en la biblioteca, con su origen (F2.5 de PLAN-CREADOR-2.md).
//
// Uso: node tools/biblioteca/desde-juego.mjs <carpeta del juego> <spec.json>
//
// spec.json:
//   { "coleccion": "el-regalo-robado",
//     "paginas":   [ { "de": "p1", "id": "ficha-victima", "nombre": "Ficha de la víctima", "etiquetas": ["misterio", "kraft", "foto"] } ],
//     "secciones": [ { "de": "victima", "id": "seccion-victima", "nombre": "Cumpleañero", "etiquetas": ["formulario", "foto", "nombre"] } ],
//     "puzzles":   [ { "de": "ticks", "id": "puzzle-ticks", "nombre": "Casillas marcadas", "etiquetas": ["casillas", "marcas", "datos"] } ] }
//
// Escribe biblioteca/paginas/<coleccion>/, biblioteca/secciones/<coleccion>/ y biblioteca/puzzles/<coleccion>/
// (manifest.json y, para el fondo PDF, fondos/<id>-v1.pdf con la página del PDF del juego). Cada entrada guarda su
// origen (juego, versión, página, sección o mecánica) y se valida con tools/biblioteca/validar.mjs; si no valida,
// no se escribe nada.
//
// Puzzles: «de» es el tipo de una mecánica del juego (game.mechanics[].type), y debe aparecer una sola vez. Se guarda
// como puzzle de datos: sus parámetros, los campos que lee (needs) y la solución del juego si la hay en la misma página.
// Una página con puzzles (elementos «puzzle») se rechaza: aún no se pueden colocar en una página de la biblioteca.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { migrarAV2 } from '../game/v2.mjs';
import { validarColeccion } from './validar.mjs';

const require = createRequire(import.meta.url);
const { PDFDocument } = require(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'pdf-lib'));
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIBLIOTECA = path.join(ROOT, 'biblioteca');

function leerJuegoV2(carpeta) {
  const raw = JSON.parse(fs.readFileSync(path.join(carpeta, 'game.json'), 'utf8'));
  return { g: raw.schema === 'pme-game/2' ? raw : migrarAV2(raw), carpeta };
}

function textosDe(elementos, idiomas, i18n) {
  const out = {};
  for (const lang of idiomas) {
    out[lang] = {};
    for (const e of elementos) {
      if (e.kind !== 'text') continue;
      const v = (i18n[lang] || {})[e.key];
      if (v === undefined) throw new Error(`el texto «${e.key}» no existe en «${lang}»`);
      out[lang][e.key] = v;
    }
  }
  return out;
}

async function copiarPaginaPdf(origen, numero, destino) {
  const src = await PDFDocument.load(fs.readFileSync(origen));
  const out = await PDFDocument.create();
  const [pag] = await out.copyPages(src, [numero - 1]);
  out.addPage(pag);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, await out.save());
}

async function exportarPaginas({ g, carpeta }, specs, dir) {
  const piezas = [];
  for (const s of specs) {
    const p = g.pages.find((x) => x.id === s.de);
    if (!p) throw new Error(`el juego no tiene la página «${s.de}»`);
    if (p.elements.some((e) => e.kind === 'puzzle')) throw new Error(`la página «${s.de}» usa puzzles: se guardan en F2.6`);
    const campos = [...new Set(p.elements.filter((e) => e.kind === 'field' || e.kind === 'photo').map((e) => e.field))];
    const textos = textosDe(p.elements, g.languages, g.i18n);
    const i18n = Object.fromEntries(g.languages.map((l) => [l, textos[l]]));
    const page = { id: p.id, title: p.title, elements: structuredClone(p.elements) };
    const bg = p.background || { kind: 'none' };
    if (bg.kind === 'pdf') {
      const file = `fondos/${s.id}-v1.pdf`;
      await copiarPaginaPdf(path.resolve(carpeta, bg.file), bg.page, path.join(dir, file));
      page.background = { kind: 'pdf', file, page: 1 };
    } else {
      page.background = bg;
    }
    piezas.push({
      id: s.id, version: 1, name: s.nombre, tags: s.etiquetas,
      origin: { game: g.id, version: g.version, page: s.de },
      languages: g.languages, page, i18n, fields: campos,
    });
  }
  return piezas;
}

function exportarSecciones({ g }, specs) {
  return specs.map((s) => {
    const sec = (g.form.sections || []).find((x) => x.id === s.de);
    if (!sec) throw new Error(`el juego no tiene la sección «${s.de}»`);
    const campos = sec.fields;
    const fieldDefs = Object.fromEntries(campos.map((c) => {
      if (!g.fields[c]) throw new Error(`el campo «${c}» de la sección «${s.de}» no existe en fields`);
      return [c, g.fields[c]];
    }));
    const examples = (g.examples || []).map((ej) => ({
      id: String(ej.id),
      values: Object.fromEntries(Object.entries(ej.values || {}).map(([lang, v]) =>
        [lang, Object.fromEntries(Object.entries(v).filter(([k]) => campos.includes(k)))])),
      photos: Object.fromEntries(Object.entries(ej.photos || {}).filter(([k]) => campos.includes(k))),
    }));
    const section = { id: sec.id, title: sec.title };
    for (const k of ['hint', 'nameField', 'photoField']) if (sec[k] !== undefined) section[k] = sec[k];
    section.fields = campos;
    return {
      id: s.id, version: 1, name: s.nombre, tags: s.etiquetas,
      origin: { game: g.id, version: g.version, section: s.de },
      section, fieldDefs, examples,
    };
  });
}

/** Campos que una mecánica lee de la ficha, según sus parámetros (sin los que calcula). */
function camposQueLee(m) {
  const p = m.params || {};
  const campos = [];
  if (p.field) campos.push(p.field);
  if (p.name) campos.push(p.name);
  if (p.alias) campos.push(p.alias);
  if (p.map) campos.push(...Object.keys(p.map));
  return campos;
}

function exportarPuzzles({ g }, specs) {
  return specs.map((s) => {
    const iguales = (g.mechanics || []).filter((x) => x.type === s.de);
    if (iguales.length !== 1) throw new Error(`el juego tiene ${iguales.length} mecánica(s) «${s.de}» (hace falta exactamente una)`);
    const m = iguales[0];
    const solucion = (g.solutions || []).find((x) => x.page === m.page);
    const derives = m.derives || [];
    const necesita = [...new Set([...camposQueLee(m), ...((solucion && solucion.dependsOn) || [])])].filter((c) => !derives.includes(c));
    for (const c of necesita) if (!g.fields[c]) throw new Error(`el puzzle «${s.id}» lee el campo «${c}», que no existe en fields`);
    const entrada = {
      id: s.id, version: 1, name: s.nombre, tags: s.etiquetas,
      origin: { game: g.id, version: g.version, mechanic: m.type, page: m.page },
      kind: 'datos', mechanic: m.type, params: structuredClone(m.params), needs: necesita,
    };
    if (derives.length) entrada.derives = [...derives];
    if (solucion) entrada.solution = structuredClone(solucion);
    return entrada;
  });
}

function escribirColeccion(tipo, carpeta, entradas) {
  const file = path.join(carpeta, 'manifest.json');
  const previas = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).pieces : [];
  const ids = new Set(previas.map((p) => `${p.id}@${p.version}`));
  for (const e of entradas) {
    if (ids.has(`${e.id}@${e.version}`)) throw new Error(`ya existe «${e.id}» versión ${e.version} en ${tipo}: usa otro id o una versión nueva`);
  }
  const todas = [...previas, ...entradas];
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ schema: 'pme-biblioteca/1', tipo, pieces: todas }, null, 2) + '\n');
  return file;
}

async function main() {
  const [carpeta, specFile] = process.argv.slice(2);
  if (!carpeta || !specFile) { console.error('uso: node tools/biblioteca/desde-juego.mjs <carpeta del juego> <spec.json>'); return 2; }
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  const origen = leerJuegoV2(path.resolve(carpeta));
  const colPag = path.join(BIBLIOTECA, 'paginas', spec.coleccion);
  const colSec = path.join(BIBLIOTECA, 'secciones', spec.coleccion);
  const colPuz = path.join(BIBLIOTECA, 'puzzles', spec.coleccion);
  const leer = (dir) => (fs.existsSync(path.join(dir, 'manifest.json')) ? fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8') : null);
  const antes = { pag: leer(colPag), sec: leer(colSec), puz: leer(colPuz) };
  // Antes de copiar nada: los ids nuevos no pueden existir ya en la colección.
  const existentes = (carpeta) => new Set(fs.existsSync(path.join(carpeta, 'manifest.json'))
    ? JSON.parse(fs.readFileSync(path.join(carpeta, 'manifest.json'), 'utf8')).pieces.map((p) => `${p.id}@${p.version}`) : []);
  const grupos = [[colPag, (spec.paginas || []).map((p) => p.id)], [colSec, (spec.secciones || []).map((s) => s.id)],
    [colPuz, (spec.puzzles || []).map((z) => z.id)]];
  for (const [carpeta, ids] of grupos) {
    const previas = existentes(carpeta);
    const repetidos = ids.filter((id) => previas.has(`${id}@1`));
    if (repetidos.length) { console.error(`ERROR ya existe en la biblioteca: ${repetidos.join(', ')} (usa otro id o una versión nueva)\nNo se ha guardado nada.`); return 1; }
  }
  const fondosDe = (dir) => new Set(fs.existsSync(path.join(dir, 'fondos')) ? fs.readdirSync(path.join(dir, 'fondos')) : []);
  const fondosAntes = { pag: fondosDe(colPag), sec: fondosDe(colSec) };
  try {
    if (spec.paginas?.length) {
      const piezas = await exportarPaginas(origen, spec.paginas, colPag);
      escribirColeccion('pagina', colPag, piezas);
      const { errores } = validarColeccion(colPag);
      if (errores.length) throw new Error(`la colección de páginas no valida:\n  ${errores.join('\n  ')}`);
      console.log(`OK ${piezas.length} página(s) → ${path.relative(ROOT, colPag)}`);
    }
    if (spec.secciones?.length) {
      const entradas = exportarSecciones(origen, spec.secciones);
      escribirColeccion('seccion', colSec, entradas);
      const { errores } = validarColeccion(colSec);
      if (errores.length) throw new Error(`la colección de secciones no valida:\n  ${errores.join('\n  ')}`);
      console.log(`OK ${entradas.length} sección(es) → ${path.relative(ROOT, colSec)}`);
    }
    if (spec.puzzles?.length) {
      const entradas = exportarPuzzles(origen, spec.puzzles);
      escribirColeccion('puzzle', colPuz, entradas);
      const { errores } = validarColeccion(colPuz);
      if (errores.length) throw new Error(`la colección de puzzles no valida:\n  ${errores.join('\n  ')}`);
      console.log(`OK ${entradas.length} puzzle(s) → ${path.relative(ROOT, colPuz)}`);
    }
  } catch (e) {
    // Deshace: restaura los manifiestos y borra las carpetas nuevas.
    for (const [dir, previo, antesF] of [[colPag, antes.pag, fondosAntes.pag], [colSec, antes.sec, fondosAntes.sec], [colPuz, antes.puz, new Set()]]) {
      if (previo === null) { fs.rmSync(dir, { recursive: true, force: true }); continue; }
      if (fs.existsSync(dir)) fs.writeFileSync(path.join(dir, 'manifest.json'), previo);
      for (const f of fondosDe(dir)) if (!antesF.has(f)) fs.rmSync(path.join(dir, 'fondos', f), { force: true });
    }
    console.error(`ERROR ${e.message}\nNo se ha guardado nada.`);
    return 1;
  }
  return 0;
}

main().then((c) => { process.exitCode = c; });
