// Pruebas de los puzzles de datos de la biblioteca (F2.6 de PLAN-CREADOR-2.md).
// 1. La colección real (las 6 mecánicas de El regalo robado) valida, y todas son de datos, sin contenido inventado.
// 2. Cada cambio incorrecto en una copia de esa colección se rechaza con su error.
// 3. La exportación rechaza lo que no existe en el juego, y una exportación que falla no deja nada escrito.
// Uso: node tools/qa/biblioteca-puzzles-test.mjs   (código 0 si todo pasa)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validarColeccion } from '../biblioteca/validar.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const COL = path.join(ROOT, 'biblioteca', 'puzzles', 'el-regalo-robado');
const TMP = path.join(ROOT, 'tools', 'qa', 'salida-qa', 'biblioteca-puzzles');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
let fallos = 0;
const ok = (nombre, cond, detalle = '') => { if (!cond) fallos++; console.log(`${cond ? 'OK  ' : 'FALLO'} ${nombre}${!cond && detalle ? ' | ' + detalle : ''}`); };

// 1. Colección real
const v = validarColeccion(COL);
ok('colección de puzzles de El regalo robado valida', v.errores.length === 0, v.errores.join('; '));
const base = JSON.parse(fs.readFileSync(path.join(COL, 'manifest.json'), 'utf8'));
ok('son 6 puzzles, uno por mecánica del juego', base.pieces.length === 6, `hay ${base.pieces.length}`);
ok('todos son de datos (no hay contenido inventado)', base.pieces.every((p) => p.kind === 'datos'));
const tiras = base.pieces.find((p) => p.id === 'puzzle-strips');
ok('las tiras llevan la solución del juego en los dos idiomas', !!(tiras && tiras.solution && tiras.solution.es && tiras.solution.en));
ok('needs en formato §2.3 (campo y tipo)', base.pieces.every((p) => p.needs.every((n) => n.field && n.type)));

// 2. Variantes incorrectas
let n = 0;
function variante(nombre, cambiar, espera) {
  const dir = path.join(TMP, `caso-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  const m = structuredClone(base);
  cambiar(m);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  const { errores } = validarColeccion(dir);
  ok(nombre, errores.some((e) => e.includes(espera)), `esperado «${espera}», errores: ${JSON.stringify(errores.slice(0, 2))}`);
}
variante('mecánica que no existe en mechanics/', (m) => { m.pieces[0].mechanic = 'inventada'; m.pieces[0].origin.mechanic = 'inventada'; m.pieces[0].id = 'puzzle-inventada'; }, 'no existe en mechanics');
variante('falta un parámetro requerido de la mecánica', (m) => { delete m.pieces[0].params.field; }, 'faltan los parámetros de «ticks»');
variante('el origen no coincide con la mecánica', (m) => { m.pieces[1].origin.mechanic = 'prefix'; }, 'el origen dice');
variante('el id no corresponde a la mecánica', (m) => { m.pieces[2].id = 'puzzle-otra'; }, 'el id debe ser');
variante('campo derivado listado como necesario', (m) => { m.pieces[1].needs.push({ field: 'NOMBRE_CUMPLE_FICHA' }); }, 'calcula');
variante('campo repetido en needs', (m) => { m.pieces[0].needs.push(structuredClone(m.pieces[0].needs[0])); }, 'dos veces');
variante('necesidad sin campo (esquema §2.3)', (m) => { m.pieces[0].needs[0] = { type: 'multi' }; }, 'field');
variante('solución que no es texto por idioma (esquema)', (m) => { m.pieces[3].solution = { id: 'x', how: {} }; }, 'esquema');
variante('puzzle de contenido (aún no admitido)', (m) => { m.pieces[0].kind = 'contenido'; }, 'esquema');
variante('puzzle de datos sin mecánica (esquema)', (m) => { delete m.pieces[0].mechanic; }, 'mechanic');
variante('versión repetida', (m) => { m.pieces.push(structuredClone(m.pieces[0])); }, 'repetida');

// 3. Exportación
const juegoCopia = path.join(TMP, 'juego-sin-campo');
fs.mkdirSync(juegoCopia, { recursive: true });
const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'games', 'final3', 'game.json'), 'utf8'));
delete g.fields.DEBILIDAD;
fs.writeFileSync(path.join(juegoCopia, 'game.json'), JSON.stringify(g));
const specDe = (de, id, col = 'el-regalo-robado-prueba') => {
  // La colección de prueba no se toca: solo se usa la real cuando el caso lo necesita (id repetido).
  const f = path.join(TMP, `spec-${id}.json`);
  fs.writeFileSync(f, JSON.stringify({ coleccion: col, puzzles: [{ de, id, nombre: 'X', etiquetas: ['a', 'b', 'c'] }] }));
  return f;
};
const colPrueba = path.join(ROOT, 'biblioteca', 'puzzles', 'el-regalo-robado-prueba');
const r1 = spawnSync('node', ['tools/biblioteca/desde-juego.mjs', juegoCopia, specDe('ticks', 'puzzle-ticks-x')], { cwd: ROOT, encoding: 'utf8' });
ok('exportar un puzzle cuyo campo no existe en el juego: error', r1.status === 1 && r1.stderr.includes('no existe en fields'), r1.stderr);
const r2 = spawnSync('node', ['tools/biblioteca/desde-juego.mjs', path.join(ROOT, 'games', 'final3'), specDe('no-existe', 'puzzle-no-existe')], { cwd: ROOT, encoding: 'utf8' });
ok('exportar una mecánica que el juego no tiene: error', r2.status === 1 && r2.stderr.includes('hace falta exactamente una'), r2.stderr);
const r3 = spawnSync('node', ['tools/biblioteca/desde-juego.mjs', path.join(ROOT, 'games', 'final3'), specDe('ticks', 'puzzle-ticks', 'el-regalo-robado')], { cwd: ROOT, encoding: 'utf8' });
ok('exportar un id que ya está en la biblioteca: error', r3.status === 1 && r3.stderr.includes('ya existe'), r3.stderr);
ok('los fallos no crean la colección nueva', !fs.existsSync(colPrueba));
ok('la colección real no cambia tras los fallos', fs.readFileSync(path.join(COL, 'manifest.json'), 'utf8') === JSON.stringify(base, null, 2) + '\n');

console.log(fallos ? `\n${fallos} FALLO(S)` : '\nTodo OK');
process.exitCode = fallos ? 1 : 0;
