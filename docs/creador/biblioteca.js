// Biblioteca en el navegador (F4): la misma vista que tools/biblioteca/indice.mjs, leída a través del almacén
// (de GitHub: biblioteca/ en la rama principal del repositorio privado; nunca de la web publicada).
//   const bib = await cargarBiblioteca(almacen);
//   bib.entradas(tipo), bib.actuales(tipo), bib.buscar(tipo, ref)           (tipo: arte | pagina | seccion | puzzle; ref «id@versión» o «id»)
//   bib.bytes(tipo, coleccion, rel), bib.bytesDePieza(pieza), bib.miniatura(pieza) → URL de la imagen
//   bib.arteCombinado() → manifiesto de todo el arte (para el validador)

export const TIPOS = { arte: 'arte', pagina: 'paginas', seccion: 'secciones', puzzle: 'puzzles' };

export function partirRef(ref) {
  const m = /^(.+?)(?:@(\d+))?$/.exec(String(ref));
  return { id: m[1], version: m[2] ? Number(m[2]) : null };
}

const leerJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

export async function cargarBiblioteca(almacen) {
  const porTipo = {};
  const errores = [];
  for (const [tipo, dir] of Object.entries(TIPOS)) {
    const lista = [];
    for (const c of await almacen.colecciones(dir)) {
      try {
        const m = leerJson(await almacen.leerBiblioteca(`${dir}/${c}/manifest.json`));
        for (const p of m.pieces || []) lista.push({ ...p, coleccion: c });
      } catch (e) {
        errores.push(`${dir}/${c}: ${e.message}`);
      }
    }
    porTipo[tipo] = lista;
  }
  const cache = new Map();
  const urls = new Map();

  const bib = {
    errores,
    entradas: (tipo) => porTipo[tipo] || [],
    /** La última versión de cada entrada (lo que se ofrece para insertar; las anteriores siguen para los juegos que las usan). */
    actuales(tipo) {
      const ultima = new Map();
      for (const e of porTipo[tipo] || []) {
        const k = `${e.coleccion}/${e.id}`;
        if (!ultima.has(k) || e.version > ultima.get(k).version) ultima.set(k, e);
      }
      return [...ultima.values()];
    },
    buscar(tipo, ref) {
      const { id, version } = partirRef(ref);
      const c = (porTipo[tipo] || []).filter((e) => e.id === id && (version === null || e.version === version));
      return c.length ? c.reduce((a, b) => (b.version > a.version ? b : a)) : null;
    },
    async bytes(tipo, coleccion, rel) {
      const clave = `${TIPOS[tipo]}/${coleccion}/${rel}`;
      if (!cache.has(clave)) cache.set(clave, almacen.leerBiblioteca(clave));
      return cache.get(clave);
    },
    bytesDePieza: (pieza) => bib.bytes('arte', pieza.coleccion, pieza.file),
    /** URL (blob:) de la miniatura de una pieza de arte. */
    async miniatura(pieza) {
      const clave = `${pieza.coleccion}/${pieza.thumb}`;
      if (!urls.has(clave)) {
        urls.set(clave, bib.bytes('arte', pieza.coleccion, pieza.thumb).then((b) => URL.createObjectURL(new Blob([b], { type: 'image/png' }))));
      }
      return urls.get(clave);
    },
    arteCombinado: () => ({ schema: 'pme-biblioteca/1', tipo: 'arte', pieces: (porTipo.arte || []).map((p) => ({ ...p })) }),
    /** Etiquetas de un tipo, de más a menos usada. */
    etiquetas(tipo) {
      const n = new Map();
      for (const e of porTipo[tipo] || []) for (const t of e.tags || []) n.set(t, (n.get(t) || 0) + 1);
      return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
    },
    /** Añade una entrada recién guardada (sin recargar todo). */
    anadir(tipo, entrada) { porTipo[tipo] = [...(porTipo[tipo] || []), entrada]; },
  };
  return bib;
}
