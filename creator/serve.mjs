#!/usr/bin/env node
// Servidor local del editor (T5.1 de PLAN-CREADOR.md). Sirve la raíz del repo para que el editor
// lea el motor, las mecánicas, el kit y los juegos con rutas relativas.
// Uso: node creator/serve.mjs [--port 8080] [--raiz docs]   →  http://localhost:8080/creator/index.html
// Con --raiz docs se sirve la copia publicada (docs/creador/, T5.7) y el editor queda en /creador/.
// No es el despliegue: GitHub Pages sirve docs/.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};

/** Ruta del disco para una URL, o null si sale de la raíz o pasa por .git / node_modules. */
export function rutaDe(urlPath, raiz = ROOT) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.endsWith('/')) p += 'index.html';
  const abs = path.resolve(raiz, '.' + p);
  if (abs !== raiz && !abs.startsWith(raiz + path.sep)) return null;
  const rel = path.relative(raiz, abs).split(path.sep);
  if (rel.some((seg) => seg === '.git' || seg === 'node_modules')) return null;
  return abs;
}

/** Arranca el servidor. Devuelve { server, url }. Puerto 0 = uno libre. */
export function servir(port = 8080, host = '127.0.0.1', raiz = ROOT) {
  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (req.url === '/' || req.url.startsWith('/?')) { res.writeHead(302, { Location: '/creator/index.html' }); return res.end(); }
    const abs = rutaDe(req.url, raiz);
    if (!abs || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) { res.writeHead(404); return res.end('no encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(abs).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => resolve({ server, url: `http://${host}:${server.address().port}` }));
  });
}

const esCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCLI) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : 8080;
  const r = process.argv.indexOf('--raiz');
  const raiz = r >= 0 ? path.resolve(ROOT, process.argv[r + 1]) : ROOT;
  servir(port, '127.0.0.1', raiz).then(({ url }) => console.log(`editor en ${url}/${r >= 0 ? 'creador' : 'creator'}/index.html`));
}
