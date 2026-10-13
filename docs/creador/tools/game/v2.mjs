// Formato de juego pme-game/2 (F1.2 de PLAN-CREADOR-2.md): páginas compuestas por elementos.
//
// migrarAV2(juegoV1) → juego v2, sin pérdida.
// aV1(juegoV2)      → juego v1 equivalente: es lo que siguen leyendo el motor, el validador y el formulario
//                     del comprador mientras el motor no dibuje los elementos directamente.
// Garantía (prueba: tools/qa/v2-ida-vuelta.mjs): aV1(migrarAV2(g)) es igual a g. Por eso un juego migrado da
// el mismo PDF, píxel a píxel.
//
// F1.3b: aV1 también traduce lo nuevo de v2 a lo que el motor sabe dibujar:
//   - fondo de página «pdf» de varios ficheros → bgFile/bgPage por página;
//   - fondo «color» → bgColor; fondo «art» → una pieza de arte a página completa;
//   - elementos «art» antes del primer texto/campo/foto → capa baja (layers); después → capa alta (topLayers);
//   - elementos «puzzle» con elementos propios → se aplanan dentro de su caja (la escala del texto sigue el ancho);
//   - puzzles de datos (con mecánica) → una mecánica v1 en esa página (y su solución, si la tienen). Sus parámetros
//     están en % de la página de origen, así que el bloque ocupa la página entera (lo exige el validador).
// Limitación: el orden entre piezas de arte y textos se conserva solo en dos bandas (baja y alta).
//
// Sin importaciones de Node: lo usan también el creador web y la vista previa del navegador.

/** Propiedades de un texto fijo v1 que pasan tal cual a su elemento v2 (estilo y posición). */
const SIN_COPIAR_TEXTO = new Set(['page', 'key', 'es']);

/** Juego v1 → v2. No cambia el juego que recibe. */
export function migrarAV2(g) {
  if (g.schema === 'pme-game/2') return structuredClone(g);
  if (g.schema !== 'pme-game/1') throw new Error(`no sé migrar «${g.schema}»`);
  const fields = g.fields || {};
  const fondoPdf = g.background && g.background.kind === 'pdf';
  const tpl = g.template;
  const pages = tpl.pages.map((p, i) => {
    const elements = [];
    let n = 0;
    const id = () => `${p.id}-e${++n}`;
    for (const capa of p.layers || []) {
      const { asset, ...resto } = capa;
      elements.push({ id: id(), kind: 'art', ref: asset, ...resto });
    }
    for (const t of g.texts || []) {
      if (t.page !== i + 1) continue;
      const estilo = Object.fromEntries(Object.entries(t).filter(([k]) => !SIN_COPIAR_TEXTO.has(k)));
      elements.push({ id: id(), kind: 'text', key: t.key, ...estilo });
    }
    for (const s of p.slots || []) {
      const tipo = fields[s.field] && fields[s.field].type === 'photo' ? 'photo' : 'field';
      elements.push({ id: id(), kind: tipo, ...s });
    }
    const pagina = {
      id: p.id,
      title: p.title,
      // Una página con capas (en blanco en v1) no lleva PDF: así el motor la compone igual que antes.
      background: fondoPdf && p.layers === undefined ? { kind: 'pdf', file: g.background.file, page: i + 1 } : { kind: 'none' },
      elements,
    };
    if (p.background !== undefined) pagina.preview = p.background; // imagen de referencia (extract.py)
    if (p.layers !== undefined && !p.layers.length) pagina.emptyLayers = true;
    return pagina;
  });
  const { template, texts, background, schema, ...resto } = g;
  const v2 = { schema: 'pme-game/2', ...resto, pageSize: tpl.pageSize, pages, puzzles: [] };
  // Lo que solo existe por compatibilidad con los juegos hechos con el PDF del artista.
  v2.compat = {
    template: { id: tpl.id, version: tpl.version, name: tpl.name, fields: tpl.fields },
    backgroundKind: background ? background.kind : null,
    // Orden original de los textos fijos (el motor lo usa al encadenar textos): [página, n.º de texto en ella].
    textOrder: (() => { const vistos = {}; return (texts || []).map((t) => [t.page, (vistos[t.page] = (vistos[t.page] ?? -1) + 1)]); })(),
  };
  return v2;
}

/** Caja absoluta (en % de la página) de un elemento que vive dentro de otra caja (o de la página si no hay). */
function enPagina(e, caja) {
  if (!caja) return { x: e.x, y: e.y, w: e.w, h: e.h };
  return { x: caja.x + (e.x * caja.w) / 100, y: caja.y + (e.y * caja.h) / 100, w: (e.w * caja.w) / 100, h: (e.h * caja.h) / 100 };
}

/** Aplana los elementos (y los de los puzzles que contengan) a elementos de página, con sus cajas absolutas.
 *  Los puzzles de datos encontrados se añaden a «datos» (se convierten en mecánicas de la página). */
function aplanar(elementos, puzzles, caja, visitados, datos) {
  const salida = [];
  for (const e of elementos || []) {
    if (e.kind !== 'puzzle') {
      const { id, kind, ...resto } = e;
      const abs = enPagina(e, caja);
      // Los tamaños de letra son % del ancho de página: se escalan con la caja del puzzle.
      const f = caja ? caja.w / 100 : 1;
      const escalado = {};
      if (f !== 1) {
        for (const k of ['size', 'leading']) if (typeof resto[k] === 'number') escalado[k] = resto[k] * f;
      }
      salida.push({ kind, ...resto, ...abs, ...escalado });
      continue;
    }
    if (visitados.has(e.puzzle)) throw new Error(`puzzle «${e.puzzle}» contenido en sí mismo`);
    const pz = puzzles.get(e.puzzle);
    if (!pz) throw new Error(`no existe el puzzle «${e.puzzle}»`);
    const propios = (pz.page && pz.page.elements) || [];
    if (pz.mechanic) {
      if (caja) throw new Error(`el puzzle de datos «${e.puzzle}» debe ir directamente en una página, no dentro de otro puzzle`);
      datos.push(pz);
      if (!propios.length) continue;
    } else if (!propios.length) {
      throw new Error(`el puzzle «${e.puzzle}» (sin mecánica) aún no tiene elementos que dibujar`);
    }
    const abs = enPagina(e, caja);
    salida.push(...aplanar(propios, puzzles, abs, new Set([...visitados, e.puzzle]), datos));
  }
  return salida;
}

/** Juego v2 → v1 equivalente (lo que leen hoy el motor, el validador y el formulario). */
export function aV1(g) {
  if (g.schema === 'pme-game/1') return structuredClone(g);
  if (g.schema !== 'pme-game/2') throw new Error(`no es un juego pme-game/2: «${g.schema}»`);
  const compat = g.compat || {};
  const tplCompat = compat.template || {};
  const lang0 = (g.languages || [])[0];
  const i18nEs = (g.i18n && (g.i18n.es || g.i18n[lang0])) || {};
  const puzzles = new Map((g.puzzles || []).map((p) => [p.id, p]));
  const pdfs = [...new Set(g.pages.filter((p) => p.background && p.background.kind === 'pdf').map((p) => p.background.file))];
  const kind = compat.backgroundKind || (pdfs.length ? 'pdf' : 'layers');
  const textos = [];
  const mecanicasPuzzles = [];
  const solucionesPuzzles = [];
  const pages = g.pages.map((p, i) => {
    const slots = [];
    const layers = [];
    const topLayers = [];
    let hayContenido = false;
    const datos = [];
    const planos = aplanar(p.elements, puzzles, null, new Set(), datos);
    for (const pz of datos) {
      const m = { type: pz.mechanic, page: p.id, params: structuredClone(pz.params || {}) };
      if ((pz.derives || []).length) m.derives = [...pz.derives];
      mecanicasPuzzles.push(m);
      if (pz.solution) {
        solucionesPuzzles.push({ id: pz.id, page: p.id, dependsOn: (pz.needs || []).map((n) => n.field).filter(Boolean),
          how: structuredClone(pz.solution) });
      }
    }
    for (const e of planos) {
      const { kind, ...resto } = e;
      if (kind === 'art') {
        const { ref, ...pos } = resto;
        (hayContenido ? topLayers : layers).push({ asset: ref, ...pos });
      } else if (kind === 'text') {
        hayContenido = true;
        const { key, ...estilo } = resto;
        textos.push({ page: i + 1, key, es: i18nEs[key], ...estilo });
      } else if (kind === 'field' || kind === 'photo') {
        hayContenido = true;
        slots.push(resto);
      } else {
        throw new Error(`página ${p.id}: el motor actual aún no dibuja elementos «${kind}»`);
      }
    }
    // Fondo de la página. El motor, sin «bgKind», toma una página con capas como hoja en blanco y el
    // resto como PDF; bgKind solo se escribe cuando eso no coincide con el fondo de la página.
    const bg = p.background || { kind: 'none' };
    const pagina = { id: p.id, title: p.title };
    if (p.preview !== undefined) pagina.background = p.preview;
    if (bg.kind === 'art') layers.unshift({ asset: bg.ref, x: 0, y: 0, w: 100, h: 100, angle: 0 });
    const conCapas = layers.length > 0 || !!p.emptyLayers;
    if (bg.kind === 'pdf') {
      const pdfPorDefecto = bg.file === pdfs[0] && bg.page === i + 1;
      if (!pdfPorDefecto) { pagina.bgFile = bg.file; pagina.bgPage = bg.page - 1; }
      if (conCapas) pagina.bgKind = 'pdf';
    } else if (!conCapas || kind === 'pdf') {
      // Hoja sin PDF; en un juego con PDF se dice siempre (con capas, el motor y el validador lo necesitan).
      pagina.bgKind = 'blank';
    }
    if (bg.kind === 'color') pagina.bgColor = bg.value;
    pagina.slots = slots;
    // En un juego sin ningún PDF (fondo «layers» en v1) cada página declara sus capas, aunque no tenga ninguna.
    if (conCapas || kind === 'layers') pagina.layers = layers;
    if (topLayers.length) pagina.topLayers = topLayers;
    return pagina;
  });
  // El orden de los textos fijos importa al motor (flujo de textos): se respeta el original si existe.
  let textosV1 = textos;
  if (compat.textOrder && compat.textOrder.length === textos.length) {
    const porPagina = {};
    for (const t of textos) (porPagina[t.page] = porPagina[t.page] || []).push(t);
    textosV1 = compat.textOrder.map(([pg, k]) => porPagina[pg] && porPagina[pg][k]);
    if (textosV1.some((t) => !t)) textosV1 = textos; // la lista cambió: orden por página
  }
  const { schema, pages: _p, pageSize, puzzles: _z, compat: _c, ...resto } = g;
  const background = kind === 'pdf' ? { kind: 'pdf', file: pdfs[0] } : { kind };
  const v1 = {
    schema: 'pme-game/1',
    id: resto.id, version: resto.version, status: resto.status, name: resto.name, languages: resto.languages,
    background,
    template: { id: tplCompat.id ?? g.id, version: tplCompat.version ?? 1, name: tplCompat.name ?? g.id,
      pageSize: pageSize || 'A4', fields: tplCompat.fields ?? [], pages },
    texts: textosV1,
  };
  for (const [k, v] of Object.entries(resto)) if (!(k in v1)) v1[k] = v;
  // Solo se tocan mecánicas y soluciones si hay puzzles de datos: así un juego migrado vuelve idéntico.
  if (mecanicasPuzzles.length) v1.mechanics = [...(v1.mechanics || []), ...mecanicasPuzzles];
  if (solucionesPuzzles.length) v1.solutions = [...(v1.solutions || []), ...solucionesPuzzles];
  return v1;
}
