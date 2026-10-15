#!/usr/bin/env node
// Prueba de las herramientas MCP de PLAN-CREADOR-2.md §2.4 (F3.1): componer un juego pme-game/2 desde cero con la
// biblioteca, por stdio como lo haría Claude Code. Trabaja sobre una copia de la biblioteca (PME_BIBLIOTECA), así
// que la real no cambia (se comprueba al final).
//
// Uso: node mcp/test-v2.mjs <carpeta de prueba>      (código 0 si todo pasa)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(AQUI, '..');
const SERVIDOR = path.join(AQUI, 'server.mjs');
const RES = [];
const ID = 'prueba-v2';
const rec = (nombre, ok, detalle = '') => { RES.push(Boolean(ok)); console.log((ok ? 'OK    ' : 'FALLO ') + nombre + (!ok && detalle ? ` | ${detalle}` : '')); };

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
const huellaBiblioteca = (dir) => {
  const h = crypto.createHash('sha256');
  const recorrer = (d) => { for (const n of fs.readdirSync(d).sort()) { const f = path.join(d, n); if (fs.statSync(f).isDirectory()) recorrer(f); else h.update(n).update(fs.readFileSync(f)); } };
  recorrer(dir);
  return h.digest('hex');
};

async function main() {
  const base = path.resolve(process.argv[2] || 'salidas/mcp-v2');
  const repo = path.join(base, 'repo');
  const biblioteca = path.join(base, 'biblioteca');
  fs.rmSync(base, { recursive: true, force: true });
  fs.mkdirSync(path.join(repo, 'games'), { recursive: true });
  fs.cpSync(path.join(ROOT, 'biblioteca'), biblioteca, { recursive: true });
  const huellaReal = huellaBiblioteca(path.join(ROOT, 'biblioteca'));
  const FINAL3 = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', 'final3', 'game.json'), 'utf8'));

  const env = { ...process.env, PME_BIBLIOTECA: biblioteca };
  delete env.PME_KIT;
  const cliente = new Client({ name: 'prueba-v2', version: '0.1.0' });
  await cliente.connect(new StdioClientTransport({ command: process.execPath, args: [SERVIDOR], cwd: repo, env, stderr: 'pipe' }));
  try {
    const nombres = (await cliente.listTools()).tools.map((t) => t.name);
    const nuevas = ['list_library', 'duplicate_game', 'insert_page', 'insert_section', 'add_element', 'update_element', 'remove_element',
      'add_puzzle', 'update_puzzle', 'remove_puzzle', 'import_art', 'create_vector_art', 'save_to_library', 'read_notes', 'write_change_summary', 'set_theme'];
    rec('el servidor anuncia las herramientas de §2.4 e insert_section', nuevas.every((n) => nombres.includes(n)), nuevas.filter((n) => !nombres.includes(n)).join(' '));

    // Biblioteca
    const arte = await ok(cliente, 'list_library', { tipo: 'arte' });
    const paginas = await ok(cliente, 'list_library', { tipo: 'pagina' });
    const secciones = await ok(cliente, 'list_library', { tipo: 'seccion' });
    const puzzles = await ok(cliente, 'list_library', { tipo: 'puzzle' });
    rec('list_library: arte, páginas, secciones y puzzles', arte.length >= 43 && paginas.length >= 1 && secciones.length >= 1 && puzzles.length === 6,
      `${arte.length}/${paginas.length}/${secciones.length}/${puzzles.length}`);
    rec('list_library: filtro por etiqueta', (await ok(cliente, 'list_library', { tipo: 'arte', tag: 'morado' })).every((p) => p.tags.includes('morado')));

    // Juego nuevo v2
    const creado = await ok(cliente, 'create_game', { id: ID, name: { es: 'Prueba v2', en: 'Test v2' }, languages: ['es', 'en'], pages: 0 });
    rec('create_game: juego v2 vacío', creado.schema === 'pme-game/2' && creado.paginas === 0);

    const sinCampos = await llamar(cliente, 'insert_page', { id: ID, from: 'ficha-cumpleanero' });
    rec('insert_page sin los campos: dice cuáles faltan y qué sección y puzzle los traen',
      !sinCampos.ok && sinCampos.error.code === 'faltan-campos' && /cumpleanero@1/.test(sinCampos.error.message) && /puzzle-prefix@1/.test(sinCampos.error.message),
      JSON.stringify(sinCampos.error).slice(0, 300));

    const sec = await ok(cliente, 'insert_section', { id: ID, from: 'cumpleanero' });
    rec('insert_section: campos, definiciones y ejemplos de la sección', sec.fields.includes('NOMBRE_CUMPLE') && sec.examples.length === 3 && sec.from === 'cumpleanero@1');
    const sosp = [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [`NOMBRE_${i}`, `APODO_${i}`]);
    for (const c of sosp) await ok(cliente, 'upsert_field', { id: ID, field: c, def: FINAL3.fields[c] });
    const form = await ok(cliente, 'get_game', { id: ID, part: 'form' });
    await ok(cliente, 'set_sections', { id: ID, sections: [...form.sections, { id: 'sospechosos', title: { es: 'Sospechosos', en: 'Suspects' }, fields: sosp }] });

    const p1 = await ok(cliente, 'insert_page', { id: ID, from: 'ficha-cumpleanero', puzzles: ['puzzle-prefix@1'] });
    rec('insert_page de la biblioteca con su puzzle (apodos con prefijo)', p1.page === 'p1' && p1.from === 'ficha-cumpleanero@1' && p1.puzzles.includes('prefix'), JSON.stringify(p1));
    rec('insert_page copia el fondo PDF a la carpeta del juego', fs.existsSync(path.join(repo, 'games', ID, 'fondos', 'ficha-cumpleanero-v1.pdf')));
    const p2 = await ok(cliente, 'insert_page', { id: ID, title: 'Ficha', background: { kind: 'color', value: '#F3E9D2' } });
    rec('insert_page en blanco', p2.page === 'p2' && p2.elements === 0);

    // Elementos
    const marco = await ok(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'art', ref: 'marco-ficha-sospechoso-verde', x: 10, y: 20, w: 80 } });
    rec('add_element arte: fija la versión y calcula el alto con la proporción', marco.ref === 'marco-ficha-sospechoso-verde@1' && marco.h > 0 && marco.h < 40, JSON.stringify(marco));
    const titulo = await ok(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'text', texts: { es: 'Ficha del cumpleañero', en: 'Birthday person file' }, x: 10, y: 8, w: 80, h: 6, size: 5, color: '#3B2A20', fontFamily: 'Anton' } });
    const textos = await ok(cliente, 'get_game', { id: ID, part: 'texts' });
    rec('add_element texto: crea la clave en los dos idiomas', textos.es[titulo.key] === 'Ficha del cumpleañero' && textos.en[titulo.key] === 'Birthday person file', titulo.key);
    await ok(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'field', field: 'NOMBRE_CUMPLE', x: 18, y: 32, w: 40, h: 5, size: 3.5, color: '#3B2A20', fontFamily: 'Caveat' } });
    const campoMalo = await llamar(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'field', field: 'NO_EXISTE', x: 1, y: 1, w: 5, h: 5 } });
    rec('add_element de un campo que no existe se rechaza', !campoMalo.ok && campoMalo.error.code === 'faltan-campos');
    const fuera = await llamar(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'text', texts: { es: 'x', en: 'x' }, x: 90, y: 1, w: 30, h: 5 } });
    rec('add_element fuera de la página se rechaza (validador)', !fuera.ok && fuera.error.code === 'invalido');
    const cambiado = await ok(cliente, 'update_element', { id: ID, page: 'p2', element: titulo.id, changes: { size: 6, texts: { es: 'Ficha de la persona homenajeada' } } });
    const textos2 = await ok(cliente, 'get_game', { id: ID, part: 'texts' });
    rec('update_element: estilo y texto', cambiado.size === 6 && textos2.es[titulo.key] === 'Ficha de la persona homenajeada');
    const temporal = await ok(cliente, 'add_element', { id: ID, page: 'p2', element: { kind: 'art', ref: 'icono-bombilla', x: 80, y: 80, w: 8 } });
    const quitado = await ok(cliente, 'remove_element', { id: ID, page: 'p2', element: temporal.id });
    rec('remove_element', quitado.removed === temporal.id);

    // Formas geométricas y puzzle de contenido
    const rejilla = await ok(cliente, 'create_vector_art', { piece_id: 'puzzle-rejilla-3x3', nombre: 'Rejilla 3 × 3', categoria: 'puzzle', etiquetas: ['rejilla', 'puzzle', 'formas'],
      autor: 'Estudio PrintMyEscape (prueba)', width_mm: 60, height_mm: 60,
      shapes: [{ type: 'rect', x: 1, y: 1, w: 58, h: 58, stroke: '#3B2A20', width: 1 },
        { type: 'line', x1: 20.33, y1: 1, x2: 20.33, y2: 59 }, { type: 'line', x1: 39.67, y1: 1, x2: 39.67, y2: 59 },
        { type: 'line', x1: 1, y1: 20.33, x2: 59, y2: 20.33 }, { type: 'line', x1: 1, y1: 39.67, x2: 59, y2: 39.67 }] });
    rec('create_vector_art: rejilla en la colección «formas»', rejilla.ref === 'puzzle-rejilla-3x3@1' && rejilla.coleccion === 'formas' && Math.abs(rejilla.widthMm - 60) < 0.5, JSON.stringify(rejilla));
    const libre = await llamar(cliente, 'create_vector_art', { piece_id: 'decoracion-x', nombre: 'X', categoria: 'decoracion', etiquetas: ['a', 'b', 'c'], autor: 'x', width_mm: 10, height_mm: 10, shapes: [{ type: 'path', d: 'M0 0' }] });
    rec('create_vector_art no admite trazos libres', !libre.ok && libre.error.code === 'invalid');
    const contenido = await ok(cliente, 'add_puzzle', { id: ID, page: 'p2', box: { x: 25, y: 55, w: 50, h: 35 }, puzzle: {
      id: 'tres-en-raya', name: 'Tres en raya', kind: 'contenido', difficulty: 2, minAge: 8, minutes: 5,
      solution: { es: 'La X gana en diagonal.', en: 'X wins on the diagonal.' },
      page: { elements: [
        { kind: 'art', ref: rejilla.ref, x: 10, y: 0, w: 80, h: 100 },
        { kind: 'text', texts: { es: '¿Quién gana?', en: 'Who wins?' }, x: 0, y: 0, w: 100, h: 10, size: 4, color: '#3B2A20', fontFamily: 'Anton' },
      ] } } });
    rec('add_puzzle de contenido con arte y texto en su caja', contenido.kind === 'contenido' && contenido.element);
    // Elementos sin id junto a otros con id explícito: ids libres (lo encontró el ensayo F3.3).
    const conIds = await ok(cliente, 'update_puzzle', { id: ID, puzzle: 'tres-en-raya', changes: { page: { elements: [
      { kind: 'art', ref: rejilla.ref, x: 10, y: 0, w: 80, h: 100 },
      { id: 'tres-en-raya-e1', kind: 'text', texts: { es: '¿Quién gana?', en: 'Who wins?' }, x: 0, y: 0, w: 100, h: 10, size: 4, color: '#3B2A20', fontFamily: 'Anton' },
    ] } } });
    const idsPz = conIds.page.elements.map((e) => e.id);
    rec('update_puzzle: ids libres aunque otro elemento traiga el suyo', new Set(idsPz).size === 2 && idsPz.includes('tres-en-raya-e1'), idsPz.join(' '));
    await ok(cliente, 'set_texts', { id: ID, lang: 'es', entries: { 'clave-suelta': 'x' } });
    await ok(cliente, 'set_texts', { id: ID, lang: 'en', entries: { 'clave-suelta': 'x' } });
    const avisoClave = await ok(cliente, 'validate_game', { id: ID, mode: 'draft' });
    rec('validate_game avisa de la clave que no usa ningún texto', avisoClave.warnings.some((w) => w.includes('clave-suelta')));
    await ok(cliente, 'set_texts', { id: ID, lang: 'es', entries: { 'clave-suelta': null } });
    await ok(cliente, 'set_texts', { id: ID, lang: 'en', entries: { 'clave-suelta': null } });
    const sinClave = await ok(cliente, 'get_game', { id: ID, part: 'texts' });
    rec('set_texts con null quita la clave', !('clave-suelta' in sinClave.es) && !('clave-suelta' in sinClave.en));
    const usada = await llamar(cliente, 'set_texts', { id: ID, lang: 'es', entries: { [titulo.key]: null } });
    rec('set_texts con null de una clave que usa un texto se rechaza', !usada.ok && usada.error.code === 'invalido');
    const repetido = await llamar(cliente, 'add_puzzle', { id: ID, page: 'p2', from: 'puzzle-prefix@1' });
    rec('add_puzzle repetido del catálogo se rechaza', !repetido.ok && repetido.error.code === 'exists');
    const ficha = await ok(cliente, 'update_puzzle', { id: ID, puzzle: 'prefix', changes: { name: 'Apodos', difficulty: 1, minAge: 6, minutes: 1 } });
    rec('update_puzzle: ficha del puzzle del catálogo', ficha.difficulty === 1 && ficha.name === 'Apodos');
    const params = await llamar(cliente, 'update_puzzle', { id: ID, puzzle: 'prefix', changes: { params: {} } });
    rec('update_puzzle no cambia los parámetros de un puzzle de datos', !params.ok && params.error.code === 'invalid');
    const quitarUsado = await llamar(cliente, 'remove_puzzle', { id: ID, puzzle: 'prefix' });
    rec('remove_puzzle se niega si la página usa los campos que calcula', !quitarUsado.ok && quitarUsado.error.code === 'invalido');
    const sinNeeds = await llamar(cliente, 'add_puzzle', { id: ID, page: 'p2', from: 'puzzle-strips' });
    rec('add_puzzle del catálogo sin sus campos: faltan-campos', !sinNeeds.ok && sinNeeds.error.code === 'faltan-campos' && /TEST_LUGAR/.test(sinNeeds.error.message));

    // Validación, ejemplo y vista previa
    const v = await ok(cliente, 'validate_game', { id: ID, mode: 'draft' });
    rec('validate_game en borrador sin errores', v.errors.length === 0, v.errors.join(' | '));
    const completo = await ok(cliente, 'get_game', { id: ID, part: 'full' });
    const ej = completo.examples.find((e) => e.id === '1');
    ej.values.es = { ...ej.values.es, NOMBRE_1: 'Ana', APODO_1: 'La Rápida', NOMBRE_2: 'Bruno' };
    ej.values.en = { ...ej.values.en, NOMBRE_1: 'Ann', APODO_1: 'Speedy', NOMBRE_2: 'Bruno' };
    await ok(cliente, 'set_example', { id: ID, example: ej });
    const vista = await ok(cliente, 'render_preview', { id: ID, lang: 'es', example: '1' });
    const texto = spawnSync('pdftotext', ['-layout', path.join(repo, vista.pdf), '-'], { encoding: 'utf8' }).stdout.replace(/\s+/g, ' ');
    rec('render_preview: 2 páginas con el arte de la biblioteca y los apodos calculados', vista.paginas === 2 && /Ana\s*, La Rápida/.test(texto) && texto.includes('¿Quién gana?'), texto.slice(0, 160));

    // Notas del cliente y resumen de cambios
    const fichero = path.join(repo, 'games', ID, 'game.json');
    const g = JSON.parse(fs.readFileSync(fichero, 'utf8'));
    g.notes = [{ text: 'El título más grande', page: 'p2', element: titulo.id, author: 'cliente' }];
    fs.writeFileSync(fichero, JSON.stringify(g, null, 2) + '\n');
    const notas = await ok(cliente, 'read_notes', { id: ID, pending: true });
    rec('read_notes: la nota del cliente con su id', notas.length === 1 && notas[0].id === 'n1' && !notas[0].done);
    await ok(cliente, 'update_element', { id: ID, page: 'p2', element: titulo.id, changes: { size: 7 } });
    const resumen = await ok(cliente, 'write_change_summary', { id: ID, text: 'Título de la ficha más grande (nota n1).', notes_done: ['n1'] });
    rec('write_change_summary: deja el resumen y marca la nota', resumen.pendientes === 0 && resumen.changes === 1);
    const notaRara = await llamar(cliente, 'write_change_summary', { id: ID, text: 'x', notes_done: ['n9'] });
    rec('write_change_summary con una nota que no existe se rechaza', !notaRara.ok && notaRara.error.code === 'not-found');
    const conSug = await ok(cliente, 'write_change_summary', { id: ID, text: 'Título más visible.', presupuestar: ['Mensaje en morse: no está en el catálogo'],
      suggestions: [{ page: 'p2', element: titulo.id, text: 'Lo he hecho más grande para que se lea de lejos.' }, { page: p2.page || 'p2', text: 'Página de la ficha.' }] });
    const crudo = JSON.parse(fs.readFileSync(path.join(repo, 'games', ID, 'game.json'), 'utf8'));
    rec('write_change_summary: sugerencias (con id) y «a presupuestar» en el juego', conSug.sugerencias === 2 && crudo.suggestions[0].id === 's1'
      && crudo.suggestions[0].element === titulo.id && crudo.changes.at(-1).presupuestar[0].startsWith('Mensaje en morse'), JSON.stringify(crudo.suggestions));
    const sugMala = await llamar(cliente, 'write_change_summary', { id: ID, text: 'x', suggestions: [{ field: 'NO_EXISTE', text: 'y' }] });
    rec('una sugerencia de algo que no existe se rechaza', !sugMala.ok && sugMala.error.code === 'not-found');

    // Tema de color
    const tema = await ok(cliente, 'set_theme', { id: ID, theme: { name: 'Halloween', preset: 'halloween', map: [{ from: '#023a3a', to: '#3D1E4F' }] } });
    const conTema = JSON.parse(fs.readFileSync(path.join(repo, 'games', ID, 'game.json'), 'utf8'));
    rec('set_theme: guarda el tema (colores en mayúsculas) y el juego valida', tema.theme.map[0].from === '#023A3A' && conTema.theme.name === 'Halloween'
      && (await ok(cliente, 'validate_game', { id: ID, mode: 'draft' })).errors.length === 0);
    const temaMalo = await llamar(cliente, 'set_theme', { id: ID, theme: { name: 'x', map: [] } });
    rec('set_theme sin colores se rechaza', !temaMalo.ok);
    await ok(cliente, 'set_theme', { id: ID, theme: null });
    rec('set_theme null quita el tema', !JSON.parse(fs.readFileSync(path.join(repo, 'games', ID, 'game.json'), 'utf8')).theme);

    // Copiar el juego y guardar piezas en la biblioteca
    const copia = await ok(cliente, 'duplicate_game', { from: ID, id: `${ID}-copia`, name: 'Copia' });
    rec('duplicate_game: copia en v2 con su fondo', copia.ficheros.includes('fondos/ficha-cumpleanero-v1.pdf') && copia.paginas === 2, JSON.stringify(copia));
    rec('la copia valida', (await ok(cliente, 'validate_game', { id: `${ID}-copia`, mode: 'draft' })).errors.length === 0);
    const p3 = await ok(cliente, 'insert_page', { id: ID, title: 'Instrucciones' });
    await ok(cliente, 'add_element', { id: ID, page: p3.page, element: { kind: 'text', texts: { es: 'Recortad las piezas.', en: 'Cut out the pieces.' }, x: 10, y: 10, w: 80, h: 6, size: 3, color: '#3B2A20', fontFamily: 'Open Sans' } });
    // Los nombres de fuente que da el skill (reference/formato.md) valen todos.
    for (const [i, f] of ['Caveat', 'Caveat Bold', 'Anton', 'Open Sans Bold', 'Courier Prime', 'Courier Prime Bold'].entries()) {
      await ok(cliente, 'add_element', { id: ID, page: p3.page, element: { kind: 'text', texts: { es: `Fuente ${f}`, en: `Font ${f}` }, x: 10, y: 20 + i * 6, w: 80, h: 5, size: 3, color: '#3B2A20', fontFamily: f } });
    }
    rec('las fuentes del skill validan (Courier Prime incluida)', true);
    const guardada = await ok(cliente, 'save_to_library', { id: ID, tipo: 'pagina', de: p3.page, new_id: 'instrucciones-recortar', nombre: 'Instrucciones: recortar', etiquetas: ['instrucciones', 'texto', 'blanco'], coleccion: 'prueba' });
    rec('save_to_library: página nueva en la biblioteca', guardada.ref === 'instrucciones-recortar@1');
    const seccionG = await ok(cliente, 'save_to_library', { id: ID, tipo: 'seccion', de: 'sospechosos', new_id: 'sospechosos-ocho', nombre: 'Ocho sospechosos con alias', etiquetas: ['sospechosos', 'nombre', 'alias'], coleccion: 'prueba' });
    rec('save_to_library: sección nueva', seccionG.ref === 'sospechosos-ocho@1');
    rec('list_library ve lo guardado', (await ok(cliente, 'list_library', { tipo: 'pagina', coleccion: 'prueba' })).length === 1);

    // Importar arte de un artista
    fs.mkdirSync(path.join(repo, 'arte-nuevo'), { recursive: true });
    fs.copyFileSync(path.join(biblioteca, 'arte', 'el-regalo-robado', 'piezas', 'objeto-sello-barco-v1.pdf'), path.join(repo, 'arte-nuevo', 'sello.pdf'));
    const imp = await ok(cliente, 'import_art', { file: 'arte-nuevo/sello.pdf', coleccion: 'prueba', piece_id: 'objeto-sello-prueba', categoria: 'objeto', nombre: 'Sello de prueba', etiquetas: ['sello', 'verde', 'prueba'], autor: 'Kreatures', origen: 'Prueba MCP' });
    rec('import_art: pieza nueva con su tamaño', imp.ref === 'objeto-sello-prueba@1' && Math.abs(imp.widthMm - 39.4) < 0.5, JSON.stringify(imp));
    const sinAutor = await llamar(cliente, 'import_art', { file: 'arte-nuevo/sello.pdf', coleccion: 'prueba', piece_id: 'objeto-sello-otro', categoria: 'objeto', nombre: 'X', etiquetas: ['a', 'b', 'c'], autor: 'por confirmar', origen: 'Prueba' });
    rec('import_art sin autor real se rechaza y no deja nada', !sinAutor.ok && !fs.existsSync(path.join(biblioteca, 'arte', 'prueba', 'piezas', 'objeto-sello-otro-v1.pdf')));

    // Secciones infantiles (guardadas desde el ensayo F3.3): con «mision-escondite», el puzzle de tiras entra directo.
    await ok(cliente, 'create_game', { id: 'prueba-tiras', name: 'Tiras', languages: ['es', 'en'], pages: 0 });
    await ok(cliente, 'insert_section', { id: 'prueba-tiras', from: 'cumpleanero-infantil' });
    await ok(cliente, 'insert_section', { id: 'prueba-tiras', from: 'mision-escondite' });
    await ok(cliente, 'insert_page', { id: 'prueba-tiras', title: 'Tiras' });
    await ok(cliente, 'add_element', { id: 'prueba-tiras', page: 'p1', element: { kind: 'field', field: 'TEST_LUGAR', x: 15, y: 40, w: 70, h: 6, size: 3, fontFamily: 'Anton', color: '#3B2A20' } });
    await ok(cliente, 'add_element', { id: 'prueba-tiras', page: 'p1', element: { kind: 'field', field: 'TEST_RESULTADO', x: 15, y: 55, w: 70, h: 25, size: 2.5, fontFamily: 'Caveat', color: '#3B2A20', wrap: true } });
    const tiras = await llamar(cliente, 'add_puzzle', { id: 'prueba-tiras', page: 'p1', from: 'puzzle-strips' });
    rec('secciones infantiles de la biblioteca + puzzle de tiras', tiras.ok, tiras.ok ? '' : JSON.stringify(tiras.error).slice(0, 300));

    // Reglas: formato y estado
    rec('upsert_slot en un juego v2: solo-v1', (await llamar(cliente, 'upsert_slot', { id: ID, page: 'p1', slot: { field: 'EDAD', x: 1, y: 1, w: 5, h: 5 } })).error?.code === 'solo-v1');
    await ok(cliente, 'create_game', { id: 'prueba-v1', name: 'v1', pages: 1, format: 'v1' });
    rec('add_element en un juego v1: solo-v2', (await llamar(cliente, 'add_element', { id: 'prueba-v1', page: 'p1', element: { kind: 'text', texts: { es: 'x' }, x: 1, y: 1, w: 5, h: 5 } })).error?.code === 'solo-v2');
    const fc = path.join(repo, 'games', `${ID}-copia`, 'game.json');
    fs.writeFileSync(fc, fs.readFileSync(fc, 'utf8').replace('"status": "borrador"', '"status": "enviado"'));
    rec('fuera de borrador no se edita', (await llamar(cliente, 'remove_element', { id: `${ID}-copia`, page: 'p2', element: titulo.id })).error?.code === 'no-borrador');
  } finally {
    await cliente.close();
  }
  rec('la biblioteca real no ha cambiado', huellaBiblioteca(path.join(ROOT, 'biblioteca')) === huellaReal);
  const bien = RES.filter(Boolean).length;
  console.log(`\nRESUMEN: ${bien}/${RES.length} OK`);
  return bien === RES.length ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error('FALLO', e.message); process.exit(1); });
