#!/usr/bin/env node
// Pruebas de los presupuestos (tools/presupuesto/) y del tema de color (motor y tools/game/paletas.mjs), en Node.
//   node tools/qa/presupuesto-tema-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import {
  TARIFAS_INICIALES, completarTarifas, lineaDe, conComplejidad, totales, siguienteId, presupuestoNuevo,
  lineasDesdeJuego, lineasCambioDeTema, conceptoParaTexto, erroresDe, euros,
} from '../presupuesto/calculo.mjs';
import { presupuestoPdf } from '../presupuesto/pdf.mjs';
import { presupuestoXlsx } from '../presupuesto/xlsx.mjs';
import { PALETAS, paletaDeMuestras, asignarPaleta, lab } from '../game/paletas.mjs';
import { REGLAS, armonia, hexARueda, ruedaAHex, coloresDeTexto, coloresDeAse, aseDeColores } from '../game/armonias.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RES = [];
const rec = (nombre, ok, detalle = '') => { RES.push(!!ok); console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? ` | ${detalle}` : ''}`); };

const tf = completarTarifas(null);
// ---- Cálculo
const p = presupuestoNuevo(tf, 'P-2026-007', { titulo: 'Prueba' });
p.lineas = [lineaDe(tf, 'prop', { complejidad: 'muy-compleja' }), lineaDe(tf, 'prop', { cantidad: 3, complejidad: 'sencilla' }), lineaDe(tf, 'programacion-puzzle', { complejidad: 'compleja' })];
p.gestion = 10;
let t = totales(p);
rec('tarifas de la tabla: prop muy alta 2,5 h × 30 € = 75 €', t.lineas[0].importe === 75, String(t.lineas[0].importe));
rec('3 props de complejidad baja: 3 × 0,5 h × 30 €', t.lineas[1].importe === 45, String(t.lineas[1].importe));
rec('programación de un puzzle complejo: 3 h × 50 €', t.lineas[2].importe === 150, String(t.lineas[2].importe));
rec('base, gestión 10 %, IVA 21 %', t.base === 270 && t.gestion === 27 && t.iva === 62.37 && t.total === 359.37, JSON.stringify([t.base, t.gestion, t.iva, t.total]));
p.descuento = 5; t = totales(p);
rec('descuento sobre base + gestión', t.descuento === 14.85 && t.imponible === 282.15, JSON.stringify([t.descuento, t.imponible]));
rec('cambiar la complejidad cambia las horas a las de ese nivel', conComplejidad(tf, p.lineas[0], 'media').horas === 1 && conComplejidad(tf, p.lineas[2], 'sencilla').horas === 1);
const precios = (id) => ['sencilla', 'media', 'compleja', 'muy-compleja'].map((n) => lineaDe(tf, id, { complejidad: n })).map((l) => l.horas * l.tarifa);
rec('tabla completa: props, game design y programación por puzzle', precios('prop').join() === '15,30,60,75' && precios('gamedesign-puzzle').join() === '60,105,210,210'
  && precios('programacion-puzzle').join() === '50,100,150,150' && lineaDe(tf, 'maquetacion').horas * lineaDe(tf, 'maquetacion').tarifa === 150
  && lineaDe(tf, 'gamedesign-testing').horas * 30 === 90 && lineaDe(tf, 'programacion-ajustes').horas * 50 === 50, [precios('prop'), precios('gamedesign-puzzle'), precios('programacion-puzzle')].join(' | '));
rec('siguiente número del año', siguienteId(['P-2026-001', 'P-2026-009', 'P-2025-050'], new Date('2026-05-01')) === 'P-2026-010');
rec('concepto desde una nota de Claude', conceptoParaTexto('Mecánica nueva: tiras recortables con cifrado') === 'programacion-puzzle'
  && conceptoParaTexto('Encargar una ilustración del salón') === 'prop' && conceptoParaTexto('Algo raro') === 'otro');
rec('importe con formato español', euros(1234.5) === '1.234,50 €' && euros(-3) === '-3,00 €');
rec('errores: falta el título', erroresDe({ ...p, titulo: '' }).length === 1);
const juego = JSON.parse(fs.readFileSync(path.join(ROOT, 'ensayos/f3/cumple-mision-secreta/game.json'), 'utf8'));
const lt = lineasCambioDeTema(tf, juego, 'Fiesta');
rec('cambio de tema: ajustes, retoque de cada pieza (señalada) y testing', lt.length === 3 && lt[0].concepto === 'programacion-ajustes' && lt[1].concepto === 'prop'
  && lt[1].complejidad === 'sencilla' && lt[1].cantidad > 5 && lt[1].anclas.length > 5 && lt[2].concepto === 'gamedesign-testing');
rec('lo «A presupuestar» de un juego, una línea por nota', lineasDesdeJuego(tf, { changes: [{ presupuestar: ['Mecánica nueva de dados', 'Dibujar un dragón'] }] }).length === 2);

// ---- Excel y PDF
const ej = JSON.parse(fs.readFileSync(path.join(ROOT, 'ensayos/f5/presupuestos/P-2026-002.json'), 'utf8'));
const xlsx = presupuestoXlsx(ej, tf);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pres-'));
fs.writeFileSync(path.join(tmp, 'p.xlsx'), xlsx);
let leido = '';
try {
  leido = execFileSync('python3', ['-c', `
import openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb['Presupuesto']
f = [c.value for r in ws.iter_rows() for c in r if isinstance(c.value, str) and c.value.startswith('=')]
wb2 = openpyxl.load_workbook(sys.argv[1], data_only=True); ws2 = wb2['Presupuesto']
total = [r for r in ws2.iter_rows(values_only=True) if r[8] == 'TOTAL'][0][9]
print(len(f), total, wb.sheetnames)`, path.join(tmp, 'p.xlsx')]).toString().trim();
} catch (e) { leido = `error ${e.message}`; }
rec('Excel: se abre, con fórmulas y el total calculado', /^\d+ 798\.6 \['Presupuesto', 'Tarifas'\]$/.test(leido) && Number(leido.split(' ')[0]) >= 30, leido);
globalThis.PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fuente = (f) => fs.readFileSync(path.join(ROOT, 'assets/fonts', f));
const pdf = await presupuestoPdf(ej, tf, { PDFLib: globalThis.PDFLib, fontkit, fuentes: { regular: fuente('OpenSans-Regular.ttf'), bold: fuente('OpenSans-Bold.ttf'), titular: fuente('Anton-Regular.ttf') } });
const doc = await globalThis.PDFLib.PDFDocument.load(pdf);
fs.writeFileSync(path.join(tmp, 'p.pdf'), pdf);
const texto = execFileSync('pdftotext', [path.join(tmp, 'p.pdf'), '-']).toString();
rec('PDF: número, conceptos y total', doc.getPageCount() >= 1 && texto.includes('P-2026-002') && texto.includes('Prop · complejidad muy alta') && texto.includes('Game design de un puzzle medio') && texto.includes('798,60 €'), `${doc.getPageCount()} páginas`);
fs.rmSync(tmp, { recursive: true, force: true });

// ---- Paletas
const pal = paletaDeMuestras({ '#FFFFFF': 5000, '#000000': 900, '#DEC3A5': 3000, '#DCC1A3': 400, '#023A3A': 1200, '#8B1E1E': 100, '#808080': 700 });
rec('paleta del juego: sin neutros, agrupando parecidos', pal.length === 3 && pal.map((c) => c.hex).join() === '#023A3A,#8B1E1E,#DEC3A5', JSON.stringify(pal));
const map = asignarPaleta(['#021E23', '#3B2A20', '#3B4A45', '#8B1E1E', '#D7C0A0', '#E2EBDB'], PALETAS.find((x) => x.id === 'fiesta').colores);
const L = (h) => lab(h)[0];
rec('reparto: los oscuros siguen oscuros y los claros, claros', L(map[0].to) < 35 && L(map[1].to) < 35 && L(map[4].to) > 80 && L(map[5].to) > 80, JSON.stringify(map.map((m) => m.to)));

// ---- Motor: recoloreado
require(path.join(ROOT, 'tools/pme-compose-core.js'));
const PC = globalThis.PMECompose;
const tema = PC.crearTema({ map: [{ from: '#023A3A', to: '#7A2E8C' }] });
rec('tema: el color de la paleta pasa al nuevo', tema.hex('#023A3A') === '#7A2E8C');
rec('tema: un tono cercano conserva su diferencia', tema.hex('#0A4444') !== '#0A4444' && tema.hex('#0A4444') !== '#7A2E8C');
rec('tema: un color lejano no cambia', tema.hex('#E8D3A2') === '#E8D3A2' && tema.hex('#FFFFFF') === '#FFFFFF');
rec('sin tema: nada', PC.crearTema(null) === null && PC.crearTema({ map: [{ from: '#111111', to: '#111111' }] }) === null);
const pieza = fs.readFileSync(path.join(ROOT, 'biblioteca/arte/el-regalo-robado/piezas/marco-foto-polaroid-verde-grande-v1.pdf'));
const colores = async (bytes) => {
  const d = await globalThis.PDFLib.PDFDocument.load(bytes);
  const c = d.getPages()[0].node.Contents();
  const raw = c instanceof globalThis.PDFLib.PDFArray ? c.asArray().map((r) => d.context.lookup(r)) : [c];
  return raw.map((s) => Buffer.from(globalThis.PDFLib.decodePDFRawStream(s).decode()).toString('latin1')).join('\n');
};
const antes = await colores(pieza);
const verde = (antes.match(/(?<![\d.])0?\.0019\d* 0?\.391\d* 0?\.338\d* rg/) || [])[0];
const temaVerde = PC.crearTema({ map: [{ from: '#00645A', to: '#C2185B' }] });
const despues = await colores(await PC.recolorearPdf(pieza, temaVerde));
rec('pieza recoloreada: el verde de la polaroid cambia y la pieza original no', !!verde && antes.includes(verde) && !despues.includes(verde) && /0\.7\d* 0\.[01]\d* 0\.3\d* rg/.test(despues), verde || 'sin verde');

// ---- Armonías y Adobe Color
rec('rueda de los pintores: el complementario del rojo es verde y el del azul, amarillo anaranjado', (() => {
  const [, , , verde] = armonia('complementario', '#FF0000', { tintaYPapel: false }); const hv = hexARueda(verde).h;
  const [, , , naranja] = armonia('complementario', '#0000FF', { tintaYPapel: false });
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(naranja.slice(i, i + 2), 16));
  return Math.abs(hv - 180) < 1 && r > 200 && g > 120 && g < 230 && b < 40;
})());
rec('cada regla da 5 colores (+3 de tinta y papeles), con el base en el centro', REGLAS.every((r) => { const c = armonia(r.id, '#2EC4B6'); return c.length === 8 && c[2] === '#2EC4B6' && lab(c[5])[0] < 25 && lab(c[7])[0] > 95; }));
rec('ida y vuelta de la rueda', ['#C2185B', '#2EC4B6', '#F7B32B', '#4B3FA6'].every((h) => ruedaAHex(hexARueda(h)) === h));
rec('Adobe Color: CSS, SCSS, XML y rgba()', coloresDeTexto('.c1 { color: #1D3557; }\n$c2: #e94560;\n<color name="x" rgb="0F3460" r="15"/>').join() === '#1D3557,#E94560,#0F3460'
  && coloresDeTexto('rgba(26, 43, 60, 1)').join() === '#1A2B3C' && coloresDeTexto('https://color.adobe.com/es/x-color-theme-1/').length === 0);
const ase = aseDeColores(['#2B2D6E', '#C2185B'], 'Fiesta');
rec('.ase: se escribe y se lee (RGB)', String.fromCharCode(...ase.slice(0, 4)) === 'ASEF' && coloresDeAse(ase).map((c) => c.hex).join() === '#2B2D6E,#C2185B');

// ---- Componer con tema (CLI)
const dir = fs.mkdtempSync(path.join(ROOT, 'salidas', 'tema-'));
fs.cpSync(path.join(ROOT, 'ensayos/f3/cumple-mision-secreta/fotos'), path.join(dir, 'fotos'), { recursive: true });
fs.writeFileSync(path.join(dir, 'game.json'), JSON.stringify({ ...juego, theme: { name: 'Fiesta', preset: 'fiesta', map: asignarPaleta(['#021E23', '#00645A', '#DEC3A5'], PALETAS[0].colores),
  palette: { source: 'armonia', rule: 'triada', base: '#E63946', colors: armonia('triada', '#E63946') } } }));
let salida = '';
try {
  salida = execFileSync('node', ['tools/compose.js', '--game', path.relative(ROOT, dir), '--kit', 'biblioteca/arte/el-regalo-robado/manifest.json', '--example', '1', '--lang', 'es', '--out', path.relative(ROOT, path.join(dir, 't.pdf'))], { cwd: ROOT }).toString();
} catch (e) { salida = e.stdout ? e.stdout.toString() + e.stderr.toString() : e.message; }
const valido = execFileSync('node', ['tools/game/validate.mjs', path.relative(ROOT, dir)], { cwd: ROOT }).toString();
rec('juego con tema: válido y se compone', /^OK/.test(salida.trim()) && fs.existsSync(path.join(dir, 't.pdf')) && /^OK/m.test(valido), salida.trim().slice(0, 120));
fs.rmSync(dir, { recursive: true, force: true });

const ok = RES.every(Boolean);
console.log(`\nRESUMEN: ${RES.filter(Boolean).length}/${RES.length} OK${ok ? '' : ' (fallos)'}`);
process.exit(ok ? 0 : 1);
