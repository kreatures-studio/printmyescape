#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Publica el creador de juegos en docs/creador/ (T5.7 de PLAN-CREADOR.md; F4 de PLAN-CREADOR-2.md).

El creador vive en creator/ (y creator/vistas/, creator/store/…) y usa rutas relativas («../mechanics/…»,
«../tools/…», «../assets/fonts/…», «../../tools/…» desde las vistas) para llegar al motor, las mecánicas, las
reglas compartidas con Claude y las fuentes. Aquí se copia todo eso a docs/creador/: lo de creator/ queda en la raíz
y lo demás con su misma ruta del repo. Las rutas de los ficheros del creador que salen de creator/ se reescriben
para el sitio nuevo. Así docs/creador/index.html funciona tal cual sirvan la carpeta docs/ (GitHub Pages o un
servidor local).

Qué se copia: lo que el creador referencia (se resuelve cada ruta literal), las mecánicas, las fuentes del registro
(assets/fonts/) y los dos juegos de muestra del almacén en memoria (solo su game.json). NO se copian el PDF del
artista ni las fotos (no se publican datos de clientes) ni la biblioteca (biblioteca/ es del repositorio privado:
el creador publicado la lee de GitHub con el token). El servidor de desarrollo (creator/serve.mjs) no se copia.

Uso:  python3 tools/build-creator.py          (regenera docs/creador/ desde cero)
Comprueba antes de copiar: que la lista de <script> de mecánicas en creator/index.html es la de
mechanics/*.js (sin index.js), que toda ruta literal «../» del creador existe en el repo y que nada de biblioteca/
se publica; después, que toda ruta relativa literal de lo publicado apunta a un fichero publicado.
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
CARPETAS = ['assets/fonts']
# Ficheros que no se publican aunque los referencie el editor.
EXCLUIDOS = {'creator/serve.mjs'}
# Carpetas que nunca se publican (aunque algo las nombre).
PRIVADAS = ('biblioteca/', 'games/', 'ensayos/')
# Juegos de muestra del almacén en memoria: solo su game.json.
MUESTRAS = {'games/final3/game.json', 'ensayos/f3/cumple-mision-secreta/game.json'}
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
    rutas = {p for p in pendientes if p not in EXCLUIDOS and not p.startswith('mechanics/index.js')}
    privadas = sorted(p for p in rutas if p.startswith(PRIVADAS) and p not in MUESTRAS)
    if privadas:
        raise Error(f'el creador nombra ficheros privados que no se publican: {privadas[:8]}')
    return rutas


def destino(rel):
    """Dónde queda una ruta del repo dentro de docs/creador/. El editor (creator/) va en la raíz."""
    if rel.startswith('creator/'):
        return os.path.join(SALIDA, rel[len('creator/'):])
    return os.path.join(SALIDA, rel)


def reescribir(texto, rel):
    """Rutas literales de un fichero de creator/ que salen de creator/: las de su sitio publicado.
    (Lo de fuera de creator/ conserva su forma relativa: sus rutas siguen valiendo tal cual.)"""
    if not rel.startswith('creator/'):
        return texto
    base = os.path.dirname(os.path.join(ROOT, rel))
    publicado = os.path.dirname(destino(rel))

    def cambiar(m):
        ref = m.group(2)
        objetivo = os.path.relpath(os.path.normpath(os.path.join(base, ref)), ROOT).replace(os.sep, '/')
        if objetivo.startswith('creator/') or objetivo == 'creator':
            return m.group(0)
        nueva = os.path.relpath(destino(objetivo), publicado).replace(os.sep, '/') + ('/' if ref.endswith('/') else '')
        if not nueva.startswith('.'):
            nueva = './' + nueva
        return f"{m.group(1)}{nueva}{m.group(1)}"
    lineas = texto.split('\n')
    return '\n'.join(l if es_comentario(l) else RE_REF.sub(cambiar, l) for l in lineas)


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
                f.write(reescribir(texto, rel))
        else:
            shutil.copyfile(origen, fin)
    # Toda ruta relativa literal del código publicado apunta a algo publicado (las que acaban en «/» son carpetas).
    rotas = []
    re_rel = re.compile(r'''(['"])(\.{1,2}/[^'"\s]+)\1''')
    for dirpath, _, names in os.walk(SALIDA):
        for n in names:
            if not n.endswith(CODIGO):
                continue
            fichero = os.path.join(dirpath, n)
            for _, ref in re_rel.findall(codigo(open(fichero, encoding='utf-8').read())):
                objetivo = os.path.normpath(os.path.join(dirpath, ref.split('?')[0]))
                if ref.endswith('/'):
                    continue
                if not os.path.exists(objetivo):
                    rotas.append(f'{os.path.relpath(fichero, SALIDA)} → {ref}')
    if rotas:
        raise Error(f'rutas que no llevan a nada en lo publicado: {sorted(set(rotas))[:12]}')
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
