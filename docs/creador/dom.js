// Ayudas de DOM del creador. Todo se construye con nodos (nunca innerHTML con datos del juego o de la biblioteca).

/** h('div', { class: 'x', onclick, 'aria-label': '…' }, hijo1, 'texto', [más hijos]) → elemento. */
export function h(tag, attrs = {}, ...hijos) {
  const el = document.createElementNS(tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect' || tag === 'line' || tag === 'polyline'
    ? 'http://www.w3.org/2000/svg' : 'http://www.w3.org/1999/xhtml', tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled' || k === 'hidden') { el[k] = !!v; if (v === true) el.setAttribute(k, ''); }
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  anadir(el, hijos);
  return el;
}
function anadir(el, hijos) {
  for (const c of hijos) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) anadir(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Iconos de trazo (24 × 24), decorativos. */
const TRAZOS = {
  atras: 'M15 18l-6-6 6-6',
  mas: 'M12 5v14M5 12h14',
  copiar: 'M9 9h10v10H9zM5 15V5h10',
  claude: 'M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z',
  subir: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  pagina: 'M6 3h9l3 3v15H6zM15 3v3h3',
  deshacer: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  ojo: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  basura: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  arriba: 'M12 19V5M6 11l6-6 6 6',
  abajo: 'M12 5v14M6 13l6 6 6-6',
  llave: 'M15 7a4 4 0 11-3.5 6H8v3H5v-3H3v-3h8.5A4 4 0 0115 7z',
  externo: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  descargar: 'M12 4v12M7 11l5 5 5-5M5 20h14',
};
export function icono(nombre, { color = 'currentColor', tam = 20 } = {}) {
  return h('svg', { width: tam, height: tam, viewBox: '0 0 24 24', fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' },
    h('path', { d: TRAZOS[nombre] || TRAZOS.mas }));
}

/** Texto de un objeto por idioma ({es, en}) en el idioma pedido, o el primero que haya. */
export function enIdioma(obj, lang = 'es') {
  if (!obj) return '';
  if (typeof obj === 'string') return obj;
  return obj[lang] ?? obj.es ?? Object.values(obj)[0] ?? '';
}

/** «hace 3 minutos» a partir de una fecha. */
export function haceCuanto(fecha) {
  if (!fecha) return '';
  const ms = Date.now() - new Date(fecha).getTime();
  if (Number.isNaN(ms)) return String(fecha);
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

export const NOMBRE_IDIOMA = { es: 'español', en: 'inglés', fr: 'francés', de: 'alemán', it: 'italiano', pt: 'portugués', ca: 'catalán' };
export const ESTADOS = { borrador: 'Borrador', enviado: 'Enviado', 'en-produccion': 'En producción', publicado: 'Publicado' };

/** id de juego a partir de un nombre: minúsculas, sin acentos, guiones. */
export function idDeNombre(nombre) {
  return String(nombre).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'juego';
}
