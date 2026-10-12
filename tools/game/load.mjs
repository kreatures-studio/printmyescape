// Carga de juegos (T0.3 de PLAN-CREADOR.md; v2 en F1.2 de PLAN-CREADOR-2.md).
// Un juego es una carpeta con game.json (o el propio fichero game.json).
// Un juego pme-game/2 se entrega en su forma v1 equivalente (tools/game/v2.mjs, aV1), que es la que leen hoy
// el motor, la CLI y los límites; con { tal: true } se devuelve tal cual está en el fichero.
import fs from 'node:fs';
import path from 'node:path';
import { plantillaParaMotor } from './reglas.mjs';
import { aV1 } from './v2.mjs';

/** Lee el juego. Acepta la carpeta del juego o la ruta del game.json. */
export function loadGame(p, { tal = false } = {}) {
  const abs = path.resolve(p);
  const file = fs.statSync(abs).isDirectory() ? path.join(abs, 'game.json') : abs;
  const game = JSON.parse(fs.readFileSync(file, 'utf8'));
  return !tal && game.schema === 'pme-game/2' ? aV1(game) : game;
}

/**
 * Lo que necesita composeGame (tools/pme-compose-core.js) para un idioma.
 * Mismo formato que construye tools/compose.js desde templates/*.
 */
export function toEngineDeps(game, lang) {
  const i18n = game.i18n && game.i18n[lang];
  if (!i18n) throw new Error(`el juego «${game.id}» no tiene textos para el idioma «${lang}»`);
  return { template: plantillaParaMotor(game), fixed: game.texts, i18n, i18nAll: game.i18n,
           mechanics: game.mechanics || [], fields: game.fields || {} };
}
