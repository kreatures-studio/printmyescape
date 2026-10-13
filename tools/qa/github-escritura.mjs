#!/usr/bin/env node
// Prueba de escritura del almacén de GitHub del creador (creator/store/github.js) contra la API real, con un token
// de verdad. La lanza el estudio (o Claude en su ordenador): desde la sesión de Claude en la nube la API no admite
// escrituras. No usa navegador: el mismo almacén del creador, en Node.
//
// Uso: node tools/qa/github-escritura.mjs --repo dueño/juegos [--principal rama] [--token-file .pme-token] [--mantener]
//   --token-file  fichero con el token (por defecto .pme-token en la raíz, que git ignora). El token no se escribe
//                 nunca en la salida. También vale la variable PME_TOKEN.
//   --principal   rama de la biblioteca y de los envíos (por defecto, la rama por defecto del repositorio).
//   --mantener    no borra lo que crea (para mirarlo en GitHub); si no, al terminar cierra el pull request y borra la
//                 rama del juego y el fichero de prueba de la biblioteca.
//
// Comprueba: permisos del token, lista de juegos, juego nuevo (rama juego/<id> desde la principal), cargar y guardar
// sobre su sha, conflicto con una versión vieja (no pisa nada), ficheros de la carpeta del juego (escribir, leer, no
// sobrescribir), escribir y leer en la biblioteca de la rama principal, historial y enviar al estudio (pull request; el
// segundo envío devuelve el mismo).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crearAlmacenGitHub } from '../../creator/store/github.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.github.com';
const RES = [];
const rec = (nombre, ok, detalle = '') => { RES.push(Boolean(ok)); console.log(`${ok ? 'OK   ' : 'FALLO'} ${nombre}${detalle ? ` | ${detalle}` : ''}`); };

function args() {
  const a = process.argv.slice(2);
  const val = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  return { repo: val('--repo'), principal: val('--principal'), tokenFile: val('--token-file') || path.join(ROOT, '.pme-token'), mantener: a.includes('--mantener') };
}

async function main() {
  const op = args();
  if (!op.repo || !/^[\w.-]+\/[\w.-]+$/.test(op.repo)) { console.error('uso: node tools/qa/github-escritura.mjs --repo dueño/juegos [--principal rama]'); process.exit(2); }
  const token = (process.env.PME_TOKEN || (fs.existsSync(op.tokenFile) ? fs.readFileSync(op.tokenFile, 'utf8') : '')).trim();
  if (!token) { console.error(`falta el token: ponlo en ${op.tokenFile} (una línea) o en PME_TOKEN`); process.exit(2); }
  const [owner, repo] = op.repo.split('/');
  const cab = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: `Bearer ${token}` };
  const api = async (ruta, { method = 'GET', body } = {}) => {
    const r = await fetch(API + ruta, { method, headers: body ? { ...cab, 'Content-Type': 'application/json' } : cab, body: body ? JSON.stringify(body) : undefined });
    const texto = await r.text();
    return { status: r.status, data: texto ? JSON.parse(texto) : null };
  };
  const base = `/repos/${owner}/${repo}`;
  const id = `prueba-escritura-${new Date().toISOString().replace(/\D/g, '').slice(8, 14)}`;
  const rama = `juego/${id}`;
  const fichBib = 'arte/_prueba-creador/leeme.txt';
  let pr = null;
  let principal = op.principal;

  try {
    const info = await api(base);
    if (info.status === 401) { rec('el token vale', false, 'GitHub responde 401: caducado o mal copiado'); return; }
    if (info.status === 404) { rec('el token ve el repositorio', false, 'GitHub responde 404: el token no tiene acceso a ese repositorio'); return; }
    principal = principal || info.data.default_branch;
    rec('el token ve el repositorio', true, `${info.data.full_name} · ${info.data.private ? 'privado' : 'PÚBLICO'} · rama principal ${principal}`);
    rec('el token puede escribir', info.data.permissions ? info.data.permissions.push : true, JSON.stringify(info.data.permissions || {}));

    const almacen = crearAlmacenGitHub({ owner, repo, token, principal });
    const juegos = await almacen.list();
    rec('list: los juegos del repositorio', Array.isArray(juegos), `${juegos.length} juego(s): ${juegos.map((j) => j.id).join(', ') || 'ninguno'}`);
    const colecciones = await almacen.colecciones('arte');
    rec('biblioteca: colecciones de arte en la rama principal', true, colecciones.join(', ') || 'ninguna (la biblioteca está vacía)');

    const juego = { schema: 'pme-game/2', id, version: '0.1.0', status: 'borrador', name: { es: 'Prueba de escritura' }, languages: ['es'], pageSize: 'A4',
      pages: [{ id: 'p1', title: 'Página 1', background: { kind: 'color', value: '#FFFFFF' }, elements: [] }], i18n: { es: {} }, fields: {}, form: { sections: [] },
      mechanics: [], examples: [], solutions: [], puzzles: [], notes: [], changes: [] };
    const { rev: rev0 } = await almacen.create(id, juego, `Prueba de escritura del creador: ${id}`);
    const cargado = await almacen.load(id);
    rec('juego nuevo: rama juego/<id> desde la principal y su game.json', cargado.game.id === id && cargado.rev === rev0, rama);

    juego.name.es = 'Prueba de escritura (guardada)';
    const { rev: rev1 } = await almacen.save(id, juego, rev0, 'Prueba: guardar');
    rec('guardar sobre la versión leída', rev1 !== rev0 && (await almacen.latestRev(id)) === rev1);
    let conflicto = 'ninguno';
    try { await almacen.save(id, juego, rev0, 'Prueba: versión vieja'); } catch (e) { conflicto = e.code; }
    rec('guardar sobre una versión vieja: conflicto, sin pisar', conflicto === 'conflict' && (await almacen.latestRev(id)) === rev1, conflicto);

    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    await almacen.escribirFichero(id, 'fotos/prueba.png', bytes, 'Prueba: fichero del juego');
    const leido = await almacen.leerFichero(id, 'fotos/prueba.png');
    const otra = await almacen.escribirFichero(id, 'fotos/prueba.png', new Uint8Array([0]), 'Prueba: no sobrescribir', { sobrescribir: false });
    rec('ficheros del juego: escribir, leer y no sobrescribir', Buffer.from(leido).equals(Buffer.from(bytes)) && otra.creado === false && await almacen.existeFichero(id, 'fotos/prueba.png'));

    await almacen.escribirBiblioteca(fichBib, new TextEncoder().encode(`Fichero de prueba del creador (${id}). Se puede borrar.\n`), `Prueba de escritura del creador: ${id}`);
    const bib = new TextDecoder().decode(await almacen.leerBiblioteca(fichBib));
    rec('biblioteca: escribir y leer en la rama principal', bib.includes(id), `biblioteca/${fichBib}`);

    const historia = await almacen.history(id);
    rec('historial del juego', historia.length >= 2, `${historia.length} versiones`);

    const envio = await almacen.submit(id, 'Prueba de escritura del creador: se cierra sola.');
    pr = Number(envio.url.split('/').pop());
    const otra2 = await almacen.submit(id, 'otra vez');
    const prInfo = await api(`${base}/pulls/${pr}`);
    rec('enviar al estudio: pull request hacia la rama principal (y el segundo envío devuelve el mismo)', prInfo.data.base.ref === principal && prInfo.data.head.ref === rama && otra2.url === envio.url, envio.url);
  } catch (e) {
    rec('sin errores inesperados', false, `${e.code || ''} ${e.message}`.trim());
  } finally {
    if (!op.mantener) {
      const limpio = [];
      if (pr) limpio.push((await api(`${base}/pulls/${pr}`, { method: 'PATCH', body: { state: 'closed' } })).status === 200 ? 'pull request cerrado' : 'NO se cerró el pull request');
      const ref = await api(`${base}/git/refs/heads/${rama}`, { method: 'DELETE' });
      limpio.push(ref.status === 204 ? `rama ${rama} borrada` : ref.status === 422 || ref.status === 404 ? 'sin rama que borrar' : `NO se borró la rama (${ref.status})`);
      if (principal) {
        const f = await api(`${base}/contents/biblioteca/${fichBib}?ref=${encodeURIComponent(principal)}`);
        if (f.status === 200) {
          const del = await api(`${base}/contents/biblioteca/${fichBib}`, { method: 'DELETE', body: { message: `Quitar el fichero de prueba del creador (${id})`, sha: f.data.sha, branch: principal } });
          limpio.push(del.status === 200 ? 'fichero de prueba de la biblioteca borrado' : `NO se borró el fichero de prueba (${del.status})`);
        }
      }
      console.log(`\nLimpieza: ${limpio.join(' · ')}`);
    }
    const ok = RES.length && RES.every(Boolean);
    console.log(`\nRESUMEN: ${RES.filter(Boolean).length}/${RES.length} OK${ok ? '' : ' (fallos)'}`);
    process.exitCode = ok ? 0 : 1;
  }
}

main();
