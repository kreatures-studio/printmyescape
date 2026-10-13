// Almacén en memoria del creador: la misma interfaz que store/github.js. Lo usan las pruebas de Playwright y el modo
// de demostración (?almacen=memoria). Los juegos se cargan de sus rutas (relativas a la página) y la biblioteca, de
// una carpeta servida por creator/serve.mjs (solo en local: la biblioteca nunca se publica). Los cambios viven en la
// pestaña y se pierden al recargar.

import { resumenDe } from './github.js';

function error(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}
const normalizar = (ruta) => {
  const partes = [];
  for (const p of ruta.split('/')) { if (!p || p === '.') continue; if (p === '..') partes.pop(); else partes.push(p); }
  return partes.join('/');
};

/**
 * fuentes: rutas de game.json; biblioteca: { base: URL de la carpeta biblioteca/, indice: URL que devuelve
 * { arte: [colecciones], paginas: [...], secciones: [...], puzzles: [...] } } (o null: biblioteca vacía).
 */
export function crearAlmacenMemoria(fuentes, biblioteca = null) {
  const juegos = new Map(); // id → { game, rev, historial, base, ficheros: Map ruta → bytes }
  const bibliotecaEscrita = new Map(); // ruta → bytes
  let indice = null;
  let cargado = null;
  let contador = 0;
  const nuevaRev = () => `m${++contador}`;

  async function cargar() {
    if (cargado) return cargado;
    cargado = (async () => {
      for (const ruta of fuentes) {
        const res = await fetch(ruta);
        if (!res.ok) throw new Error(`no se pudo cargar ${ruta} (${res.status})`);
        const game = await res.json();
        juegos.set(game.id, { game, rev: nuevaRev(), historial: [], base: new URL(ruta, location.href), ficheros: new Map() });
      }
      if (biblioteca) {
        const res = await fetch(biblioteca.indice);
        indice = res.ok ? await res.json() : {};
      } else indice = {};
    })();
    return cargado;
  }
  function entrada(id) {
    const e = juegos.get(id);
    if (!e) throw error('not-found', `no hay un juego «${id}»`);
    return e;
  }

  return {
    tipo: 'memoria',

    async list() {
      await cargar();
      return [...juegos.entries()].map(([id, { game }]) => resumenDe(id, game));
    },
    async load(id) {
      await cargar();
      const e = entrada(id);
      return { game: structuredClone(e.game), rev: e.rev };
    },
    async latestRev(id) {
      await cargar();
      return entrada(id).rev;
    },
    async save(id, game, rev, mensaje) {
      await cargar();
      const e = entrada(id);
      if (rev !== e.rev) throw error('conflict', 'la versión guardada es más nueva: recarga el juego');
      e.game = structuredClone(game);
      e.rev = nuevaRev();
      e.historial.unshift({ rev: e.rev, date: new Date().toISOString(), author: 'memoria', message: mensaje || `Actualizar ${id}` });
      return { rev: e.rev };
    },
    async create(id, game, mensaje) {
      await cargar();
      if (juegos.has(id)) throw error('exists', `ya existe el juego «${id}»`);
      const rev = nuevaRev();
      // Un juego nuevo vive en games/<id>/: sus rutas relativas se resuelven como las de los demás.
      const base = new URL(`../games/${id}/game.json`, location.href);
      // soloMemoria: su carpeta no existe en el servidor; sus ficheros son los que se escriban aquí.
      juegos.set(id, { game: structuredClone(game), rev, historial: [{ rev, date: new Date().toISOString(), author: 'memoria', message: mensaje || `Crear ${id}` }], base, ficheros: new Map(), soloMemoria: true });
      return { rev };
    },
    async history(id) {
      await cargar();
      return structuredClone(entrada(id).historial);
    },

    async leerFichero(id, ruta) {
      await cargar();
      const e = entrada(id);
      const clave = normalizar(ruta);
      if (e.ficheros.has(clave)) return e.ficheros.get(clave);
      if (e.soloMemoria && !ruta.startsWith('../')) throw error('not-found', `no existe ${ruta}`);
      const res = await fetch(new URL(ruta, e.base));
      if (!res.ok) throw error('not-found', `no se pudo leer ${ruta} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async existeFichero(id, ruta) {
      try { await this.leerFichero(id, ruta); return true; } catch { return false; }
    },
    async escribirFichero(id, ruta, bytes, _mensaje, { sobrescribir = true } = {}) {
      await cargar();
      const e = entrada(id);
      const clave = normalizar(ruta);
      if (!sobrescribir && await this.existeFichero(id, ruta)) return { creado: false };
      e.ficheros.set(clave, bytes);
      return { creado: true };
    },

    async colecciones(tipoDir) {
      await cargar();
      const escritas = [...bibliotecaEscrita.keys()].filter((r) => r.startsWith(`${tipoDir}/`)).map((r) => r.split('/')[1]);
      return [...new Set([...(indice[tipoDir] || []), ...escritas])].sort();
    },
    async leerBiblioteca(ruta) {
      await cargar();
      const clave = normalizar(ruta);
      if (bibliotecaEscrita.has(clave)) return bibliotecaEscrita.get(clave);
      if (!biblioteca) throw error('not-found', `no hay biblioteca (${ruta})`);
      const res = await fetch(new URL(clave, biblioteca.base));
      if (!res.ok) throw error('not-found', `no existe biblioteca/${clave}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async escribirBiblioteca(ruta, bytes) {
      await cargar();
      bibliotecaEscrita.set(normalizar(ruta), bytes);
      return { creado: true };
    },

    async submit(id) {
      await cargar();
      entrada(id);
      return { url: `memoria://enviados/${id}` };
    },
  };
}
