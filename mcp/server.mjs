#!/usr/bin/env node
// Servidor MCP local del creador de juegos (T6.1; contrato 3.3). Habla MCP por stdio (JSON-RPC) con
// Claude Code. Trabaja sobre la copia local del repositorio de juegos: la carpeta actual, o PME_JUEGOS.
// El motor, las mecánicas, el kit y el esquema son los de este repositorio (o de .pme/ en la copia).
// Uso: node mcp/server.mjs            (lo lanza Claude Code con .mcp.json)
// Nunca escribe en stdout que no sea MCP: los mensajes de diagnóstico van a stderr.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { crearHerramientas, ErrorHerramienta } from './herramientas.mjs';

export function arrancar({ raiz = process.env.PME_JUEGOS || process.cwd(), transporte = new StdioServerTransport() } = {}) {
  // La biblioteca (F3.1): la de PME_BIBLIOTECA; si no, la del repositorio de juegos (biblioteca/), y si no tiene,
  // la del repositorio de código.
  if (!process.env.PME_BIBLIOTECA && fs.existsSync(path.join(path.resolve(raiz), 'biblioteca'))) {
    process.env.PME_BIBLIOTECA = path.join(path.resolve(raiz), 'biblioteca');
  }
  const { herramientas, comprobarArgs } = crearHerramientas({ raiz: path.resolve(raiz) });
  const porNombre = new Map(herramientas.map((h) => [h.name, h]));
  const servidor = new Server({ name: 'printmyescape', version: '0.1.0' }, { capabilities: { tools: {} } });

  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: herramientas.map((h) => ({ name: h.name, description: h.description, inputSchema: h.schema })),
  }));

  servidor.setRequestHandler(CallToolRequestSchema, async (req) => {
    const h = porNombre.get(req.params.name);
    const texto = (obj) => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] });
    if (!h) return { isError: true, ...texto({ code: 'unknown-tool', message: `no hay herramienta «${req.params.name}»` }) };
    try {
      const args = req.params.arguments || {};
      comprobarArgs(h.name, h.schema, args);
      return texto(await h.run(args));
    } catch (e) {
      const salida = { code: e.code || 'error', message: e.message };
      if (e.detalles) salida.detalles = e.detalles;
      if (!(e instanceof ErrorHerramienta) && !e.code) console.error('[pme-mcp]', e.stack);
      return { isError: true, ...texto(salida) };
    }
  });

  return servidor.connect(transporte).then(() => servidor);
}

const esCLI = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (esCLI) arrancar().catch((e) => { console.error('[pme-mcp] no arranca:', e); process.exit(1); });
