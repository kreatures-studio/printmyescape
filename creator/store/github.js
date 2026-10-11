// Almacén del editor en GitHub (T5.2, contrato 3.5 de PLAN-CREADOR.md).
//
// Un juego es la rama `juego/<id>` del repositorio de juegos, con el fichero `games/<id>/game.json`.
// rev = sha del fichero en esa rama. save() nunca pisa una versión más nueva: si la rev no es la
// última, devuelve el error { code: 'conflict' } y el editor pide recargar.
// El token se pasa al crear el almacén; nunca va en una URL (solo en la cabecera Authorization).
//
// Errores: { code: 'auth' | 'not-found' | 'conflict' | 'http', status, message }.

const PREFIJO = 'juego/';
const RUTA = (id) => `games/${id}/game.json`;

function error(code, message, status = 0) {
  const e = new Error(message);
  e.code = code;
  e.status = status;
  return e;
}

/** Base64 de texto UTF-8 y al revés (la API de contenidos usa base64). */
export function textoAb64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64aTexto(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/**
 * Crea el almacén. opciones: { owner, repo, token, fetchFn?, api? }.
 * fetchFn y api se cambian en las pruebas (respuestas simuladas).
 */
export function crearAlmacenGitHub({ owner, repo, token, fetchFn, api = 'https://api.github.com' }) {
  const f = fetchFn || ((...a) => fetch(...a));
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const rama = (id) => PREFIJO + id;

  async function req(path, { method = 'GET', body, ok = [200] } = {}) {
    const cabeceras = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}` };
    if (body) cabeceras['Content-Type'] = 'application/json';
    const res = await f(api + path, { method, headers: cabeceras, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) throw error('auth', 'el token no es válido o no tiene permisos', 401);
    if (res.status === 404) throw error('not-found', `no existe ${path}`, 404);
    if (res.status === 409) throw error('conflict', 'la versión guardada es más nueva', 409);
    const data = res.status === 204 ? null : await res.json();
    if (!ok.includes(res.status)) throw error('http', (data && data.message) || `HTTP ${res.status}`, res.status);
    return data;
  }

  async function leerFichero(id) {
    return req(`${base}/contents/${RUTA(id)}?ref=${encodeURIComponent(rama(id))}`);
  }

  async function latestRev(id) {
    return (await leerFichero(id)).sha;
  }

  async function load(id) {
    const d = await leerFichero(id);
    return { game: JSON.parse(b64aTexto(d.content)), rev: d.sha };
  }

  return {
    /** Juegos: las ramas juego/<id>. name, version y status se leen de cada game.json. */
    async list() {
      const ramas = await req(`${base}/branches?per_page=100`);
      const ids = ramas.map((b) => b.name).filter((n) => n.startsWith(PREFIJO)).map((n) => n.slice(PREFIJO.length));
      return Promise.all(ids.map(async (id) => {
        const { game } = await load(id);
        return { id, name: game.name, version: game.version, status: game.status };
      }));
    },

    load,
    latestRev,

    /** Guarda el juego sobre la rev leída. Devuelve { rev } nueva o lanza { code: 'conflict' }. */
    async save(id, game, rev, mensaje) {
      const actual = await latestRev(id);
      if (actual !== rev) throw error('conflict', 'la versión guardada es más nueva: recarga el juego', 409);
      const d = await req(`${base}/contents/${RUTA(id)}`, {
        method: 'PUT', ok: [200, 201],
        body: { message: mensaje || `Actualizar ${id}`, content: textoAb64(JSON.stringify(game, null, 1) + '\n'), sha: rev, branch: rama(id) },
      });
      return { rev: d.content.sha };
    },

    /** Versiones del juego (commits de su fichero). rev aquí es el commit, no el sha del fichero. */
    async history(id) {
      const cs = await req(`${base}/commits?sha=${encodeURIComponent(rama(id))}&path=${encodeURIComponent(RUTA(id))}&per_page=50`);
      return cs.map((c) => ({
        rev: c.sha,
        date: c.commit.committer.date,
        author: (c.author && c.author.login) || c.commit.author.name,
        message: c.commit.message.split('\n')[0],
      }));
    },

    /** Abre el pull request de la rama del juego hacia main. Si ya hay uno abierto, devuelve ese. */
    async submit(id, nota) {
      try {
        const pr = await req(`${base}/pulls`, {
          method: 'POST', ok: [201],
          body: { title: `Enviar ${id} al estudio`, head: rama(id), base: 'main', body: nota || '' },
        });
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
