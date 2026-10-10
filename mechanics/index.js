/* Registro de mecánicas para Node (CLI y pruebas). Carga cada mecánica del directorio, que
   se registran en globalThis.PMEMechanics. La demo del navegador incrusta los mismos ficheros
   (tools/build-demo.py), así que una mecánica nueva solo hay que añadirla a esta carpeta. */
const fs = require('fs');
const path = require('path');

for (const f of fs.readdirSync(__dirname).sort()) {
  if (f.endsWith('.js') && f !== 'index.js') require(path.join(__dirname, f));
}

module.exports = globalThis.PMEMechanics;
