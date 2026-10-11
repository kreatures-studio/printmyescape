#!/usr/bin/env python3
"""Pruebas del formulario y las mecánicas del editor (T5.5 de PLAN-CREADOR.md). Chromium + Playwright,
almacén en memoria.

Formulario: se listan las secciones y sus campos; se cambian el tope (cap) y la pregunta en español
de un campo; al guardar, el juego difiere del fichero original solo en esos dos valores; deshacer
devuelve el tipo de un campo.
Mecánicas: se listan; los parámetros se editan como JSON por clave (las obligatorias se marcan);
un JSON no válido o un parámetro obligatorio que falta no se aplica; la validación de la mecánica
(la misma que usa el validador) aparece en el panel.
Uso (desde la raíz del repo):  python3 tools/qa/creator-campos.py
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
            page.wait_for_selector('#vistas button:not([disabled])')

            # --- Formulario ---
            page.get_by_role('button', name='Formulario').click()
            secciones = page.locator('#paginas button').count()
            rec('formulario: nueve secciones', secciones == 9, f'{secciones}')
            page.get_by_role('button', name='El cumpleañero').click()
            campos = page.locator('.campos-seccion button').all_inner_texts()
            esperados = original['form']['sections'][0]['fields']
            rec('la sección «El cumpleañero» lista sus campos (los del juego)', campos == esperados, f'{len(campos)} campos')
            page.locator('.campos-seccion button', has_text='NOMBRE_CUMPLE').click()
            page.wait_for_selector('.propiedades.campo')
            tipo = page.get_by_label('Tipo').input_value()
            rec('el campo muestra su tipo', tipo == 'name', tipo)

            page.get_by_label('Tope de caracteres (cap)').fill('10')
            page.get_by_label('Tope de caracteres (cap)').press('Tab')
            page.get_by_label('Pregunta (es)').fill('Nombre del cumpleañero')
            page.get_by_label('Pregunta (es)').press('Tab')
            page.wait_for_function("window.pmeCreador.juego.fields.NOMBRE_CUMPLE.cap === 10")
            rec('cambiar el tope y la pregunta actualiza el juego',
                page.evaluate('window.pmeCreador.juego.fields.NOMBRE_CUMPLE.q.es') == 'Nombre del cumpleañero')

            page.get_by_role('button', name='Guardar').click()
            page.wait_for_function("document.getElementById('estado').textContent === 'Guardado'")
            guardado = page.evaluate("window.pmeCreador.almacen.load('final3')")['game']
            cambios = diferencias(original, guardado)
            rec('ACEPTACIÓN del formulario: al guardar solo cambian el tope y la pregunta',
                sorted(cambios) == ['.fields.NOMBRE_CUMPLE.cap', '.fields.NOMBRE_CUMPLE.q.es'], ', '.join(cambios))

            page.locator('.campos-seccion button', has_text='B_ALIAS').click()
            page.wait_for_selector('.propiedades.campo')
            page.get_by_label('Tipo').select_option('text')
            page.wait_for_function("window.pmeCreador.juego.fields.B_ALIAS.type === 'text'")
            page.get_by_role('button', name='Deshacer').click()
            page.wait_for_function("window.pmeCreador.juego.fields.B_ALIAS.type === 'name'")
            rec('deshacer devuelve el tipo del campo', True)

            # --- Mecánicas ---
            page.get_by_role('button', name='Mecánicas').click()
            n_mec = page.locator('#paginas button').count()
            rec('mecánicas: seis en final3', n_mec == 6, f'{n_mec}')
            page.locator('#paginas button', has_text='ticks').click()
            page.wait_for_selector('#param-boxes')
            etiquetas = page.locator('.propiedades.mecanica label').all_inner_texts()
            rec('los parámetros salen por clave; las obligatorias se marcan',
                'field (obligatorio)' in etiquetas and 'boxes (obligatorio)' in etiquetas and 'half' in etiquetas, ' · '.join(etiquetas))

            page.fill('#param-half', '0.7')
            page.get_by_role('button', name='Aplicar parámetros').click()
            page.wait_for_function("window.pmeCreador.juego.mechanics[0].params.half === 0.7")
            rec('aplicar: el parámetro cambia en el juego', True)

            antes = page.evaluate('window.pmeCreador.juego.mechanics[0].params.boxes.length')
            page.fill('#param-boxes', '[{"x": 1,')
            page.get_by_role('button', name='Aplicar parámetros').click()
            despues = page.evaluate('window.pmeCreador.juego.mechanics[0].params.boxes.length')
            rec('JSON no válido: no se aplica y avisa', 'no es JSON válido' in page.inner_text('p.error:not([hidden])') and despues == antes,
                f'boxes {antes} → {despues}')

            page.fill('#param-boxes', json.dumps(page.evaluate('window.pmeCreador.juego.mechanics[0].params.boxes')))
            page.fill('#param-field', '')
            page.get_by_role('button', name='Aplicar parámetros').click()
            rec('falta un parámetro obligatorio: no se aplica y lo dice',
                'obligatorios: field' in page.inner_text('p.error:not([hidden])'), page.inner_text('p.error:not([hidden])'))

            page.fill('#param-field', 'NO_EXISTE')
            page.get_by_role('button', name='Aplicar parámetros').click()
            page.wait_for_function("window.pmeCreador.juego.mechanics[0].params.field === 'NO_EXISTE'")
            errores_mec = page.locator('.errores-mecanica').inner_text()
            rec('la validación de la mecánica aparece en el panel',
                'no existe el campo «NO_EXISTE»' in errores_mec, errores_mec)

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
