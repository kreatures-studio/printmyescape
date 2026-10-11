#!/usr/bin/env python3
"""Pruebas del esqueleto del editor (T5.1 de PLAN-CREADOR.md). Chromium headless + Playwright.

Levanta creator/serve.mjs en un puerto libre y comprueba: la lista de juegos, las páginas de un
juego (con sus huecos y capas), el detalle de una página con sus capas, que no hay errores de
consola y que el servidor no sirve rutas fuera del repo ni .git.
Uso (desde la raíz del repo):  python3 tools/qa/creator-esqueleto.py
Código 0 si todo pasa; 1 si algo falla.
"""
import os, socket, subprocess, sys, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = []


def rec(nombre, ok, detalle=''):
    RES.append(ok)
    print(('OK    ' if ok else 'FALLO ') + nombre + (f' | {detalle}' if detalle else ''), flush=True)


def puerto_libre():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def esperar(url, limite=15):
    fin = time.time() + limite
    while time.time() < fin:
        try:
            urllib.request.urlopen(url, timeout=1)
            return True
        except Exception:
            time.sleep(0.2)
    return False


def estado(url):
    try:
        return urllib.request.urlopen(url, timeout=5).status
    except urllib.error.HTTPError as e:
        return e.code


def main():
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        if not esperar(base + '/creator/index.html'):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        rec('el servidor sirve el editor', True, base + '/creator/index.html')
        rec('ruta fuera del repo: 404', estado(base + '/creator/../../../etc/passwd') in (400, 404))
        rec('.git no se sirve', estado(base + '/.git/config') == 404)
        rec('node_modules no se sirve', estado(base + '/tools/node_modules/pdf-lib/package.json') == 404)

        errores = []
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1200, 'height': 800})
            page.on('pageerror', lambda e: errores.append(str(e)))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
            page.goto(base + '/creator/index.html')
            page.wait_for_selector('#juegos button')

            nombres = page.locator('#juegos button').all_inner_texts()
            rec('lista de juegos: dos juegos', len(nombres) == 2, ' / '.join(n.split('\n')[0] for n in nombres))

            page.get_by_role('button', name='Regalo robado').click()
            page.wait_for_selector('#paginas button')
            n_pag = page.locator('#paginas button').count()
            rec('final3: 16 páginas', n_pag == 16, f'{n_pag} páginas')
            primera = page.locator('#paginas button').first.inner_text()
            rec('final3: la primera página dice sus huecos y capas', '19 huecos · 0 capas' in primera, primera.replace('\n', ' · '))

            page.get_by_role('button', name='Prueba de capas').click()
            page.wait_for_selector('#paginas button')
            page.locator('#paginas button').first.click()
            page.wait_for_selector('#detalle dl')
            detalle = page.locator('#detalle').inner_text()
            rec('capas: la página de prueba lista sus tres capas',
                all(x in detalle for x in ['prueba-degradado', 'prueba-rojo', 'prueba-azul']) and '30°' in detalle,
                detalle.replace('\n', ' · ')[:160])
            rec('marca activa en el juego y la página',
                page.get_by_role('button', name='Prueba de capas').get_attribute('aria-current') == 'true')

            page.set_viewport_size({'width': 390, 'height': 800})
            sin_scroll = page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            rec('móvil: sin scroll horizontal', sin_scroll)
            b.close()
        rec('sin errores de consola', not errores, '; '.join(errores)[:200])
    finally:
        srv.terminate()
        srv.wait(timeout=5)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' if ok else f'\nRESUMEN: {sum(RES)}/{len(RES)} OK (fallos)')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
