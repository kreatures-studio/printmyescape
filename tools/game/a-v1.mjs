#!/usr/bin/env node
// Imprime por la salida estándar el juego en la forma que leen el motor, el formulario y el validador
// (pme-game/1). Un juego pme-game/2 se convierte con aV1 (tools/game/v2.mjs); uno v1 sale tal cual.
// Uso: node tools/game/a-v1.mjs <carpeta | game.json>
// Lo usa tools/build-demo.py para juegos v2 (F1.6 de PLAN-CREADOR-2.md).
import { loadGame } from './load.mjs';

const origen = process.argv[2];
if (!origen) { console.error('uso: node tools/game/a-v1.mjs <carpeta | game.json>'); process.exit(1); }
process.stdout.write(JSON.stringify(loadGame(origen), null, 1) + '\n');
