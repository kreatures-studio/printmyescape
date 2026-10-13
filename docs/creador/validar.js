// Validación en el navegador (F4): las mismas reglas que el servidor MCP y la línea de órdenes (tools/game/reglas.mjs
// sobre el juego v2 y su forma v1), con el arte de la biblioteca. Lo que no se puede comprobar aquí (el esquema JSON
// completo y que existan los ficheros) lo comprueban validate_game y el envío al estudio.
//
// El creador valida antes de aceptar cada cambio: un cambio que añade errores se rechaza, igual que en las
// herramientas de Claude. Así el juego guardado siempre se puede seguir editando desde Claude Code.

import { reglasCruzadas, reglasV2, avisosV2, avisosGame, erroresKitDatos } from './tools/game/reglas.mjs';
import { aV1 } from './tools/game/v2.mjs';

function fuentesUsadas(juego) {
  const usadas = new Map();
  const walk = (o, ruta) => {
    if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${ruta}[${i}]`));
    else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        if (k === 'fontFamily') { const n = v == null ? '' : String(v); if (!usadas.has(n)) usadas.set(n, ruta); } else walk(v, ruta ? `${ruta}.${k}` : k);
      }
    }
  };
  walk(juego, '');
  return usadas;
}

/** { errores, avisos } del juego. submit: las reglas para enviar al estudio. */
export function validar(juego, { biblioteca, registro, submit = false }) {
  const errores = [];
  for (const [n, ruta] of fuentesUsadas(juego)) {
    if (registro && !registro.registrado(n)) errores.push(`${ruta}: la fuente «${n}» no está en el registro de fuentes`);
  }
  let v1 = juego;
  if (juego.schema === 'pme-game/2') {
    errores.push(...reglasV2(juego));
    try { v1 = aV1(juego); } catch (e) { return { errores: [...errores, `pages: ${e.message}`], avisos: [] }; }
  }
  const kit = biblioteca ? erroresKitDatos(biblioteca.arteCombinado(), null) : null;
  errores.push(...reglasCruzadas(v1, { submit, existe: null, kit, kitForzado: false, kitNombre: 'la biblioteca' }));
  const avisos = [...avisosGame(v1), ...(juego.schema === 'pme-game/2' ? avisosV2(juego) : [])];
  // En borrador, una lista aún vacía (sin secciones, sin ejemplos) es contenido que falta, no un error.
  const filtrados = submit ? errores : errores.filter((e) => !/must NOT have fewer than 1 items|falta al menos una sección/.test(e));
  return { errores: [...new Set(filtrados)], avisos: [...new Set(avisos)] };
}

/** Página a la que se refiere un mensaje del validador (para enlazarlo), o null. */
export function paginaDe(mensaje) {
  const m = /^(?:pages|template)\/(p\d+)/.exec(mensaje);
  return m ? m[1] : null;
}
