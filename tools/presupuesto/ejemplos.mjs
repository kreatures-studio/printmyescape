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
  + 'sin cambiar textos, puzzles ni formulario. El creador recolorea las piezas al componer; la ilustradora revisa cada '
  + 'una y retoca lo que no quede bien, y se comprueba el contraste de los textos en papel.';
tema.lineas = lineasCambioDeTema(tarifas, juego, 'Fiesta').map((l, i) => ({ ...l, id: `l${i + 1}` }));

const prueba = presupuestoNuevo(tarifas, 'P-2026-002', { titulo: 'Misión Secreta: prueba nueva «El cuadro de la fiesta»', juego: juego.id, cliente: 'Cliente de ejemplo' });
prueba.fecha = FECHA;
prueba.descripcion = 'Añadir una cuarta prueba antes de la final: un cuadro de la fiesta de cumpleaños con cinco objetos '
  + 'escondidos; las iniciales de los objetos forman la contraseña, que sale del nombre del cumpleañero. Incluye la '
  + 'página nueva, sus textos en español e inglés, una pregunta más en el formulario y las pruebas en papel.';
const L = (concepto, descripcion, opciones = {}) => lineaDe(tarifas, concepto, { descripcion, ...opciones });
prueba.lineas = [
  L('ilustracion', 'Cuadro de la fiesta de cumpleaños con cinco objetos escondidos (la pista de la prueba)', { complejidad: 'compleja' }),
  L('objeto', 'Tarta de cumpleaños con velas (premio de la prueba)'),
  L('icono', 'Globo, confeti y gorro de fiesta, para marcar los objetos encontrados', { complejidad: 'sencilla', cantidad: 3 }),
  L('pagina-nueva', 'Página «Prueba 3: el cuadro de la fiesta» con el cuadro, la tarta y la ficha de respuestas'),
  L('pagina-ajuste', 'Prueba final y hoja de quien dirige la misión: la nueva contraseña y la numeración de pruebas', { cantidad: 2 }),
  L('textos', 'Textos de la página nueva en español e inglés'),
  L('pregunta', 'Pregunta nueva del formulario: comida favorita del cumpleañero (sale en el cuadro)'),
  L('mecanica-sencilla', 'Contraseña con las iniciales del nombre del cumpleañero, escondidas en el cuadro'),
  L('prueba-puzzle', 'Resolver la prueba nueva en papel con dos nombres distintos', { cantidad: 2 }),
  L('prueba-juego', 'Partida completa con el juego impreso', { complejidad: 'sencilla' }),
].map((l, i) => ({ ...l, id: `l${i + 1}` }));
prueba.mostrarHoras = true;

globalThis.PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fuente = (f) => fs.readFileSync(path.join(ROOT, 'assets', 'fonts', f));
const fuentes = { regular: fuente('OpenSans-Regular.ttf'), bold: fuente('OpenSans-Bold.ttf'), titular: fuente('Anton-Regular.ttf') };

fs.writeFileSync(path.join(salida, 'tarifas.json'), JSON.stringify(tarifas, null, 2) + '\n');
for (const p of [tema, prueba]) {
  fs.writeFileSync(path.join(salida, `${p.id}.json`), JSON.stringify(p, null, 2) + '\n');
  fs.writeFileSync(path.join(salida, `${p.id}.pdf`), await presupuestoPdf(p, tarifas, { PDFLib: globalThis.PDFLib, fontkit, fuentes }));
  fs.writeFileSync(path.join(salida, `${p.id}.xlsx`), presupuestoXlsx(p, tarifas));
  const t = totales(p);
  console.log(`OK ${p.id} · ${p.titulo} · ${p.lineas.length} líneas · ${t.horas} h · base ${euros(t.base)} · total ${euros(t.total)}`);
}
