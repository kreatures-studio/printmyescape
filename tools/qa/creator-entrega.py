#!/usr/bin/env python3
"""Pruebas de validación, vista previa, envío y sondeo del editor (T5.6 de PLAN-CREADOR.md).
Chromium + Playwright, almacén en memoria, kit de prueba (tools/qa/fixtures/capas/kit).

Comprueba:
  - validar: final3 pasa lo necesario para enviar; un fallo (cap a 0) aparece como enlace; el enlace
    lleva al campo; «Enviar al estudio» queda desactivado mientras haya errores;
  - vista previa: final3 y el juego por capas se componen en el navegador; el PDF lleva «VISTA PREVIA»
    (se extrae el texto con pdftotext) y su número de páginas coincide con el juego;
  - envío: con el juego corregido, «Enviar al estudio» guarda el juego como «enviado» y abre la petición;
  - sondeo: si otra versión es más nueva aparece el aviso; «recargar» trae esa versión.
Uso (desde la raíz del repo):  python3 tools/qa/creator-entrega.py
Código 0 si todo pasa; 1 si no.
"""
import base64, json, os, socket, subprocess, sys, time, urllib.request
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


def leer(ruta):
    return json.load(open(os.path.join(ROOT, ruta), encoding='utf8'))


def texto_pdf(datos):
    """Texto de un PDF (pdftotext) desde bytes."""
    tmp = os.path.join(os.environ.get('TMPDIR_PRUEBA', os.path.join(ROOT, 'salidas', 'qa')), 'entrega-previa.pdf')
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    with open(tmp, 'wb') as f:
        f.write(datos)
    # -raw y sin espacios: la marca va girada y pdftotext la parte en letras sueltas.
    r = subprocess.run(['pdftotext', '-raw', tmp, '-'], capture_output=True, text=True)
    return ''.join(r.stdout.split())


def main():
    original = leer('games/final3/game.json')
    capas = leer('tools/qa/fixtures/games/capas/game.json')
    cap_original = original['fields']['NOMBRE_1']['cap']
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    try:
        if not esperar(base + '/creator/index.html'):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        url = (base + '/creator/index.html?almacen=memoria&sondeo=400'
               '&kit=../tools/qa/fixtures/capas/kit/manifest.json')
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1280, 'height': 900})
            page.on('pageerror', lambda e: errores.append(str(e) + ' @ ' + str(getattr(e, 'stack', ''))[:1500]))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
            page.goto(url)

            def abrir_juego(id_):
                page.locator('#juegos li').filter(has=page.locator('small', has_text=id_)).locator('button').click()
                page.wait_for_function(f"window.pmeCreador.juego && window.pmeCreador.juego.id === '{id_}'")

            def vista(nombre):
                page.locator(f'#vistas button[data-vista="{nombre}"]').click()

            def juego():
                return page.evaluate('window.pmeCreador.juego')

            # 1) Validar final3: lo necesario para enviar está completo.
            abrir_juego('final3')
            vista('validar')
            page.wait_for_selector('text=Sin errores')
            rec('validar: final3 no tiene errores para enviar', page.locator('text=Sin errores').count() == 1)
            rec('validar: «Enviar al estudio» activo si no hay errores', page.get_by_role('button', name='Enviar al estudio').is_enabled())

            # 2) Vista previa de final3 (ejemplo 1, español): PDF con marca de agua y mismas páginas.
            vista('vista')
            page.get_by_role('button', name='Componer vista previa').click()
            page.wait_for_selector('.previa-marco', timeout=20000)
            src = page.locator('.previa-marco').get_attribute('src')
            rec('vista previa: final3 se compone en el navegador (blob)', src.startswith('blob:'))
            datos = page.evaluate("""async (u) => {
                const b = new Uint8Array(await (await fetch(u)).arrayBuffer());
                let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
                return btoa(s);
            }""", src)
            pdf = base64.b64decode(datos)
            rec('vista previa: el PDF empieza por %PDF', pdf[:4] == b'%PDF')
            texto = texto_pdf(pdf)
            rec('vista previa: el PDF lleva la marca «VISTA PREVIA»', 'VISTAPREVIA' in texto)
            paginas = len(original['template']['pages'])
            rec(f'vista previa: {paginas} páginas, como el juego', f'{paginas} página(s)' in page.inner_text('#detalle'))

            # 3) Validar NOMBRE_1: cap a 0 → error con enlace; el botón de enviar se desactiva.
            vista('formulario')
            seccion = next(i for i, s in enumerate(original['form']['sections']) if 'NOMBRE_1' in (s.get('fields') or []))
            page.locator('#paginas button').nth(seccion).click()
            page.locator('.campos-seccion button', has_text='NOMBRE_1').click()
            page.wait_for_selector('.campo input[type="number"]')
            cap_input = page.locator('.campo input[type="number"]')
            cap_input.fill('0')
            cap_input.dispatch_event('change')
            page.wait_for_function("window.pmeCreador.juego.fields.NOMBRE_1.cap === 0")
            vista('validar')
            enlace = page.locator('.lista-problemas button', has_text='fields/NOMBRE_1')
            rec('validar: el fallo aparece como enlace', enlace.count() == 1)
            rec('validar: «Enviar al estudio» desactivado con errores', page.get_by_role('button', name='Enviar al estudio').is_disabled())
            enlace.click()
            page.wait_for_selector('.campo')
            rec('enlace: lleva al campo del formulario', page.locator('h3', has_text='Campo NOMBRE_1').count() == 1)

            # 4) Arreglar el campo y enviar: guarda como «enviado» y abre la petición.
            page.locator('.campo input[type="number"]').fill(str(cap_original))
            page.locator('.campo input[type="number"]').dispatch_event('change')
            page.wait_for_function(f"window.pmeCreador.juego.fields.NOMBRE_1.cap === {cap_original}")
            vista('validar')
            page.wait_for_selector('text=Sin errores')
            page.get_by_role('button', name='Enviar al estudio').click()
            page.wait_for_selector('text=Enviado. Petición:')
            guardado = page.evaluate("window.pmeCreador.almacen.load('final3')")
            rec('envío: el juego guardado está como «enviado»', guardado['game']['status'] == 'enviado', guardado['game']['status'])
            rec('envío: el tope corregido se guarda', guardado['game']['fields']['NOMBRE_1']['cap'] == cap_original)
            rec('envío: no queda nada sin guardar', page.evaluate('window.pmeCreador.sucio') is False)
            rec('envío: el botón queda desactivado', page.get_by_role('button', name='Enviar al estudio').is_disabled())

            # 5) Juego por capas: vista previa con su kit de prueba (la pieza sale en el PDF).
            abrir_juego(capas['id'])
            vista('vista')
            page.get_by_role('button', name='Componer vista previa').click()
            page.wait_for_selector('.previa-marco', timeout=20000)
            src = page.locator('.previa-marco').get_attribute('src')
            datos = page.evaluate("""async (u) => {
                const b = new Uint8Array(await (await fetch(u)).arrayBuffer());
                let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
                return btoa(s);
            }""", src)
            rec('vista previa por capas: el PDF lleva «VISTA PREVIA»', 'VISTAPREVIA' in texto_pdf(base64.b64decode(datos)))

            # 6) Sondeo: otra versión más nueva (guardada desde fuera) → aviso y «recargar» la trae.
            page.evaluate("""async (id) => {
                const a = window.pmeCreador.almacen;
                const { game, rev } = await a.load(id);
                game.name = { ...game.name, es: game.name.es + ' (otra)' };
                await a.save(id, game, rev, 'cambio desde fuera');
            }""", capas['id'])
            page.wait_for_selector('.aviso-novedades', timeout=5000)
            rec('sondeo: aparece el aviso de cambios nuevos', page.locator('.aviso-novedades').count() == 1)
            page.locator('.aviso-novedades button', has_text='recargar').click()
            page.wait_for_function("window.pmeCreador.juego.name.es.endsWith('(otra)')")
            rec('sondeo: «recargar» trae la versión nueva', juego()['name']['es'].endswith('(otra)'))
            rec('sondeo: el aviso desaparece tras recargar', page.locator('.aviso-novedades').count() == 0)

            b.close()
        ruido = [e for e in errores if '401' not in e and '409' not in e and '422' not in e]
        rec('sin errores de página (excepciones) durante las pruebas', not ruido, '; '.join(ruido)[:300])
    finally:
        srv.terminate()
        srv.wait(timeout=5)

    total = len(RES)
    ok = sum(RES)
    print(f'\nRESUMEN: {ok}/{total} OK')
    return 0 if ok == total else 1


if __name__ == '__main__':
    sys.exit(main())
