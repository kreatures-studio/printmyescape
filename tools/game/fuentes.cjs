/* Fuentes que embeben el motor y las herramientas de Node (CLI, límites, pruebas). Salen del registro
   assets/fonts/registro.json (F1.4 de PLAN-CREADOR-2.md): solo Google Fonts con licencia libre.
   FUENTES: ficheros por clave (embeberCompleta = embed completo; si no, subconjunto).
   resolverFuentes(): traduce el nombre de fuente de un juego (fontFamily) a una clave del registro. Un nombre
   que no está en el registro se rechaza (lanza error), igual que en el validador. */
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..', '..');
const REGISTRO_FILE = path.join(RAIZ, 'assets', 'fonts', 'registro.json');
const REGISTRO = JSON.parse(fs.readFileSync(REGISTRO_FILE, 'utf8'));

const FUENTES = Object.fromEntries(REGISTRO.fuentes.map((f) => [f.key, {
  file: path.join(RAIZ, 'assets', 'fonts', f.fichero),
  subset: !f.embeberCompleta,
}]));

/** Nombre de fuente de un juego → entrada del registro (lanza si no está registrado). */
function entradaDeNombre(familia, registro = REGISTRO) {
  const nombre = familia == null ? '' : String(familia);
  if (!Object.prototype.hasOwnProperty.call(registro.nombres, nombre)) {
    throw new Error(`fuente no registrada: «${nombre}» (ver assets/fonts/registro.json)`);
  }
  return registro.nombres[nombre];
}

/** Lo que el motor necesita de cada nombre: clave de fichero y si la letra es manuscrita (escala propia). */
function resolverFuentes(registro = REGISTRO) {
  return {
    key: (familia) => entradaDeNombre(familia, registro).key,
    manuscrita: (familia) => !!entradaDeNombre(familia, registro).manuscrita,
  };
}

/** ¿Está el nombre en el registro? (sin lanzar; lo usa el validador). */
function nombreRegistrado(familia, registro = REGISTRO) {
  const nombre = familia == null ? '' : String(familia);
  return Object.prototype.hasOwnProperty.call(registro.nombres, nombre);
}

module.exports = { FUENTES, REGISTRO, resolverFuentes, nombreRegistrado };
