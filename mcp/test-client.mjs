#!/usr/bin/env node
// Prueba del servidor MCP (T6.5 de PLAN-CREADOR.md). Arranca mcp/server.mjs por stdio como lo haría
// Claude Code, y llama a cada herramienta de 3.3 sobre un repositorio de juegos.
//
// Uso:
//   node mcp/test-client.mjs --nuevo <carpeta>            crea un repositorio de juegos de prueba
//                                                         (copia local + origin local) y lo prueba
//   node mcp/test-client.mjs --repo <carpeta> [--kit <manifest.json>]
//                                                         prueba un repositorio existente
// --kit cambia el manifiesto del kit que usa el servidor (PME_KIT). Sin --kit, el del motor.
// Aceptación (T6.5): crea un juego de 2 páginas con piezas del kit, lo valida en borrador sin errores
// y genera su vista previa. Código 0 si todo pasa; 1 si no.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SERVIDOR = path.join(AQUI, 'server.mjs');
const RES = [];
const ID = 'prueba-mcp';

function rec(nombre, ok, detalle = '') {
  RES.push(Boolean(ok));
  console.log((ok ? 'OK    ' : 'FALLO ') + nombre + (detalle ? ` | ${detalle}` : ''));
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Repositorio de juegos nuevo: copia local con games/ y un origin local (bare) con la rama main. */
function crearRepo(carpeta) {
  const origen = `${carpeta}-origin.git`;
  fs.rmSync(carpeta, { recursive: true, force: true });
  fs.rmSync(origen, { recursive: true, force: true });
  fs.mkdirSync(carpeta, { recursive: true });
  git(['init', '--bare', '-b', 'main', origen], os.tmpdir());
  git(['init', '-b', 'main'], carpeta);
  git(['config', 'user.email', 'prueba@local'], carpeta);
  git(['config', 'user.name', 'Prueba MCP'], carpeta);
  fs.mkdirSync(path.join(carpeta, 'games'), { recursive: true });
  fs.writeFileSync(path.join(carpeta, 'games', '.gitkeep'), '');
  git(['add', '.'], carpeta);
  git(['commit', '-m', 'Repositorio de juegos de prueba'], carpeta);
  git(['remote', 'add', 'origin', origen], carpeta);
  git(['push', '-u', 'origin', 'main'], carpeta);
  return carpeta;
}

async function conectar(repo, kit) {
  const env = { ...process.env };
  if (kit) env.PME_KIT = path.resolve(kit);
  const transporte = new StdioClientTransport({ command: process.execPath, args: [SERVIDOR], cwd: repo, env, stderr: 'pipe' });
  const cliente = new Client({ name: 'prueba-mcp', version: '0.1.0' });
  await cliente.connect(transporte);
  return cliente;
}

/** Llama a una herramienta. Devuelve { ok, data, error } con el JSON de la respuesta. */
async function llamar(cliente, name, args = {}) {
  const r = await cliente.callTool({ name, arguments: args });
  const texto = (r.content || []).map((c) => c.text || '').join('');
  let data;
  try { data = JSON.parse(texto); } catch { data = texto; }
  if (r.isError) return { ok: false, error: data };
  return { ok: true, data };
}

const ok = async (cliente, name, args) => {
  const r = await llamar(cliente, name, args);
  if (!r.ok) throw new Error(`${name} falló: ${r.error.code}: ${r.error.message}${r.error.detalles ? ' ' + JSON.stringify(r.error.detalles) : ''}`);
  return r.data;
};

async function main() {
  const args = process.argv.slice(2);
  const val = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
  const nuevo = val('--nuevo');
  const repo = nuevo ? crearRepo(path.resolve(nuevo)) : path.resolve(val('--repo') || process.cwd());
  const kit = val('--kit');
  const cliente = await conectar(repo, kit);
  try {
    const herr = await cliente.listTools();
    const nombres = herr.tools.map((t) => t.name);
    // 21 de PLAN-CREADOR.md §3.3, 12 de PLAN-CREADOR-2.md §2.4 e insert_section (F3.1). El flujo v2: mcp/test-v2.mjs.
    rec('el servidor anuncia las 37 herramientas (3.3, 2.4, insert_section, update_puzzle, remove_puzzle y set_theme)', nombres.length === 37, nombres.join(' '));

    rec('list_games: repositorio vacío', (await ok(cliente, 'list_games')).length === 0);

    // Juego de 2 páginas con piezas del kit.
    const creado = await ok(cliente, 'create_game', { id: ID, name: 'Prueba MCP', languages: ['es', 'en'], pages: 2, format: 'v1' });
    rec('create_game: juego de 2 páginas en borrador', creado.status === 'borrador' && creado.paginas === 2, JSON.stringify(creado.name));

    const piezas = await ok(cliente, 'list_assets');
    rec('list_assets: el kit tiene piezas', piezas.length > 0, `${piezas.length} piezas`);
    if (!piezas.length) throw new Error('el kit está vacío: la aceptación necesita piezas (usa --kit con un manifiesto que tenga piezas)');
    const pieza = (id) => piezas.find((p) => p.id === id) || piezas[0];
    const rojo = pieza('prueba-rojo').id;
    const azul = pieza('prueba-azul').id;
    const fondo = pieza('prueba-degradado').id;
    rec('list_assets: filtro por etiqueta', (await ok(cliente, 'list_assets', { tag: 'prueba' })).length >= 1);

    const mecanicas = await ok(cliente, 'list_mechanics');
    rec('list_mechanics: hay mecánicas registradas', mecanicas.length > 0, mecanicas.map((m) => m.type).join(', '));

    await ok(cliente, 'set_page', { id: ID, page: 'p1', layers: [
      { asset: rojo, x: 5, y: 55, w: 40, h: 25 },
      { asset: azul, x: 55, y: 55, w: 30, h: 30, angle: 30 },
    ] });
    await ok(cliente, 'set_page', { id: ID, page: 'p2', layers: [{ asset: fondo, x: 0, y: 0, w: 100, h: 100 }] });
    rec('set_page: dos páginas con capas del kit', true);

    await ok(cliente, 'upsert_field', { id: ID, field: 'NOMBRE_1', def: { type: 'name', required: true, cap: 12, q: { es: 'Nombre', en: 'Name' } } });
    await ok(cliente, 'upsert_slot', { id: ID, page: 'p1', slot: { field: 'NOMBRE_1', x: 10, y: 10, w: 40, h: 8, size: 6, color: '#000000', fontFamily: 'Caveat' } });
    await ok(cliente, 'set_sections', { id: ID, sections: [{ id: 's1', title: { es: 'Persona 1', en: 'Person 1' }, nameField: 'NOMBRE_1', fields: ['NOMBRE_1'] }] });
    await ok(cliente, 'set_texts', { id: ID, lang: 'es', entries: { TITULO: 'Prueba' } });
    await ok(cliente, 'set_texts', { id: ID, lang: 'en', entries: { TITULO: 'Test' } });
    await ok(cliente, 'set_example', { id: ID, example: { id: '1', values: { es: { NOMBRE_1: 'Isabel' }, en: { NOMBRE_1: 'Isabel' } } } });
    rec('upsert_field, upsert_slot, set_sections, set_texts y set_example', true);

    const resumen = await ok(cliente, 'get_game', { id: ID });
    rec('get_game summary: 2 páginas, 1 campo, 1 ejemplo', resumen.paginas === 2 && resumen.campos === 1 && resumen.ejemplos === 1, JSON.stringify(resumen));
    for (const parte of ['form', 'fields', 'pages', 'mechanics', 'full']) {
      const r = await llamar(cliente, 'get_game', { id: ID, part: parte });
      rec(`get_game ${parte}`, r.ok);
    }

    const borrador = await ok(cliente, 'validate_game', { id: ID, mode: 'draft' });
    rec('ACEPTACIÓN: validate_game en borrador sin errores', borrador.errors.length === 0, borrador.errors.join(' | ') || `${borrador.warnings.length} aviso(s)`);

    const limites = await ok(cliente, 'measure_limits', { id: ID });
    rec('measure_limits: el campo tiene capacidad y límite', limites && limites.NOMBRE_1 && limites.NOMBRE_1.limite > 0,
      limites && limites.NOMBRE_1 ? `límite ${limites.NOMBRE_1.limite}` : '');

    const vista = await ok(cliente, 'render_preview', { id: ID, lang: 'es', example: '1', pages: [1] });
    const pdf = path.join(repo, vista.pdf);
    rec('ACEPTACIÓN: render_preview genera el PDF con marca BORRADOR', fs.existsSync(pdf) && vista.paginas === 2, `${vista.pdf}, ${vista.paginas} páginas`);
    if (vista.aviso) console.log(`      aviso: ${vista.aviso}`);
    else rec('render_preview: PNG de la página pedida', vista.png.length === 1 && fs.existsSync(path.join(repo, vista.png[0])), vista.png.join(' '));

    // Negativos: un estado inválido no se guarda.
    const malo = await llamar(cliente, 'upsert_field', { id: ID, field: 'MALO', def: { type: 'tipo-inventado', required: false, q: { es: 'x' } } });
    rec('upsert_field con un tipo inválido se rechaza', !malo.ok && malo.error.code === 'invalido');
    const mecMala = await llamar(cliente, 'upsert_mechanic', { id: ID, mechanic: { type: 'inventada', page: 'p1', params: {} } });
    rec('upsert_mechanic con una mecánica desconocida se rechaza', !mecMala.ok && mecMala.error.code === 'invalido');
    const sinPagina = await llamar(cliente, 'remove_slot', { id: ID, page: 'p9', slot: 'NOMBRE_1' });
    rec('remove_slot en una página que no existe da not-found', !sinPagina.ok && sinPagina.error.code === 'not-found');
    const despues = await ok(cliente, 'get_game', { id: ID, part: 'fields' });
    rec('los rechazos no cambian el juego', Object.keys(despues).length === 1 && !('MALO' in despues));

    // Quitar y volver a poner un hueco, y un campo que aún usa un hueco no se puede quitar.
    await ok(cliente, 'remove_slot', { id: ID, page: 'p1', slot: 'NOMBRE_1' });
    await ok(cliente, 'upsert_slot', { id: ID, page: 'p1', slot: { field: 'NOMBRE_1', x: 10, y: 10, w: 40, h: 8, size: 6, color: '#000000', fontFamily: 'Caveat' } });
    const campoEnUso = await llamar(cliente, 'remove_field', { id: ID, field: 'NOMBRE_1' });
    rec('remove_field de un campo con hueco se rechaza', !campoEnUso.ok && campoEnUso.error.code === 'invalido');

    // Para enviar: sin soluciones no pasa la validación (el envío no llega a GitHub).
    const enviar = await llamar(cliente, 'validate_game', { id: ID, mode: 'submit' });
    rec('validate_game en modo submit: pide soluciones', enviar.ok && enviar.data.errors.some((e) => /soluci/.test(e)));
    const sub = await llamar(cliente, 'submit_to_studio', { id: ID, note: 'Prueba' });
    rec('submit_to_studio sin requisitos o sin gh no cambia el juego', !sub.ok && (sub.error.code === 'invalido' || sub.error.code === 'sin-gh'),
      sub.ok ? '' : sub.error.code);

    // Sincronización con el origin local.
    const subida = await ok(cliente, 'sync', { id: ID, direction: 'push', message: 'Prueba MCP: juego de 2 páginas' });
    rec('sync push: confirma y sube juego/prueba-mcp', subida.status === 'ok', `commit ${subida.commit}`);
    const bajada = await ok(cliente, 'sync', { id: ID, direction: 'pull' });
    rec('sync pull: la rama ya está al día', bajada.status === 'ok');

    const lista = await ok(cliente, 'list_games');
    rec('list_games: aparece el juego', lista.some((j) => j.id === ID && j.status === 'borrador'));
  } finally {
    await cliente.close();
  }

  // Conflicto (T6.3): dos copias locales editan el mismo juego. La segunda no sube (rechazado) y, al
  // traer cambios, para y lo explica sin dejar la copia a medias.
  if (nuevo) {
    const origen = `${repo}-origin.git`;
    const copia = `${repo}-b`;
    fs.rmSync(copia, { recursive: true, force: true });
    git(['clone', '-q', origen, copia], os.tmpdir());
    git(['config', 'user.email', 'prueba@local'], copia);
    git(['config', 'user.name', 'Prueba MCP B'], copia);
    git(['checkout', '-q', `juego/${ID}`], copia);
    const a = await conectar(repo, kit);
    const b = await conectar(copia, kit);
    try {
      await ok(a, 'set_texts', { id: ID, lang: 'es', entries: { TITULO: 'Cambio desde A' } });
      await ok(a, 'sync', { id: ID, direction: 'push', message: 'A cambia el título' });
      await ok(b, 'set_texts', { id: ID, lang: 'es', entries: { TITULO: 'Cambio desde B' } });
      const rech = await llamar(b, 'sync', { id: ID, direction: 'push', message: 'B cambia el título' });
      rec('sync push desde B rechazado si origin tiene cambios nuevos', !rech.ok && rech.error.code === 'rechazado', rech.ok ? '' : rech.error.code);
      const conf = await llamar(b, 'sync', { id: ID, direction: 'pull' });
      rec('sync pull con conflicto: para y lo explica', !conf.ok && conf.error.code === 'conflicto', conf.ok ? '' : conf.error.code);
      const estado = git(['status', '--porcelain'], copia);
      rec('tras el conflicto la copia queda limpia (rebase abortado)', estado === '' && !fs.existsSync(path.join(copia, '.git', 'rebase-merge')) && !fs.existsSync(path.join(copia, '.git', 'rebase-apply')));
    } finally {
      await a.close();
      await b.close();
    }
  }
  const total = RES.length;
  const bien = RES.filter(Boolean).length;
  console.log(`\nRESUMEN: ${bien}/${total} OK`);
  return bien === total ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('FALLO', e.message); process.exit(1); });
