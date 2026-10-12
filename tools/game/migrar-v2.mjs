#!/usr/bin/env node
// Migra un juego pme-game/1 a pme-game/2 (F1.2 de PLAN-CREADOR-2.md), sin pérdida.
// Uso: node tools/game/migrar-v2.mjs <carpeta|game.json> <salida.json | carpeta-salida>
//   Las rutas del juego (fondo, fotos) son relativas a su carpeta: la salida debe quedar a la misma
//   profundidad para que sigan valiendo (p. ej. games/final3 → salidas/final3-v2).
import fs from 'node:fs';
import path from 'node:path';
import { loadGame } from './load.mjs';
import { migrarAV2, aV1 } from './v2.mjs';

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error('Uso: node tools/game/migrar-v2.mjs <carpeta|game.json> <salida.json | carpeta-salida>');
  process.exit(2);
}
const g = loadGame(entrada, { tal: true });
const v2 = migrarAV2(g);
// Sin pérdida o nada: la vuelta a v1 tiene que dar el juego original (claves en cualquier orden).
const canon = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.keys(v).sort().map((c) => [c, v[c]])) : v));
if (canon(aV1(v2)) !== canon(g)) {
  console.error('ERROR la migración perdería información: no se escribe nada');
  process.exit(1);
}
const destino = salida.endsWith('.json') ? salida : path.join(salida, 'game.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, JSON.stringify(v2, null, 2) + '\n');
const n = v2.pages.reduce((s, p) => s + p.elements.length, 0);
console.log(`OK ${destino} · ${v2.pages.length} páginas, ${n} elementos`);
