// Paletas para el cambio de tema (game.theme): las de partida del creador, la paleta de un juego (a partir de los
// colores que se ven en sus páginas) y el reparto de una paleta nueva sobre la del juego. Sin dependencias: lo usan el
// creador y las pruebas en Node. El recoloreado lo hace el motor (tools/pme-compose-core.js, crearTema).

/** Paletas de partida: de oscuro a claro no importa (se ordenan por luminosidad al repartirlas). */
export const PALETAS = [
  { id: 'fiesta', nombre: 'Fiesta', colores: ['#2B2D6E', '#C2185B', '#E4407B', '#F7B32B', '#2EC4B6', '#FDE8D0', '#FFF4E6'] },
  { id: 'halloween', nombre: 'Halloween', colores: ['#1B1028', '#3D1E4F', '#6B2D84', '#E86F1C', '#9AB33C', '#F6A541', '#F3E3C3'] },
  { id: 'navidad', nombre: 'Navidad', colores: ['#0F3B2E', '#1F6B45', '#8E1B22', '#B3202A', '#D9A441', '#EADBC0', '#F7F0E2'] },
  { id: 'oceano', nombre: 'Océano', colores: ['#0B2545', '#13315C', '#1B6F8A', '#3FA7C6', '#8FD3E0', '#E9D2A4', '#F6EEDC'] },
  { id: 'pastel', nombre: 'Pastel', colores: ['#4A3F78', '#7C6BB8', '#9D8CD6', '#F4A7B9', '#A8E0D1', '#FBD9B0', '#FFF6F0'] },
  { id: 'selva', nombre: 'Selva', colores: ['#1E2D1A', '#2F4A24', '#5C7A2E', '#A3B84A', '#C79A3C', '#E8D3A2', '#F6EFD9'] },
  { id: 'espacio', nombre: 'Espacio', colores: ['#0B0D2B', '#23255E', '#4B3FA6', '#7D5BD6', '#3FB8C9', '#E3C565', '#F4F1FF'] },
  { id: 'detective', nombre: 'Detective (sepia)', colores: ['#141414', '#2E2A26', '#5A4E44', '#8C3B2E', '#A88A63', '#D9CBB0', '#F1EAD8'] },
];

export const hexARgb = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const rgbAHex = (c) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
export function lab(hexOrRgb) {
  const c = typeof hexOrRgb === 'string' ? hexARgb(hexOrRgb) : hexOrRgb;
  const lin = c.map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  const X = (lin[0] * 0.4124 + lin[1] * 0.3576 + lin[2] * 0.1805) / 0.95047;
  const Y = lin[0] * 0.2126 + lin[1] * 0.7152 + lin[2] * 0.0722;
  const Z = (lin[0] * 0.0193 + lin[1] * 0.1192 + lin[2] * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
export const deltaE = (a, b) => { const A = lab(a), B = lab(b); return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]); };

/**
 * Paleta de un juego a partir de muestras { '#RRGGBB': nº de píxeles (o peso) }: agrupa los colores parecidos
 * (ΔE < umbral) y devuelve los grupos con más peso, [{ hex, peso (0..1) }], de oscuro a claro. Los neutros (blancos,
 * grises y negros sin color) no entran: el tema no los cambia.
 */
export function paletaDeMuestras(muestras, { max = 8, umbral = 14, minimo = 0.008, croma = 6 } = {}) {
  const lista = Object.entries(muestras).map(([hex, n]) => ({ hex: hex.toUpperCase(), n, L: lab(hex) }))
    .filter((c) => Math.hypot(c.L[1], c.L[2]) >= croma && c.L[0] <= 97)
    .sort((a, b) => b.n - a.n);
  const grupos = [];
  for (const c of lista) {
    const g = grupos.find((x) => Math.hypot(x.L[0] - c.L[0], x.L[1] - c.L[1], x.L[2] - c.L[2]) < umbral);
    if (g) g.n += c.n; else grupos.push({ hex: c.hex, L: c.L, n: c.n });
  }
  const total = grupos.reduce((a, g) => a + g.n, 0) || 1;
  return grupos.filter((g) => g.n / total >= minimo).sort((a, b) => b.n - a.n).slice(0, max)
    .sort((a, b) => a.L[0] - b.L[0]).map((g) => ({ hex: g.hex, peso: Math.round((g.n / total) * 1000) / 1000 }));
}

/** Reparte una paleta nueva sobre la del juego, por luminosidad y sin que los textos pierdan contraste: los colores
 *  muy oscuros del juego (textos, contornos) van al más oscuro de la paleta; los muy claros (papeles, fondos), al más
 *  claro; y los intermedios se reparten por orden de luminosidad entre los demás colores de la paleta, del más
 *  oscuro al más claro. Devuelve el map de game.theme: [{ from, to }]. */
export function asignarPaleta(origen, colores) {
  const de = [...origen].map((o) => (typeof o === 'string' ? o : o.hex)).map((hex) => ({ hex, L: lab(hex)[0] })).sort((a, b) => a.L - b.L);
  const a = colores.map((c) => ({ hex: c.toUpperCase(), L: lab(c)[0] })).sort((x, y) => x.L - y.L);
  if (!de.length || !a.length) return [];
  const oscuro = a[0], claro = a[a.length - 1];
  const medios = a.length > 2 ? a.slice(1, -1) : a;
  const out = [];
  const intermedios = [];
  for (const o of de) {
    if (o.L < 28 && oscuro.L < 35) out.push({ from: o.hex, to: oscuro.hex });
    else if (o.L > 88 && claro.L > 80) out.push({ from: o.hex, to: claro.hex });
    else intermedios.push(o);
  }
  intermedios.forEach((o, i) => {
    const k = intermedios.length === 1 ? Math.floor((medios.length - 1) / 2) : Math.round((i * (medios.length - 1)) / (intermedios.length - 1));
    out.push({ from: o.hex, to: medios[k].hex });
  });
  return origen.map((x) => (typeof x === 'string' ? x : x.hex)).map((from) => out.find((m) => m.from === from));
}
