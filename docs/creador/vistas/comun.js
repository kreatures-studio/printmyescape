// Piezas comunes de las vistas del creador.

import { h, NOMBRE_IDIOMA } from '../dom.js';

/**
 * Un texto en todos los idiomas del juego ({ es, en }). Solo se guarda cuando está completo: si un idioma se queda
 * vacío, avisa al lado y espera (el validador rechazaría un texto a medias). Si no es obligatorio, vaciarlo en todos
 * los idiomas lo quita (alGuardar(null)).
 */
export function grupoIdiomas(app, { id, rotulo, valor, obligatorio = false, multilinea = false, filas = 2, ayuda = null, alGuardar, soloLectura = app.soloLectura, placeholder = null }) {
  const langs = app.juego.languages;
  const nota = h('span', { class: 'ayuda', role: 'status' });
  const entradas = langs.map((l) => {
    const attrs = { id: `${id}-${l}`, disabled: soloLectura, 'data-lang': l, placeholder, onchange: () => enviar() };
    return multilinea ? h('textarea', { ...attrs, rows: filas }, (valor && valor[l]) || '') : h('input', { ...attrs, value: (valor && valor[l]) || '', autocomplete: 'off' });
  });
  function enviar() {
    const nuevo = Object.fromEntries(langs.map((l, i) => [l, entradas[i].value.trim()]));
    const vacios = langs.filter((l) => !nuevo[l]);
    if (vacios.length === langs.length && !obligatorio) { nota.textContent = ''; if (valor) alGuardar(null); return; }
    if (vacios.length) {
      nota.textContent = `Falta en ${vacios.map((l) => NOMBRE_IDIOMA[l] || l).join(' y ')}: se guarda cuando esté en todos los idiomas.`;
      nota.style.color = 'var(--aviso)';
      return;
    }
    nota.textContent = '';
    if (JSON.stringify(nuevo) !== JSON.stringify(Object.fromEntries(langs.map((l) => [l, (valor && valor[l]) || ''])))) alGuardar(nuevo);
  }
  const unaSola = langs.length === 1;
  return h('div', { class: 'campo' },
    unaSola ? h('label', { for: `${id}-${langs[0]}` }, rotulo) : h('span', { class: 'rotulo' }, rotulo),
    langs.map((l, i) => unaSola ? entradas[i] : h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
      h('label', { for: `${id}-${l}`, class: 'tenue', style: { fontSize: '13px' } }, NOMBRE_IDIOMA[l] ? NOMBRE_IDIOMA[l][0].toUpperCase() + NOMBRE_IDIOMA[l].slice(1) : l), entradas[i])),
    ayuda ? h('span', { class: 'ayuda' }, ayuda) : null,
    nota);
}

/** Los ejemplos del juego con su nombre: el primero es el corto, el segundo el normal y el tercero el largo. */
export function nombresDeEjemplos(juego) {
  return (juego.examples || []).map((e, i) => ({ id: e.id, nombre: ['Corto', 'Normal', 'Largo'][i] || `Ejemplo ${e.id}` }));
}

/** Botones de idioma y de ejemplo (para vistas previas). */
export function selectoresVista(app, ui, { vacio = true } = {}) {
  const g = app.juego;
  const ejemplos = nombresDeEjemplos(g);
  return [
    g.languages.length > 1 ? h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Idioma' },
      g.languages.map((l) => h('button', { type: 'button', 'aria-pressed': ui.lang === l ? 'true' : 'false', onclick: () => { ui.lang = l; app.repintar(); } }, l.toUpperCase()))) : null,
    ejemplos.length ? h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Ejemplo' },
      ejemplos.map((e) => h('button', { type: 'button', 'aria-pressed': ui.ejemplo === e.id ? 'true' : 'false', onclick: () => { ui.ejemplo = e.id; app.repintar(); } }, e.nombre)),
      vacio ? h('button', { type: 'button', 'aria-pressed': ui.ejemplo === null ? 'true' : 'false', onclick: () => { ui.ejemplo = null; app.repintar(); } }, 'Vacío') : null) : null,
  ];
}

/** Páginas (número y título) donde sale un campo: huecos, fotos y puzzles que lo leen. */
export function dondeSale(juego, campo) {
  const usaPuzzle = new Set((juego.puzzles || []).filter((z) => (z.needs || []).some((n) => n.field === campo)).map((z) => z.id));
  const paginas = [];
  juego.pages.forEach((p, i) => {
    const usa = p.elements.some((e) => ((e.kind === 'field' || e.kind === 'photo') && e.field === campo) || (e.kind === 'puzzle' && usaPuzzle.has(e.puzzle)));
    if (usa) paginas.push({ id: p.id, numero: i + 1, titulo: p.title || '' });
  });
  // Puzzles de contenido con huecos dentro.
  for (const z of juego.puzzles || []) {
    if (!(z.page && z.page.elements && z.page.elements.some((e) => e.field === campo))) continue;
    juego.pages.forEach((p, i) => {
      if (p.elements.some((e) => e.kind === 'puzzle' && e.puzzle === z.id) && !paginas.some((x) => x.id === p.id)) paginas.push({ id: p.id, numero: i + 1, titulo: p.title || '' });
    });
  }
  return paginas.sort((a, b) => a.numero - b.numero);
}

export const listaY = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
