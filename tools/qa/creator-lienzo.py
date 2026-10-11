#!/usr/bin/env python3
"""Pruebas del lienzo del editor (T5.3 de PLAN-CREADOR.md). Chromium + Playwright, almacén en memoria.

Aceptación: mover un hueco y guardar cambia solo su `x` (se compara el juego guardado con el
fichero original, campo a campo). Además: arrastrar en horizontal no cambia `y`; redimensionar
cambia `w` y no `x`; flechas mueven el hueco (Mayús: paso grande); deshacer restaura; el panel de
propiedades cambia el valor; un guardado con una versión más nueva dice que hay que recargar.
Uso (desde la raíz del repo):  python3 tools/qa/creator-lienzo.py
Código 0 si todo pasa; 1 si no.
"""
import json, os, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
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


def diferencias(a, b, ruta=''):
    """Rutas donde a y b difieren (listas y objetos recorridos)."""
    if type(a) != type(b):
        return [ruta]
    if isinstance(a, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(f'{ruta}.{k}')
            else:
                out += diferencias(a[k], b[k], f'{ruta}.{k}')
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            return [ruta]
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out += diferencias(x, y, f'{ruta}[{i}]')
        return out
    return [] if a == b else [ruta]


def centro(loc):
    b = loc.bounding_box()
    return b['x'] + b['width'] / 2, b['y'] + b['height'] / 2


def arrastrar(page, desde, dx, dy):
    x, y = desde
    page.mouse.move(x, y)
    page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(x + dx * i / 8, y + dy * i / 8)
    page.mouse.up()


def main():
    original = json.load(open(os.path.join(ROOT, 'games', 'final3', 'game.json'), encoding='utf8'))
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
            page.goto(base + '/creator/index.html?almacen=memoria')
            page.get_by_role('button', name='Regalo robado').click()
            page.locator('#paginas button').first.click()
            page.wait_for_selector('.hueco')
            n = page.locator('.hueco').count()
            rec('página 1: un elemento por hueco', n == 19, f'{n} huecos')

            def juego():
                return page.evaluate('window.pmeCreador.juego')

            def slot(k, p_=0):
                return page.evaluate(f'window.pmeCreador.juego.template.pages[{p_}].slots[{k}]')

            s0 = slot(0)
            rec('la página de prueba tiene 19 huecos en el juego', len(juego()['template']['pages'][0]['slots']) == 19)

            # 1) Seleccionar y arrastrar en horizontal.
            page.locator('.hueco[data-k="0"]').click()
            page.wait_for_selector('#prop-x')
            rec('seleccionar: aparece el panel de propiedades', page.locator('#prop-x').count() == 1)
            cx, cy = centro(page.locator('.hueco[data-k="0"]'))
            arrastrar(page, (cx, cy), 60, 0)
            s1 = slot(0)
            rec('arrastrar en horizontal: cambia x', s1['x'] != s0['x'], f"x {s0['x']} → {s1['x']}")
            rec('arrastrar en horizontal: no cambia y ni w ni h',
                s1['y'] == s0['y'] and s1['w'] == s0['w'] and s1['h'] == s0['h'])
            rec('la barra dice que hay cambios sin guardar', 'sin guardar' in page.inner_text('#estado'))

            # 2) Guardar: solo cambia su x (comparado con el fichero original).
            page.get_by_role('button', name='Guardar').click()
            page.wait_for_function("document.getElementById('estado').textContent === 'Guardado'")
            guardado = page.evaluate("window.pmeCreador.almacen.load('final3')")
            cambios = diferencias(original, guardado['game'])
            esperado = ['.template.pages[0].slots[0].x']
            rec('ACEPTACIÓN: mover y guardar cambia solo el x del hueco', cambios == esperado, ', '.join(cambios)[:200] or 'sin diferencias')

            # 3) Deshacer: vuelve a la posición original.
            page.get_by_role('button', name='Deshacer').click()
            rec('deshacer: vuelve el x original', slot(0)['x'] == s0['x'], f"x {slot(0)['x']}")

            # 4) Flechas: paso fino y paso grande.
            page.locator('.hueco[data-k="1"]').click()
            page.locator('.hueco[data-k="1"]').focus()
            x1, y1 = slot(1)['x'], slot(1)['y']
            page.keyboard.press('ArrowRight')
            page.locator('.hueco[data-k="1"]').focus()
            page.keyboard.press('Shift+ArrowDown')
            s_1 = slot(1)
            rec('flechas: derecha mueve x 0,5 y Mayús+abajo mueve y 5',
                round(s_1['x'] - x1, 2) == 0.5 and round(s_1['y'] - y1, 2) == 5, f"x +{round(s_1['x'] - x1, 2)} y +{round(s_1['y'] - y1, 2)}")

            # 5) Redimensionar con el asa: cambia w, no x.
            page.locator('.hueco[data-k="2"]').click()
            page.wait_for_selector('.asa')
            s2 = slot(2)
            ax, ay = centro(page.locator('.asa'))
            arrastrar(page, (ax, ay), 30, 0)
            s2b = slot(2)
            rec('redimensionar: cambia w y no x', s2b['w'] != s2['w'] and s2b['x'] == s2['x'], f"w {s2['w']} → {s2b['w']}")

            # 6) Panel de propiedades: escribir un valor lo aplica.
            page.locator('.hueco[data-k="2"]').click()
            page.wait_for_selector('#prop-angle, #prop-w')
            page.fill('#prop-w', '12.5')
            page.keyboard.press('Tab')
            rec('propiedades: escribir w lo aplica', slot(2)['w'] == 12.5, f"w {slot(2)['w']}")

            # 7) Conflicto: otra versión más nueva en el almacén → guardar avisa.
            page.locator('.hueco[data-k="0"]').click()
            page.locator('.hueco[data-k="0"]').focus()
            page.keyboard.press('ArrowLeft')
            page.evaluate("""async () => {
                const a = window.pmeCreador.almacen;
                const { game, rev } = await a.load('final3');
                game.name = { es: 'Otra versión', en: 'Other version' };
                await a.save('final3', game, rev, 'otra pestaña');
            }""")
            page.get_by_role('button', name='Guardar').click()
            page.wait_for_function("document.getElementById('estado').textContent.includes('recarga')")
            rec('guardar con versión más nueva: avisa de recargar', 'recarga' in page.inner_text('#estado'), page.inner_text('#estado'))

            # 8) Deshacer con Ctrl+Z: un movimiento con flecha se deshace.
            page.locator('.hueco[data-k="0"]').focus()
            x_antes = slot(0)['x']
            page.keyboard.press('ArrowRight')
            x_movido = slot(0)['x']
            page.locator('body').click(position={'x': 5, 'y': 5})
            page.keyboard.press('Control+z')
            x_tras = slot(0)['x']
            rec('Ctrl+Z deshace el último movimiento',
                x_movido != x_antes and x_tras == x_antes, f'{x_antes} → {x_movido} → {x_tras}')

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
