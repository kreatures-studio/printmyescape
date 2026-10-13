// Reglas del validador de juegos pme-game/1 que no dependen de Node (T5.6 de PLAN-CREADOR.md).
// Las usan tools/game/validate.mjs (CLI, con el sistema de ficheros) y el editor del navegador
// (creator/), así que aquí no hay importaciones de Node: los ficheros se comprueban con `existe`
// y el manifiesto del kit llega ya leído. Las mecánicas y transformaciones se toman de
// globalThis.PMEMechanics y globalThis.PMETransforms (cargadas por quien llama).

const LICENCIAS_KIT = new Set(['CC0-1.0']); // contrato 3.4: en fase 1 solo CC0
// Arte de la biblioteca (F2): propio del estudio o CC0. Igual que LICENCIAS_ARTE de tools/biblioteca/reglas.mjs
// (no se importa para que este módulo siga sin dependencias en el navegador; lo comprueba biblioteca-juego-test).
export const LICENCIAS_BIBLIOTECA = new Set(['propia-estudio', 'CC0-1.0']);
const TIPOS_KIT = new Set(['background', 'frame', 'photo-frame', 'decor', 'icon']);
const TEXT_TYPES = new Set(['name', 'text', 'long']);

/**
 * Manifiesto del kit (contrato 3.4): cada pieza tiene id único, tipo, fichero que existe,
 * licencia CC0-1.0 (fase 1), fuente y autor. `m` es el manifiesto ya leído; `existe(ruta)` dice si
 * un fichero del kit existe (null: no se comprueba). Devuelve { errores, piezas: Map id → pieza }.
 */
export function erroresKitDatos(m, existe = null) {
  const errores = [];
  const piezas = new Map();
  if (!m || !Array.isArray(m.pieces)) return { errores: ['kit: falta la lista «pieces»'], piezas };
  const hay = (ruta) => !existe || existe(ruta);
  if (m.schema === 'pme-biblioteca/1') {
    // Colección de arte de la biblioteca: ya la valida tools/biblioteca/validar.mjs; aquí, lo que necesita el juego.
    if (m.tipo !== 'arte') return { errores: [`kit: la colección de la biblioteca es de «${m.tipo}», no de arte`], piezas };
    for (const p of [...m.pieces].sort((a, b) => a.version - b.version)) {
      const pieza = { ...p, deBiblioteca: true };
      piezas.set(`${p.id}@${p.version}`, pieza);
      piezas.set(p.id, pieza); // sin versión: la más alta
      if (!p.file || !hay(p.file)) errores.push(`kit/${p.id}@${p.version}: no existe el fichero «${p.file}»`);
    }
    return { errores, piezas };
  }
  for (const p of m.pieces) {
    const id = p.id || '(sin id)';
    if (!p.id) errores.push('kit: una pieza no tiene id');
    else if (piezas.has(p.id)) errores.push(`kit: la pieza «${p.id}» está repetida`);
    else piezas.set(p.id, p);
    if (!TIPOS_KIT.has(p.kind)) errores.push(`kit/${id}: kind debe ser ${[...TIPOS_KIT].join(' | ')}`);
    if (!p.file) errores.push(`kit/${id}: falta file`);
    else if (!hay(p.file)) errores.push(`kit/${id}: no existe el fichero «${p.file}»`);
    if (p.thumb && !hay(p.thumb)) errores.push(`kit/${id}: no existe la miniatura «${p.thumb}»`);
    if (!LICENCIAS_KIT.has(p.license)) errores.push(`kit/${id}: licencia no admitida («${p.license}»); en fase 1 solo CC0-1.0`);
    if (!p.source) errores.push(`kit/${id}: falta source`);
    if (!p.author) errores.push(`kit/${id}: falta author`);
  }
  return { errores, piezas };
}

/**
 * Comprobaciones cruzadas: lo que el esquema no puede expresar.
 * opciones: submit (exige lo de enviar, 3.6); existe(ruta) para los ficheros del juego (null: no se
 * comprueban); codigos (códigos [CODIGO] del PDF del artista); kit (resultado de erroresKitDatos o
 * null); kitForzado (exige el kit aunque no haya capas); kitNombre (para el mensaje).
 */
export function reglasCruzadas(game, { submit = false, existe = null, codigos = null, kit = null, kitForzado = false, kitNombre = 'assets/kit/manifest.json' } = {}) {
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
    const def = (globalThis.PMEMechanics || {})[m.type];
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
        if (!(globalThis.PMETransforms || {})[sl.transform]) errs.push(`template/pages/${p.id}: la transformación «${sl.transform}» no existe`);
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
      else if (existe && !existe(ex.photos[id])) errs.push(`examples/${ex.id}: no existe la foto «${ex.photos[id]}» de «${id}»`);
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
  if (kind === 'pdf' && existe && !existe(game.background.file)) {
    errs.push(`background: no existe el PDF «${game.background.file}»`);
  }
  if (kind === 'pdf') {
    // F1.3b: una página con bgKind (juegos v2) dice ella misma su fondo y puede llevar piezas de arte.
    for (const p of pages) if (p.layers && !p.bgKind) errs.push(`template/${p.id}: las capas solo van con background «layers»`);
  }
  if (kind === 'layers') {
    for (const p of pages) if (!Array.isArray(p.layers)) errs.push(`template/${p.id}: falta «layers» (fondo por capas; puede ser [])`);
  }
  const conCapas = pages.some((p) => Array.isArray(p.layers) && p.layers.length);
  if (kind === 'layers' || conCapas || kitForzado) {
    if (!kit) {
      errs.push(`background: no hay manifiesto del kit (${kitNombre})`);
    } else {
      errs.push(...kit.errores);
      for (const p of pages) {
        for (const capa of [...(p.layers || []), ...(p.topLayers || [])]) {
          const pieza = kit.piezas.get(capa.asset);
          if (!pieza) errs.push(`template/${p.id}: la pieza «${capa.asset}» no está en el kit`);
          else if (pieza.deBiblioteca) {
            if (!LICENCIAS_BIBLIOTECA.has(pieza.license)) errs.push(`template/${p.id}: la pieza «${capa.asset}» tiene una licencia no admitida («${pieza.license}»)`);
            else if (!pieza.author) errs.push(`template/${p.id}: la pieza «${capa.asset}» necesita autor`);
            else if (pieza.status === 'reexportar') errs.push(`template/${p.id}: la pieza «${capa.asset}» está pendiente de reexportar por el artista (no se usa en juegos)`);
          } else if (!LICENCIAS_KIT.has(pieza.license)) errs.push(`template/${p.id}: la pieza «${capa.asset}» tiene una licencia no admitida («${pieza.license}»)`);
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


/**
 * Plantilla lista para el motor (T6.1). El motor busca el tipo de cada hueco en `template.fields`, con
 * los tipos heredados «text» e «image» (las fotos). Esta función lo alinea con `game.fields`: las
 * fotos pasan a «image», el resto a «text», y los campos que no están en la lista se añaden. No cambia
 * el juego: devuelve una copia de `template`. Para final3 la lista ya coincide (golden 96/96).
 */
export function plantillaParaMotor(game) {
  const tpl = game.template;
  const campos = game.fields || {};
  const tipoMotor = (t) => (t === 'photo' ? 'image' : 'text');
  const lista = (tpl.fields || []).map((f) => (campos[f.id] ? { ...f, type: tipoMotor(campos[f.id].type) } : f));
  const conocidos = new Set(lista.map((f) => f.id));
  for (const [id, c] of Object.entries(campos)) {
    if (conocidos.has(id)) continue;
    conocidos.add(id);
    lista.push(c.cap ? { id, type: tipoMotor(c.type), maxLength: c.cap } : { id, type: tipoMotor(c.type) });
  }
  // Los campos que calcula una mecánica (derives) también tienen hueco: sin estar en la lista, el motor no los dibuja.
  for (const m of game.mechanics || []) {
    for (const id of m.derives || []) {
      if (conocidos.has(id)) continue;
      conocidos.add(id);
      lista.push({ id, type: 'text' });
    }
  }
  return { ...tpl, fields: lista };
}

/**
 * Reglas propias de pme-game/2 (F1.5 de PLAN-CREADOR-2.md), además de las de reglasCruzadas sobre su forma v1:
 * ids de elemento únicos en cada página, puzzles con id único y mecánica conocida, y cada bloque de puzzle
 * apunta a un puzzle del juego.
 */
/* F1.5: las cajas de los elementos (en % de la página, o de la caja del puzzle) deben caber en ella.
   Un texto, campo o foto fuera de la página es error; una pieza de arte puede sobresalir (aviso). */
const TOL_CAJA = 0.01;
function cajaFueraDe(e) {
  if (![e.x, e.y, e.w, e.h].every((v) => typeof v === 'number')) return null;
  if (e.x < -TOL_CAJA || e.y < -TOL_CAJA || e.x + e.w > 100 + TOL_CAJA || e.y + e.h > 100 + TOL_CAJA) {
    return `la caja (${e.x}, ${e.y}, ${e.w}×${e.h}) sale de la página`;
  }
  return null;
}
/* Un puzzle de datos lleva coordenadas de la página de origen: su bloque ocupa la página entera. */
const esPaginaEntera = (e) => [[e.x, 0], [e.y, 0], [e.w, 100], [e.h, 100]].every(([v, t]) => Math.abs(v - t) <= TOL_CAJA);
/* Recorre los elementos de una página o de un puzzle: ids, puzzles citados y cajas.
   «usos» cuenta dónde se coloca cada puzzle de datos (cada uno, una sola vez). */
function elementosV2(elementos, ruta, puzzles, errs, avisos, visitados = new Set(), usos = new Map()) {
  const ids = new Set();
  for (const e of elementos || []) {
    if (ids.has(e.id)) errs.push(`${ruta}: el elemento «${e.id}» está repetido`);
    ids.add(e.id);
    const fuera = cajaFueraDe(e);
    if (fuera) {
      if (e.kind === 'art') avisos.push(`${ruta}/${e.id}: la pieza de arte ${fuera} (puede sobresalir a propósito)`);
      else errs.push(`${ruta}/${e.id}: ${fuera}`);
    }
    if (e.kind === 'puzzle') {
      if (!puzzles.has(e.puzzle)) { errs.push(`${ruta}/${e.id}: el puzzle «${e.puzzle}» no existe en puzzles`); continue; }
      if (visitados.has(e.puzzle)) { errs.push(`${ruta}/${e.id}: el puzzle «${e.puzzle}» se contiene a sí mismo`); continue; }
      const pz = puzzles.get(e.puzzle);
      if (pz.mechanic) {
        if (visitados.size) errs.push(`${ruta}/${e.id}: el puzzle de datos «${pz.id}» va directamente en una página, no dentro de otro puzzle`);
        else if (!esPaginaEntera(e)) errs.push(`${ruta}/${e.id}: el puzzle de datos «${pz.id}» ocupa la página entera (0, 0, 100×100): sus coordenadas son las de la página de origen`);
        if (usos.has(pz.id)) errs.push(`${ruta}/${e.id}: el puzzle de datos «${pz.id}» ya está en ${usos.get(pz.id)} (va una sola vez)`);
        else usos.set(pz.id, ruta);
      }
      if (pz.page && pz.page.elements) elementosV2(pz.page.elements, `puzzles/${pz.id}`, puzzles, errs, avisos, new Set([...visitados, e.puzzle]), usos);
    }
  }
}
/* Mapa de puzzles y sus errores propios (sin depender de la página donde se usan). */
function puzzlesV2(game, errs) {
  const puzzles = new Map();
  for (const pz of game.puzzles || []) {
    if (puzzles.has(pz.id)) errs.push(`puzzles/${pz.id}: id repetido`);
    puzzles.set(pz.id, pz);
    if (pz.mechanic && !(globalThis.PMEMechanics || {})[pz.mechanic]) errs.push(`puzzles/${pz.id}: la mecánica «${pz.mechanic}» no está en el catálogo`);
    if (pz.kind === 'datos' && !pz.mechanic) errs.push(`puzzles/${pz.id}: un puzzle de datos necesita una mecánica del catálogo`);
    if (pz.kind === 'contenido' && pz.mechanic) errs.push(`puzzles/${pz.id}: un puzzle de contenido no lleva mecánica`);
  }
  return puzzles;
}
export function reglasV2(game) {
  const errs = [];
  const puzzles = puzzlesV2(game, errs);
  const paginas = new Set();
  const usos = new Map();
  for (const p of game.pages || []) {
    if (paginas.has(p.id)) errs.push(`pages/${p.id}: la página está repetida`);
    paginas.add(p.id);
    elementosV2(p.elements, `pages/${p.id}`, puzzles, errs, [], new Set(), usos);
  }
  return errs;
}
/* Avisos v2 (no bloquean): piezas de arte que sobresalen de la página. */
export function avisosV2(game) {
  const errs = [], avisos = [];
  const puzzles = puzzlesV2(game, errs);
  for (const p of game.pages || []) elementosV2(p.elements, `pages/${p.id}`, puzzles, errs, avisos);
  // Sugerencias de Claude que apuntan a algo que ya no está (se quitó sin descartarlas).
  for (const s of game.suggestions || []) {
    const p = s.page && (game.pages || []).find((x) => x.id === s.page);
    if (s.field && !(game.fields || {})[s.field]) avisos.push(`suggestions/${s.id}: la pregunta «${s.field}» ya no existe`);
    else if (s.page && !p) avisos.push(`suggestions/${s.id}: la página «${s.page}» ya no existe`);
    else if (s.element && !p.elements.some((e) => e.id === s.element)) avisos.push(`suggestions/${s.id}: el elemento «${s.element}» ya no está en ${s.page}`);
  }
  return avisos;
}
