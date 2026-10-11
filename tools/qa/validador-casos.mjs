#!/usr/bin/env node
// Casos del validador (T3.2 de PLAN-CREADOR.md): un caso por regla. Cada caso parte de
// games/final3/game.json, le cambia una cosa y comprueba el mensaje esperado (o que no hay errores).
// Uso: node tools/qa/validador-casos.mjs   (código 0 si todos pasan)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGame, avisosGame, codigosDePdf } from '../game/validate.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = path.join(ROOT, 'tools', 'qa', 'fixtures');
const BASE = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', 'final3', 'game.json'), 'utf8'));
const DIR = path.join(ROOT, 'games', 'final3');
const clon = () => structuredClone(BASE);
const bloque = (g, mec) => g.mechanics.find((m) => m.type === mec);

/* tipo: 'error' (espera un error que contiene «espera»), 'aviso' (un aviso), 'ok' (sin errores). */
const CASOS = [
  { nombre: 'final3 pasa sin errores ni avisos', tipo: 'ok', g: clon, opts: { dir: DIR } },
  { nombre: 'final3 pasa la validación para enviar', tipo: 'ok', g: clon, opts: { dir: DIR, submit: true } },
  { nombre: 'campo sin página: aviso, no error', tipo: 'aviso', espera: 'SOBRA',
    g: () => { const g = clon(); g.fields.SOBRA = { type: 'text', required: false, cap: 10, q: { es: 'Sobra', en: 'Extra' } }; return g; },
    opts: { dir: DIR } },
  { nombre: 'código [CODIGO] del PDF que no es un campo', tipo: 'error', espera: 'FANTASMA_9',
    g: clon, opts: { dir: DIR, codigos: codigosDePdf(path.join(FIX, 'games', 'texto-artista.pdf')) } },
  { nombre: 'ejemplo con más caracteres que el tope', tipo: 'error', espera: 'tiene 30 caracteres',
    g: () => { const g = clon(); g.examples[0].values.es.NOMBRE_CUMPLE = 'X'.repeat(30); return g; }, opts: { dir: DIR } },
  { nombre: 'mecánica sin un parámetro requerido', tipo: 'error', espera: 'falta el parámetro «boxes»',
    g: () => { const g = clon(); delete bloque(g, 'ticks').params.boxes; return g; }, opts: { dir: DIR } },
  { nombre: 'mecánica desconocida', tipo: 'error', espera: 'mecánica desconocida',
    g: () => { const g = clon(); g.mechanics.push({ type: 'inventada', page: 'p1', params: {} }); return g; }, opts: { dir: DIR } },
  { nombre: 'para enviar: faltan tres ejemplos', tipo: 'error', espera: 'faltan ejemplos',
    g: () => { const g = clon(); g.examples = g.examples.slice(0, 2); return g; }, opts: { dir: DIR, submit: true } },
  { nombre: 'para enviar: un ejemplo sin un idioma', tipo: 'error', espera: 'falta el ejemplo en «en»',
    g: () => { const g = clon(); delete g.examples[1].values.en; return g; }, opts: { dir: DIR, submit: true } },
  { nombre: 'fondo PDF inexistente', tipo: 'error', espera: 'no existe el PDF',
    g: () => { const g = clon(); g.background.file = 'no-existe.pdf'; return g; }, opts: { dir: DIR } },
  { nombre: 'foto de ejemplo inexistente', tipo: 'error', espera: 'no existe la foto',
    g: () => { const g = clon(); g.examples[0].photos.FOTO_1 = 'assets/no-existe.jpg'; return g; }, opts: { dir: DIR } },
  { nombre: 'fondo por capas: pieza que no está en el kit', tipo: 'error', espera: 'no está en el kit',
    g: () => { const g = clon(); g.background = { kind: 'layers', layers: [{ asset: 'fantasma' }] }; return g; },
    opts: { kit: path.join(FIX, 'kit', 'manifest-ok.json') } },
  { nombre: 'fondo por capas: licencia distinta de CC0', tipo: 'error', espera: 'licencia no admitida',
    g: () => { const g = clon(); g.background = { kind: 'layers', layers: [{ asset: 'papel-viejo-1' }] }; return g; },
    opts: { kit: path.join(FIX, 'kit', 'manifest-licencia.json') } },
  { nombre: 'fondo por capas: pieza CC0 con autor y fuente', tipo: 'ok',
    g: () => { const g = clon(); g.background = { kind: 'layers', layers: [{ asset: 'papel-viejo-1' }] }; return g; },
    opts: { kit: path.join(FIX, 'kit', 'manifest-ok.json') } },
  { nombre: 'corta sin el idioma inglés', tipo: 'error', espera: 'fields/NOMBRE_1/corta: falta el texto en «en»',
    g: () => { const g = clon(); delete g.fields.NOMBRE_1.corta.en; return g; }, opts: { dir: DIR } },
];

let fallos = 0;
for (const c of CASOS) {
  const g = c.g();
  const errs = validateGame(g, c.opts);
  const avisos = avisosGame(g, c.opts);
  let ok;
  if (c.tipo === 'ok') ok = errs.length === 0;
  else if (c.tipo === 'error') ok = errs.some((e) => e.includes(c.espera));
  else ok = avisos.some((a) => a.includes(c.espera)) && errs.length === 0;
  if (!ok) fallos++;
  const detalle = c.tipo === 'ok' ? `${errs.length} error(es), ${avisos.length} aviso(s)` : `«${c.espera}»`;
  console.log(`${ok ? 'OK  ' : 'FALLO'} ${c.nombre} | ${detalle}${ok ? '' : ' | errores: ' + JSON.stringify(errs) + ' avisos: ' + avisos.length}`);
}
console.log(`\nRESUMEN: ${CASOS.length - fallos}/${CASOS.length} OK`);
process.exit(fallos ? 1 : 0);
