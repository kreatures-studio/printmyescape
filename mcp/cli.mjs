#!/usr/bin/env node
// Cliente de línea de órdenes del servidor MCP (F3.3): llama a una herramienta por stdio, igual que Claude Code,
// para quien no tiene el servidor registrado (un agente, un script, una prueba a mano).
//
// Uso (desde la copia local del repositorio de juegos):
//   node .pme/mcp/cli.mjs list                         lista las herramientas con su descripción
//   node .pme/mcp/cli.mjs <herramienta> '<json>'      llama a una herramienta con sus argumentos (JSON)
//   node .pme/mcp/cli.mjs <herramienta> @args.json    los argumentos en un fichero
// Escribe la respuesta (JSON) en stdout. Código 0 si la herramienta responde bien; 1 si devuelve un error.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVIDOR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'server.mjs');

async function main() {
  const [nombre, crudo] = process.argv.slice(2);
  if (!nombre) {
    console.error("uso: node .pme/mcp/cli.mjs list | <herramienta> '<json>' | <herramienta> @fichero.json");
    return 2;
  }
  let args = {};
  if (crudo) {
    const texto = crudo.startsWith('@') ? fs.readFileSync(crudo.slice(1), 'utf8') : crudo;
    try { args = JSON.parse(texto); } catch (e) { console.error(`los argumentos no son JSON: ${e.message}`); return 2; }
  }
  const cliente = new Client({ name: 'pme-cli', version: '0.1.0' });
  await cliente.connect(new StdioClientTransport({ command: process.execPath, args: [SERVIDOR], cwd: process.cwd(), env: process.env, stderr: 'inherit' }));
  try {
    if (nombre === 'list') {
      const { tools } = await cliente.listTools();
      for (const t of tools) console.log(`${t.name}\n  ${t.description}\n  argumentos: ${JSON.stringify(t.inputSchema.properties)}\n`);
      return 0;
    }
    const r = await cliente.callTool({ name: nombre, arguments: args });
    console.log((r.content || []).map((c) => c.text || '').join(''));
    return r.isError ? 1 : 0;
  } finally {
    await cliente.close();
  }
}

main().then((c) => process.exit(c)).catch((e) => { console.error(e.message); process.exit(1); });
