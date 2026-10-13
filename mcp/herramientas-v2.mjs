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
import { entradas, buscar, rutaBiblioteca, TIPOS } from '../tools/biblioteca/indice.mjs';
import { crearOperaciones, claveDeTexto } from '../tools/game/operaciones.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export { claveDeTexto };

const fecha = () => new Date().toISOString().slice(0, 10);

export function herramientasV2(ctx) {
  const { almacen, mutar, cargarCrudo, validar, ErrorHerramienta: E, esquema, ID, PAGINA, raiz } = ctx;
  const S = { type: 'string' };
  // La lógica de edición es la misma que la del creador web (tools/game/operaciones.mjs); aquí, la biblioteca en disco.
  const ops = crearOperaciones({ buscar, entradas });

  /** Copia a la carpeta del juego lo que pide una operación (fondos, fotos) si no está; devuelve los creados. */
  function hacerCopias(id, copias, creados) {
    for (const c of copias) {
      const destino = path.join(almacen.carpeta(id), c.destino);
      if (fs.existsSync(destino)) continue;
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.copyFileSync(path.join(rutaBiblioteca(), TIPOS[c.tipo], c.coleccion, c.rel), destino);
      creados.push(destino);
    }
  }
  /** mutar() con una operación que copia ficheros: los borra si el cambio no se guarda. */
  async function mutarConFicheros(id, mensaje, operar) {
    const creados = [];
    try {
      return await mutar(id, mensaje, (g) => { const { resultado, copias } = operar(g); hacerCopias(id, copias, creados); return resultado; }, { formato: 'v2' });
    } catch (e) {
      for (const f of creados) fs.rmSync(f, { force: true });
      throw e;
    }
  }
  function copiarAlJuego(id, origen, rel) {
    const destino = path.join(almacen.carpeta(id), rel);
    if (fs.existsSync(destino)) return null;
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origen, destino);
    return destino;
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
      run: async ({ id, from, title, background, position, puzzles = [] }) => mutarConFicheros(id, `Página nueva en ${id}`,
        (g) => ops.insertarPagina(g, { from, title, background, position, puzzles })),
    },
    {
      name: 'insert_section',
      description: 'Copia una sección del formulario de la biblioteca (from: «seccion-id@versión»): sus campos con sus definiciones y los valores de sus ejemplos (se juntan con los ejemplos del juego del mismo id). position: orden en el formulario (1 = primera); por defecto, al final.',
      schema: esquema({ id: ID, from: S, position: { type: 'integer' } }, ['id', 'from']),
      run: async ({ id, from, position }) => mutarConFicheros(id, `Sección ${from} en ${id}`, (g) => ops.insertarSeccion(g, { from, position })),
    },
    {
      name: 'add_element',
      description: 'Añade un elemento a una página (kind art|text|field|photo|puzzle; x, y, w, h en % de la página). Texto: «texts» {idioma: texto} (crea la clave de i18n). Arte: «ref» de la biblioteca; con solo w (o h) se completa con la proporción de la pieza. index: posición en el orden de dibujo (0 = debajo de todo); por defecto, encima.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'object' }, index: { type: 'integer' } }, ['id', 'page', 'element']),
      run: async ({ id, page, element, index }) => mutar(id, `Elemento en ${page} de ${id}`, (g) => ops.anadirElemento(g, { page, element, index }), { formato: 'v2' }),
    },
    {
      name: 'update_element',
      description: 'Cambia propiedades de un elemento (changes: {x, y, size, color, fontFamily, ...}; texts para cambiar el texto en cada idioma; ref para otra pieza). No cambia su kind.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'string', description: 'id del elemento' }, changes: { type: 'object' } }, ['id', 'page', 'element', 'changes']),
      run: async ({ id, page, element, changes }) => mutar(id, `Cambiar ${element} en ${page}`, (g) => ops.actualizarElemento(g, { page, element, changes }), { formato: 'v2' }),
    },
    {
      name: 'remove_element',
      description: 'Quita un elemento de una página.',
      schema: esquema({ id: ID, page: PAGINA, element: { type: 'string', description: 'id del elemento' } }, ['id', 'page', 'element']),
      run: async ({ id, page, element }) => mutar(id, `Quitar ${element} de ${page}`, (g) => ops.quitarElemento(g, { page, element }), { formato: 'v2' }),
    },
    {
      name: 'add_puzzle',
      description: 'Añade un puzzle y lo coloca en una página. Del catálogo (from: «puzzle-x@versión», de datos: ocupa la página entera y necesita sus campos) o de contenido (puzzle: {id, name, kind: "contenido", solution {idioma: texto}, hints?, difficulty?, minAge?, minutes?, page: {elements}} con elementos en % de su caja; los textos con «texts»). box: caja del puzzle de contenido en % de la página (por defecto, la página entera).',
      schema: esquema({ id: ID, page: PAGINA, from: S, puzzle: { type: 'object' }, box: { type: 'object' }, puzzle_id: S }, ['id', 'page']),
      run: async ({ id, page, from, puzzle, box, puzzle_id }) => mutar(id, `Puzzle en ${page} de ${id}`, (g) => ops.anadirPuzzle(g, { page, from, puzzle, box, puzzle_id }), { formato: 'v2' }),
    },
    {
      name: 'update_puzzle',
      description: 'Cambia un puzzle del juego: ficha (name, difficulty, minAge, minutes), solution {idioma: texto}, hints [{idioma: texto}] y, en los de contenido, page.elements. Los de datos no cambian su mecánica ni sus parámetros (vienen del catálogo).',
      schema: esquema({ id: ID, puzzle: { type: 'string', description: 'id del puzzle en el juego' }, changes: { type: 'object' } }, ['id', 'puzzle', 'changes']),
      run: async ({ id, puzzle, changes }) => mutar(id, `Cambiar puzzle ${puzzle}`, (g) => ops.actualizarPuzzle(g, { puzzle, changes }), { formato: 'v2' }),
    },
    {
      name: 'remove_puzzle',
      description: 'Quita un puzzle del juego y sus bloques en las páginas. Se niega si alguna página usa campos que solo calcula ese puzzle.',
      schema: esquema({ id: ID, puzzle: { type: 'string', description: 'id del puzzle en el juego' } }, ['id', 'puzzle']),
      run: async ({ id, puzzle }) => mutar(id, `Quitar puzzle ${puzzle}`, (g) => ops.quitarPuzzle(g, { puzzle }), { formato: 'v2' }),
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
