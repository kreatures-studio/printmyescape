#!/usr/bin/env node
// Genera el catálogo de mecánicas del skill (T7.1 de PLAN-CREADOR.md) desde el registro real del motor
// (mechanics/*.js). Así el catálogo no puede quedar desfasado. Escribe
// .claude/skills/crear-escape-room/reference/mecanicas.md.
// Uso: node tools/build-skill-reference.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'tools', 'game', 'fuentes.cjs'));
globalThis.PDFLib = require('pdf-lib');
globalThis.fontkit = require('@pdf-lib/fontkit');
require(path.join(ROOT, 'mechanics', 'index.js'));
require(path.join(ROOT, 'tools', 'pme-compose-core.js'));

const SALIDA = path.join(ROOT, '.claude', 'skills', 'crear-escape-room', 'reference', 'mecanicas.md');
const capa = { none: 'ninguna (solo datos)', under: 'debajo del texto', over: 'encima del texto', final: 'pieza final (se dibuja al final)' };

const filas = Object.entries(globalThis.PMEMechanics).sort(([a], [b]) => a.localeCompare(b)).map(([tipo, def]) => {
  const req = (def.params && def.params.required) || [];
  const etiqueta = (def.label && def.label.es) || tipo;
  const derive = typeof def.derive === 'function' ? 'sí' : 'no';
  return `| \`${tipo}\` | ${etiqueta} | ${req.length ? req.map((r) => `\`${r}\``).join(', ') : '—'} | ${capa[def.layer] || def.layer} | ${derive} |`;
});

const texto = `# Catálogo de mecánicas

<!-- Generado por tools/build-skill-reference.mjs desde mechanics/*.js. No editar a mano. -->

Solo estas mecánicas se pueden usar en un juego. Si el encargo necesita otra, no se inventa:
se anota como «mecánica nueva a presupuestar» en el resumen final.

| Tipo | Qué hace | Parámetros obligatorios | Capa | Tiene derive |
| --- | --- | --- | --- | --- |
${filas.join('\n')}

Para el significado de cada parámetro, leer \`.pme/mechanics/<tipo>.js\` (la mecánica explica sus
parámetros y su \`validate\`). Usar \`list_mechanics\` para ver las mismas definiciones desde el servidor.

- Una mecánica va asociada a una página (\`page\`: p1, p2…) y se añade con \`upsert_mechanic\`.
- \`derives\`: campos que la mecánica calcula y que no están en \`fields\` (no se crean a mano).
`;
fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, texto, 'utf8');
console.log(`OK ${path.relative(ROOT, SALIDA)} · ${filas.length} mecánicas`);
