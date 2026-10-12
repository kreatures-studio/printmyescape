#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Prepara el repositorio de juegos del cliente con el servidor MCP local (T6.4 de PLAN-CREADOR.md).

Uso:  python3 tools/build-mcp-bundle.py <ruta-repo-juegos>

Copia a <ruta>/.pme/ lo que el servidor necesita (mcp/, motor, mecánicas, herramientas de Node, esquema,
kit y fuentes), con un package.json propio. Deja en la raíz del repositorio de juegos:
  - .mcp.json                       registro del servidor para Claude Code (ámbito proyecto);
  - .claude/skills/crear-escape-room/  el skill, si existe en este repositorio (M7);
  - .gitignore con .pme/node_modules/ y salidas/ (las dependencias y las vistas previas no se versionan).
Después, una vez: npm install --prefix .pme   (o ejecutar este script con --instalar).

El script no toca games/. Cada vez que cambie el motor, el kit o el servidor, vuelve a ejecutarlo: .pme/
es una copia, no un enlace.
"""
import argparse
import datetime
import glob
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

# Dependencias del servidor, con las mismas versiones que el repositorio de código.
DEPENDENCIAS = {
    '@modelcontextprotocol/sdk': '1.32.1',
    '@pdf-lib/fontkit': '^1.1.1',
    'ajv': '^8.20.0',
    'pdf-lib': '^1.17.1',
}
NO_TOOLS = {'tools/game/migrate-final3.mjs'}
SKILL = os.path.join(ROOT, '.claude', 'skills', 'crear-escape-room')


def copiar(rel_origen, destino_base):
    origen = os.path.join(ROOT, rel_origen)
    destino = os.path.join(destino_base, rel_origen)
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    shutil.copyfile(origen, destino)


def copiar_carpeta(rel, destino_base):
    origen = os.path.join(ROOT, rel)
    destino = os.path.join(destino_base, rel)
    shutil.rmtree(destino, ignore_errors=True)
    shutil.copytree(origen, destino)


def construir(repo):
    pme = os.path.join(repo, '.pme')
    shutil.rmtree(os.path.join(pme, 'mcp'), ignore_errors=True)
    for mod in ['mcp/server.mjs', 'mcp/store-fs.mjs', 'mcp/motor.mjs', 'mcp/herramientas.mjs', 'mcp/test-client.mjs']:
        copiar(mod, pme)
    for f in sorted(glob.glob(os.path.join(ROOT, 'mechanics', '*.js'))):
        copiar(os.path.relpath(f, ROOT).replace(os.sep, '/'), pme)
    copiar('tools/pme-compose-core.js', pme)
    for f in sorted(glob.glob(os.path.join(ROOT, 'tools', 'game', '*'))):
        rel = os.path.relpath(f, ROOT).replace(os.sep, '/')
        if os.path.isfile(f) and rel not in NO_TOOLS and f.endswith(('.mjs', '.cjs')):
            copiar(rel, pme)
    copiar('schema/pme-game-1.schema.json', pme)
    copiar_carpeta('assets/kit', pme)
    copiar_carpeta('assets/fonts', pme)

    with open(os.path.join(pme, 'package.json'), 'w', encoding='utf-8') as f:
        json.dump({'name': 'pme-juegos-pme', 'private': True, 'version': '0.1.0', 'dependencies': DEPENDENCIAS},
                  f, indent=2, ensure_ascii=False)
        f.write('\n')
    rev = subprocess.run(['git', 'rev-parse', '--short', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    with open(os.path.join(pme, 'VERSION.txt'), 'w', encoding='utf-8') as f:
        f.write(f'Copia generada por tools/build-mcp-bundle.py desde el repositorio de código ({rev or "sin git"}), '
                f'{datetime.date.today().isoformat()}. No editar: se regenera.\n')

    with open(os.path.join(repo, '.mcp.json'), 'w', encoding='utf-8') as f:
        json.dump({'mcpServers': {'printmyescape': {'type': 'stdio', 'command': 'node', 'args': ['.pme/mcp/server.mjs']}}},
                  f, indent=2, ensure_ascii=False)
        f.write('\n')

    skill_destino = os.path.join(repo, '.claude', 'skills', 'crear-escape-room')
    if os.path.isdir(SKILL):
        # El catálogo de mecánicas sale del registro del motor: se regenera antes de copiarlo.
        r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'build-skill-reference.mjs')], cwd=ROOT)
        if r.returncode:
            raise SystemExit('ERROR no se pudo generar el catálogo de mecánicas del skill')
        shutil.rmtree(skill_destino, ignore_errors=True)
        shutil.copytree(SKILL, skill_destino)
        estado_skill = 'skill copiado'
    else:
        estado_skill = 'sin skill todavía (M7): .claude/skills/crear-escape-room/ no existe en el repositorio de código'

    gi = os.path.join(repo, '.gitignore')
    lineas = open(gi, encoding='utf-8').read().splitlines() if os.path.exists(gi) else []
    for linea in ['.pme/node_modules/', 'salidas/']:
        if linea not in lineas:
            lineas.append(linea)
    with open(gi, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lineas) + '\n')
    return estado_skill


def instalar(repo):
    r = subprocess.run(['npm', 'install', '--prefix', '.pme'], cwd=repo)
    return r.returncode == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('repo', help='ruta del repositorio de juegos')
    ap.add_argument('--instalar', action='store_true', help='ejecuta npm install --prefix .pme al terminar')
    a = ap.parse_args()
    repo = os.path.abspath(a.repo)
    if not os.path.isdir(os.path.join(repo, 'games')):
        print(f'ERROR {repo} no tiene una carpeta games/: ¿es el repositorio de juegos?', file=sys.stderr)
        return 1
    estado = construir(repo)
    print(f'OK {os.path.join(repo, ".pme")} · {estado}')
    if a.instalar and not instalar(repo):
        print('ERROR npm install --prefix .pme falló', file=sys.stderr)
        return 1
    if not a.instalar:
        print('Falta una vez: npm install --prefix .pme')
    return 0


if __name__ == '__main__':
    sys.exit(main())
