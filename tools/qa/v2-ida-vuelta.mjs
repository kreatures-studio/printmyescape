#!/usr/bin/env node
// Prueba de F1.2 (PLAN-CREADOR-2.md): migrar a v2 y volver da exactamente el mismo juego, y migrar dos veces
// da lo mismo que una. Uso: node tools/qa/v2-ida-vuelta.mjs   (código 0 si todo pasa)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrarAV2, aV1 } from '../game/v2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JUEGOS = ['games/final3/game.json', 'tools/qa/fixtures/games/capas/game.json'];

/** Diferencias entre dos valores JSON (rutas), sin tener en cuenta el orden de las claves. */
function diferencias(a, b, ruta = '') {
  if (Array.isArray(a) !== Array.isArray(b) || typeof a !== typeof b || (a === null) !== (b === null)) return [ruta];
  if (Array.isArray(a)) {
    if (a.length !== b.length) return [`${ruta} (largo ${a.length} ≠ ${b.length})`];
    return a.flatMap((x, i) => diferencias(x, b[i], `${ruta}[${i}]`));
  }
  if (a && typeof a === 'object') {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    return [...claves].flatMap((k) => (k in a && k in b ? diferencias(a[k], b[k], `${ruta}.${k}`) : [`${ruta}.${k}`]));
  }
  return a === b ? [] : [ruta];
}

let fallos = 0;
const rec = (nombre, ok, detalle = '') => { if (!ok) fallos++; console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? ' | ' + detalle : ''}`); };
for (const rel of JUEGOS) {
  const g = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const v2 = migrarAV2(g);
  const d = diferencias(g, aV1(v2));
  rec(`${g.id}: ida y vuelta sin cambios`, d.length === 0, d.slice(0, 5).join(', '));
  rec(`${g.id}: migrar dos veces = una`, diferencias(v2, migrarAV2(v2)).length === 0);
  const n = v2.pages.reduce((s, p) => s + p.elements.length, 0);
  const esperado = (g.texts || []).length + g.template.pages.reduce((s, p) => s + p.slots.length + (p.layers || []).length, 0);
  rec(`${g.id}: un elemento por texto, hueco y capa`, n === esperado, `${n} elementos`);
  rec(`${g.id}: v2 sin template ni texts`, !('template' in v2) && !('texts' in v2));
}
console.log(`\nRESUMEN: ${fallos ? 'con fallos' : 'todo OK'}`);
process.exit(fallos ? 1 : 0);
