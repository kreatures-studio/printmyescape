// Aceptación de F2 (PLAN-CREADOR-2.md): un juego v2 hecho con piezas de la biblioteca.
// 1. Equivalencia: final3 con sus 6 mecánicas sustituidas por los puzzles de datos de la biblioteca da el mismo
//    PDF, píxel a píxel, que final3 tal cual.
// 2. Juego nuevo: arte, fuente (registro), página, sección y puzzle de la biblioteca, copiados con «from».
//    Valida sin errores, se compone, y el PDF lleva los textos calculados por el puzzle y el arte dibujado.
// Uso: node tools/qa/biblioteca-juego-test.mjs   (código 0 si todo pasa; necesita python3 con PyMuPDF y pdftotext)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { migrarAV2, aV1 } from '../game/v2.mjs';
import { validateGame } from '../game/validate.mjs';
import { LICENCIAS_BIBLIOTECA } from '../game/reglas.mjs';
import { LICENCIAS_ARTE } from '../biblioteca/reglas.mjs';
import { componerJuego } from '../../mcp/motor.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIB = path.join(ROOT, 'biblioteca');
const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const coleccion = (tipo) => leer(path.join(BIB, tipo, 'el-regalo-robado', 'manifest.json')).pieces;
const ARTE_BIB = path.join(BIB, 'arte', 'el-regalo-robado', 'manifest.json');
// Las carpetas de prueba están a dos niveles de la raíz, como games/final3: sus rutas «../../» siguen valiendo.
const carpeta = (nombre) => {
  const d = path.join(ROOT, 'salidas', `qa-biblioteca-${nombre}`);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
};

let fallos = 0;
const ok = (nombre, cond, detalle = '') => { if (!cond) fallos++; console.log(`${cond ? 'OK  ' : 'FALLO'} ${nombre}${!cond && detalle ? ' | ' + detalle : ''}`); };
const PAGINA_ENTERA = { x: 0, y: 0, w: 100, h: 100 };
const FINAL3 = leer(path.join(ROOT, 'games', 'final3', 'game.json'));
const PUZZLES = coleccion('puzzles');

/** Copia un puzzle del catálogo al juego, como lo hará insert_puzzle: sin datos de catálogo y con «from». */
function copiarPuzzle(z, id) {
  const { id: idBib, version, tags, origin, status, notes, ...resto } = structuredClone(z);
  return { id, from: `${idBib}@${version}`, ...resto };
}

/** Rasteriza un PDF y devuelve una huella por página (python3 + PyMuPDF). */
function huellas(pdf) {
  const r = spawnSync('python3', ['-c', `
import sys, hashlib
try:
    import pymupdf as fitz
except ImportError:
    import fitz
d = fitz.open(sys.argv[1])
for p in d:
    print(hashlib.md5(p.get_pixmap(dpi=60).samples).hexdigest())
`, pdf], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim().split('\n');
}

async function componer(game, dir, ejemplo, salida) {
  const { bytes, warns } = await componerJuego(game, { dir, lang: 'es', example: ejemplo });
  fs.writeFileSync(salida, bytes);
  return warns;
}

// 0. Las licencias del arte coinciden en el validador de juegos y en el de la biblioteca.
ok('licencias de arte iguales en juegos y biblioteca', JSON.stringify([...LICENCIAS_BIBLIOTECA].sort()) === JSON.stringify([...LICENCIAS_ARTE].sort()));

// 1. Equivalencia: las 6 mecánicas de final3 como puzzles de la biblioteca
{
  const dir = carpeta('equivalencia');
  const g = migrarAV2(FINAL3);
  g.puzzles = [];
  for (const m of g.mechanics) {
    const z = PUZZLES.find((p) => p.mechanic === m.type);
    const id = `pz-${m.type}`;
    g.puzzles.push(copiarPuzzle(z, id));
    g.pages.find((p) => p.id === m.page).elements.push({ id: `bloque-${id}`, kind: 'puzzle', puzzle: id, ...PAGINA_ENTERA });
  }
  ok('las 6 mecánicas de final3 tienen su puzzle en la biblioteca', g.puzzles.length === 6 && g.mechanics.length === 6);
  g.mechanics = [];
  g.solutions = []; // la solución de las tiras viene ahora con su puzzle
  fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify(g, null, 2));
  const errs = validateGame(g, { dir, submit: true });
  ok('final3 con puzzles de la biblioteca valida (para enviar)', errs.length === 0, errs.slice(0, 3).join('; '));
  const v1 = aV1(g);
  ok('aV1 da las 6 mecánicas y la solución de las tiras', v1.mechanics.length === 6 && v1.solutions.length === 1 && v1.solutions[0].page === 'p9');
  const original = path.join(dir, 'original.pdf'), conPuzzles = path.join(dir, 'con-puzzles.pdf');
  await componer(FINAL3, path.join(ROOT, 'games', 'final3'), '1', original);
  await componer(v1, dir, '1', conPuzzles);
  const a = huellas(original), b = huellas(conPuzzles);
  const distintas = a.map((h, i) => (h === b[i] ? null : i + 1)).filter(Boolean);
  ok(`mismo PDF píxel a píxel (${a.length} páginas)`, a.length === b.length && !distintas.length, `páginas distintas: ${distintas.join(', ')}`);
}

// 2. Juego nuevo hecho con la biblioteca
{
  const dir = carpeta('juego-nuevo');
  const PAG = coleccion('paginas').find((p) => p.id === 'ficha-cumpleanero');
  const SEC = coleccion('secciones').find((s) => s.id === 'cumpleanero');
  const PREFIJO = PUZZLES.find((z) => z.id === 'puzzle-prefix');
  const ARTE = leer(ARTE_BIB).pieces.find((p) => p.id === 'marco-ficha-sospechoso-verde-regalo');
  const refArte = `${ARTE.id}@${ARTE.version}`;
  // El fondo de la página se copia con ella.
  fs.mkdirSync(path.join(dir, 'fondos'), { recursive: true });
  fs.copyFileSync(path.join(BIB, 'paginas', 'el-regalo-robado', PAG.page.background.file), path.join(dir, PAG.page.background.file));

  // Sospechosos: los campos que usan la página y el puzzle (needs) y no trae la sección (se definen en el propio
  // juego). Los que calcula el puzzle (derives) no se piden.
  const usados = [...PAG.fields, ...PREFIJO.needs.map((n) => n.field)];
  const sospechosos = [...new Set(usados)].filter((c) => !SEC.section.fields.includes(c) && !(PREFIJO.derives || []).includes(c));
  const fields = { ...structuredClone(SEC.fieldDefs) };
  for (const c of sospechosos) fields[c] = structuredClone(FINAL3.fields[c]);
  for (const c of Object.keys(fields)) {
    // Un campo «Otro» de una opción múltiple viaja con ella.
    const otro = fields[c].otherField;
    if (otro && !fields[otro]) fields[otro] = structuredClone(FINAL3.fields[otro]);
  }
  const extras = Object.keys(fields).filter((c) => !SEC.section.fields.includes(c) && !sospechosos.includes(c));

  // Tamaño del marco en la página 2: 80 % del ancho, con su proporción (A4: 210 × 297 mm).
  const anchoMarco = 80, altoMarco = (anchoMarco * 210 / 100) * (ARTE.heightMm / ARTE.widthMm) / 297 * 100;
  const g = {
    schema: 'pme-game/2', id: 'prueba-biblioteca', version: '0.1.0', status: 'borrador',
    name: { es: 'Prueba de la biblioteca', en: 'Library test' }, languages: ['es', 'en'], pageSize: 'A4',
    i18n: {
      es: { ...PAG.i18n.es, 'titulo-ficha': 'Ficha del cumpleañero' },
      en: { ...PAG.i18n.en, 'titulo-ficha': 'Birthday person file' },
    },
    fields,
    form: { sections: [
      { ...structuredClone(SEC.section), from: `${SEC.id}@${SEC.version}` },
      { id: 'sospechosos', title: { es: 'Sospechosos', en: 'Suspects' }, fields: [...sospechosos, ...extras] },
    ] },
    pages: [
      { id: 'p1', title: PAG.page.title, from: `${PAG.id}@${PAG.version}`, background: structuredClone(PAG.page.background),
        elements: [
          ...structuredClone(PAG.page.elements),
          { id: 'p1-apodos', kind: 'puzzle', puzzle: 'apodos', ...PAGINA_ENTERA },
          { id: 'p1-sello', kind: 'art', ref: refArte, x: 60, y: 80, w: 30, h: 30 * altoMarco / anchoMarco, angle: -8 },
        ] },
      { id: 'p2', title: 'Ficha', background: { kind: 'color', value: '#F3E9D2' },
        elements: [
          { id: 'p2-marco', kind: 'art', ref: refArte, x: 10, y: 20, w: anchoMarco, h: altoMarco, angle: 0 },
          { id: 'p2-titulo', kind: 'text', key: 'titulo-ficha', x: 10, y: 8, w: 80, h: 6, size: 5, color: '#3B2A20', fontFamily: 'Anton' },
          { id: 'p2-nombre', kind: 'field', field: 'NOMBRE_CUMPLE', x: 18, y: 32, w: 40, h: 5, size: 3.5, color: '#3B2A20', fontFamily: 'Caveat' },
        ] },
    ],
    puzzles: [copiarPuzzle(PREFIJO, 'apodos')],
    examples: [{ id: '1', values: {
      es: { NOMBRE_CUMPLE: 'Lucía', EDAD: '9', NOMBRE_1: 'Ana', APODO_1: 'La Rápida', NOMBRE_2: 'Bruno' },
      en: { NOMBRE_CUMPLE: 'Lucy', EDAD: '9', NOMBRE_1: 'Ann', APODO_1: 'Speedy', NOMBRE_2: 'Bruno' },
    } }],
  };
  fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify(g, null, 2));
  const errs = validateGame(g, { dir, kit: ARTE_BIB });
  ok('juego nuevo con arte, fuente, página, sección y puzzle de la biblioteca valida', errs.length === 0, errs.slice(0, 4).join('; '));
  ok('página, sección y puzzle guardan su origen («from»)', !!(g.pages[0].from && g.form.sections[0].from && g.puzzles[0].from));

  process.env.PME_KIT = ARTE_BIB;
  const pdf = path.join(dir, 'prueba.pdf');
  let warns = [];
  try { warns = await componer(aV1(g), dir, '1', pdf); } catch (e) { ok('el juego nuevo se compone', false, e.message); }
  if (fs.existsSync(pdf)) {
    ok('el juego nuevo se compone (2 páginas)', huellas(pdf).length === 2, warns.join('; '));
    const texto = spawnSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    ok('el puzzle de la biblioteca calcula el apodo con su prefijo («Ana, La Rápida»)', /Ana\s*, La Rápida/.test(texto), texto.slice(0, 200));
    ok('sin apodo, sin prefijo («Bruno» sin coma)', /Bruno(?!\s*,)/.test(texto));
    ok('textos de la página y de la fuente registrada en el PDF', texto.includes('Ficha del cumpleañero') && texto.includes('Lucía'));
    // El marco de la biblioteca se ve: en su caja, la página 2 no es solo el color de fondo.
    const r = spawnSync('python3', ['-c', `
import sys
try:
    import pymupdf as fitz
except ImportError:
    import fitz
p = fitz.open(sys.argv[1])[1]
pix = p.get_pixmap(dpi=40)
x0, y0, x1, y1 = [float(v) for v in sys.argv[2:6]]
fondo = (0xF3, 0xE9, 0xD2)
distintos = total = 0
for yy in range(int(pix.height * y0), int(pix.height * y1), 2):
    for xx in range(int(pix.width * x0), int(pix.width * x1), 2):
        total += 1
        if max(abs(a - b) for a, b in zip(pix.pixel(xx, yy)[:3], fondo)) > 24: distintos += 1
print(distintos / total)
`, pdf, '0.12', '0.22', '0.88', String((20 + altoMarco - 2) / 100)], { encoding: 'utf8' });
    const proporcion = parseFloat(r.stdout);
    ok('el arte de la biblioteca está dibujado en la página 2', proporcion > 0.3, `píxeles distintos del fondo: ${r.stdout.trim()} ${r.stderr}`);
  }
}

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK');
process.exitCode = fallos ? 1 : 0;
