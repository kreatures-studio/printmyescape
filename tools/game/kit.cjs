/* Índice de piezas de arte para el motor y el validador: acepta el kit (contrato 3.4) y una colección de arte
   de la biblioteca (pme-biblioteca/1, tipo «arte»). En la biblioteca, cada pieza se encuentra por «id@versión»
   y por «id» (la versión más alta). CommonJS para que lo usen tools/compose.js y el servidor MCP. */
function indicePiezas(manifiesto) {
  const indice = new Map();
  const piezas = (manifiesto && manifiesto.pieces) || [];
  if (manifiesto && manifiesto.schema === 'pme-biblioteca/1') {
    const ordenadas = [...piezas].sort((a, b) => a.version - b.version);
    for (const p of ordenadas) {
      indice.set(`${p.id}@${p.version}`, p);
      indice.set(p.id, p); // la última versión gana
    }
    return indice;
  }
  for (const p of piezas) if (!indice.has(p.id)) indice.set(p.id, p);
  return indice;
}

module.exports = { indicePiezas };
