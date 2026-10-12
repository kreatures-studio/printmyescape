// Almacén de archivos del servidor MCP local (contrato 3.5, implementación store-fs).
// Los juegos son games/<id>/game.json dentro de la copia local del repositorio de juegos.
// rev = hash SHA-256 del contenido del archivo: si cambia en disco (o en otra copia que llega con
// sync pull), save() devuelve «conflict» y no pisa nada. La rama juego/<id> y los commits los maneja
// sync (herramientas.mjs), no este almacén.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const RE_ID = /^[a-z0-9][a-z0-9-]*$/;

export class ErrorAlmacen extends Error {
  constructor(code, message) {
    super(message);
    this.code = code; // 'conflict' | 'not-found' | 'invalid' | 'exists'
  }
}

function hashDe(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex');
}

function nombreDe(game) {
  if (!game.name || typeof game.name !== 'object') return game.id;
  return game.name.es ?? Object.values(game.name)[0] ?? game.id;
}

/** Almacén sobre la carpeta `raiz` (la copia local del repositorio de juegos). */
export function crearAlmacenFs(raiz) {
  const dirJuegos = path.join(raiz, 'games');

  function comprobarId(id) {
    if (typeof id !== 'string' || !RE_ID.test(id)) throw new ErrorAlmacen('invalid', `id de juego no válido: «${id}»`);
  }
  function carpeta(id) { comprobarId(id); return path.join(dirJuegos, id); }
  function fichero(id) { return path.join(carpeta(id), 'game.json'); }

  function leerTexto(id) {
    const f = fichero(id);
    if (!fs.existsSync(f)) return null;
    return fs.readFileSync(f, 'utf8');
  }

  return {
    /** Carpeta del juego (dir) y la raíz de la copia local. */
    carpeta,
    raiz,

    async list() {
      if (!fs.existsSync(dirJuegos)) return [];
      const ids = fs.readdirSync(dirJuegos).filter((n) => RE_ID.test(n) && fs.existsSync(path.join(dirJuegos, n, 'game.json')));
      return ids.sort().map((id) => {
        const g = JSON.parse(fs.readFileSync(fichero(id), 'utf8'));
        return { id, name: g.name, version: g.version, status: g.status };
      });
    },

    async load(id) {
      const texto = leerTexto(id);
      if (texto === null) throw new ErrorAlmacen('not-found', `no existe el juego «${id}»`);
      return { game: JSON.parse(texto), rev: hashDe(texto) };
    },

    async latestRev(id) {
      const texto = leerTexto(id);
      return texto === null ? null : hashDe(texto);
    },

    /** rev null = juego nuevo (solo si no existe). En otro caso, rev tiene que ser la del archivo. */
    async save(id, game, rev, _mensaje) {
      const actual = leerTexto(id);
      if (rev === null || rev === undefined) {
        if (actual !== null) throw new ErrorAlmacen('exists', `ya existe el juego «${id}»`);
      } else if (actual === null) {
        throw new ErrorAlmacen('not-found', `no existe el juego «${id}»`);
      } else if (hashDe(actual) !== rev) {
        throw new ErrorAlmacen('conflict', 'el juego cambió en disco: vuelve a leerlo antes de guardar');
      }
      const texto = JSON.stringify(game, null, 2) + '\n';
      fs.mkdirSync(carpeta(id), { recursive: true });
      fs.writeFileSync(fichero(id), texto, 'utf8');
      return { rev: hashDe(texto) };
    },

    /** Bytes de un fichero de la carpeta del juego (ruta relativa al game.json). No sale de la copia local. */
    async leerFichero(id, ruta) {
      const abs = path.resolve(carpeta(id), ruta);
      if (abs !== raiz && !abs.startsWith(raiz + path.sep)) throw new ErrorAlmacen('invalid', `ruta fuera del repositorio: ${ruta}`);
      if (!fs.existsSync(abs)) throw new ErrorAlmacen('not-found', `no existe «${ruta}»`);
      return fs.readFileSync(abs);
    },
  };
}
