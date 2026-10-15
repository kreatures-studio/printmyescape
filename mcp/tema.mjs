// Tema de color desde Claude: los colores de un juego (como los ve el creador: compone sus páginas sin tema, las
// pinta pequeñas y cuenta los píxeles) y la herramienta color_palette (armonías de la rueda de color e importación de
// paletas de Adobe Color: .ase, CSS, XML o códigos pegados).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { paletaDeMuestras, asignarPaleta, rgbAHex } from '../tools/game/paletas.mjs';
import { REGLAS, armonia, coloresDeTexto, coloresDeAse } from '../tools/game/armonias.mjs';
import { aV1 } from '../tools/game/v2.mjs';

const ANCHO = 150; // px de ancho de cada página al contar colores (como el creador)

/** Colores de un juego: [{ hex, peso }] de oscuro a claro (los neutros no entran). Necesita pdftoppm (poppler). */
export async function paletaDelJuego(game, dir) {
  const { componerJuego } = await import('./motor.mjs');
  const g = structuredClone(game);
  delete g.theme;
  const v1 = g.schema === 'pme-game/2' ? aV1(g) : g;
  const { bytes } = await componerJuego(v1, { dir, lang: v1.languages[0], example: null });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pme-colores-'));
  try {
    fs.writeFileSync(path.join(tmp, 'j.pdf'), bytes);
    const r = spawnSync('pdftoppm', ['-scale-to-x', String(ANCHO), '-scale-to-y', '-1', path.join(tmp, 'j.pdf'), path.join(tmp, 'p')], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`pdftoppm no está disponible o falló (${(r.stderr || r.error || '').toString().trim()}): instala poppler`);
    const muestras = {};
    for (const f of fs.readdirSync(tmp).filter((n) => n.endsWith('.ppm'))) contarPpm(fs.readFileSync(path.join(tmp, f)), muestras);
    // Los colores de los textos también son del tema, aunque ocupen pocos píxeles.
    for (const p of game.pages || []) for (const e of p.elements || []) if (e.color) muestras[e.color.toUpperCase()] = (muestras[e.color.toUpperCase()] || 0) + 400;
    return paletaDeMuestras(muestras);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function contarPpm(buf, muestras) {
  // P6 <ancho> <alto> <máximo>\n y los píxeles RGB.
  let o = 0;
  const campo = () => {
    while (/\s/.test(String.fromCharCode(buf[o]))) o++;
    if (buf[o] === 35) { while (buf[o] !== 10) o++; return campo(); }
    let s = '';
    while (!/\s/.test(String.fromCharCode(buf[o]))) s += String.fromCharCode(buf[o++]);
    return s;
  };
  if (campo() !== 'P6') throw new Error('PPM no esperado');
  const ancho = Number(campo()), alto = Number(campo()), max = Number(campo());
  o++;
  const k = 255 / max;
  for (let i = 0; i < ancho * alto; i++, o += 3) {
    const hex = rgbAHex([(buf[o] * k) / 255, (buf[o + 1] * k) / 255, (buf[o + 2] * k) / 255]);
    muestras[hex] = (muestras[hex] || 0) + 1;
  }
}

/** El map de un tema a partir de una paleta nueva: reparte sus colores sobre los del juego, como el creador. */
export async function mapaDePaleta(game, dir, colores, { tintaYPapel = false } = {}) {
  const paleta = await paletaDelJuego(game, dir);
  return { origen: paleta, map: asignarPaleta(paleta, colores, { tintaYPapel }).filter(Boolean) };
}

export function herramientasTema({ raiz, ErrorHerramienta: E, esquema }) {
  return [
    {
      name: 'color_palette',
      description: 'Paleta de colores para un tema: una armonía de la rueda de color (como Adobe Color: harmony { rule, base, ink_paper? }), '
        + 'o los colores de una paleta importada de Adobe Color: file (ruta en el repositorio a un .ase, .css, .scss, .less, .xml o .txt) o text '
        + '(códigos pegados: #1A2B3C, rgb(…)). ink_paper (por defecto true) añade una tinta oscura y dos papeles claros del mismo tono para que '
        + 'el juego se lea al imprimir (los tres últimos colores; palette.inkPaper). Devuelve colors y el objeto palette listo para set_theme. '
        + `Reglas: ${REGLAS.map((r) => r.id).join(', ')}.`,
      schema: esquema({
        harmony: { type: 'object', description: '{ rule, base: "#RRGGBB", ink_paper?: boolean }' },
        file: { type: 'string', description: 'ruta (dentro del repositorio) del .ase, CSS, XML o texto exportado de Adobe Color' },
        text: { type: 'string', description: 'texto con los códigos de color' },
        ink_paper: { type: 'boolean', description: 'para file/text: añadir tinta y papeles (por defecto, solo si a la paleta le faltan un oscuro o un claro)' },
      }),
      run: async ({ harmony, file, text, ink_paper }) => {
        if ([harmony, file, text].filter((x) => x !== undefined).length !== 1) throw new E('invalid', 'da una de estas: harmony, file o text');
        if (harmony) {
          const { rule, base } = harmony;
          if (!REGLAS.some((r) => r.id === rule) || rule === 'personalizado') throw new E('invalid', `regla «${rule}» desconocida: ${REGLAS.filter((r) => r.id !== 'personalizado').map((r) => r.id).join(', ')}`);
          if (!/^#[0-9A-Fa-f]{6}$/.test(base || '')) throw new E('invalid', 'base: un color #RRGGBB');
          const tp = harmony.ink_paper !== false;
          const colors = armonia(rule, base, { tintaYPapel: tp });
          return { colors, palette: { source: 'armonia', rule, base: base.toUpperCase(), colors, ...(tp ? { inkPaper: true } : {}) } };
        }
        let colores;
        if (file) {
          const abs = path.resolve(raiz, file);
          if (!abs.startsWith(path.resolve(raiz) + path.sep)) throw new E('invalid', 'file tiene que estar dentro del repositorio');
          if (!fs.existsSync(abs)) throw new E('not-found', `no existe «${file}»`);
          colores = /\.ase$/i.test(abs) ? coloresDeAse(fs.readFileSync(abs)).map((c) => c.hex) : coloresDeTexto(fs.readFileSync(abs, 'utf8'));
        } else colores = coloresDeTexto(text);
        if (!colores.length) {
          throw new E('not-found', /color\.adobe\.com/.test(text || '')
            ? 'un enlace de Adobe Color no trae los colores: pide al estudio el .ase (Descargar) o los códigos hexadecimales'
            : 'no hay colores (#RRGGBB, rgb(…) o un .ase)');
        }
        colores = colores.slice(0, 12);
        const { lab } = await import('../tools/game/paletas.mjs');
        const falta = !colores.some((c) => lab(c)[0] < 30) || !colores.some((c) => lab(c)[0] > 88);
        const tp = ink_paper ?? falta;
        if (tp) {
          const { tintaYPapelDePaleta } = await import('../tools/game/armonias.mjs');
          colores = [...colores, ...tintaYPapelDePaleta(colores)];
        }
        return { colors: colores, palette: { source: 'importada', colors: colores, ...(tp ? { inkPaper: true } : {}) } };
      },
    },
  ];
}
