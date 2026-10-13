// Sugerencias de Claude (game.suggestions): una pregunta, una página o un elemento que Claude añadió por su cuenta,
// con el porqué (write_change_summary con suggestions). El cliente la acepta (se queda y desaparece el aviso) o la
// descarta (se quita lo sugerido). Las que apuntan a algo que ya no existe no se enseñan (el validador las avisa).

import { h } from '../dom.js';

/** Sugerencias vigentes del juego que cumplen el filtro ({ field } | { page } | { page, element } | nada = todas). */
export function sugerenciasDe(g, filtro = {}) {
  return (g.suggestions || []).filter((s) => {
    if (!vigente(g, s)) return false;
    if (filtro.field !== undefined) return s.field === filtro.field;
    if (filtro.element !== undefined) return s.page === filtro.page && s.element === filtro.element;
    if (filtro.page !== undefined) return !s.field && !s.element && s.page === filtro.page;
    return true;
  });
}

function vigente(g, s) {
  if (s.field) return !!(g.fields || {})[s.field];
  const p = (g.pages || []).find((x) => x.id === s.page);
  if (!p) return false;
  return !s.element || p.elements.some((e) => e.id === s.element);
}

/** Qué es lo sugerido, en palabras. */
export function queEs(g, s) {
  if (s.field) return `la pregunta ${s.field}`;
  const i = g.pages.findIndex((p) => p.id === s.page);
  return s.element ? `un elemento de la página ${i + 1}` : `la página ${i + 1}`;
}

/** Quita una pregunta de todo el juego: definición, secciones, ejemplos, sus huecos en las páginas y sus sugerencias. */
export function quitarPregunta(g, c) {
  const usaPuzzle = (g.puzzles || []).find((z) => (z.needs || []).some((n) => n.field === c));
  if (usaPuzzle) throw new Error(`la usa el puzzle «${usaPuzzle.name || usaPuzzle.id}»: quítalo antes`);
  const padre = Object.entries(g.fields).find(([, d]) => d.otherField === c);
  if (padre) throw new Error(`es la respuesta «Otro» de ${padre[0]}: desmarca «Otro» allí`);
  const otro = g.fields[c] && g.fields[c].otherField;
  delete g.fields[c];
  for (const s of g.form.sections) {
    s.fields = s.fields.filter((x) => x !== c);
    if (s.nameField === c) delete s.nameField;
    if (s.photoField === c) delete s.photoField;
  }
  for (const ej of g.examples || []) {
    for (const l of Object.keys(ej.values || {})) delete ej.values[l][c];
    if (ej.photos) delete ej.photos[c];
  }
  const fuera = (els) => els.filter((e) => e.field !== c);
  for (const p of g.pages) p.elements = fuera(p.elements);
  for (const z of g.puzzles || []) if (z.page && z.page.elements) z.page.elements = fuera(z.page.elements);
  if (g.suggestions) g.suggestions = g.suggestions.filter((s) => s.field !== c);
  if (otro && g.fields[otro]) quitarPregunta(g, otro);
}

function sinSugerencia(g, id) {
  g.suggestions = (g.suggestions || []).filter((x) => x.id !== id);
  if (!g.suggestions.length) delete g.suggestions;
}

export function aceptar(app, s) {
  return app.cambiar(`Aceptar la sugerencia de Claude (${queEs(app.juego, s)})`, (g) => { sinSugerencia(g, s.id); });
}

export function descartar(app, s) {
  return app.cambiar(`Descartar la sugerencia de Claude (${queEs(app.juego, s)})`, (g) => {
    if (s.field) {
      quitarPregunta(g, s.field);
    } else if (s.element) {
      const p = g.pages.find((x) => x.id === s.page);
      const el = p.elements.find((e) => e.id === s.element);
      if (el.kind === 'puzzle') app.ops.quitarPuzzle(g, { puzzle: el.puzzle });
      else app.ops.quitarElemento(g, { page: s.page, element: s.element });
    } else {
      const i = g.pages.findIndex((x) => x.id === s.page);
      const [p] = g.pages.splice(i, 1);
      // Los puzzles que solo estaban en esa página se van con ella.
      for (const e of p.elements.filter((x) => x.kind === 'puzzle')) {
        const enOtra = g.pages.some((q) => q.elements.some((x) => x.kind === 'puzzle' && x.puzzle === e.puzzle));
        if (!enOtra) g.puzzles = (g.puzzles || []).filter((z) => z.id !== e.puzzle);
      }
      if (g.suggestions) g.suggestions = g.suggestions.filter((x) => x.page !== s.page || x.field);
    }
    sinSugerencia(g, s.id);
  });
}

/** Caja «Sugerido por Claude» con su porqué y los botones. */
export function cajaSugerencia(app, s, { compacta = false } = {}) {
  return h('div', { class: 'info claude sugerencia', 'data-sugerencia': s.id },
    h('strong', {}, 'Sugerido por Claude'),
    h('span', { style: { fontSize: '13px' } }, `«${s.text}»`),
    compacta ? h('span', { class: 'tenue', style: { fontSize: '12px' } }, queEs(app.juego, s)) : null,
    app.soloLectura ? null : h('div', { class: 'filtros', style: { marginTop: '4px' } },
      h('button', { class: 'boton pequeno claude', type: 'button', onclick: (e) => { e.stopPropagation(); aceptar(app, s); } }, 'Aceptar'),
      h('button', { class: 'boton pequeno', type: 'button', onclick: (e) => { e.stopPropagation(); descartar(app, s); } }, 'Descartar')));
}
