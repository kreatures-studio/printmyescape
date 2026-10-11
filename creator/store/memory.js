// Almacén en memoria del editor (T5.1). Tiene la misma interfaz que el almacén de GitHub
// (T5.2, creator/store/github.js, contrato 3.5); las pruebas de Playwright lo usan en lugar de GitHub.
//
// Interfaz (las funciones devuelven promesas):
//   list()            → [{ id, name }]            juegos disponibles
//   load(id)          → game (pme-game/1)          juego completo
//
// En esta fase los juegos llegan de una lista de rutas (`fuentes`) y se guardan en memoria.
// save/submit/history llegan con T5.2 y T5.6.

/** Crea un almacén con juegos cargados de sus rutas (relativas a la raíz del repo). */
export function crearAlmacenMemoria(fuentes) {
  const juegos = new Map();
  let lista = null;

  async function cargar() {
    if (lista) return lista;
    for (const ruta of fuentes) {
      const res = await fetch(ruta);
      if (!res.ok) throw new Error(`no se pudo cargar ${ruta} (${res.status})`);
      const game = await res.json();
      juegos.set(game.id, game);
    }
    lista = [...juegos.values()].map((g) => ({ id: g.id, name: g.name }));
    return lista;
  }

  return {
    async list() { return cargar(); },
    async load(id) {
      await cargar();
      if (!juegos.has(id)) throw new Error(`no hay un juego «${id}»`);
      return structuredClone(juegos.get(id));
    },
  };
}
