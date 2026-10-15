#!/usr/bin/env python3
"""Pruebas del creador: presupuestos y tema de color (Chromium + Playwright, almacén en memoria).

  - Presupuestos: la lista trae los dos de ejemplo; el editor da el total del ejemplo y, al lado, el escape con cada
    línea señalada; PDF y Excel se descargan y se leen (pdftotext, openpyxl); añadir una línea, cambiar su complejidad
    y señalarla en una página cambia el total y la marca, y se guarda; «Como lo verá el cliente» enseña el PDF; un
    presupuesto nuevo «con un cambio de tema» trae sus líneas; las tarifas se guardan y los presupuestos nuevos usan
    la tarifa cambiada.
  - Tema: el creador saca la paleta del juego, una paleta de partida la reparte, la vista previa se compone, aplicar
    guarda game.theme (válido) y la vista previa del juego sale con los colores nuevos; quitar el tema lo deja como
    estaba.
  - Armonías: la rueda de color (arrastrar, reglas) da la paleta nueva, se guarda en game.theme.palette y se vuelve
    a abrir igual; la paleta se descarga en .ase. Adobe Color: importar un .ase, pegar códigos, avisar con un enlace.
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
            pg.goto(base + '#/presupuestos'); pg.wait_for_selector('[data-presupuesto]')
            rec('lista: los dos presupuestos de ejemplo, en tarjetas con su reparto', pg.locator('a.tarjeta-presupuesto').count() == 2)
            pg.click('a:has-text("P-2026-002")'); pg.wait_for_selector('[data-prueba=total-presupuesto]')
            rec('editor: el total del ejemplo (tarifas nuevas)', pg.inner_text('[data-prueba=total-presupuesto]') == '798,60 €', pg.inner_text('[data-prueba=total-presupuesto]'))
            pg.wait_for_selector('[data-paginas-escape][data-listo]', timeout=180000)
            hojas = pg.locator('.hoja-escape').count(); marcas = pg.locator('.chapa.marca').count()
            rec('al lado, el escape con cada línea señalada en su página', hojas >= 6 and marcas >= 4, f'{hojas} páginas · {marcas} marcas')
            pg.locator('.chapa.marca').first.click(); pg.wait_for_timeout(300)
            rec('pulsar una marca selecciona su línea', pg.locator('article.tarjeta-linea.sel').count() == 1)
            with pg.expect_download() as d: pg.click('[data-pdf]')
            pdf = os.path.join(tmp, 'p.pdf'); d.value.save_as(pdf)
            texto = subprocess.run(['pdftotext', pdf, '-'], capture_output=True, text=True).stdout
            rec('PDF descargado: número, conceptos, total y «Dónde va cada cosa»', 'P-2026-002' in texto and 'Prop · complejidad muy alta' in texto and '798,60 €' in texto
                and 'DÓNDE VA CADA COSA' in texto.upper() and d.value.suggested_filename.endswith('.pdf'), d.value.suggested_filename)
            with pg.expect_download() as d: pg.click('[data-excel]')
            xlsx = os.path.join(tmp, 'p.xlsx'); d.value.save_as(xlsx)
            r = subprocess.run([sys.executable, '-c', "import openpyxl,sys; ws=openpyxl.load_workbook(sys.argv[1], data_only=True)['Presupuesto']; print([x for x in ws.iter_rows(values_only=True) if x[8]=='TOTAL'][0][9])", xlsx], capture_output=True, text=True)
            rec('Excel descargado: se abre y da el mismo total', r.stdout.strip() == '798.6', r.stdout.strip() or r.stderr[-200:])
            pg.select_option('#pres-nuevo-concepto', 'prop'); pg.click('[data-anadir-linea]')
            pg.wait_for_function("document.querySelectorAll('article.tarjeta-linea').length === 10")
            total = pg.inner_text('[data-prueba=total-presupuesto]')
            rec('añadir un prop de complejidad media suma 30 € + IVA', total == '834,90 €', total)
            nueva = pg.locator('article.tarjeta-linea.sel')
            nueva.locator('.niveles button:has-text("alta")').first.click(); pg.wait_for_timeout(200)
            total = pg.inner_text('[data-prueba=total-presupuesto]')
            rec('pasarlo a complejidad alta: 2 h × 30 € (total 871,20 €)', total == '871,20 €', total)
            antes = pg.locator('.chapa.marca').count()
            pg.locator('article.tarjeta-linea.sel [data-senalar]').click()
            pg.locator('.hoja-escape[data-pagina=p3]').click(position={'x': 60, 'y': 80}); pg.wait_for_timeout(300)
            anclas = pg.evaluate("async () => { const { app } = await import('./app.js'); const p = app.ui.presupuestos.actual; return p.lineas[p.lineas.length - 1].anclas || []; }")
            rec('«Señalar en el escape» y pulsar una página pone la marca de la línea', pg.locator('.chapa.marca').count() == antes + 1 and len(anclas) == 1 and anclas[0]['pagina'] == 'p3', str(anclas))
            pg.click('[data-guardar]'); pg.wait_for_function("document.querySelector('[data-prueba=estado-presupuesto]').textContent === 'Guardado'")
            guardado = pg.evaluate("async () => (await (await import('./app.js')).app.almacen.leerPresupuesto('P-2026-002')).lineas.length")
            rec('se guarda en el almacén', guardado == 10, str(guardado))
            pg.click('[data-vista-cliente]'); pg.wait_for_selector('[data-vista-cliente-paginas][data-listo]', timeout=120000)
            n = int(pg.get_attribute('[data-vista-cliente-paginas]', 'data-listo'))
            rec('«Como lo verá el cliente» enseña el PDF', n >= 2, f'{n} páginas')
            pg.keyboard.press('Escape')

            pg.goto(base + '#/presupuestos/tarifas'); pg.wait_for_selector('[data-tarifa=arte]')
            pg.fill('[data-tarifa=arte]', '35'); pg.press('[data-tarifa=arte]', 'Tab')
            pg.click('[data-guardar-tarifas]'); pg.wait_for_timeout(200)
            t = pg.evaluate("async () => (await (await import('./app.js')).app.almacen.leerTarifas()).perfiles.arte.tarifa")
            rec('tarifas: la hora de arte se guarda', t == 35, str(t))

            pg.goto(base + '#/presupuestos'); pg.wait_for_selector('[data-presupuesto]')
            pg.click('button:has-text("Nuevo presupuesto")')
            pg.fill('#pres-titulo', 'Cambio de tema'); pg.select_option('#pres-juego', 'cumple-mision-secreta'); pg.select_option('#pres-empezar', 'tema')
            pg.click('.dialogo button[type=submit]'); pg.wait_for_selector('[data-prueba=total-presupuesto]')
            lineas = pg.locator('article.tarjeta-linea').count()
            rec('nuevo con un cambio de tema: P-2026-003 con sus líneas', 'P-2026-003' in pg.inner_text('h1') and lineas == 3, f'{lineas} líneas')
            tarifa = pg.locator('section[data-seccion=arte] article.tarjeta-linea input[aria-label="Tarifa por hora"]').first.input_value()
            rec('las líneas nuevas usan la tarifa cambiada (35 €/h)', tarifa == '35', tarifa)
            alto = pg.evaluate("document.querySelector('.barra-presupuesto').getBoundingClientRect().height")
            rec('la barra del presupuesto cabe en una línea', alto < 70, str(alto))

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

            # ---- Armonías (rueda de color) y Adobe Color
            pg.click('[data-pestana-tema=armonias]'); pg.wait_for_selector('.rueda [data-marcador="2"]')
            rec('armonías: rueda con 5 puntos y 8 colores (con tinta y papeles)', pg.locator('.rueda .marcador').count() == 5 and pg.locator('.armonia-muestras .muestra-armonia').count() == 8)
            caja = pg.locator('.rueda').bounding_box(); m = pg.locator('[data-marcador="2"]').bounding_box()
            pg.mouse.move(m['x'] + m['width'] / 2, m['y'] + m['height'] / 2); pg.mouse.down()
            pg.mouse.move(caja['x'] + caja['width'] * 0.2, caja['y'] + caja['height'] * 0.75, steps=6); pg.mouse.up(); pg.wait_for_timeout(300)
            pal = app("app.ui.tema.borrador.palette")
            rec('arrastrar el color base usa la armonía como paleta nueva', pal and pal['source'] == 'armonia' and pal['rule'] == 'complementario' and len(pal['colors']) == 8, str(pal))
            pg.select_option('#tema-regla', 'triada'); pg.wait_for_timeout(300)
            regla = app("app.ui.tema.borrador.palette.rule"); nombre = app("app.ui.tema.borrador.name")
            rec('cambiar la regla (tríada) cambia la paleta y el nombre', regla == 'triada' and nombre == 'Armonía · Tríada', f'{regla} · {nombre}')
            pg.wait_for_selector('.tema-previa[data-listo]', timeout=180000)
            pg.click('[data-aplicar-tema]'); pg.wait_for_timeout(500)
            guardado = app("app.juego.theme && app.juego.theme.palette && app.juego.theme.palette.rule")
            rec('aplicar guarda la armonía en el juego y sigue válido', guardado == 'triada' and app("app.validacion.errores.length") == 0, str(guardado))
            pg.goto(base + '#/juego/cumple-mision-secreta/paginas'); pg.wait_for_timeout(300)
            pg.evaluate("async () => { const { app } = await import('./app.js'); app.ui.tema = null; }")
            pg.goto(base + '#/juego/cumple-mision-secreta/tema'); pg.wait_for_selector('.rueda')
            rec('al volver, se abre en Armonías con la tríada', pg.locator('[data-pestana-tema=armonias][aria-selected=true]').count() == 1 and pg.input_value('#tema-regla') == 'triada')
            with pg.expect_download() as d: pg.click('[data-descargar-ase]')
            ase = os.path.join(tmp, 'p.ase'); d.value.save_as(ase)
            leido = subprocess.run(['node', '--input-type=module', '-e', f"import fs from 'node:fs'; import {{ coloresDeAse }} from '{ROOT}/tools/game/armonias.mjs'; console.log(coloresDeAse(fs.readFileSync('{ase}')).length)"], capture_output=True, text=True).stdout.strip()
            rec('descargar la paleta nueva en .ase (para Illustrator o Photoshop)', d.value.suggested_filename.endswith('.ase') and leido.isdigit() and int(leido) >= 5, f'{d.value.suggested_filename} · {leido} colores')

            pg.click('[data-pestana-tema=adobe]'); pg.wait_for_selector('.zona-soltar')
            rec('Adobe Color: enlace a la rueda de Adobe', pg.get_attribute('.pasos-adobe a', 'href') == 'https://color.adobe.com/es/create/color-wheel')
            subprocess.run(['node', '--input-type=module', '-e', f"import fs from 'node:fs'; import {{ aseDeColores }} from '{ROOT}/tools/game/armonias.mjs'; fs.writeFileSync('{tmp}/Mi paleta.ase', aseDeColores(['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51']))"], check=True)
            pg.set_input_files('[data-importar-paleta]', os.path.join(tmp, 'Mi paleta.ase')); pg.wait_for_timeout(500)
            b2 = app("({ name: app.ui.tema.borrador.name, colors: app.ui.tema.borrador.palette && app.ui.tema.borrador.palette.colors })")
            rec('importar un .ase de Adobe Color: sus colores (y tinta y papeles, que le faltaban)', b2['name'] == 'Mi paleta' and b2['colors'][:5] == ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'] and len(b2['colors']) == 8, str(b2))
            pg.fill('#tema-pegar', 'https://color.adobe.com/es/Mi-paleta-color-theme-123/'); pg.click('[data-leer-pegado]'); pg.wait_for_timeout(200)
            rec('un enlace de Adobe Color explica que hay que descargar o copiar los códigos', 'Descargar' in pg.inner_text('.panel-adobe .mensaje'))
            pg.fill('#tema-pegar', '#1D3557 #457B9D #A8DADC #F1FAEE #E63946'); pg.click('[data-leer-pegado]'); pg.wait_for_timeout(300)
            rec('pegar los códigos de Adobe Color', app("app.ui.tema.borrador.palette.colors.slice(0, 5).join()") == '#1D3557,#457B9D,#A8DADC,#F1FAEE,#E63946')
            b.close()
    finally:
        srv.terminate()
    rec('sin errores de JavaScript', not errores, '; '.join(errores)[:300])
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
