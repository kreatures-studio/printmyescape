#!/usr/bin/env node
// Presupuestos de ejemplo sobre el juego que hizo Claude (Misión Secreta: Operación Cumpleaños), con sus PDF y Excel.
//   node tools/presupuesto/ejemplos.mjs [carpeta-salida]     (por defecto ensayos/f5/presupuestos)
// Escribe P-2026-001.json (cambio de tema), P-2026-002.json (una prueba nueva) y tarifas.json, más .pdf y .xlsx de
// cada uno. Los JSON son los que el creador lee del repositorio de juegos (presupuestos/).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { TARIFAS_INICIALES, presupuestoNuevo, lineaDe, lineasCambioDeTema, totales, euros } from './calculo.mjs';
import { presupuestoPdf } from './pdf.mjs';
import { presupuestoXlsx } from './xlsx.mjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const salida = path.resolve(process.argv[2] || path.join(ROOT, 'ensayos', 'f5', 'presupuestos'));
fs.mkdirSync(salida, { recursive: true });

const tarifas = structuredClone(TARIFAS_INICIALES);
const juego = JSON.parse(fs.readFileSync(path.join(ROOT, 'ensayos', 'f3', 'cumple-mision-secreta', 'game.json'), 'utf8'));
const FECHA = '2026-10-15';

const tema = presupuestoNuevo(tarifas, 'P-2026-001', { titulo: 'Misión Secreta: cambio de tema «Fiesta»', juego: juego.id, cliente: 'Cliente de ejemplo' });
tema.fecha = FECHA;
tema.descripcion = 'Cambiar los colores de todo el juego (verde y kraft) por la paleta «Fiesta» (rosa, amarillo y turquesa), '
  + 'sin cambiar textos, puzzles ni formulario. El creador recolorea las piezas al componer; se revisa cada una y se '
  + 'retoca lo que no quede bien, y se comprueba el contraste de los textos en papel.';
tema.lineas = lineasCambioDeTema(tarifas, juego, 'Fiesta').map((l, i) => ({ ...l, id: `l${i + 1}` }));

const prueba = presupuestoNuevo(tarifas, 'P-2026-002', { titulo: 'Misión Secreta: prueba nueva «El cuadro de la fiesta»', juego: juego.id, cliente: 'Cliente de ejemplo' });
prueba.fecha = FECHA;
prueba.descripcion = 'Añadir una cuarta prueba antes de la final: un cuadro de la fiesta de cumpleaños con cinco objetos '
  + 'escondidos; las iniciales de los objetos forman la contraseña, que sale del nombre del cumpleañero. Incluye la '
  + 'página nueva, sus textos en español e inglés, una pregunta más en el formulario y las pruebas en papel.';
const L = (concepto, descripcion, opciones = {}, anclas = null) => { const l = lineaDe(tarifas, concepto, { descripcion, ...opciones }); if (anclas) l.anclas = anclas; return l; };
prueba.lineas = [
  L('prop', 'Cuadro de la fiesta de cumpleaños con cinco objetos escondidos (la pista de la prueba)', { complejidad: 'muy-compleja' }),
  L('prop', 'Tarta de cumpleaños con velas (premio de la prueba)', { complejidad: 'media' }),
  L('prop', 'Globo, confeti y gorro de fiesta, para marcar los objetos encontrados', { complejidad: 'sencilla', cantidad: 3 }),
  L('prop', 'Polaroid del expediente con un marco de fiesta (confeti y globos)', { complejidad: 'sencilla' }, [{ pagina: 'p1', elemento: 'p1-e4' }]),
  L('maquetacion', 'Página nueva «Prueba 3: el cuadro de la fiesta», y la prueba final y la hoja de quien dirige con la nueva contraseña', {}, [{ pagina: 'p5', x: 50, y: 6 }, { pagina: 'p6', x: 50, y: 6 }]),
  L('gamedesign-puzzle', 'El cuadro de la fiesta: qué objetos se esconden, sus pistas y cómo dan la contraseña', { complejidad: 'media' }),
  L('programacion-puzzle', 'Contraseña con las iniciales del nombre del cumpleañero, escondidas en el cuadro', { complejidad: 'media' }, [{ pagina: 'p5', elemento: 'p5-e1' }]),
  L('programacion-ajustes', 'Pregunta nueva del formulario: comida favorita del cumpleañero (sale en el cuadro)'),
  L('gamedesign-testing', 'Partida completa con el juego impreso'),
].map((l, i) => ({ ...l, id: `l${i + 1}` }));
prueba.mostrarHoras = true;

globalThis.PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fuente = (f) => fs.readFileSync(path.join(ROOT, 'assets', 'fonts', f));
const fuentes = { regular: fuente('OpenSans-Regular.ttf'), bold: fuente('OpenSans-Bold.ttf'), titular: fuente('Anton-Regular.ttf') };

// El juego compuesto (ejemplo 1) para el anexo «Dónde va cada cosa», y las miniaturas de las piezas.
const { execFileSync } = await import('node:child_process');
const tmp = fs.mkdtempSync(path.join(ROOT, 'salidas', 'pres-'));
execFileSync('node', ['tools/compose.js', '--game', 'ensayos/f3/cumple-mision-secreta', '--kit', 'biblioteca/arte/el-regalo-robado/manifest.json',
  '--example', '1', '--lang', 'es', '--out', path.relative(ROOT, path.join(tmp, 'juego.pdf'))], { cwd: ROOT });
const juegoPdf = fs.readFileSync(path.join(tmp, 'juego.pdf'));
fs.rmSync(tmp, { recursive: true, force: true });
const coleccion = path.join(ROOT, 'biblioteca', 'arte', 'el-regalo-robado');
const manifiesto = JSON.parse(fs.readFileSync(path.join(coleccion, 'manifest.json'), 'utf8'));
const miniaturas = Object.fromEntries(manifiesto.pieces.map((m) => [`${m.id}@${m.version}`, fs.readFileSync(path.join(coleccion, m.thumb))]));
for (const p of [tema, prueba]) p.actualizado = `${FECHA}T12:00:00.000Z`;

fs.writeFileSync(path.join(salida, 'tarifas.json'), JSON.stringify(tarifas, null, 2) + '\n');
for (const p of [tema, prueba]) {
  fs.writeFileSync(path.join(salida, `${p.id}.json`), JSON.stringify(p, null, 2) + '\n');
  fs.writeFileSync(path.join(salida, `${p.id}.pdf`), await presupuestoPdf(p, tarifas, { PDFLib: globalThis.PDFLib, fontkit, fuentes, miniaturas, juego, juegoPdf }));
  fs.writeFileSync(path.join(salida, `${p.id}.xlsx`), presupuestoXlsx(p, tarifas));
  const t = totales(p);
  console.log(`OK ${p.id} · ${p.titulo} · ${p.lineas.length} líneas · ${t.horas} h · base ${euros(t.base)} · total ${euros(t.total)}`);
}
