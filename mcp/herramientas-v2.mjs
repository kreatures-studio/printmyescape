// Herramientas MCP de PLAN-CREADOR-2.md §2.4 (F3.1): componer juegos pme-game/2 con la biblioteca.
// Mismas reglas que las de herramientas.mjs: validan antes de guardar, se niegan fuera de «borrador» y no pisan
// una versión más nueva (rev). Reutilizar es copiar: páginas, secciones y puzzles llegan con «from» (id@versión);
// el arte se cita por id y versión fija.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { migrarAV2 } from '../tools/game/v2.mjs';
import { entradas, buscar, partirRef, rutaBiblioteca } from '../tools/biblioteca/indice.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS_ELEMENTO = ['art', 'text', 'field', 'photo', 'puzzle'];
const PAGINA_A4_MM = { w: 210, h: 297 };
const PAGINA_ENTERA = { x: 0, y: 0, w: 100, h: 100 };

/** Clave de i18n a partir de un texto: minúsculas, sin acentos, guiones; como las de los juegos migrados. */
export function claveDeTexto(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'texto';
}

const fecha = () => new Date().toISOString().slice(0, 10);

export function herramientasV2(ctx) {
  const { almacen, mutar, cargarCrudo, validar, ErrorHerramienta: E, esquema, ID, PAGINA, raiz } = ctx;
  const S = { type: 'string' };

  /* ---- Ayudas ---- */
  const paginaV2 = (g, id) => {
    const p = g.pages.find((x) => x.id === id);
    if (!p) throw new E('not-found', `no hay página «${id}» (hay: ${g.pages.map((x) => x.id).join(', ')})`);
    return p;
  };
  const idNuevoDePagina = (g) => `p${Math.max(0, ...g.pages.map((p) => Number(p.id.slice(1)) || 0)) + 1}`;
  const idNuevoDeElemento = (pagina) => {
    let n = pagina.elements.length + 1;
    while (pagina.elements.some((e) => e.id === `${pagina.id}-e${n}`)) n++;
    return `${pagina.id}-e${n}`;
  };
  /** Campos que calcula el juego (mecánicas y puzzles de datos): no hace falta pedirlos. */
  const derivados = (g) => new Set([...(g.mechanics || []).flatMap((m) => m.derives || []), ...(g.puzzles || []).flatMap((z) => z.derives || [])]);
  function faltanCampos(g, campos, que) {
    const calc = derivados(g);
    const faltan = [...new Set(campos)].filter((c) => !(g.fields || {})[c] && !calc.has(c));
    if (!faltan.length) return;
    const secciones = entradas('seccion').filter((s) => faltan.some((c) => s.section.fields.includes(c)))
      .map((s) => `${s.id}@${s.version}`);
    const puzzles = entradas('puzzle').filter((z) => faltan.some((c) => (z.derives || []).includes(c)))
      .map((z) => `${z.id}@${z.version}`);
    throw new E('faltan-campos', `${que} usa campos que el juego no tiene: ${faltan.join(', ')}. Créalos con upsert_field`
      + (secciones.length ? `, copia una sección de la biblioteca que los trae (${secciones.join(', ')})` : '')
      + (puzzles.length ? `, o añade antes el puzzle que los calcula (${puzzles.join(', ')})` : ''), faltan);
  }
  /** Guarda los textos {idioma: texto} de un elemento en i18n y devuelve la clave (sin pisar otra distinta). */
  function guardarTextos(g, textos, claveDeseada) {
    const idiomas = g.languages;
    const falta = idiomas.filter((l) => typeof textos[l] !== 'string' || !textos[l].trim());
    if (falta.length) throw new E('invalid', `faltan los textos en: ${falta.join(', ')} (el juego tiene ${idiomas.join(', ')})`);
    const base = claveDeseada || claveDeTexto(textos[idiomas[0]]);
    let clave = base, n = 2;
    const libre = (k) => idiomas.every((l) => g.i18n[l][k] === undefined || g.i18n[l][k] === textos[l]);
    while (!libre(clave)) clave = `${base}-${n++}`;
    for (const l of idiomas) g.i18n[l][clave] = textos[l];
    return clave;
  }
  /** Fija la versión del arte (id → id@versión) y completa w o h con la proporción de la pieza. */
  function prepararArte(g, el) {
    const pieza = buscar('arte', el.ref);
    if (!pieza) throw new E('not-found', `no hay pieza de arte «${el.ref}» en la biblioteca (list_library tipo arte)`);
    if (pieza.status === 'reexportar') throw new E('invalid', `la pieza «${el.ref}» está pendiente de reexportar: no se usa en juegos`);
    el.ref = `${pieza.id}@${pieza.version}`;
    const aspecto = (pieza.heightMm / PAGINA_A4_MM.h) / (pieza.widthMm / PAGINA_A4_MM.w); // h% / w% en A4
    if (typeof el.w === 'number' && typeof el.h !== 'number') el.h = Math.round(el.w * aspecto * 100) / 100;
    if (typeof el.h === 'number' && typeof el.w !== 'number') el.w = Math.round((el.h / aspecto) * 100) / 100;
    if (el.angle === undefined) el.angle = 0;
  }
  /** Prepara un elemento nuevo: id, textos (texts → i18n), arte. */
  function prepararElemento(g, pagina, el) {
    if (!TIPOS_ELEMENTO.includes(el.kind)) throw new E('invalid', `kind debe ser ${TIPOS_ELEMENTO.join(' | ')}`);
    const nuevo = structuredClone(el);
    if (!nuevo.id) nuevo.id = idNuevoDeElemento(pagina);
    if (pagina.elements.some((e) => e.id === nuevo.id)) throw new E('exists', `ya hay un elemento «${nuevo.id}» en ${pagina.id}`);
    if (nuevo.kind === 'text' && nuevo.texts) { nuevo.key = guardarTextos(g, nuevo.texts, nuevo.key); delete nuevo.texts; }
    if (nuevo.kind === 'text' && !nuevo.key) throw new E('invalid', 'un texto necesita «texts» ({idioma: texto}) o «key» de i18n');
    if (nuevo.kind === 'art') prepararArte(g, nuevo);
    if ((nuevo.kind === 'field' || nuevo.kind === 'photo')) faltanCampos(g, [nuevo.field], `el elemento ${nuevo.id}`);
    return nuevo;
  }
  /** Copia de un puzzle del catálogo para el juego (con «from»), sin colocarlo. */
  function puzzleDelCatalogo(g, ref, idJuego) {
    const e = buscar('puzzle', ref);
    if (!e) throw new E('not-found', `no hay puzzle «${ref}» en el catálogo (list_library tipo puzzle)`);
    const { id: idBib, version, tags, origin, status, notes, coleccion, dir, ...resto } = structuredClone(e);
    const nuevo = { id: idJuego || idBib.replace(/^puzzle-/, ''), from: `${idBib}@${version}`, ...resto };
    if ((g.puzzles || []).some((z) => z.id === nuevo.id)) throw new E('exists', `ya hay un puzzle «${nuevo.id}» (usa puzzle_id para otro nombre)`);
    return nuevo;
  }
  /** Copia un fichero de la biblioteca a la carpeta del juego si no está; devuelve si lo ha creado. */
  function copiarAlJuego(id, origen, rel) {
    const destino = path.join(almacen.carpeta(id), rel);
    if (fs.existsSync(destino)) return null;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origen, destino);
    return destino;
  }
  /** mutar() que borra los ficheros copiados si el cambio no se guarda. */
  async function mutarConFicheros(id, mensaje, cambiar) {
    const creados = [];
    try {
      return await mutar(id, mensaje, (g) => cambiar(g, creados), { formato: 'v2' });
    } catch (e) {
      for (const f of creados) if (f) fs.rmSync(f, { force: true });
      throw e;
    }
  }
  function python(args) {
    const r = spawnSync('python3', args, { cwd: ROOT, encoding: 'utf8' });
    if (r.error) throw new E('sin-python', 'hace falta python3 con PyMuPDF para importar arte');
    return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  }
  const rutaDelRepo = (rel) => {
    const abs = path.resolve(raiz, rel);
    if (!fs.existsSync(abs)) throw new E('not-found', `no existe «${rel}» (rutas relativas a la copia local del repositorio de juegos)`);
    return abs;
  };

  return [
    {
      name: 'list_library',
      description: 'Lista la biblioteca: tipo arte (piezas), pagina, seccion o puzzle (catálogo de datos). Filtra por etiqueta o colección. Devuelve «ref» (id@versión) para usar en las demás herramientas.',
      schema: esquema({ tipo: { type: 'string', enum: ['arte', 'pagina', 'seccion', 'puzzle'] }, tag: S, coleccion: S }, ['tipo']),
      run: async ({ tipo, tag, coleccion }) => entradas(tipo)
        .filter((e) => (!tag || (e.tags || []).includes(tag)) && (!coleccion || e.coleccion === coleccion))
        .map((e) => {
          const base = { ref: `${e.id}@${e.version}`, name: e.name, tags: e.tags, coleccion: e.coleccion };
          if (tipo === 'arte') return { ...base, category: e.category, widthMm: e.widthMm, heightMm: e.heightMm, zones: e.zones, status: e.status ?? 'ok' };
          if (tipo === 'pagina') return { ...base, fields: e.fields, languages: e.languages, background: e.page.background.kind, elements: e.page.elements.length };
          if (tipo === 'seccion') return { ...base, fields: e.section.fields, nameField: e.section.nameField ?? null, photoField: e.section.photoField ?? null };
          return { ...base, kind: e.kind, mechanic: e.mechanic, needs: e.needs.map((n) => n.field), derives: e.derives || [], solution: !!e.solution };
        }),
    },
    {
      name: 'duplicate_game',
      description: 'Copia un juego como punto de partida de otro (siempre en pme-game/2, en borrador, versión 0.1.0, sin notas). Copia también los ficheros de la carpeta del juego (fondos y fotos).',
      schema: esquema({ from: ID, id: ID, name: { description: 'Nombre: texto u objeto { idioma: texto }' } }, ['from', 'id']),
      run: async ({ from, id, name }) => {
        if (await almacen.latestRev(id)) throw new E('exists', `ya existe el juego «${id}»`);
        const origen = await cargarCrudo(from);
        const g = migrarAV2(origen);
        g.id = id;
        g.version = '0.1.0';
        g.status = 'borrador';
        if (name) g.name = typeof name === 'string' ? Object.fromEntries(g.languages.map((l) => [l, name])) : name;
        g.notes = [];
        g.changes = [{ date: fecha(), text: `Copia de «${from}» (versión ${origen.version}).` }];
        // Ficheros dentro de la carpeta del juego (las rutas que salen de ella siguen valiendo: misma profundidad).
        const dirOrigen = almacen.carpeta(from);
        const rutas = new Set([
          ...g.pages.filter((p) => p.background && p.background.kind === 'pdf').map((p) => p.background.file),
          ...(g.examples || []).flatMap((e) => Object.values(e.photos || {})),
        ]);
        const creados = [];
        try {
          for (const rel of rutas) {
            const abs = path.resolve(dirOrigen, rel);
            if (!abs.startsWith(dirOrigen + path.sep) || !fs.existsSync(abs)) continue;
            creados.push(copiarAlJuego(id, abs, rel));
          }
          const { errors } = await validar(g, { dir: almacen.carpeta(id) });
          if (errors.length) throw new E('invalido', 'la copia no valida; no se ha guardado', errors);
          await almacen.save(id, g, null, `Copiar ${from} en ${id}`);
        } catch (e) {
          for (const f of creados) if (f) fs.rmSync(f, { force: true });
          throw e;
        }
        return { id, schema: g.schema, paginas: g.pages.length, ficheros: creados.filter(Boolean).map((f) => path.relative(almacen.carpeta(id), f)) };
      },
    },
    {
      name: 'insert_page',
      description: 'Añade una página: copiada de la biblioteca (from: «pagina-id@versión», con su fondo, elementos y textos) o en blanco (background: {kind: color|none|art|pdf, ...}; por defecto blanca). puzzles: puzzles del catálogo que van en esta página (p. ej. el que calcula sus campos), en el mismo cambio. position: número de orden (1 = primera); por defecto, al final.',
      schema: esquema({ id: ID, from: S, title: S, background: { type: 'object' }, position: { type: 'integer' }, puzzles: { type: 'array', description: 'refs del catálogo, «puzzle-x@versión»' } }, ['id']),
      run: async ({ id, from, title, background, position, puzzles = [] }) => mutarConFicheros(id, `Página nueva en ${id}`, (g, creados) => {
        const nueva = { id: idNuevoDePagina(g), title: title || '', background: background || { kind: 'color', value: '#FFFFFF' }, elements: [] };
        g.puzzles = g.puzzles || [];
        // Primero los puzzles: sus campos (needs) tienen que existir y sus derivados cuentan para la página.
        for (const ref of puzzles) {
          const z = puzzleDelCatalogo(g, ref);
          faltanCampos(g, z.needs.map((n) => n.field), `el puzzle «${ref}»`);
          g.puzzles.push(z);
          nueva.elements.push({ id: `${nueva.id}-${z.id}`, kind: 'puzzle', puzzle: z.id, ...PAGINA_ENTERA });
        }
        if (from) {
          const e = buscar('pagina', from);
          if (!e) throw new E('not-found', `no hay página «${from}» en la biblioteca (list_library tipo pagina)`);
          const faltaIdioma = g.languages.filter((l) => !e.i18n[l]);
          if (faltaIdioma.length) throw new E('invalid', `la página «${from}» no tiene textos en ${faltaIdioma.join(', ')}`);
          faltanCampos(g, e.fields, `la página «${from}»`);
          nueva.from = `${e.id}@${e.version}`;
          nueva.title = title || e.page.title || e.name;
          const bloques = nueva.elements;
          nueva.elements = [...structuredClone(e.page.elements).map((el) => ({ ...el, id: el.id.replace(/^p\d+-/, `${nueva.id}-`) })), ...bloques];
          // Textos: misma clave si está libre o tiene el mismo texto; si no, una clave nueva.
          for (const el of nueva.elements) {
            if (el.kind !== 'text') continue;
            el.key = guardarTextos(g, Object.fromEntries(g.languages.map((l) => [l, e.i18n[l][el.key]])), el.key);
          }
          const bg = e.page.background;
          if (bg.kind === 'pdf') {
            const rel = `fondos/${e.id}-v${e.version}.pdf`;
            creados.push(copiarAlJuego(id, path.join(e.dir, bg.file), rel));
            nueva.background = { kind: 'pdf', file: rel, page: bg.page };
          } else {
            nueva.background = structuredClone(bg);
          }
        }
        if (nueva.background.kind === 'art') prepararArte(g, nueva.background);
        const i = position ? Math.max(0, Math.min(g.pages.length, position - 1)) : g.pages.length;
        g.pages.splice(i, 0, nueva);
        return { page: nueva.id, title: nueva.title, from: nueva.from ?? null, elements: nueva.elements.length, position: i + 1,
          puzzles: nueva.elements.filter((x) => x.kind === 'puzzle').map((x) => x.puzzle) };
      }),
    },
    {
      name: 'insert_section',
      description: 'Copia una sección del formulario de la biblioteca (from: «seccion-id@versión»): sus campos con sus definiciones y los valores de sus ejemplos (se juntan con los ejemplos del juego del mismo id). position: orden en el formulario (1 = primera); por defecto, al final.',
      schema: esquema({ id: ID, from: S, position: { type: 'integer' } }, ['id', 'from']),
      run: async ({ id, from, position }) => mutarConFicheros(id, `Sección ${from} en ${id}`, (g, creados) => {
        const e = buscar('seccion', from);
        if (!e) throw new E('not-found', `no hay sección «${from}» en la biblioteca (list_library tipo seccion)`);
        if (g.form.sections.some((s) => s.id === e.section.id)) throw new E('exists', `el formulario ya tiene una sección «${e.section.id}»`);
        const distintos = Object.keys(e.fieldDefs).filter((c) => g.fields[c] && JSON.stringify(g.fields[c]) !== JSON.stringify(e.fieldDefs[c]));
        if (distintos.length) throw new E('exists', `el juego ya tiene campos con el mismo nombre y otra definición: ${distintos.join(', ')}`);
        Object.assign(g.fields, structuredClone(e.fieldDefs));
        const seccion = { ...structuredClone(e.section), from: `${e.id}@${e.version}` };
        const i = position ? Math.max(0, Math.min(g.form.sections.length, position - 1)) : g.form.sections.length;
        g.form.sections.splice(i, 0, seccion);
        g.examples = g.examples || [];
        for (const ej of e.examples) {
          let destino = g.examples.find((x) => x.id === ej.id);
          if (!destino) { destino = { id: ej.id, values: {} }; g.examples.push(destino); }
          for (const l of g.languages) destino.values[l] = { ...(destino.values[l] || {}), ...((ej.values || {})[l] || {}) };
          // Las fotos de los ejemplos se copian a la carpeta del juego (fotos/).
          for (const [campo, rel] of Object.entries(ej.photos || {})) {
            const destinoRel = `fotos/${path.basename(rel)}`;
            creados.push(copiarAlJuego(id, path.join(e.dir, rel), destinoRel));
            destino.photos = { ...(destino.photos || {}), [campo]: destinoRel };
          }
        }
        return { section: seccion.id, from: seccion.from, fields: seccion.fields, examples: e.examples.map((x) => x.id), position: i + 1 };
      }),
    },
    {
      name: 'add_element',
      description: 'Añade un elemento a una página (kind art|text|field|photo|puzzle; x, y, w, h en % de la página). Texto: «texts» {idioma: texto} (crea la clave de i18n). Arte: «ref» de la biblioteca; con solo w (o h) se completa con la proporción de la pieza. index: posición en el orden de dibujo (0 = debajo de todo); por defecto, encima.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'object' }, index: { type: 'integer' } }, ['id', 'page', 'element']),
      run: async ({ id, page, element, index }) => mutar(id, `Elemento en ${page} de ${id}`, (g) => {
        const p = paginaV2(g, page);
        const nuevo = prepararElemento(g, p, element);
        const i = index === undefined ? p.elements.length : Math.max(0, Math.min(p.elements.length, index));
        p.elements.splice(i, 0, nuevo);
        return nuevo;
      }, { formato: 'v2' }),
    },
    {
      name: 'update_element',
      description: 'Cambia propiedades de un elemento (changes: {x, y, size, color, fontFamily, ...}; texts para cambiar el texto en cada idioma; ref para otra pieza). No cambia su kind.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'string', description: 'id del elemento' }, changes: { type: 'object' } }, ['id', 'page', 'element', 'changes']),
      run: async ({ id, page, element, changes }) => mutar(id, `Cambiar ${element} en ${page}`, (g) => {
        const p = paginaV2(g, page);
        const el = p.elements.find((e) => e.id === element);
        if (!el) throw new E('not-found', `no hay elemento «${element}» en ${page}`);
        const { texts, kind, id: _id, ...resto } = changes;
        if (kind && kind !== el.kind) throw new E('invalid', 'no se cambia el kind de un elemento: quítalo y añade otro');
        Object.assign(el, resto);
        for (const [k, v] of Object.entries(resto)) if (v === null) delete el[k];
        if (texts) {
          if (el.kind !== 'text') throw new E('invalid', 'texts solo vale para elementos de texto');
          for (const l of g.languages) if (typeof texts[l] === 'string') g.i18n[l][el.key] = texts[l];
        }
        if (el.kind === 'art' && resto.ref) prepararArte(g, el);
        return el;
      }, { formato: 'v2' }),
    },
    {
      name: 'remove_element',
      description: 'Quita un elemento de una página.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'string', description: 'id del elemento' } }, ['id', 'page', 'element']),
      run: async ({ id, page, element }) => mutar(id, `Quitar ${element} de ${page}`, (g) => {
        const p = paginaV2(g, page);
        const antes = p.elements.length;
        p.elements = p.elements.filter((e) => e.id !== element);
        if (p.elements.length === antes) throw new E('not-found', `no hay elemento «${element}» en ${page}`);
        return { removed: element };
      }, { formato: 'v2' }),
    },
    {
      name: 'add_puzzle',
      description: 'Añade un puzzle y lo coloca en una página. Del catálogo (from: «puzzle-x@versión», de datos: ocupa la página entera y necesita sus campos) o de contenido (puzzle: {id, name, kind: "contenido", solution {idioma: texto}, hints?, difficulty?, minAge?, minutes?, page: {elements}} con elementos en % de su caja; los textos con «texts»). box: caja del puzzle de contenido en % de la página (por defecto, la página entera).',
      schema: esquema({ id: ID, page: PAGINA, from: S, puzzle: { type: 'object' }, box: { type: 'object' }, puzzle_id: S }, ['id', 'page']),
      run: async ({ id, page, from, puzzle, box, puzzle_id }) => mutar(id, `Puzzle en ${page} de ${id}`, (g) => {
        if (!from === !puzzle) throw new E('invalid', 'da «from» (catálogo) o «puzzle» (de contenido), uno de los dos');
        const p = paginaV2(g, page);
        g.puzzles = g.puzzles || [];
        let nuevo, caja;
        if (from) {
          nuevo = puzzleDelCatalogo(g, from, puzzle_id);
          faltanCampos(g, nuevo.needs.map((n) => n.field), `el puzzle «${from}»`);
          caja = PAGINA_ENTERA;
        } else {
          if (puzzle.kind !== 'contenido') throw new E('invalid', 'un puzzle sin «from» es de contenido: kind "contenido"');
          if (puzzle.mechanic) throw new E('invalid', 'un puzzle de contenido no lleva mecánica (las mecánicas vienen del catálogo)');
          nuevo = structuredClone(puzzle);
          const elementos = (nuevo.page && nuevo.page.elements) || [];
          if (!elementos.length) throw new E('invalid', 'el puzzle de contenido necesita page.elements (lo que se dibuja)');
          const caja0 = { id: `${nuevo.id}`, elements: [] };
          nuevo.page.elements = elementos.map((el) => { const x = prepararElemento(g, caja0, el); caja0.elements.push(x); return x; });
          caja = box || PAGINA_ENTERA;
        }
        if (g.puzzles.some((z) => z.id === nuevo.id)) throw new E('exists', `ya hay un puzzle «${nuevo.id}» (usa puzzle_id para otro nombre)`);
        g.puzzles.push(nuevo);
        const bloque = { id: idNuevoDeElemento(p), kind: 'puzzle', puzzle: nuevo.id, ...caja };
        p.elements.push(bloque);
        return { puzzle: nuevo.id, from: nuevo.from ?? null, kind: nuevo.kind, page, element: bloque.id };
      }, { formato: 'v2' }),
    },
    {
      name: 'import_art',
      description: 'Importa una pieza de arte de un artista a una colección de la biblioteca (PDF o SVG vectorial, o PNG a 300 ppp). Pide autor humano y licencia propia-estudio o CC0-1.0; valida la colección y, si no valida, no guarda nada.',
      schema: esquema({ file: { type: 'string', description: 'ruta relativa a la copia local' }, coleccion: S, piece_id: S, categoria: S, nombre: S,
        etiquetas: { type: 'array' }, autor: S, origen: S, licencia: { type: 'string', enum: ['propia-estudio', 'CC0-1.0'] }, zonas: { type: 'array' } },
      ['file', 'coleccion', 'piece_id', 'categoria', 'nombre', 'etiquetas', 'autor', 'origen']),
      run: async ({ file, coleccion, piece_id, categoria, nombre, etiquetas, autor, origen, licencia = 'propia-estudio', zonas }) => {
        const args = [path.join(ROOT, 'tools', 'biblioteca', 'importar-arte.py'), rutaDelRepo(file), path.join(rutaBiblioteca(), 'arte', coleccion),
          '--id', piece_id, '--categoria', categoria, '--nombre', nombre, '--etiquetas', etiquetas.join(', '), '--autor', autor, '--origen', origen, '--licencia', licencia];
        let tmp = null;
        if (zonas) { tmp = path.join(os.tmpdir(), `pme-zonas-${process.pid}-${Date.now()}.json`); fs.writeFileSync(tmp, JSON.stringify(zonas)); args.push('--zonas', tmp); }
        try {
          const r = python(args);
          if (!r.ok) throw new E('invalido', 'la pieza no entra en la biblioteca', r.out.split('\n'));
          const pieza = buscar('arte', piece_id);
          return { ref: `${pieza.id}@${pieza.version}`, coleccion, widthMm: pieza.widthMm, heightMm: pieza.heightMm, zones: pieza.zones };
        } finally { if (tmp) fs.rmSync(tmp, { force: true }); }
      },
    },
    {
      name: 'create_vector_art',
      description: 'Crea una pieza de formas geométricas (rectángulos, líneas, círculos, elipses, polilíneas y polígonos, en mm) para cuadrículas, casillas, flechas o marcos sencillos de un puzzle. No es para ilustraciones: el arte lo hacen los artistas. Va a la colección «formas» (u otra), con el autor humano que la pide.',
      schema: esquema({ piece_id: S, nombre: S, categoria: { type: 'string', enum: ['puzzle', 'decoracion', 'marco', 'papel'] }, etiquetas: { type: 'array' },
        autor: { type: 'string', description: 'la persona del estudio que pide la pieza' }, width_mm: { type: 'number' }, height_mm: { type: 'number' },
        shapes: { type: 'array', description: '[{type: rect|line|circle|ellipse|polyline|polygon, x, y, w, h | x1, y1, x2, y2 | cx, cy, r | rx, ry | points: [[x,y],...], stroke: "#hex", fill: "#hex"|null, width: mm}]' },
        coleccion: S }, ['piece_id', 'nombre', 'categoria', 'etiquetas', 'autor', 'width_mm', 'height_mm', 'shapes']),
      run: async ({ piece_id, nombre, categoria, etiquetas, autor, width_mm, height_mm, shapes, coleccion = 'formas' }) => {
        const svg = svgDeFormas(width_mm, height_mm, shapes, E);
        const tmp = path.join(os.tmpdir(), `pme-formas-${process.pid}-${Date.now()}.svg`);
        fs.writeFileSync(tmp, svg);
        try {
          const r = python([path.join(ROOT, 'tools', 'biblioteca', 'importar-arte.py'), tmp, path.join(rutaBiblioteca(), 'arte', coleccion),
            '--id', piece_id, '--categoria', categoria, '--nombre', nombre, '--etiquetas', etiquetas.join(', '), '--autor', autor,
            '--origen', 'Formas geométricas (create_vector_art)', '--licencia', 'propia-estudio']);
          if (!r.ok) throw new E('invalido', 'la pieza no entra en la biblioteca', r.out.split('\n'));
          const pieza = buscar('arte', piece_id);
          return { ref: `${pieza.id}@${pieza.version}`, coleccion, widthMm: pieza.widthMm, heightMm: pieza.heightMm };
        } finally { fs.rmSync(tmp, { force: true }); }
      },
    },
    {
      name: 'save_to_library',
      description: 'Guarda en la biblioteca una página (de: id de página), una sección del formulario (de: id de sección) o una mecánica del juego como puzzle de datos (de: tipo de mecánica), con su origen. new_id: id en la biblioteca (los puzzles empiezan por «puzzle-»).',
      schema: esquema({ id: ID, tipo: { type: 'string', enum: ['pagina', 'seccion', 'puzzle'] }, de: S, new_id: S, nombre: S, etiquetas: { type: 'array' }, coleccion: S },
        ['id', 'tipo', 'de', 'new_id', 'nombre', 'etiquetas', 'coleccion']),
      run: async ({ id, tipo, de, new_id, nombre, etiquetas, coleccion }) => {
        await cargarCrudo(id);
        const clave = { pagina: 'paginas', seccion: 'secciones', puzzle: 'puzzles' }[tipo];
        const spec = { coleccion, [clave]: [{ de, id: new_id, nombre, etiquetas }] };
        const tmp = path.join(os.tmpdir(), `pme-guardar-${process.pid}-${Date.now()}.json`);
        fs.writeFileSync(tmp, JSON.stringify(spec));
        try {
          const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'biblioteca', 'desde-juego.mjs'), almacen.carpeta(id), tmp],
            { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PME_BIBLIOTECA: rutaBiblioteca() } });
          if (r.status !== 0) throw new E('invalido', 'no se ha guardado en la biblioteca', `${r.stdout}${r.stderr}`.trim().split('\n'));
          const e = buscar(tipo, new_id);
          return { ref: `${e.id}@${e.version}`, tipo, coleccion };
        } finally { fs.rmSync(tmp, { force: true }); }
      },
    },
    {
      name: 'read_notes',
      description: 'Notas del cliente para Claude (pantalla de revisión). Cada nota lleva su id (n1, n2… si no tenía), página, elemento y si está hecha.',
      schema: esquema({ id: ID, pending: { type: 'boolean', description: 'solo las pendientes' } }, ['id']),
      run: async ({ id, pending = false }) => {
        const g = await cargarCrudo(id);
        return (g.notes || []).map((n, i) => ({ id: n.id || `n${i + 1}`, ...n, done: !!n.done }))
          .filter((n) => !pending || !n.done);
      },
    },
    {
      name: 'write_change_summary',
      description: 'Deja un resumen de los cambios hechos (lo lee el cliente en la revisión) y marca como hechas las notas atendidas (ids de read_notes).',
      schema: esquema({ id: ID, text: S, notes_done: { type: 'array' } }, ['id', 'text']),
      run: async ({ id, text, notes_done = [] }) => mutar(id, `Resumen de cambios de ${id}`, (g) => {
        g.notes = (g.notes || []).map((n, i) => ({ ...n, id: n.id || `n${i + 1}` }));
        const ids = new Set(g.notes.map((n) => n.id));
        const desconocidas = notes_done.filter((n) => !ids.has(n));
        if (desconocidas.length) throw new E('not-found', `no hay notas ${desconocidas.join(', ')}`);
        for (const n of g.notes) if (notes_done.includes(n.id)) n.done = true;
        g.changes = g.changes || [];
        const cambio = { date: fecha(), text };
        if (notes_done.length) cambio.notes = notes_done;
        g.changes.push(cambio);
        return { changes: g.changes.length, pendientes: g.notes.filter((n) => !n.done).length };
      }, { formato: 'v2' }),
    },
  ];
}

/** SVG de formas geométricas (en mm). Solo primitivas: nada de trazos libres. */
export function svgDeFormas(ancho, alto, formas, E = Error) {
  if (!(ancho > 0 && alto > 0 && ancho <= 600 && alto <= 600)) throw new E('invalid', 'width_mm y height_mm entre 0 y 600');
  if (!Array.isArray(formas) || !formas.length || formas.length > 500) throw new E('invalid', 'shapes: de 1 a 500 formas');
  const color = (c, porDefecto) => {
    if (c === null) return 'none';
    if (c === undefined) return porDefecto;
    if (!/^#[0-9A-Fa-f]{6}$/.test(c)) throw new E('invalid', `color no válido: «${c}» (usa #RRGGBB)`);
    return c;
  };
  const num = (v, que) => { if (typeof v !== 'number' || !Number.isFinite(v)) throw new E('invalid', `${que} debe ser un número`); return v; };
  const partes = formas.map((f, i) => {
    const estilo = `stroke="${color(f.stroke, '#000000')}" fill="${color(f.fill, 'none')}" stroke-width="${num(f.width ?? 0.5, `shapes[${i}].width`)}"`;
    const q = (k) => num(f[k], `shapes[${i}].${k}`);
    const puntos = () => (f.points || []).map((p, j) => `${num(p[0], `shapes[${i}].points[${j}]`)},${num(p[1], `shapes[${i}].points[${j}]`)}`).join(' ');
    switch (f.type) {
      case 'rect': return `<rect x="${q('x')}" y="${q('y')}" width="${q('w')}" height="${q('h')}" ${estilo}/>`;
      case 'line': return `<line x1="${q('x1')}" y1="${q('y1')}" x2="${q('x2')}" y2="${q('y2')}" ${estilo}/>`;
      case 'circle': return `<circle cx="${q('cx')}" cy="${q('cy')}" r="${q('r')}" ${estilo}/>`;
      case 'ellipse': return `<ellipse cx="${q('cx')}" cy="${q('cy')}" rx="${q('rx')}" ry="${q('ry')}" ${estilo}/>`;
      case 'polyline': return `<polyline points="${puntos()}" ${estilo}/>`;
      case 'polygon': return `<polygon points="${puntos()}" ${estilo}/>`;
      default: throw new E('invalid', `shapes[${i}]: tipo «${f.type}» no admitido (rect, line, circle, ellipse, polyline, polygon)`);
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}mm" height="${alto}mm" viewBox="0 0 ${ancho} ${alto}">\n${partes.join('\n')}\n</svg>\n`;
}
