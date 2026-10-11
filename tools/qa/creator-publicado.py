#!/usr/bin/env python3
"""Prueba de la copia publicada del editor (T5.7 de PLAN-CREADOR.md). Chromium + Playwright.

Construye docs/creador/ (tools/build-creator.py) y sirve docs/ con creator/serve.mjs --raiz docs.
Comprueba que docs/creador/index.html funciona como el editor de creator/: lista los juegos del almacén
en memoria, carga las mecánicas (la validación de la mecánica sale), el kit de arte (su panel), la
validación de final3 y la vista previa. En la copia publicada no está el PDF del artista, así que la
vista previa de final3 debe avisar de ello (no fallar en silencio).
Uso (desde la raíz del repo):  python3 tools/qa/creator-publicado.py
Código 0 si todo pasa; 1 si no.
"""
import os, socket, subprocess, sys, time, urllib.request
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


def main():
    r = subprocess.run([sys.executable, 'tools/build-creator.py'], cwd=ROOT, capture_output=True, text=True)
    rec('build-creator: genera docs/creador/', r.returncode == 0, (r.stdout + r.stderr).strip()[:300])
    if r.returncode:
        return 1
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port), '--raiz', 'docs'], cwd=ROOT,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    no_encontrados = []
    try:
        if not esperar(base + '/creador/index.html'):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1280, 'height': 900})
            page.on('pageerror', lambda e: errores.append(str(e)))
            # Los recursos que faltan (404) se miran aparte; el consola los repite con texto genérico.
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
            page.on('response', lambda r: no_encontrados.append(r.url) if r.status == 404 else None)
            page.goto(base + '/creador/index.html?almacen=memoria')
            page.wait_for_selector('#juegos button')
            nombres = page.locator('#juegos small').all_inner_texts()
            rec('lista los dos juegos del almacén', sorted(nombres) == ['capas', 'final3'], ', '.join(nombres))

            page.locator('#juegos li').filter(has=page.locator('small', has_text='final3')).locator('button').click()
            page.wait_for_function("window.pmeCreador.juego && window.pmeCreador.juego.id === 'final3'")

            page.locator('#vistas button[data-vista="paginas"]').click()
            page.locator('#paginas button').first.click()
            page.wait_for_selector('#detalle')
            rec('el kit se carga: su panel aparece en la página', page.locator('h3', has_text='Kit de arte').count() == 1)

            page.locator('#vistas button[data-vista="mecanicas"]').click()
            page.locator('#paginas button').first.click()
            page.wait_for_selector('.errores-mecanica')
            rec('las mecánicas se cargan: su validación aparece', page.locator('.errores-mecanica').count() == 1)

            page.locator('#vistas button[data-vista="validar"]').click()
            page.wait_for_selector('text=Sin errores')
            rec('validar: final3 sin errores para enviar', page.locator('text=Sin errores').count() == 1)

            page.locator('#vistas button[data-vista="vista"]').click()
            page.get_by_role('button', name='Componer vista previa').click()
            page.wait_for_selector('.error:has-text("No se pudo componer")', timeout=20000)
            aviso = page.locator('.error', has_text='No se pudo componer').count()
            rec('vista previa: sin el PDF del artista avisa (no falla en silencio)', aviso == 1,
                page.locator('.error').first.inner_text()[:160] if aviso else '')

            rec('el único recurso que falta es el PDF del artista (no se publica)',
                no_encontrados and all(u.endswith('/Final3-Clean.pdf') for u in no_encontrados), ', '.join(no_encontrados)[:200])
            rec('sin excepciones de página', not errores, '; '.join(errores)[:300])
            b.close()
    finally:
        srv.terminate()
        srv.wait(timeout=5)

    total = len(RES)
    ok = sum(RES)
    print(f'\nRESUMEN: {ok}/{total} OK')
    return 0 if ok == total else 1


if __name__ == '__main__':
    sys.exit(main())
