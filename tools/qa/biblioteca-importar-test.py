#!/usr/bin/env python3
"""Prueba del importador de arte (F2.2 de PLAN-CREADOR-2.md).

Genera en tools/qa/salida-qa/biblioteca-importar/ las entradas del artista (PDF vectorial con capa
«zona-foto», SVG, PNG con zonas en un fichero JSON), las importa a una colección nueva y comprueba:
  - cada formato entra, con su PDF, PNG, tamaño en mm y zonas;
  - la colección resultante valida (tools/biblioteca/validar.mjs);
  - una pieza que no debe entrar (texto dentro del PDF, categoría mala, licencia no admitida, versión repetida)
    se rechaza y no deja ficheros ni cambios en el manifiesto.
Uso (desde la raíz del repo): python3 tools/qa/biblioteca-importar-test.py   (código 0 si todo pasa)
"""
import json, os, shutil, subprocess, sys
import pymupdf
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
IMPORTAR = os.path.join(ROOT, 'tools', 'biblioteca', 'importar-arte.py')
SALIDA = os.path.join(ROOT, 'tools', 'qa', 'salida-qa', 'biblioteca-importar')
COL = os.path.join(SALIDA, 'coleccion')
ENT = os.path.join(SALIDA, 'entradas')
fallos = 0


def comprobar(nombre, ok, detalle=''):
    global fallos
    if not ok:
        fallos += 1
    print(f"{'OK  ' if ok else 'FALLO'} {nombre}{' | ' + detalle if detalle and not ok else ''}")


def importar(fichero, *extra, id_='papel-prueba', cat='papel', etiquetas='misterio, kraft, pista', extra_args=()):
    cmd = ['python3', IMPORTAR, fichero, COL, '--id', id_, '--categoria', cat, '--nombre', 'Prueba',
           '--etiquetas', etiquetas, '--autor', 'Kreatures', '--origen', 'Prueba de importación', *extra_args]
    r = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    return r.returncode, (r.stdout + r.stderr).strip()


def manifiesto():
    return json.load(open(os.path.join(COL, 'manifest.json'), encoding='utf-8'))


def valida():
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'biblioteca', 'validar.mjs'), COL],
                       cwd=ROOT, capture_output=True, text=True)
    return r.returncode == 0, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else ''


def main():
    shutil.rmtree(SALIDA, ignore_errors=True)
    os.makedirs(ENT); os.makedirs(COL)
    # 1. Entradas del artista
    pdf = os.path.join(ENT, 'papel-hoja.pdf')
    d = pymupdf.open(); p = d.new_page(width=300, height=200)
    oc = d.add_ocg('zona-foto')
    sh = p.new_shape(); sh.draw_rect(pymupdf.Rect(20, 20, 120, 100)); sh.finish(color=(1, 0, 1), width=1, oc=oc); sh.commit()
    sh = p.new_shape(); sh.draw_rect(pymupdf.Rect(150, 30, 270, 150)); sh.finish(color=(0, 0, 0), fill=(0.9, 0.8, 0.6)); sh.commit()
    d.save(pdf)
    svg = os.path.join(ENT, 'papel-etiqueta.svg')
    open(svg, 'w').write('<svg xmlns="http://www.w3.org/2000/svg" width="120mm" height="80mm" viewBox="0 0 120 80">'
                         '<rect x="10" y="10" width="50" height="30" fill="#c33"/><circle cx="90" cy="40" r="15" fill="#36c"/></svg>')
    png = os.path.join(ENT, 'papel-sello.png')
    Image.new('RGBA', (600, 300), (200, 60, 60, 255)).save(png, dpi=(300, 300))
    zonas = os.path.join(ENT, 'zonas-sello.json')
    json.dump([{'tipo': 'zona-texto', 'x': 10, 'y': 60, 'w': 80, 'h': 30}], open(zonas, 'w'))

    # 2. Importación correcta de los tres formatos
    c, out = importar(pdf, id_='papel-hoja-prueba', extra_args=())
    comprobar('PDF con capa zona-foto entra', c == 0, out)
    if c == 0:
        pz = manifiesto()['pieces'][-1]
        comprobar('PDF: tamaño 300×200 pt ≈ 105,8×70,6 mm', abs(pz['widthMm'] - 105.8) < 0.2 and abs(pz['heightMm'] - 70.6) < 0.2, str((pz['widthMm'], pz['heightMm'])))
        comprobar('PDF: la capa zona-foto pasa a ser zona (≈ 6,7 % × 26,7 %)',
                  any(z['tipo'] == 'zona-foto' and abs(z['x'] - 6.67) < 0.1 and abs(z['w'] - 33.33) < 0.1 for z in pz['zones']), str(pz['zones']))
        comprobar('PDF: la pieza no dibuja la guía (solo el rectángulo de arte)',
                  len(pymupdf.open(os.path.join(COL, pz['file']))[0].get_drawings()) == 1)
        comprobar('PDF: miniatura PNG creada', os.path.exists(os.path.join(COL, pz['thumb'])))
    c, out = importar(svg, id_='papel-etiqueta-prueba')
    comprobar('SVG entra', c == 0, out)
    c, out = importar(png, id_='papel-sello-prueba', extra_args=('--zonas', zonas))
    comprobar('PNG con zonas entra', c == 0, out)
    if c == 0:
        pz = manifiesto()['pieces'][-1]
        comprobar('PNG: tamaño 600×300 px a 300 ppp = 50,8×25,4 mm', abs(pz['widthMm'] - 50.8) < 0.1 and abs(pz['heightMm'] - 25.4) < 0.1, str((pz['widthMm'], pz['heightMm'])))
        comprobar('PNG: zona-texto del fichero de zonas', pz['zones'] and pz['zones'][0]['tipo'] == 'zona-texto')
    ok, ult = valida()
    comprobar('la colección con los tres formatos valida', ok, ult)

    # 3. Rechazos: no entra y no deja nada
    antes = open(os.path.join(COL, 'manifest.json'), encoding='utf-8').read()
    ficheros_antes = sorted(os.listdir(os.path.join(COL, 'piezas')))
    texto = os.path.join(ENT, 'con-texto.pdf')
    d = pymupdf.open(); p = d.new_page(width=200, height=100); p.insert_text((20, 50), 'Hola', fontsize=12); d.save(texto)
    casos = [
        ('PDF con texto se rechaza', texto, dict(id_='papel-texto-prueba'), 'texto'),
        ('categoría que no existe se rechaza', pdf, dict(id_='papel-x-prueba', cat='inventada'), 'categoría'),
        ('dos etiquetas se rechazan', pdf, dict(id_='papel-x-prueba', etiquetas='a, b'), 'etiquetas'),
        ('versión repetida se rechaza', pdf, dict(id_='papel-hoja-prueba', extra_args=('--version', '1')), 'ya existe la versión'),
        ('licencia no admitida: no entra ni deja ficheros', pdf, dict(id_='papel-lic-prueba', extra_args=('--licencia', 'All rights reserved')), 'licencia'),
    ]
    for nombre, fich, kw, esperado in casos:
        c, out = importar(fich, **kw)
        comprobar(nombre, c != 0 and esperado in out, out)
    comprobar('los rechazos no cambian el manifiesto', open(os.path.join(COL, 'manifest.json'), encoding='utf-8').read() == antes)
    comprobar('los rechazos no dejan ficheros en piezas/', sorted(os.listdir(os.path.join(COL, 'piezas'))) == ficheros_antes)
    print(f"\nRESUMEN: {'todo OK' if fallos == 0 else str(fallos) + ' fallo(s)'}")
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main())
