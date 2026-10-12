// Pruebas de páginas y secciones de la biblioteca (F2.5 de PLAN-CREADOR-2.md).
// 1. Las colecciones reales de El regalo robado (exportadas desde final3) validan.
// 2. Cada cambio incorrecto en una copia de esas colecciones se rechaza con su error.
// 3. Una exportación que falla no deja nada escrito (ni manifiesto ni fondos).
// Uso: node tools/qa/biblioteca-paginas-test.mjs   (código 0 si todo pasa)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validarColeccion } from '../biblioteca/validar.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAG = path.join(ROOT, 'biblioteca', 'paginas', 'el-regalo-robado');
const SEC = path.join(ROOT, 'biblioteca', 'secciones', 'el-regalo-robado');
const TMP = path.join(ROOT, 'tools', 'qa', 'salida-qa', 'biblioteca-paginas');
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
let fallos = 0;
const ok = (nombre, cond, detalle = '') => { if (!cond) fallos++; console.log(`${cond ? 'OK  ' : 'FALLO'} ${nombre}${!cond && detalle ? ' | ' + detalle : ''}`); };

// 1. Colecciones reales
const vp = validarColeccion(PAG), vs = validarColeccion(SEC);
ok('página exportada de final3 valida', vp.errores.length === 0, vp.errores.join('; '));
ok('sección exportada de final3 valida', vs.errores.length === 0, vs.errores.join('; '));
const base = JSON.parse(fs.readFileSync(path.join(PAG, 'manifest.json'), 'utf8'));
const baseS = JSON.parse(fs.readFileSync(path.join(SEC, 'manifest.json'), 'utf8'));

// 2. Variantes incorrectas: cada una en su carpeta con los fondos y el fichero real
let n = 0;
function variante(nombre, origen, cambiar, espera) {
  const dir = path.join(TMP, `caso-${n++}`);
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(path.join(origen.dir, 'fondos'))) fs.cpSync(path.join(origen.dir, 'fondos'), path.join(dir, 'fondos'), { recursive: true });
  const m = structuredClone(origen.m);
  cambiar(m);
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m, null, 2));
  const { errores } = validarColeccion(dir);
  ok(nombre, errores.some((e) => e.includes(espera)), `esperado «${espera}», errores: ${JSON.stringify(errores.slice(0, 2))}`);
}
const P = { dir: PAG, m: base }, S = { dir: SEC, m: baseS };
variante('página: texto que falta en inglés', P, (m) => { delete m.pieces[0].i18n.en[Object.keys(m.pieces[0].i18n.en)[0]]; }, 'falta el texto');
variante('página: campo que usa y no declara', P, (m) => { m.pieces[0].fields = m.pieces[0].fields.slice(1); }, 'usa el campo');
variante('página: campo que declara y no usa', P, (m) => { m.pieces[0].fields.push('CAMPO_FANTASMA'); }, 'declara el campo');
variante('página: PDF de fondo que no existe', P, (m) => { m.pieces[0].page.background.file = 'fondos/no-esta.pdf'; }, 'no existe el PDF de fondo');
variante('página: elemento con tipo inventado (esquema)', P, (m) => { m.pieces[0].page.elements[0].kind = 'dibujo-libre'; }, 'esquema');
variante('página: sin origen (esquema)', P, (m) => { delete m.pieces[0].origin; }, 'origin');
variante('sección: campo sin definición', S, (m) => { delete m.pieces[0].fieldDefs[m.pieces[0].section.fields[0]]; }, 'no tiene definición');
variante('sección: ejemplo con un campo que no es de la sección', S, (m) => { m.pieces[0].examples[0].values.es.CAMPO_AJENO = 'x'; }, 'no es campo de la sección');
variante('sección: definición de campo mal formada (esquema de campo)', S, (m) => { m.pieces[0].fieldDefs[m.pieces[0].section.fields[0]].type = 'tipo-inventado'; }, 'campo');

// 3. Exportación que falla: no cambia nada
const antesP = fs.readFileSync(path.join(PAG, 'manifest.json'), 'utf8');
const antesS = fs.readFileSync(path.join(SEC, 'manifest.json'), 'utf8');
const fondosAntes = fs.readdirSync(path.join(PAG, 'fondos')).sort();
const spec = path.join(TMP, 'spec-falla.json');
fs.writeFileSync(spec, JSON.stringify({ coleccion: 'el-regalo-robado-prueba', paginas: [{ de: 'p99', id: 'pagina-que-no-existe', nombre: 'X', etiquetas: ['a', 'b', 'c'] }] }));
const r1 = spawnSync('node', ['tools/biblioteca/desde-juego.mjs', 'games/final3', spec], { cwd: ROOT, encoding: 'utf8' });
ok('exportar una página que el juego no tiene: error', r1.status === 1 && r1.stderr.includes('no tiene la página'), r1.stderr);
ok('el error no crea la colección nueva', !fs.existsSync(path.join(ROOT, 'biblioteca', 'paginas', 'el-regalo-robado-prueba')));
ok('la colección real no cambia tras un fallo', fs.readFileSync(path.join(PAG, 'manifest.json'), 'utf8') === antesP && fs.readFileSync(path.join(SEC, 'manifest.json'), 'utf8') === antesS);
ok('no se añaden fondos tras un fallo', JSON.stringify(fs.readdirSync(path.join(PAG, 'fondos')).sort()) === JSON.stringify(fondosAntes));
const spec2 = path.join(TMP, 'spec-repetida.json');
fs.writeFileSync(spec2, JSON.stringify({ coleccion: 'el-regalo-robado', paginas: [{ de: 'p1', id: 'ficha-cumpleanero', nombre: 'X', etiquetas: ['a', 'b', 'c'] }] }));
const r3 = spawnSync('node', ['tools/biblioteca/desde-juego.mjs', 'games/final3', spec2], { cwd: ROOT, encoding: 'utf8' });
ok('exportar un id que ya existe: error y nada cambia', r3.status === 1 && r3.stderr.includes('ya existe') && fs.readFileSync(path.join(PAG, 'manifest.json'), 'utf8') === antesP);

console.log(`\nRESUMEN: ${fallos === 0 ? 'todo OK' : fallos + ' fallo(s)'}`);
process.exit(fallos ? 1 : 0);
