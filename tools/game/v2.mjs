// Formato de juego pme-game/2 (F1.2 de PLAN-CREADOR-2.md): páginas compuestas por elementos.
//
// migrarAV2(juegoV1) → juego v2, sin pérdida.
// aV1(juegoV2)      → juego v1 equivalente: es lo que siguen leyendo el motor, el validador y el formulario
//                     del comprador mientras F1.3 no dibuje los elementos directamente.
// Garantía (prueba: tools/qa/v2-ida-vuelta.mjs): aV1(migrarAV2(g)) es igual a g. Por eso un juego migrado da
// el mismo PDF, píxel a píxel.
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
      background: fondoPdf ? { kind: 'pdf', file: g.background.file, page: i + 1 } : { kind: 'none' },
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

/** Juego v2 → v1 equivalente (lo que leen hoy el motor, el validador y el formulario). */
export function aV1(g) {
  if (g.schema === 'pme-game/1') return structuredClone(g);
  if (g.schema !== 'pme-game/2') throw new Error(`no es un juego pme-game/2: «${g.schema}»`);
  const compat = g.compat || {};
  const tplCompat = compat.template || {};
  const lang0 = (g.languages || [])[0];
  const i18nEs = (g.i18n && (g.i18n.es || g.i18n[lang0])) || {};
  const pdfs = new Set(g.pages.filter((p) => p.background && p.background.kind === 'pdf').map((p) => p.background.file));
  if (pdfs.size > 1) throw new Error('el motor actual solo admite un PDF de fondo por juego');
  const textos = [];
  const pages = g.pages.map((p, i) => {
    const slots = [];
    const layers = [];
    for (const e of p.elements || []) {
      const { id, kind, ...resto } = e;
      if (kind === 'art') {
        const { ref, ...pos } = resto;
        layers.push({ asset: ref, ...pos });
      } else if (kind === 'text') {
        const { key, ...estilo } = resto;
        textos.push({ page: i + 1, key, es: i18nEs[key], ...estilo });
      } else if (kind === 'field' || kind === 'photo') {
        slots.push(resto);
      } else {
        throw new Error(`página ${p.id}: el motor actual aún no dibuja elementos «${kind}»`);
      }
    }
    const pagina = { id: p.id, title: p.title };
    if (p.preview !== undefined) pagina.background = p.preview;
    pagina.slots = slots;
    if (layers.length || p.emptyLayers) pagina.layers = layers;
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
  const { schema, pages: _p, pageSize, puzzles, compat: _c, ...resto } = g;
  const kind = compat.backgroundKind || (pdfs.size ? 'pdf' : 'layers');
  const background = kind === 'pdf' ? { kind: 'pdf', file: [...pdfs][0] } : { kind };
  const v1 = {
    schema: 'pme-game/1',
    id: resto.id, version: resto.version, status: resto.status, name: resto.name, languages: resto.languages,
    background,
    template: { id: tplCompat.id ?? g.id, version: tplCompat.version ?? 1, name: tplCompat.name ?? g.id,
      pageSize: pageSize || 'A4', fields: tplCompat.fields ?? [], pages },
    texts: textosV1,
  };
  for (const [k, v] of Object.entries(resto)) if (!(k in v1)) v1[k] = v;
  return v1;
}
