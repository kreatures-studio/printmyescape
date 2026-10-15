#!/usr/bin/env node
// Prueba de las herramientas MCP de presupuestos, por stdio como lo haría Claude Code: tarifas, crear un presupuesto
// «con un prompt» (conceptos y complejidades, señalando dónde va cada cosa en el escape), cambiarlo, exportarlo a PDF y
// Excel, y subirlo/traerlo de la rama principal de un origin de prueba.
//
// Uso: node mcp/test-presupuestos.mjs <carpeta de prueba>      (código 0 si todo pasa)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(AQUI, '..');
const RES = [];
const rec = (nombre, ok, detalle = '') => { RES.push(Boolean(ok)); console.log((ok ? 'OK    ' : 'FALLO ') + nombre + (!ok && detalle ? ` | ${detalle}` : '')); };
const git = (cwd, ...a) => { const r = spawnSync('git', a, { cwd, encoding: 'utf8' }); if (r.status) throw new Error(`git ${a.join(' ')}: ${r.stderr}`); return r.stdout.trim(); };

async function llamar(cliente, name, args = {}) {
  const r = await cliente.callTool({ name, arguments: args });
  const texto = (r.content || []).map((c) => c.text || '').join('');
  let data;
  try { data = JSON.parse(texto); } catch { data = texto; }
  return r.isError ? { ok: false, error: data } : { ok: true, data };
}
async function ok(cliente, name, args) {
  const r = await llamar(cliente, name, args);
  if (!r.ok) throw new Error(`${name} falló: ${r.error.code}: ${r.error.message}${r.error.detalles ? ' ' + JSON.stringify(r.error.detalles).slice(0, 600) : ''}`);
  return r.data;
}

async function main() {
  const base = path.resolve(process.argv[2] || 'salidas/mcp-presupuestos');
  const origen = path.join(base, 'origen.git');
  const repo = path.join(base, 'repo');
  const otra = path.join(base, 'otra');
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(base, { recursive: true });
  git(base, 'init', '-q', '--bare', '-b', 'main', origen);
  git(base, 'clone', '-q', origen, repo);
  for (const d of [repo]) { git(d, 'config', 'user.email', 'prueba@example.com'); git(d, 'config', 'user.name', 'Prueba'); }
  fs.cpSync(path.join(ROOT, 'ensayos', 'f3', 'cumple-mision-secreta'), path.join(repo, 'games', 'cumple-mision-secreta'), { recursive: true });
  // El creador ya tiene un presupuesto en la rama principal (P-2026-001).
  fs.mkdirSync(path.join(repo, 'presupuestos'));
  fs.copyFileSync(path.join(ROOT, 'ensayos', 'f5', 'presupuestos', 'P-2026-001.json'), path.join(repo, 'presupuestos', 'P-2026-001.json'));
  git(repo, 'add', '.'); git(repo, 'commit', '-qm', 'inicio'); git(repo, 'push', '-q', 'origin', 'HEAD:main');
  // Claude trabaja en una rama de juego: los presupuestos se suben a main sin cambiar de rama.
  git(repo, 'checkout', '-qb', 'juego/cumple');
  fs.rmSync(path.join(repo, 'presupuestos'), { recursive: true });

  const env = { ...process.env, PME_BIBLIOTECA: path.join(ROOT, 'biblioteca') };
  delete env.PME_KIT;
  const cliente = new Client({ name: 'prueba-presupuestos', version: '0.1.0' });
  await cliente.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(AQUI, 'server.mjs')], cwd: repo, env, stderr: 'pipe' }));
  try {
    const nombres = (await cliente.listTools()).tools.map((t) => t.name);
    const nuevas = ['list_budgets', 'get_budget', 'get_rates', 'set_rates', 'create_budget', 'update_budget', 'export_budget', 'sync_budgets'];
    rec('el servidor anuncia las herramientas de presupuestos', nuevas.every((n) => nombres.includes(n)), nuevas.filter((n) => !nombres.includes(n)).join(' '));

    const pull = await ok(cliente, 'sync_budgets', { direction: 'pull' });
    rec('sync_budgets pull trae los presupuestos de main', pull.traidos.includes('P-2026-001.json'), JSON.stringify(pull));
    rec('list_budgets los lista con su total', (await ok(cliente, 'list_budgets')).some((p) => p.id === 'P-2026-001' && p.total > 0));

    const tf = await ok(cliente, 'get_rates');
    const prop = tf.conceptos.find((c) => c.id === 'prop');
    rec('get_rates: tarifas nuevas (prop 15/30/60/75 €, programación 50 €/h)', prop && prop.precios.sencilla === 15 && prop.precios.media === 30 && prop.precios.compleja === 60
      && prop.precios['muy-compleja'] === 75 && tf.perfiles.programacion.tarifa === 50, JSON.stringify(prop && prop.precios));
    const gd = tf.conceptos.find((c) => c.id === 'gamedesign-puzzle');
    rec('get_rates: game design por puzzle 60/105/210 €', gd && gd.precios.sencilla === 60 && gd.precios.media === 105 && gd.precios.compleja === 210);

    // «Presupuéstame un puzzle nuevo de dificultad media con un prop complejo, en la página 5»
    const p = await ok(cliente, 'create_budget', {
      titulo: 'Puzzle nuevo de las huellas', cliente: 'Familia García', juego: 'cumple-mision-secreta', gestion: 0,
      lineas: [
        { concepto: 'prop', complejidad: 'compleja', descripcion: 'Lupa con huellas', anclas: [{ pagina: 'p5', x: 30, y: 40 }] },
        { concepto: 'prop', complejidad: 'sencilla', cantidad: 2, descripcion: 'Retocar polaroid', anclas: [{ pagina: 'p1', elemento: 'p1-e4' }] },
        { concepto: 'gamedesign-puzzle', complejidad: 'media', descripcion: 'Diseño del puzzle de las huellas' },
        { concepto: 'programacion-puzzle', complejidad: 'media', descripcion: 'Programar el puzzle' },
        { concepto: 'gamedesign-testing' },
      ],
    });
    rec('create_budget numera el siguiente (P-2026-002)', p.id === 'P-2026-002', p.id);
    // 60 + 2×15 + 105 + 100 + 90 = 385 → IVA 21 % = 465,85
    rec('create_budget: importes con las tarifas nuevas (base 385, total 465,85)', p.totales.base === 385 && Math.abs(p.totales.total - 465.85) < 0.005, JSON.stringify(p.totales));
    rec('cada línea lleva número y anclas', p.lineas.map((l) => l.n).join() === '1,2,3,4,5' && p.lineas.filter((l) => l.anclas).length === 2);
    const mala = await llamar(cliente, 'create_budget', { titulo: 'x', juego: 'cumple-mision-secreta', lineas: [{ concepto: 'prop', anclas: [{ pagina: 'p99' }] }] });
    rec('create_budget rechaza una ancla en una página que no existe', !mala.ok && /p99/.test(mala.error.message));
    const malo = await llamar(cliente, 'create_budget', { titulo: 'x', lineas: [{ concepto: 'ilustracion' }] });
    rec('create_budget rechaza un concepto que no está en las tarifas', !malo.ok && /ilustracion/.test(malo.error.message));

    const lupa = p.lineas.find((l) => l.descripcion === 'Lupa con huellas');
    const testing = p.lineas.find((l) => l.concepto === 'gamedesign-testing');
    const u = await ok(cliente, 'update_budget', { id: p.id, cambios: { estado: 'enviado', descuento: 10 },
      cambiar: [{ linea: lupa.id, complejidad: 'muy-compleja' }], quitar: [testing.n], anadir: [{ concepto: 'programacion-ajustes', descripcion: 'Pregunta nueva del formulario' }] });
    // 75 + 30 + 105 + 100 + 50 = 360; −10 % = 324; IVA → 392,04
    rec('update_budget: complejidad, quitar por número, añadir y descuento (total 392,04)', Math.abs(u.totales.total - 392.04) < 0.005 && u.estado === 'enviado', JSON.stringify(u.totales));

    const tema = await ok(cliente, 'create_budget', { titulo: 'Cambio de tema', juego: 'cumple-mision-secreta', empezar: 'tema', tema: 'Bosque' });
    const conceptos = tema.lineas.map((l) => l.concepto).sort().join();
    rec('create_budget empezar=tema: ajustes, una línea de props con cada pieza señalada y testing', conceptos === 'gamedesign-testing,programacion-ajustes,prop'
      && tema.lineas.find((l) => l.concepto === 'prop').anclas.length > 0, conceptos);

    const ex = await ok(cliente, 'export_budget', { id: u.id });
    const pdf = fs.readFileSync(ex.pdf);
    const xlsx = fs.readFileSync(ex.xlsx);
    rec('export_budget escribe un PDF con las páginas del escape (anexo) y un Excel', pdf.subarray(0, 5).toString() === '%PDF-' && xlsx.subarray(0, 2).toString() === 'PK' && !ex.aviso,
      JSON.stringify(ex));
    const PDFLib = createRequire(path.join(ROOT, 'tools', 'game', 'fuentes.cjs'))('pdf-lib');
    const paginas = (await PDFLib.PDFDocument.load(pdf)).getPageCount();
    rec('el PDF tiene el presupuesto y el anexo «Dónde va cada cosa»', paginas >= 2, `páginas ${paginas}`);

    const tr = await ok(cliente, 'set_rates', { perfiles: { arte: { tarifa: 35 } }, conceptos: [{ id: 'mural', nombre: 'Mural a doble página', seccion: 'arte', perfil: 'arte', unidad: 'pieza', horas: 6 }] });
    const tf2 = await ok(cliente, 'get_rates');
    rec('set_rates cambia la tarifa de arte y añade un concepto', tr.conceptos.includes('mural') && tf2.conceptos.find((c) => c.id === 'prop').precios.media === 35);
    const viejo = await ok(cliente, 'get_budget', { id: u.id });
    rec('los presupuestos ya hechos no cambian al cambiar las tarifas', Math.abs(viejo.totales.total - 392.04) < 0.005);

    const rama = git(repo, 'rev-parse', '--abbrev-ref', 'HEAD');
    const push = await ok(cliente, 'sync_budgets', { direction: 'push', message: 'Presupuestos de prueba' });
    rec('sync_budgets push sube a main sin cambiar la rama del juego', push.status === 'ok' && git(repo, 'rev-parse', '--abbrev-ref', 'HEAD') === rama
      && git(repo, 'ls-tree', '--name-only', 'origin/main', 'presupuestos/').split('\n').includes('presupuestos/P-2026-002.json'), JSON.stringify(push));
    rec('push deja el árbol de trabajo como estaba (nada confirmado en la rama del juego)', !git(repo, 'log', '--oneline', 'main..HEAD'));

    // Otra persona (el creador) cambia P-2026-002 en main después: push se niega hasta hacer pull.
    git(base, 'clone', '-q', origen, otra);
    git(otra, 'config', 'user.email', 'o@example.com'); git(otra, 'config', 'user.name', 'Otra');
    const f = path.join(otra, 'presupuestos', 'P-2026-002.json');
    const j = JSON.parse(fs.readFileSync(f, 'utf8')); j.titulo = 'Cambiado en el creador'; j.actualizado = '2099-01-01T00:00:00.000Z';
    fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
    git(otra, 'commit', '-qam', 'creador'); git(otra, 'push', '-q', 'origin', 'HEAD:main');
    await ok(cliente, 'update_budget', { id: 'P-2026-002', cambios: { descripcion: 'cambio local' } });
    const choque = await llamar(cliente, 'sync_budgets', { direction: 'push' });
    rec('push se niega si en main hay una versión más nueva', !choque.ok && choque.error.code === 'conflicto', JSON.stringify(choque.error));
    const pull2 = await ok(cliente, 'sync_budgets', { direction: 'pull' });
    rec('pull trae la versión más nueva del creador', pull2.traidos.includes('P-2026-002.json') && (await ok(cliente, 'get_budget', { id: 'P-2026-002' })).titulo === 'Cambiado en el creador');
  } finally {
    await cliente.close();
  }
  const fallos = RES.filter((r) => !r).length;
  console.log(`\n${RES.length - fallos}/${RES.length} comprobaciones`);
  process.exit(fallos ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
