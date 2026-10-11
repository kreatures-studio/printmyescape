// Almacén en memoria del editor (T5.1; save/history/submit en T5.3). Tiene la misma interfaz que el
// almacén de GitHub (creator/store/github.js, contrato 3.5). Las pruebas de Playwright lo usan en
// lugar de GitHub. Los datos viven en la pestaña: se pierden al recargar.
//
// Interfaz (las funciones devuelven promesas):
//   list()                       → [{ id, name, version, status }]
//   load(id)                     → { game, rev }
//   save(id, game, rev, mensaje) → { rev }  o error { code: 'conflict' } si rev no es la última
//   history(id)                  → [{ rev, date, author, message }]
//   submit(id, nota)             → { url }
//   latestRev(id)                → rev actual

function error(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

/** Crea un almacén con juegos cargados de sus rutas (relativas a la página del editor). */
export function crearAlmacenMemoria(fuentes) {
  const juegos = new Map(); // id → { game, rev, historial }
  let cargado = null;
  let contador = 0;

  async function cargar() {
    if (cargado) return cargado;
    for (const ruta of fuentes) {
      const res = await fetch(ruta);
      if (!res.ok) throw new Error(`no se pudo cargar ${ruta} (${res.status})`);
      const game = await res.json();
      contador += 1;
      juegos.set(game.id, { game, rev: `m${contador}`, historial: [], base: new URL(ruta, location.href) });
    }
    cargado = true;
    return cargado;
  }

  function entrada(id) {
    const e = juegos.get(id);
    if (!e) throw error('not-found', `no hay un juego «${id}»`);
    return e;
  }

  return {
    async list() {
      await cargar();
      return [...juegos.values()].map(({ game }) => ({ id: game.id, name: game.name, version: game.version, status: game.status }));
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
      contador += 1;
      e.game = structuredClone(game);
      e.rev = `m${contador}`;
      e.historial.unshift({ rev: e.rev, date: new Date().toISOString(), author: 'memoria', message: mensaje || `Actualizar ${id}` });
      return { rev: e.rev };
    },

    async history(id) {
      await cargar();
      return structuredClone(entrada(id).historial);
    },

    /** Bytes de un fichero de la carpeta del juego (relativo a su game.json). */
    async leerFichero(id, ruta) {
      await cargar();
      const e = entrada(id);
      const res = await fetch(new URL(ruta, e.base));
      if (!res.ok) throw error('not-found', `no se pudo leer ${ruta} (${res.status})`);
      return new Uint8Array(await res.arrayBuffer());
    },

    async submit(id) {
      await cargar();
      entrada(id);
      return { url: `memoria://enviados/${id}` };
    },
  };
}
