#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica el editor de juegos en docs/creador/ (T5.7 de PLAN-CREADOR.md).

El editor vive en creator/ y usa rutas relativas («../mechanics/…», «../tools/…», «../assets/…»)
para llegar al motor, las mecánicas, el kit y las fuentes. Aquí se copia todo eso a docs/creador/
con la misma forma, y las rutas «../» de los ficheros copiados pasan a «./». Así docs/creador/index.html
funciona tal cual sirvan la carpeta docs/ (GitHub Pages o un servidor local).

Qué se copia: lo que el editor referencia (se resuelve cada ruta literal), las mecánicas, el kit
completo y los dos juegos de muestra del almacén en memoria (solo su game.json). NO se copian el PDF del
artista ni las fotos: no se publican datos de clientes. El servidor de desarrollo (creator/serve.mjs)
no se copia.

Uso:  python3 tools/build-creator.py          (regenera docs/creador/ desde cero)
Comprueba antes de copiar: que la lista de <script> de mecánicas en creator/index.html es la de
mechanics/*.js (sin index.js), y que toda ruta literal «../» del editor existe en el repo.
"""
import glob
import os
import re
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
EDITOR = os.path.join(ROOT, 'creator')
SALIDA = os.path.join(ROOT, 'docs', 'creador')
# Carpetas que se copian enteras (su contenido lo lee el editor sin una ruta literal por fichero).
CARPETAS = ['assets/kit']
# Ficheros que no se publican aunque los referencie el editor.
EXCLUIDOS = {'creator/serve.mjs'}
# Ficheros de código: en ellos se buscan y reescriben las rutas. Los JSON (juegos, kit) se copian tal cual:
# sus rutas son datos del juego, relativas a su propia carpeta.
CODIGO = ('.html', '.js', '.mjs')
RE_REF = re.compile(r'''(['"])(\.\./[^'"\s]+)\1''')


class Error(Exception):
    pass


def comprobar_mecanicas():
    """La lista de <script> de mecánicas en index.html tiene que ser la de mechanics/*.js."""
    html = open(os.path.join(EDITOR, 'index.html'), encoding='utf-8').read()
    referenciadas = set(re.findall(r'src="\.\./(mechanics/[^"]+\.js)"', html))
    en_disco = {os.path.relpath(p, ROOT).replace(os.sep, '/')
                for p in glob.glob(os.path.join(ROOT, 'mechanics', '*.js'))
                if os.path.basename(p) != 'index.js'}
    if referenciadas != en_disco:
        falta = sorted(en_disco - referenciadas)
        sobra = sorted(referenciadas - en_disco)
        raise Error(f'mecánicas: faltan en creator/index.html {falta} o sobran {sobra}')


def es_comentario(linea):
    s = linea.lstrip()
    return s.startswith('//') or s.startswith('*') or s.startswith('/*') or s.startswith('<!--')


def codigo(texto):
    """El texto sin las líneas de comentario (las rutas que cuentan son las del código)."""
    return '\n'.join(l for l in texto.split('\n') if not es_comentario(l))


def rutas_literales(fichero):
    """Rutas «../…» literales de un fichero del editor, resueltas desde su carpeta (relativas a ROOT)."""
    texto = codigo(open(fichero, encoding='utf-8').read())
    base = os.path.dirname(fichero)
    out = set()
    for _, ref in RE_REF.findall(texto):
        if ref.endswith('/'):
            continue
        destino = os.path.normpath(os.path.join(base, ref))
        out.add(os.path.relpath(destino, ROOT).replace(os.sep, '/'))
    return out


def recoger():
    """Conjunto de rutas (relativas a ROOT) que hay que copiar."""
    pendientes = set()
    for dirpath, _, names in os.walk(EDITOR):
        for n in names:
            rel = os.path.relpath(os.path.join(dirpath, n), ROOT).replace(os.sep, '/')
            if rel not in EXCLUIDOS:
                pendientes.add(rel)
    # Dependencias: rutas literales de cada fichero de texto copiado (también de los que ellas citan).
    vistos = set()
    while pendientes - vistos:
        rel = sorted(pendientes - vistos)[0]
        vistos.add(rel)
        ruta = os.path.join(ROOT, rel)
        if not os.path.exists(ruta):
            raise Error(f'el editor referencia «{rel}», que no existe')
        if rel.endswith(CODIGO) and os.path.isfile(ruta):
            pendientes |= rutas_literales(ruta)
    for carpeta in CARPETAS:
        for dirpath, _, names in os.walk(os.path.join(ROOT, carpeta)):
            for n in names:
                pendientes.add(os.path.relpath(os.path.join(dirpath, n), ROOT).replace(os.sep, '/'))
    # El fichero de mecánicas que no es del editor (index.js de Node) nunca se copia.
    return {p for p in pendientes if p not in EXCLUIDOS and not p.startswith('mechanics/index.js')}


def destino(rel):
    """Dónde queda una ruta del repo dentro de docs/creador/. El editor (creator/) va en la raíz."""
    if rel.startswith('creator/'):
        return os.path.join(SALIDA, rel[len('creator/'):])
    return os.path.join(SALIDA, rel)


def reescribir(texto):
    """«../x» → «./x» en las rutas literales del código (los comentarios se dejan como están)."""
    lineas = texto.split('\n')
    return '\n'.join(l if es_comentario(l) else RE_REF.sub(lambda m: f"{m.group(1)}./{m.group(2)[3:]}{m.group(1)}", l)
                     for l in lineas)


def construir():
    comprobar_mecanicas()
    rutas = recoger()
    if os.path.isdir(SALIDA):
        shutil.rmtree(SALIDA)
    for rel in sorted(rutas):
        origen = os.path.join(ROOT, rel)
        fin = destino(rel)
        os.makedirs(os.path.dirname(fin), exist_ok=True)
        if rel.endswith(CODIGO):
            texto = open(origen, encoding='utf-8').read()
            with open(fin, 'w', encoding='utf-8', newline='') as f:
                f.write(reescribir(texto))
        else:
            shutil.copyfile(origen, fin)
    # Ningún «../» literal debe quedar en lo publicado (salvo en comentarios sueltos).
    sueltos = []
    for dirpath, _, names in os.walk(SALIDA):
        for n in names:
            if n.endswith(CODIGO):
                t = codigo(open(os.path.join(dirpath, n), encoding='utf-8').read())
                for m in RE_REF.finditer(t):
                    sueltos.append(os.path.relpath(os.path.join(dirpath, n), SALIDA))
    if sueltos:
        raise Error(f'quedan rutas «../» sin reescribir en {sorted(set(sueltos))}')
    return len(rutas)


def main():
    try:
        n = construir()
    except Error as e:
        print(f'ERROR {e}', file=sys.stderr)
        return 1
    print(f'OK docs/creador/ ({n} ficheros). Abrir docs/creador/index.html desde un servidor.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
