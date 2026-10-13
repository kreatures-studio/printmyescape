// Almacén del creador en GitHub (T5.2 de PLAN-CREADOR.md, ampliado en F4 de PLAN-CREADOR-2.md).
//
// Un juego es la rama `juego/<id>` del repositorio de juegos, con `games/<id>/game.json` y sus ficheros (fondos/,
// fotos/). La biblioteca vive en `biblioteca/` de la rama principal (main) y es la misma para todos los juegos.
// rev = sha del game.json en su rama. save() nunca pisa una versión más nueva: si la rev no es la última, lanza
// { code: 'conflict' } y el creador pide recargar. El token va solo en la cabecera Authorization, nunca en una URL.
//
// Interfaz (la misma que store/memory.js):
//   list(), load(id), latestRev(id), save(id, game, rev, msg), create(id, game, msg), history(id), submit(id, nota)
//   leerFichero(id, ruta), existeFichero(id, ruta), escribirFichero(id, ruta, bytes, msg)   (carpeta del juego)
//   colecciones(tipoDir), leerBiblioteca(ruta), escribirBiblioteca(ruta, bytes, msg)          (biblioteca/ en main)
// Errores: { code: 'auth' | 'not-found' | 'conflict' | 'exists' | 'http', status, message }.

const PREFIJO = 'juego/';
const PRINCIPAL = 'main';
const RUTA = (id) => `games/${id}/game.json`;

function error(code, message, status = 0) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

/** Quita «.» y «..» de una ruta con «/» (sin salir de la raíz del repositorio). */
export function normalizar(ruta) {
  const partes = [];
  for (const p of ruta.split('/')) {
    if (!p || p === '.') continue;
    if (p === '..') partes.pop();
    else partes.push(p);
  }
  return partes.join('/');
}

/** Base64 de bytes (por trozos: btoa no admite cadenas enormes). */
export function bytesAb64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function textoAb64(texto) {
  return bytesAb64(new TextEncoder().encode(texto));
}
export function b64aTexto(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
const rutaUrl = (ruta) => ruta.split('/').map(encodeURIComponent).join('/');

/**
 * Crea el almacén. opciones: { owner, repo, token, fetchFn?, api? }.
 * fetchFn y api se cambian en las pruebas (respuestas simuladas).
 */
export function crearAlmacenGitHub({ owner, repo, token, fetchFn, api = 'https://api.github.com' }) {
  const f = fetchFn || ((...a) => fetch(...a));
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const rama = (id) => PREFIJO + id;
  const cabeceras = (accept = 'application/vnd.github+json') => ({ Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}` });

  async function req(path, { method = 'GET', body, ok = [200] } = {}) {
    const h = cabeceras();
    if (body) h['Content-Type'] = 'application/json';
    const res = await f(api + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) throw error('auth', 'el token no es válido o no tiene permisos', 401);
    if (res.status === 404) throw error('not-found', `no existe ${path}`, 404);
    if (res.status === 409) throw error('conflict', 'la versión guardada es más nueva', 409);
    const data = res.status === 204 ? null : await res.json();
    if (!ok.includes(res.status)) throw error('http', (data && data.message) || `HTTP ${res.status}`, res.status);
    return data;
  }
  async function raw(ruta, ref) {
    const res = await f(`${api}${base}/contents/${rutaUrl(ruta)}?ref=${encodeURIComponent(ref)}`, { headers: cabeceras('application/vnd.github.raw') });
    if (res.status === 404) throw error('not-found', `no existe ${ruta}`, 404);
    if (res.status === 401) throw error('auth', 'el token no es válido o no tiene permisos', 401);
    if (!res.ok) throw error('http', `HTTP ${res.status} al leer ${ruta}`, res.status);
    return new Uint8Array(await res.arrayBuffer());
  }
  /** sha de un fichero en una rama, o null si no existe. */
  async function shaDe(ruta, ref) {
    try { return (await req(`${base}/contents/${rutaUrl(ruta)}?ref=${encodeURIComponent(ref)}`)).sha; } catch (e) { if (e.code === 'not-found') return null; throw e; }
  }
  async function escribir(ruta, bytes, ref, mensaje, { sobrescribir = true } = {}) {
    const sha = await shaDe(ruta, ref);
    if (sha && !sobrescribir) return { creado: false };
    await req(`${base}/contents/${rutaUrl(ruta)}`, {
      method: 'PUT', ok: [200, 201],
      body: { message: mensaje, content: bytesAb64(bytes), branch: ref, ...(sha ? { sha } : {}) },
    });
    return { creado: true };
  }

  async function leerJuego(id) {
    return req(`${base}/contents/${RUTA(id)}?ref=${encodeURIComponent(rama(id))}`);
  }
  async function latestRev(id) {
    return (await leerJuego(id)).sha;
  }
  async function load(id) {
    const d = await leerJuego(id);
    return { game: JSON.parse(b64aTexto(d.content)), rev: d.sha };
  }
  const juegoEn = (id, ruta) => normalizar(`games/${id}/${ruta}`);

  return {
    tipo: 'github',

    /** Juegos: las ramas juego/<id>, con lo que el inicio necesita de cada game.json. */
    async list() {
      const ramas = await req(`${base}/branches?per_page=100`);
      const ids = ramas.map((b) => b.name).filter((n) => n.startsWith(PREFIJO)).map((n) => n.slice(PREFIJO.length));
      const juegos = await Promise.all(ids.map(async (id) => {
        try { return { id, game: (await load(id)).game }; } catch { return null; }
      }));
      return juegos.filter(Boolean).map(({ id, game }) => resumenDe(id, game));
    },

    load,
    latestRev,

    /** Guarda el juego sobre la rev leída. Devuelve { rev } nueva o lanza { code: 'conflict' }. */
    async save(id, game, rev, mensaje) {
      const actual = await latestRev(id);
      if (actual !== rev) throw error('conflict', 'la versión guardada es más nueva: recarga el juego', 409);
      const d = await req(`${base}/contents/${RUTA(id)}`, {
        method: 'PUT', ok: [200, 201],
        body: { message: mensaje || `Actualizar ${id}`, content: textoAb64(JSON.stringify(game, null, 2) + '\n'), sha: rev, branch: rama(id) },
      });
      return { rev: d.content.sha };
    },

    /** Juego nuevo: rama juego/<id> desde main y su game.json. Lanza { code: 'exists' } si ya hay rama. */
    async create(id, game, mensaje) {
      try { await req(`${base}/git/ref/heads/${rutaUrl(rama(id))}`); throw error('exists', `ya existe el juego «${id}»`, 422); } catch (e) { if (e.code !== 'not-found') throw e; }
      const principal = await req(`${base}/git/ref/heads/${PRINCIPAL}`);
      await req(`${base}/git/refs`, { method: 'POST', ok: [201], body: { ref: `refs/heads/${rama(id)}`, sha: principal.object.sha } });
      const d = await req(`${base}/contents/${RUTA(id)}`, {
        method: 'PUT', ok: [201],
        body: { message: mensaje || `Crear ${id}`, content: textoAb64(JSON.stringify(game, null, 2) + '\n'), branch: rama(id) },
      });
      return { rev: d.content.sha };
    },

    /** Versiones del juego (commits de su fichero). */
    async history(id) {
      const cs = await req(`${base}/commits?sha=${encodeURIComponent(rama(id))}&path=${encodeURIComponent(RUTA(id))}&per_page=50`);
      return cs.map((c) => ({ rev: c.sha, date: c.commit.committer.date, author: (c.author && c.author.login) || c.commit.author.name, message: c.commit.message.split('\n')[0] }));
    },

    /** Bytes de un fichero de la carpeta del juego (ruta relativa a ella; se normaliza). Hasta 100 MB. */
    async leerFichero(id, ruta) { return raw(juegoEn(id, ruta), rama(id)); },
    async existeFichero(id, ruta) { return (await shaDe(juegoEn(id, ruta), rama(id))) !== null; },
    /** Escribe un fichero en la carpeta del juego (en su rama). sobrescribir: false = no toca uno que ya exista. */
    async escribirFichero(id, ruta, bytes, mensaje, opciones) { return escribir(juegoEn(id, ruta), bytes, rama(id), mensaje || `Fichero ${ruta} de ${id}`, opciones); },

    /** Colecciones de un tipo de la biblioteca (nombres de carpeta bajo biblioteca/<tipoDir>/). */
    async colecciones(tipoDir) {
      try {
        const lista = await req(`${base}/contents/biblioteca/${encodeURIComponent(tipoDir)}?ref=${PRINCIPAL}`);
        return lista.filter((x) => x.type === 'dir').map((x) => x.name).sort();
      } catch (e) { if (e.code === 'not-found') return []; throw e; }
    },
    async leerBiblioteca(ruta) { return raw(normalizar(`biblioteca/${ruta}`), PRINCIPAL); },
    async escribirBiblioteca(ruta, bytes, mensaje) { return escribir(normalizar(`biblioteca/${ruta}`), bytes, PRINCIPAL, mensaje || `Biblioteca: ${ruta}`); },

    /** Abre el pull request de la rama del juego hacia main. Si ya hay uno abierto, devuelve ese. */
    async submit(id, nota) {
      try {
        const pr = await req(`${base}/pulls`, { method: 'POST', ok: [201], body: { title: `Enviar ${id} al estudio`, head: rama(id), base: PRINCIPAL, body: nota || '' } });
        return { url: pr.html_url };
      } catch (e) {
        if (e.code === 'http' && e.status === 422) {
          const abiertos = await req(`${base}/pulls?state=open&head=${encodeURIComponent(`${owner}:${rama(id)}`)}`);
          if (abiertos.length) return { url: abiertos[0].html_url };
        }
        throw e;
      }
    },
  };
}

/** Lo que el inicio muestra de un juego (lo comparten los dos almacenes). */
export function resumenDe(id, game) {
  const paginas = game.schema === 'pme-game/2' ? (game.pages || []).length : ((game.template || {}).pages || []).length;
  const cambios = game.changes || [];
  const revisado = (game.review && game.review.changes) || 0;
  return {
    id, name: game.name, version: game.version, status: game.status, schema: game.schema, languages: game.languages,
    paginas, cambios: cambios.length, porRevisar: Math.max(0, cambios.length - revisado),
    ultimoCambio: cambios.length ? cambios[cambios.length - 1] : null,
    notasPendientes: (game.notes || []).filter((n) => !n.done).length,
  };
}
