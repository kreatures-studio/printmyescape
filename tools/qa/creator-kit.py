#!/usr/bin/env python3
"""Pruebas del panel del kit (T5.4 de PLAN-CREADOR.md). Chromium + Playwright, almacén en memoria.

Usa el manifiesto de prueba (tools/qa/fixtures/capas/kit/manifest.json; el del kit real está vacío
hasta T4.3). Comprueba: las piezas se listan; el filtro por etiqueta; arrastrar una pieza a la
página de un juego con fondo por capas añade una capa con el id de la pieza, dentro de la página y
con su tamaño según sus milímetros; en un juego con PDF de fondo no se añade nada y se avisa;
la capa añadida se guarda.
Uso (desde la raíz del repo):  python3 tools/qa/creator-kit.py
Código 0 si todo pasa; 1 si no.
"""
import os, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
KIT = '../tools/qa/fixtures/capas/kit/manifest.json'
RES = []


def rec(nombre, ok, detalle=''):
    RES.append(bool(ok))
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


def main():
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    try:
        if not esperar(base + '/creator/index.html'):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1280, 'height': 900})
            page.on('pageerror', lambda e: errores.append(str(e)))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
            page.goto(base + f'/creator/index.html?almacen=memoria&kit={KIT}')
            page.get_by_role('button', name='Prueba de capas').click()
            page.locator('#paginas button').first.click()
            page.wait_for_selector('.kit-pieza')

            piezas = page.locator('.kit-pieza').all()
            ids = [x.get_attribute('data-pieza') for x in piezas]
            rec('el kit lista sus tres piezas', sorted(ids) == ['prueba-azul', 'prueba-degradado', 'prueba-rojo'], ', '.join(ids))

            page.select_option('#kit-filtro', 'prueba')
            rec('filtro por etiqueta «prueba»: tres piezas', page.locator('.kit-pieza').count() == 3)
            page.select_option('#kit-filtro', '')

            capas_antes = page.evaluate('window.pmeCreador.juego.template.pages[0].layers.length')
            origen = page.locator('.kit-pieza[data-pieza="prueba-rojo"]')
            destino = page.locator('.lienzo')
            db = destino.bounding_box()
            origen.drag_to(destino, target_position={'x': db['width'] * 0.7, 'y': db['height'] * 0.3})
            capas = page.evaluate('window.pmeCreador.juego.template.pages[0].layers')
            nueva = capas[-1] if len(capas) > capas_antes else None
            rec('arrastrar una pieza a la página añade una capa', nueva is not None and len(capas) == capas_antes + 1,
                f'capas {capas_antes} → {len(capas)}')
            if nueva:
                # prueba-rojo: 120×80 mm → w = 120/210 y h = 80/297 de la página.
                esperado_w = round(120 / 210 * 100, 2)
                esperado_h = round(80 / 297 * 100, 2)
                rec('la capa usa la pieza y su tamaño en mm',
                    nueva['asset'] == 'prueba-rojo' and abs(nueva['w'] - esperado_w) < 0.02 and abs(nueva['h'] - esperado_h) < 0.02,
                    f"w {nueva['w']} h {nueva['h']}")
                dentro = 0 <= nueva['x'] and nueva['x'] + nueva['w'] <= 100 and 0 <= nueva['y'] and nueva['y'] + nueva['h'] <= 100
                rec('la capa queda dentro de la página', dentro, f"x {nueva['x']} y {nueva['y']}")
            n_datos = sum(1 for c in capas if c['asset'] == 'prueba-rojo')
            n_lienzo = page.locator('.capa[data-asset="prueba-rojo"]').count()
            rec('la capa aparece en el lienzo (hay tantas como en los datos)', n_lienzo == n_datos and n_datos == 2, f'lienzo {n_lienzo}, datos {n_datos}')

            page.get_by_role('button', name='Guardar').click()
            page.wait_for_function("document.getElementById('estado').textContent === 'Guardado'")
            guardado = page.evaluate("window.pmeCreador.almacen.load('capas')")
            ids_guardados = [c['asset'] for c in guardado['game']['template']['pages'][0]['layers']]
            rec('la capa añadida se guarda', 'prueba-rojo' in ids_guardados, ', '.join(ids_guardados))

            # Juego con PDF de fondo: no se puede añadir y se avisa.
            page.get_by_role('button', name='Regalo robado').click()
            page.locator('#paginas button').first.click()
            page.wait_for_selector('.lienzo')
            page.wait_for_selector('.kit-pieza')
            origen = page.locator('.kit-pieza[data-pieza="prueba-azul"]')
            destino = page.locator('.lienzo')
            db = destino.bounding_box()
            origen.drag_to(destino, target_position={'x': db['width'] * 0.5, 'y': db['height'] * 0.5})
            capas_final3 = page.evaluate('window.pmeCreador.juego.template.pages[0].layers')
            rec('PDF de fondo: no añade capas', capas_final3 is None, str(capas_final3))
            rec('PDF de fondo: avisa de cambiar a fondo por capas',
                'fondo por capas' in page.inner_text('#estado'), page.inner_text('#estado'))
            rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:200])
            b.close()
    finally:
        srv.terminate()
        srv.wait(timeout=5)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' if ok else f'\nRESUMEN: {sum(RES)}/{len(RES)} OK (fallos)')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
