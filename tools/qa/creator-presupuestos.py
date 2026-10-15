#!/usr/bin/env python3
"""Pruebas del creador: presupuestos y tema de color (Chromium + Playwright, almacén en memoria).

  - Presupuestos: la lista trae los dos de ejemplo; el editor da el total del ejemplo; PDF y Excel se descargan y se
    leen (pdftotext, openpyxl); añadir una línea cambia el total y se guarda; un presupuesto nuevo «con lo A
    presupuestar» de un juego y otro «con un cambio de tema» traen sus líneas; las tarifas se guardan y los
    presupuestos nuevos usan la tarifa cambiada.
  - Tema: el creador saca la paleta del juego, una paleta de partida la reparte, la vista previa se compone, aplicar
    guarda game.theme (válido) y la vista previa del juego sale con los colores nuevos; quitar el tema lo deja como
    estaba.
  - La cabecera de un juego, con «Tema», cabe en una línea a 1360 px.
Uso (desde la raíz del repo):  python3 tools/qa/creator-presupuestos.py
"""
import os, socket, subprocess, sys, time, urllib.request, tempfile
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = []


def rec(nombre, ok, detalle=''):
    RES.append(bool(ok))
    print(('OK    ' if ok else 'FALLO ') + nombre + (f' | {detalle}' if detalle else ''), flush=True)


def main():
    s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    base = f'http://127.0.0.1:{port}/creator/index.html?almacen=memoria'
    for _ in range(60):
        try: urllib.request.urlopen(base, timeout=1); break
        except Exception: time.sleep(0.2)
    tmp = tempfile.mkdtemp()
    errores = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
            pg = ctx.new_page(); pg.set_default_timeout(120000)
            pg.on('pageerror', lambda e: errores.append(str(e)))
            pg.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
            app = lambda expr: pg.evaluate(f"async () => {{ const {{ app }} = await import('./app.js'); return {expr}; }}")

            # ---- Presupuestos
            pg.goto(base + '#/presupuestos'); pg.wait_for_selector('tr[data-presupuesto]')
            rec('lista: los dos presupuestos de ejemplo', pg.locator('tr[data-presupuesto]').count() == 2)
            pg.click('a:has-text("P-2026-002")'); pg.wait_for_selector('[data-prueba=total-presupuesto]')
            rec('editor: el total del ejemplo', pg.inner_text('[data-prueba=total-presupuesto]') == '2.011,81 €', pg.inner_text('[data-prueba=total-presupuesto]'))
            with pg.expect_download() as d: pg.click('[data-pdf]')
            pdf = os.path.join(tmp, 'p.pdf'); d.value.save_as(pdf)
            texto = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
            rec('PDF descargado: número, concepto y total', 'P-2026-002' in texto and 'Ilustración o cuadro' in texto and '2.011,81 €' in texto and d.value.suggested_filename.endswith('.pdf'), d.value.suggested_filename)
            with pg.expect_download() as d: pg.click('[data-excel]')
            xlsx = os.path.join(tmp, 'p.xlsx'); d.value.save_as(xlsx)
            r = subprocess.run([sys.executable, '-c', "import openpyxl,sys; ws=openpyxl.load_workbook(sys.argv[1], data_only=True)['Presupuesto']; print([x for x in ws.iter_rows(values_only=True) if x[8]=='TOTAL'][0][9])", xlsx], capture_output=True, text=True)
            rec('Excel descargado: se abre y da el mismo total', r.stdout.strip() == '2011.81', r.stdout.strip() or r.stderr[-200:])
            pg.select_option('#pres-nuevo-concepto', 'icono'); pg.click('[data-anadir-linea]')
            pg.wait_for_function("document.querySelectorAll('tr[data-linea]').length === 11")
            total = pg.inner_text('[data-prueba=total-presupuesto]')
            rec('añadir un icono suma 45 € + gestión + IVA', total == '2.071,70 €', total)
            pg.click('[data-guardar]'); pg.wait_for_function("document.querySelector('[data-prueba=estado-presupuesto]').textContent === 'Guardado'")
            guardado = pg.evaluate("async () => (await (await import('./app.js')).app.almacen.leerPresupuesto('P-2026-002')).lineas.length")
            rec('se guarda en el almacén', guardado == 11, str(guardado))

            pg.goto(base + '#/presupuestos/tarifas'); pg.wait_for_selector('[data-tarifa=ilustracion]')
            pg.fill('[data-tarifa=ilustracion]', '35'); pg.press('[data-tarifa=ilustracion]', 'Tab')
            pg.click('[data-guardar-tarifas]'); pg.wait_for_timeout(200)
            t = pg.evaluate("async () => (await (await import('./app.js')).app.almacen.leerTarifas()).perfiles.ilustracion.tarifa")
            rec('tarifas: la hora de ilustración se guarda', t == 35, str(t))

            pg.goto(base + '#/presupuestos'); pg.wait_for_selector('tr[data-presupuesto]')
            pg.click('button:has-text("Nuevo presupuesto")')
            pg.fill('#pres-titulo', 'Cambio de tema'); pg.select_option('#pres-juego', 'cumple-mision-secreta'); pg.select_option('#pres-empezar', 'tema')
            pg.click('.dialogo button[type=submit]'); pg.wait_for_selector('[data-prueba=total-presupuesto]')
            lineas = pg.locator('tr[data-linea]').count()
            rec('nuevo con un cambio de tema: P-2026-003 con sus líneas', 'P-2026-003' in pg.inner_text('h1') and lineas == 4, f'{lineas} líneas')
            tarifa = pg.locator('tr[data-linea] input[aria-label="Tarifa por hora"]').first.input_value()
            rec('las líneas nuevas usan la tarifa cambiada (35 €/h)', tarifa == '35', tarifa)

            # ---- Tema
            pg.set_viewport_size({'width': 1360, 'height': 900})
            pg.goto(base + '#/juego/cumple-mision-secreta/tema'); pg.wait_for_selector('.tema-fila', timeout=180000)
            n = pg.locator('.tema-fila').count()
            rec('tema: la paleta del juego (entre 3 y 8 colores)', 3 <= n <= 8, str(n))
            alto = pg.evaluate("document.querySelector('.cabecera').getBoundingClientRect().height")
            rec('la cabecera del juego cabe en una línea a 1360 px', alto < 70, str(alto))
            pg.click('[data-paleta-id=halloween]'); pg.wait_for_selector('.tema-previa[data-listo]', timeout=180000)
            mapa = app("app.ui.tema.borrador.map.length")
            rec('una paleta de partida reparte sus colores', mapa == n, f'{mapa} de {n}')
            pg.click('[data-aplicar-tema]')
            pg.wait_for_function("async () => true")
            tema = app("app.juego.theme && app.juego.theme.name")
            errores_val = app("app.validacion.errores.length")
            rec('aplicar: game.theme guardado y el juego sigue válido', tema == 'Halloween' and errores_val == 0, f'{tema} · {errores_val} errores')
            pg.goto(base + '#/juego/cumple-mision-secreta/previa'); pg.wait_for_selector('.previa-paginas[data-listo]', timeout=180000)
            morado = pg.evaluate("""() => { const c = document.querySelector('.previa-paginas canvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
                let n = 0; for (let i = 0; i < d.length; i += 4) { if (Math.abs(d[i] - 0x1B) < 12 && Math.abs(d[i + 1] - 0x10) < 12 && Math.abs(d[i + 2] - 0x28) < 12) n++; } return n; }""")
            rec('la vista previa sale con los colores del tema', morado > 500, f'{morado} píxeles del color más oscuro de Halloween')
            pg.goto(base + '#/juego/cumple-mision-secreta/tema'); pg.wait_for_selector('[data-quitar-tema]')
            pg.click('[data-quitar-tema]'); pg.wait_for_timeout(300)
            rec('quitar el tema', app("app.juego.theme === undefined"))
            b.close()
    finally:
        srv.terminate()
    rec('sin errores de JavaScript', not errores, '; '.join(errores)[:300])
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
