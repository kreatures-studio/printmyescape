// Carga de juegos pme-game/1 (T0.3 de PLAN-CREADOR.md).
// Un juego es una carpeta con game.json (o el propio fichero game.json).
import fs from 'node:fs';
import path from 'node:path';

/** Lee el juego. Acepta la carpeta del juego o la ruta del game.json. */
export function loadGame(p) {
  const abs = path.resolve(p);
  const file = fs.statSync(abs).isDirectory() ? path.join(abs, 'game.json') : abs;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Lo que necesita composeGame (tools/pme-compose-core.js) para un idioma.
 * Mismo formato que construye tools/compose.js desde templates/*.
 */
export function toEngineDeps(game, lang) {
  const i18n = game.i18n && game.i18n[lang];
  if (!i18n) throw new Error(`el juego «${game.id}» no tiene textos para el idioma «${lang}»`);
  return { template: game.template, fixed: game.texts, i18n, i18nAll: game.i18n,
           mechanics: game.mechanics || [], fields: game.fields || {} };
}
