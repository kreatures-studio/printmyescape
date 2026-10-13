// Operaciones de edición de un juego pme-game/2 (F4): la misma lógica para el servidor MCP (mcp/herramientas-v2.mjs)
// y el creador web (creator/). Sin importaciones de Node: la biblioteca llega como una interfaz y los ficheros que hay
// que copiar (fondos de página, fotos de ejemplo) se devuelven en «copias» para que cada lado los copie a su manera
// (en disco o por la API de GitHub).
//
//   const ops = crearOperaciones({ buscar(tipo, ref), entradas(tipo) });
//   const { resultado, copias } = ops.insertarPagina(juego, { from, title, background, position, puzzles });
//   copias: [{ tipo, coleccion, rel, destino }]: el fichero «rel» de la colección «coleccion» de la biblioteca (tipo
//   pagina o seccion) va a «destino», relativo a la carpeta del juego. Si ya existe, no se copia.
//
// Cada operación cambia el juego que recibe (el que llama trabaja sobre una copia y valida antes de guardar).
// Los errores son ErrorOperacion con code ('not-found', 'invalid', 'exists', 'faltan-campos'), message y detalles.

const TIPOS_ELEMENTO = ['art', 'text', 'field', 'photo', 'puzzle'];
const PAGINA_A4_MM = { w: 210, h: 297 };
export const PAGINA_ENTERA = { x: 0, y: 0, w: 100, h: 100 };

export class ErrorOperacion extends Error {
  constructor(code, message, detalles = null) {
    super(message);
    this.code = code;
    this.detalles = detalles;
  }
}
const E = ErrorOperacion;

/** Clave de i18n a partir de un texto: minúsculas, sin acentos, guiones; como las de los juegos migrados. */
export function claveDeTexto(texto) {
  return String(texto).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'texto';
}

const nombreDeFichero = (ruta) => String(ruta).split('/').pop();

export function crearOperaciones(biblio) {
  const buscar = (tipo, ref) => biblio.buscar(tipo, ref);
  const entradas = (tipo) => biblio.entradas(tipo);

  const paginaV2 = (g, id) => {
    const p = g.pages.find((x) => x.id === id);
    if (!p) throw new E('not-found', `no hay página «${id}» (hay: ${g.pages.map((x) => x.id).join(', ') || 'ninguna'})`);
    return p;
  };
  const idNuevoDePagina = (g) => `p${Math.max(0, ...g.pages.map((p) => Number(p.id.slice(1)) || 0)) + 1}`;
  /** Id libre para un elemento nuevo; «reservados»: ids que van a llegar en la misma petición. */
  const idNuevoDeElemento = (pagina, reservados = new Set()) => {
    let n = pagina.elements.length + 1;
    while (pagina.elements.some((e) => e.id === `${pagina.id}-e${n}`) || reservados.has(`${pagina.id}-e${n}`)) n++;
    return `${pagina.id}-e${n}`;
  };
  /** Campos que calcula el juego (mecánicas y puzzles de datos): no hace falta pedirlos. */
  const derivados = (g) => new Set([...(g.mechanics || []).flatMap((m) => m.derives || []), ...(g.puzzles || []).flatMap((z) => z.derives || [])]);
  function faltanCampos(g, campos, que) {
    const calc = derivados(g);
    const faltan = [...new Set(campos)].filter((c) => !(g.fields || {})[c] && !calc.has(c));
    if (!faltan.length) return;
    const secciones = entradas('seccion').filter((s) => faltan.some((c) => s.section.fields.includes(c))).map((s) => `${s.id}@${s.version}`);
    const puzzles = entradas('puzzle').filter((z) => faltan.some((c) => (z.derives || []).includes(c))).map((z) => `${z.id}@${z.version}`);
    throw new E('faltan-campos', `${que} usa campos que el juego no tiene: ${faltan.join(', ')}. Créalos con upsert_field`
      + (secciones.length ? `, copia una sección de la biblioteca que los trae (${secciones.join(', ')})` : '')
      + (puzzles.length ? `, o añade antes el puzzle que los calcula (${puzzles.join(', ')})` : ''), faltan);
  }
  /** Guarda los textos {idioma: texto} en i18n y devuelve la clave (sin pisar otra distinta). */
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
    if (!pieza) throw new E('not-found', `no hay pieza de arte «${el.ref}» en la biblioteca`);
    if (pieza.status === 'reexportar') throw new E('invalid', `la pieza «${el.ref}» está pendiente de reexportar: no se usa en juegos`);
    el.ref = `${pieza.id}@${pieza.version}`;
    const aspecto = (pieza.heightMm / PAGINA_A4_MM.h) / (pieza.widthMm / PAGINA_A4_MM.w); // h% / w% en A4
    if (typeof el.w === 'number' && typeof el.h !== 'number') el.h = Math.round(el.w * aspecto * 100) / 100;
    if (typeof el.h === 'number' && typeof el.w !== 'number') el.w = Math.round((el.h / aspecto) * 100) / 100;
    if (el.angle === undefined) el.angle = 0;
  }
  /** Prepara un elemento nuevo: id, textos (texts → i18n), arte, campo existente. */
  function prepararElemento(g, pagina, el) {
    if (!TIPOS_ELEMENTO.includes(el.kind)) throw new E('invalid', `kind debe ser ${TIPOS_ELEMENTO.join(' | ')}`);
    const nuevo = structuredClone(el);
    if (!nuevo.id) nuevo.id = idNuevoDeElemento(pagina);
    if (pagina.elements.some((e) => e.id === nuevo.id)) throw new E('exists', `ya hay un elemento «${nuevo.id}» en ${pagina.id}`);
    if (nuevo.kind === 'text' && nuevo.texts) { nuevo.key = guardarTextos(g, nuevo.texts, nuevo.key); delete nuevo.texts; }
    if (nuevo.kind === 'text' && !nuevo.key) throw new E('invalid', 'un texto necesita «texts» ({idioma: texto}) o «key» de i18n');
    if (nuevo.kind === 'art') prepararArte(g, nuevo);
    if (nuevo.kind === 'field' || nuevo.kind === 'photo') faltanCampos(g, [nuevo.field], `el elemento ${nuevo.id}`);
    return nuevo;
  }
  /** Elementos de un puzzle de contenido (ids libres aunque algunos vengan dados). */
  function elementosDePuzzle(g, idPuzzle, elementos) {
    const caja0 = { id: idPuzzle, elements: [] };
    const reservados = new Set(elementos.map((el) => el.id).filter(Boolean));
    return elementos.map((el) => {
      const x = prepararElemento(g, caja0, el.id ? el : { ...el, id: idNuevoDeElemento(caja0, reservados) });
      caja0.elements.push(x);
      return x;
    });
  }
  /** Copia de un puzzle del catálogo para el juego (con «from»), sin colocarlo. */
  function puzzleDelCatalogo(g, ref, idJuego) {
    const e = buscar('puzzle', ref);
    if (!e) throw new E('not-found', `no hay puzzle «${ref}» en el catálogo`);
    const { id: idBib, version, tags, origin, status, notes, coleccion, dir, ...resto } = structuredClone(e);
    const nuevo = { id: idJuego || idBib.replace(/^puzzle-/, ''), from: `${idBib}@${version}`, ...resto };
    if ((g.puzzles || []).some((z) => z.id === nuevo.id)) throw new E('exists', `ya hay un puzzle «${nuevo.id}» (usa puzzle_id para otro nombre)`);
    return nuevo;
  }

  return {
    paginaV2, faltanCampos, guardarTextos, prepararArte, prepararElemento,

    insertarPagina(g, { from, title, background, position, puzzles = [] } = {}) {
      const copias = [];
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
        if (!e) throw new E('not-found', `no hay página «${from}» en la biblioteca`);
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
          const destino = `fondos/${e.id}-v${e.version}.pdf`;
          copias.push({ tipo: 'pagina', coleccion: e.coleccion, rel: bg.file, destino });
          nueva.background = { kind: 'pdf', file: destino, page: bg.page };
        } else {
          nueva.background = structuredClone(bg);
        }
      }
      if (nueva.background.kind === 'art') prepararArte(g, nueva.background);
      const i = position ? Math.max(0, Math.min(g.pages.length, position - 1)) : g.pages.length;
      g.pages.splice(i, 0, nueva);
      return {
        resultado: { page: nueva.id, title: nueva.title, from: nueva.from ?? null, elements: nueva.elements.length, position: i + 1,
          puzzles: nueva.elements.filter((x) => x.kind === 'puzzle').map((x) => x.puzzle) },
        copias,
      };
    },

    insertarSeccion(g, { from, position } = {}) {
      const copias = [];
      const e = buscar('seccion', from);
      if (!e) throw new E('not-found', `no hay sección «${from}» en la biblioteca`);
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
          const destinoRel = `fotos/${nombreDeFichero(rel)}`;
          copias.push({ tipo: 'seccion', coleccion: e.coleccion, rel, destino: destinoRel });
          destino.photos = { ...(destino.photos || {}), [campo]: destinoRel };
        }
      }
      return { resultado: { section: seccion.id, from: seccion.from, fields: seccion.fields, examples: e.examples.map((x) => x.id), position: i + 1 }, copias };
    },

    anadirElemento(g, { page, element, index }) {
      const p = paginaV2(g, page);
      const nuevo = prepararElemento(g, p, element);
      const i = index === undefined || index === null ? p.elements.length : Math.max(0, Math.min(p.elements.length, index));
      p.elements.splice(i, 0, nuevo);
      return nuevo;
    },

    actualizarElemento(g, { page, element, changes }) {
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
    },

    quitarElemento(g, { page, element }) {
      const p = paginaV2(g, page);
      const antes = p.elements.length;
      p.elements = p.elements.filter((e) => e.id !== element);
      if (p.elements.length === antes) throw new E('not-found', `no hay elemento «${element}» en ${page}`);
      return { removed: element };
    },

    /** Mueve un elemento en el orden de dibujo (0 = debajo de todo). */
    moverElemento(g, { page, element, index }) {
      const p = paginaV2(g, page);
      const i = p.elements.findIndex((e) => e.id === element);
      if (i < 0) throw new E('not-found', `no hay elemento «${element}» en ${page}`);
      const [el] = p.elements.splice(i, 1);
      p.elements.splice(Math.max(0, Math.min(p.elements.length, index)), 0, el);
      return { element, index: p.elements.indexOf(el) };
    },

    anadirPuzzle(g, { page, from, puzzle, box, puzzle_id }) {
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
        nuevo.page.elements = elementosDePuzzle(g, nuevo.id, elementos);
        caja = box || PAGINA_ENTERA;
      }
      if (g.puzzles.some((z) => z.id === nuevo.id)) throw new E('exists', `ya hay un puzzle «${nuevo.id}» (usa puzzle_id para otro nombre)`);
      g.puzzles.push(nuevo);
      const bloque = { id: idNuevoDeElemento(p), kind: 'puzzle', puzzle: nuevo.id, ...caja };
      p.elements.push(bloque);
      return { puzzle: nuevo.id, from: nuevo.from ?? null, kind: nuevo.kind, page, element: bloque.id };
    },

    actualizarPuzzle(g, { puzzle, changes }) {
      const z = (g.puzzles || []).find((x) => x.id === puzzle);
      if (!z) throw new E('not-found', `no hay puzzle «${puzzle}» (hay: ${(g.puzzles || []).map((x) => x.id).join(', ') || 'ninguno'})`);
      const permitidos = ['name', 'difficulty', 'minAge', 'minutes', 'solution', 'hints', 'examples', ...(z.kind === 'contenido' ? ['page'] : [])];
      const otros = Object.keys(changes).filter((k) => !permitidos.includes(k));
      if (otros.length) throw new E('invalid', `no se cambia ${otros.join(', ')} (se puede: ${permitidos.join(', ')})`);
      for (const [k, v] of Object.entries(changes)) {
        if (v === null) { delete z[k]; continue; }
        if (k === 'page') z.page = { elements: elementosDePuzzle(g, z.id, v.elements || []) };
        else z[k] = structuredClone(v);
      }
      return z;
    },

    quitarPuzzle(g, { puzzle }) {
      const antes = (g.puzzles || []).length;
      g.puzzles = (g.puzzles || []).filter((x) => x.id !== puzzle);
      if (g.puzzles.length === antes) throw new E('not-found', `no hay puzzle «${puzzle}»`);
      let bloques = 0;
      const quitar = (els) => els.filter((e) => { const fuera = e.kind === 'puzzle' && e.puzzle === puzzle; if (fuera) bloques++; return !fuera; });
      for (const p of g.pages) p.elements = quitar(p.elements);
      for (const z of g.puzzles) if (z.page && z.page.elements) z.page.elements = quitar(z.page.elements);
      return { removed: puzzle, bloques };
    },
  };
}
