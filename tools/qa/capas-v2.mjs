// Compone el juego de prueba de capas v2 (F1.3b de PLAN-CREADOR-2.md) por el mismo camino que el servidor MCP:
// loadGame (v2 → forma del motor) y componerJuego. Uso (desde la raíz del repo):
//   node tools/qa/capas-v2.mjs <salida.pdf>
// Lo usa tools/qa/capas-v2-test.py, que rasteriza el PDF y lo compara con su referencia en PNG.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JUEGO = path.join(ROOT, 'tools', 'qa', 'fixtures', 'games', 'capas-v2');
// El kit de prueba del repositorio (las mismas tres piezas que el juego «capas» de T4.2).
process.env.PME_KIT = path.join(ROOT, 'tools', 'qa', 'fixtures', 'capas', 'kit', 'manifest.json');

const salida = process.argv[2];
if (!salida) { console.error('uso: node tools/qa/capas-v2.mjs <salida.pdf>'); process.exit(1); }
const { loadGame } = await import(path.join(ROOT, 'tools', 'game', 'load.mjs'));
const { componerJuego } = await import(path.join(ROOT, 'mcp', 'motor.mjs'));

const game = await loadGame(path.join(JUEGO, 'game.json'));
const { bytes, warns } = await componerJuego(game, { dir: JUEGO, lang: 'es' });
fs.mkdirSync(path.dirname(path.resolve(salida)), { recursive: true });
fs.writeFileSync(salida, bytes);
console.log(`OK ${salida} (${game.template.pages.length} páginas)${warns.length ? ' avisos: ' + warns.join('; ') : ''}`);
