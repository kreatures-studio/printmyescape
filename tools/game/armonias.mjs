// Armonías de color (como la rueda de Adobe Color) e importación y exportación de paletas (.ase de Adobe, textos con
// códigos hexadecimales o rgb()). Sin dependencias: lo usan el creador (pestaña Tema) y las herramientas de Claude.
//
// La rueda es la de los pintores (rojo, amarillo y azul primarios, RYB), como la de Adobe Color: el complementario
// del rojo es el verde y el del azul, el naranja. Un color de la rueda es { h (ángulo RYB, 0–360), s (0–1), v (0–1) }.
import { hexARgb, rgbAHex, lab } from './paletas.mjs';

export const REGLAS = [
  { id: 'analogo', nombre: 'Análogo', ayuda: 'Colores vecinos en la rueda: tranquilo y natural.' },
  { id: 'monocromatico', nombre: 'Monocromático', ayuda: 'Un solo color, más claro y más oscuro.' },
  { id: 'triada', nombre: 'Tríada', ayuda: 'Tres colores a la misma distancia: vivo y equilibrado.' },
  { id: 'complementario', nombre: 'Complementario', ayuda: 'El color y su opuesto: mucho contraste.' },
  { id: 'complementario-dividido', nombre: 'Complementario dividido', ayuda: 'El color y los dos vecinos de su opuesto.' },
  { id: 'doble-complementario', nombre: 'Doble complementario dividido', ayuda: 'Dos vecinos del color y dos de su opuesto.' },
  { id: 'cuadrado', nombre: 'Cuadrado', ayuda: 'Cuatro colores a 90°: muy variado.' },
  { id: 'compuesto', nombre: 'Compuesto', ayuda: 'Un vecino del color y un par cerca de su opuesto.' },
  { id: 'matices', nombre: 'Matices', ayuda: 'El mismo color con distintas luces.' },
  { id: 'personalizado', nombre: 'Personalizado', ayuda: 'Cada color donde quieras: arrastra los puntos.' },
];

// Cinco colores por regla, el base en el centro (índice 2), como Adobe Color: [giro en la rueda, × saturación, × luz].
const FORMAS = {
  analogo: [[-40, 1, 0.9], [-20, 1, 1], [0, 1, 1], [20, 1, 1], [40, 1, 0.9]],
  monocromatico: [[0, 1, 0.5], [0, 0.45, 1], [0, 1, 1], [0, 0.45, 0.6], [0, 1, 0.8]],
  triada: [[0, 1, 0.55], [120, 1, 1], [0, 1, 1], [240, 1, 1], [240, 1, 0.55]],
  complementario: [[0, 1, 0.55], [0, 0.45, 1], [0, 1, 1], [180, 1, 1], [180, 1, 0.55]],
  'complementario-dividido': [[0, 1, 0.55], [150, 1, 1], [0, 1, 1], [210, 1, 1], [210, 1, 0.55]],
  'doble-complementario': [[-30, 1, 1], [150, 1, 1], [0, 1, 1], [210, 1, 1], [30, 1, 1]],
  cuadrado: [[90, 1, 1], [180, 1, 1], [0, 1, 1], [270, 1, 1], [0, 1, 0.55]],
  compuesto: [[30, 1, 1], [30, 1, 0.55], [0, 1, 1], [165, 1, 1], [165, 1, 0.55]],
  matices: [[0, 1, 0.25], [0, 1, 0.5], [0, 1, 1], [0, 1, 0.65], [0, 1, 0.8]],
};

// Ángulo en la rueda de los pintores → tono RGB (HSV). Tabla habitual de las ruedas RYB (cada 15°).
const RYB_RGB = [0, 8, 17, 26, 34, 41, 48, 54, 60, 81, 103, 123, 138, 155, 171, 187, 204, 219, 234, 251, 267, 282, 298, 329, 360];
const mod = (a, n = 360) => ((a % n) + n) % n;
export function rybATono(h) {
  const x = mod(h) / 15, i = Math.floor(x), f = x - i;
  return RYB_RGB[i] + (RYB_RGB[Math.min(i + 1, 24)] - RYB_RGB[i]) * f;
}
export function tonoARyb(t) {
  t = mod(t);
  for (let i = 0; i < 24; i++) if (t >= RYB_RGB[i] && t <= RYB_RGB[i + 1]) return (i + (t - RYB_RGB[i]) / ((RYB_RGB[i + 1] - RYB_RGB[i]) || 1)) * 15;
  return 0;
}
function hsvARgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return [f(5), f(3), f(1)];
}
function rgbAHsv([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? 60 * (((g - b) / d) % 6) : mx === g ? 60 * ((b - r) / d + 2) : 60 * ((r - g) / d + 4);
  return [mod(h), mx ? d / mx : 0, mx];
}
const lim = (x) => Math.max(0, Math.min(1, x));
/** { h (RYB), s, v } → '#RRGGBB'. */
export const ruedaAHex = ({ h, s, v }) => rgbAHex(hsvARgb(rybATono(h), lim(s), lim(v)));
/** '#RRGGBB' → { h (RYB), s, v }. */
export function hexARueda(hex) { const [t, s, v] = rgbAHsv(hexARgb(hex)); return { h: tonoARyb(t), s, v }; }

/** Los cinco puntos de una armonía (en la rueda) a partir del color base. `libres`: los puntos de «personalizado». */
export function puntosDeArmonia(regla, base, libres = null) {
  if (regla === 'personalizado') return libres && libres.length ? libres.map((p) => ({ ...p })) : puntosDeArmonia('analogo', base);
  const forma = FORMAS[regla];
  if (!forma) throw new Error(`regla de armonía desconocida: «${regla}» (${REGLAS.map((r) => r.id).join(', ')})`);
  return forma.map(([dh, fs, fv], i) => (i === 2 ? { ...base } : { h: mod(base.h + dh), s: lim(base.s * fs), v: lim(base.v * fv) }));
}

/** Tinta y papel para imprimir: un oscuro (textos, contornos) y dos claros (papel de color y papel) con un toque del
 *  color base, para que los textos se lean y los papeles del juego no se vuelvan colores chillones. */
export function tintaYPapel(base) {
  return [
    ruedaAHex({ h: base.h, s: Math.min(0.7, base.s * 0.8 + 0.1), v: 0.16 }),
    ruedaAHex({ h: base.h, s: Math.min(0.16, base.s * 0.25), v: 0.96 }),
    ruedaAHex({ h: base.h, s: Math.min(0.07, base.s * 0.1), v: 0.985 }),
  ];
}

/** Tinta y papeles para una paleta importada: la tinta con el tono de su color más oscuro y los papeles con el de su
 *  color más claro (una paleta de atardecer da tinta azul noche y papel crema). */
export function tintaYPapelDePaleta(colores) {
  const orden = [...colores].sort((a, b) => lab(a)[0] - lab(b)[0]);
  const oscuro = hexARueda(orden[0]), claro = hexARueda(orden[orden.length - 1]);
  const [tinta] = tintaYPapel({ ...oscuro, s: Math.max(oscuro.s, 0.4) });
  const [, papelColor, papel] = tintaYPapel({ ...claro, s: Math.max(claro.s, 0.4) });
  return [tinta, papelColor, papel];
}

/**
 * Paleta de una armonía: { regla, base: '#RRGGBB', tintaYPapel = true } → ['#RRGGBB', …] (los cinco de la armonía y,
 * si se pide, tinta y papel: los textos del juego necesitan un oscuro y sus papeles, claros).
 */
export function armonia(regla, baseHex, { tintaYPapel: tp = true, libres = null } = {}) {
  const base = hexARueda(baseHex);
  const cinco = puntosDeArmonia(regla, base, libres).map(ruedaAHex);
  return tp ? [...cinco, ...tintaYPapel(base)] : cinco;
}

/** El color de la rueda en un ángulo (RYB) a plena saturación y con la luz dada: para pintar la rueda. */
export const colorDeRueda = (h, v = 1) => ruedaAHex({ h, s: 1, v });

// ---------------------------------------------------------------------------------------------------- Importar

/** Colores de un texto: códigos hexadecimales (#1A2B3C, 1A2B3C en el XML de Adobe) o rgb()/rgba(). Sin repetir. */
export function coloresDeTexto(texto) {
  const out = [];
  const meter = (hex) => { hex = hex.toUpperCase(); if (!out.includes(hex)) out.push(hex); };
  const t = String(texto || '');
  for (const m of t.matchAll(/(?:#|\brgb=['"]|\bhex['"]?\s*[:=]\s*['"]?|(?<![\w#-]))([0-9A-Fa-f]{6})(?![\w-])/g)) meter('#' + m[1]);
  if (!out.length) {
    for (const m of t.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g)) {
      const c = [m[1], m[2], m[3]].map(Number);
      if (c.every((x) => x <= 255)) meter(rgbAHex(c.map((x) => x / 255)));
    }
  }
  return out;
}

/** Colores de un .ase de Adobe (Adobe Swatch Exchange): [{ nombre, hex }]. RGB, CMYK, LAB y gris. */
export function coloresDeAse(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(b[0], b[1], b[2], b[3]) !== 'ASEF') throw new Error('no es un archivo .ase de Adobe');
  const n = dv.getUint32(8);
  let o = 12;
  const out = [];
  for (let i = 0; i < n && o + 6 <= b.length; i++) {
    const tipo = dv.getUint16(o), largo = dv.getUint32(o + 2);
    const fin = o + 6 + largo;
    if (tipo === 0x0001) {
      let p = o + 6;
      const letras = dv.getUint16(p); p += 2;
      let nombre = '';
      for (let k = 0; k < letras; k++) { const c = dv.getUint16(p + k * 2); if (c) nombre += String.fromCharCode(c); }
      p += letras * 2;
      const modelo = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]).trim(); p += 4;
      const f = (k) => dv.getFloat32(p + k * 4);
      let rgb = null;
      if (modelo === 'RGB') rgb = [f(0), f(1), f(2)];
      else if (modelo === 'CMYK') { const [c, m, y, k] = [f(0), f(1), f(2), f(3)]; rgb = [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)]; }
      else if (modelo === 'Gray') rgb = [f(0), f(0), f(0)];
      else if (modelo === 'LAB') rgb = labARgb(f(0) * 100, f(1), f(2));
      if (rgb) out.push({ nombre, hex: rgbAHex(rgb) });
    }
    o = fin;
  }
  return out;
}

function labARgb(L, a, bb) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - bb / 200;
  const g = (t) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787);
  const X = g(fx) * 0.95047, Y = g(fy), Z = g(fz) * 1.08883;
  const lin = [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];
  return lin.map((v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(Math.max(v, 0), 1 / 2.4) - 0.055));
}

/** Un .ase con los colores dados (para cargarlo en Illustrator, Photoshop o InDesign: Muestras → Cargar). */
export function aseDeColores(colores, grupo = 'PrintMyEscape') {
  const bloques = [];
  const cadena = (s) => { const u = [...s].map((c) => c.charCodeAt(0)); return [u.length + 1, ...u, 0]; };
  const u16 = (x) => [(x >> 8) & 255, x & 255];
  const u32 = (x) => [(x >>> 24) & 255, (x >> 16) & 255, (x >> 8) & 255, x & 255];
  const f32 = (x) => { const d = new DataView(new ArrayBuffer(4)); d.setFloat32(0, x); return [...new Uint8Array(d.buffer)]; };
  const nombre = (s) => { const [n, ...u] = cadena(s); return [...u16(n), ...u.flatMap(u16)]; };
  const bloque = (tipo, cuerpo) => bloques.push([...u16(tipo), ...u32(cuerpo.length), ...cuerpo]);
  bloque(0xC001, nombre(grupo));
  colores.forEach((c) => {
    const hex = typeof c === 'string' ? c : c.hex;
    const rgb = hexARgb(hex);
    bloque(0x0001, [...nombre(typeof c === 'string' ? hex.toUpperCase() : (c.nombre || hex)), ...'RGB '.split('').map((x) => x.charCodeAt(0)), ...rgb.flatMap(f32), ...u16(2)]);
  });
  bloque(0xC002, []);
  return new Uint8Array([...'ASEF'.split('').map((x) => x.charCodeAt(0)), ...u16(1), ...u16(0), ...u32(bloques.length), ...bloques.flat()]);
}

/** Ordena de oscuro a claro (para enseñar una paleta importada). */
export const deOscuroAClaro = (colores) => [...colores].sort((a, b) => lab(a)[0] - lab(b)[0]);
