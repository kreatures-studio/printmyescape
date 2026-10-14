#!/usr/bin/env python3
"""Pruebas del creador web (F4 de PLAN-CREADOR-2.md). Chromium + Playwright, almacén en memoria y biblioteca del
repositorio servida por creator/serve.mjs.

Recorre lo que hará el cliente con el juego del ensayo F3 (ensayos/f3/cumple-mision-secreta) sin ayuda:
  - inicio: sus juegos, «Para revisar» con los cambios de Claude y el juego antiguo (v1) en solo lectura;
  - diseñar página (F4.2): el lienzo compuesto por el motor; elegir, mover con el teclado, deshacer; texto fijo nuevo
    y su texto; imagen de la biblioteca; un cambio que deja el juego con errores se rechaza; subir una imagen;
  - formulario (F4.3): pregunta, tope (un tope que deja ejemplos largos fuera se rechaza), vista del comprador,
    sección nueva, pregunta nueva, cambiar su código y reutilizar una sección de la biblioteca;
  - puzzles y soluciones: solución (a medias no se guarda), pistas, puzzle del catálogo sin sus campos (rechazado);
  - vista previa: todas las páginas, sin errores, PDF descargable;
  - revisar (F4.4): marcar como revisada, nota para Claude, cambios vistos;
  - biblioteca (F4.1): juego en blanco con una página de la biblioteca y lo que necesita; duplicar el juego antiguo;
  - ida y vuelta: el juego guardado por el creador pasa el validador de la línea de órdenes (el de Claude).
Uso (desde la raíz del repo):  python3 tools/qa/creator-f4.py
Código 0 si todo pasa; 1 si no.
"""
import io, json, os, re, shutil, socket, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
# Piezas de arte de la colección (la última versión de cada una): lo que el inicio cuenta como material.
PIEZAS = len({p['id'] for p in __import__('json').load(open(os.path.join(ROOT, 'biblioteca', 'arte', 'el-regalo-robado', 'manifest.json'), encoding='utf-8'))['pieces']})
F3 = 'cumple-mision-secreta'
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


def png_de_prueba():
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (600, 400), '#F3E6D3')
    d = ImageDraw.Draw(im)
    d.rectangle([40, 40, 560, 360], outline='#1F5B4A', width=12)
    d.ellipse([200, 120, 400, 280], fill='#9B2C22')
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


JUEGO = "async () => { const { app } = await import('./app.js'); window.__app = app; return app.juego; }"


def juego(page):
    return page.evaluate(JUEGO)


def preparar(page):
    """window.__app: el estado del creador, para esperar a los cambios con predicados síncronos."""
    page.wait_for_function("document.getElementById('cabecera').children.length > 0")
    page.evaluate("async () => { window.__app = (await import('./app.js')).app; }")


def esperar_guardado(page, limite=8000):
    page.wait_for_function("document.querySelector('[data-prueba=estado-guardado]') && /guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)", timeout=limite)


def lienzo_listo(page, limite=45000):
    page.wait_for_selector('.lienzo[data-listo]', timeout=limite)


def avisos_error(page):
    return page.locator('#avisos .aviso-flotante.error').all_inner_texts()


def limpiar_avisos(page):
    page.evaluate("document.getElementById('avisos').replaceChildren()")


def main():
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}/creator/index.html?almacen=memoria&guardar=200&sondeo=600000'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    tmp = tempfile.mkdtemp(prefix='creator-f4-')
    try:
        if not esperar(base):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, accept_downloads=True)
            page = ctx.new_page()
            page.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' else None)
            page.on('response', lambda r: errores.append(f'{r.status} {r.url}') if r.status >= 400 else None)
            page.set_default_timeout(20000)

            # ---------------- Inicio ----------------
            page.goto(base)
            preparar(page)
            page.wait_for_selector('.tarjeta-juego')
            tarjetas = page.locator('.tarjeta-juego').evaluate_all('els => els.map(e => e.dataset.juego)')
            rec('inicio: lista los juegos del almacén', set(tarjetas) == {F3, 'final3'}, str(tarjetas))
            rec('inicio: el juego de Claude sale en «Para revisar»', page.locator(f'.para-revisar[data-juego={F3}]').count() == 1)
            rec('inicio: el juego antiguo se marca «Formato antiguo»', 'Formato antiguo' in page.inner_text('.tarjeta-juego[data-juego=final3]'))
            rec(f'inicio: el material de la biblioteca ({PIEZAS} imágenes del artista)', f'{PIEZAS} piezas' in page.inner_text('.material'), page.inner_text('.material .tarjeta-material:nth-child(3) .cabeza'))

            # ---------------- Diseñar página ----------------
            page.goto(base + f'#/juego/{F3}/paginas/p1')
            preparar(page)
            lienzo_listo(page)
            ancho = page.evaluate("document.querySelector('.lienzo canvas.pintado').width")
            rec('página: el motor pinta la página en el lienzo', ancho > 300, f'canvas {ancho}px')
            g0 = juego(page)
            el = next(e for e in g0['pages'][0]['elements'] if e['kind'] == 'field')
            caja = page.locator(f'.caja[data-elemento="{el["id"]}"]')
            caja.click()
            rec('página: un clic elige el elemento', caja.get_attribute('aria-pressed') == 'true' and page.locator('.columna.propiedades .prop-cabeza .tipo').inner_text().lower().startswith('hueco'))
            page.locator(f'.caja[data-elemento="{el["id"]}"]').focus()
            page.keyboard.press('ArrowRight')
            page.wait_for_function(f"""window.__app && __app.juego.pages[0].elements.find(e => e.id === '{el['id']}').x !== {el['x']}""")
            g1 = juego(page)
            x1 = next(e for e in g1['pages'][0]['elements'] if e['id'] == el['id'])['x']
            rec('página: la flecha mueve el elemento medio punto', abs(x1 - (el['x'] + 0.5)) < 1e-6, f'{el["x"]} → {x1}')
            esperar_guardado(page)
            rec('página: se guarda solo', 'guardado' in page.inner_text('[data-prueba=estado-guardado]'))
            page.click('.cabecera button:has-text("Deshacer")')
            g2 = juego(page)
            rec('página: deshacer devuelve el elemento a su sitio', next(e for e in g2['pages'][0]['elements'] if e['id'] == el['id'])['x'] == el['x'])

            n0 = len(juego(page)['pages'][0]['elements'])
            page.click('.barra-mesa .herramientas button:has-text("Texto fijo")')
            page.wait_for_function(f"window.__app && __app.juego.pages[0].elements.length === {n0 + 1}")
            nuevo = juego(page)['pages'][0]['elements'][-1]
            rec('página: «Texto fijo» añade un texto elegido', nuevo['kind'] == 'text' and page.locator(f'.caja[data-elemento="{nuevo["id"]}"]').get_attribute('aria-pressed') == 'true')
            page.fill(f'#el-{nuevo["id"]}-t-es', '¡Bienvenidos, agentes!')
            page.press(f'#el-{nuevo["id"]}-t-es', 'Tab')
            page.wait_for_function(f"window.__app && __app.juego.i18n.es['{nuevo['key']}'] === '¡Bienvenidos, agentes!'")
            rec('página: el texto se escribe en las propiedades', juego(page)['i18n']['es'][nuevo['key']] == '¡Bienvenidos, agentes!')

            # Un cambio que deja el juego con errores se rechaza (un texto no puede salirse de la página).
            limpiar_avisos(page)
            page.fill(f'#el-{nuevo["id"]}-x', '95')
            page.press(f'#el-{nuevo["id"]}-x', 'Tab')
            page.wait_for_selector('#avisos .aviso-flotante.error')
            xr = next(e for e in juego(page)['pages'][0]['elements'] if e['id'] == nuevo['id'])['x']
            rec('página: un cambio con errores se rechaza y se explica', xr == nuevo['x'] and 'sale de la página' in ' '.join(avisos_error(page)), ' '.join(avisos_error(page))[:140])

            lienzo_listo(page)
            n1 = len(juego(page)['pages'][0]['elements'])
            lapices0 = sum(1 for e in juego(page)['pages'][0]['elements'] if e['kind'] == 'art' and e['ref'].startswith('decoracion-lapiz-verde@'))
            page.click('.pieza[data-pieza^="decoracion-lapiz-verde@"]')
            page.wait_for_function(f"window.__app && __app.juego.pages[0].elements.length === {n1 + 1}")
            arte = [e for e in juego(page)['pages'][0]['elements'] if e['kind'] == 'art' and e['ref'].startswith('decoracion-lapiz-verde@')]
            primer_texto = next(i for i, e in enumerate(juego(page)['pages'][0]['elements']) if e['kind'] in ('text', 'field', 'photo'))
            idx_arte = [i for i, e in enumerate(juego(page)['pages'][0]['elements']) if e['kind'] == 'art' and e['ref'].startswith('decoracion-lapiz-verde@')]
            rec('página: una imagen de la biblioteca se pone debajo de los textos', len(arte) == lapices0 + 1 and max(idx_arte) < primer_texto, f'arte en {idx_arte}, primer texto {primer_texto}')

            # Subir una imagen a la biblioteca (colección «subidas») y ponerla en la página.
            n2 = len(juego(page)['pages'][0]['elements'])
            page.click('.zona-subir')
            page.set_input_files('#subir-fichero', files=[{'name': 'sello-prueba.png', 'mimeType': 'image/png', 'buffer': png_de_prueba()}])
            page.fill('#subir-nombre', 'Sello de prueba')
            page.select_option('#subir-categoria', 'decoracion')
            page.fill('#subir-etiquetas', 'sello, prueba, rojo')
            page.fill('#subir-autor', 'Estudio Kreatures')
            page.click('#dialogo button[type=submit]')
            page.wait_for_function(f"window.__app && __app.juego.pages[0].elements.length === {n2 + 1}")
            sub = juego(page)['pages'][0]['elements']
            subida = [e for e in sub if e['kind'] == 'art' and e['ref'].startswith('decoracion-sello-de-prueba@')]
            man = page.evaluate("async () => { const { app } = await import('./app.js'); return JSON.parse(new TextDecoder().decode(await app.almacen.leerBiblioteca('arte/subidas/manifest.json'))); }")
            pieza = man['pieces'][0] if man['pieces'] else {}
            rec('subir: la imagen queda en la biblioteca (PDF + miniatura, con autor y licencia)', pieza.get('file', '').endswith('.pdf') and pieza.get('author') == 'Estudio Kreatures' and pieza.get('license') == 'propia-estudio', json.dumps(pieza)[:160])
            rec('subir: y se pone en la página', len(subida) == 1, str([e.get('ref') for e in sub if e['kind'] == 'art'][-2:]))
            lienzo_listo(page)

            # ---------------- Un puzzle de contenido, por dentro ----------------
            page.goto(base + f'#/juego/{F3}/paginas/p3')
            lienzo_listo(page)
            bloque = next(e for e in juego(page)['pages'][2]['elements'] if e['kind'] == 'puzzle')
            page.locator(f'.caja[data-elemento="{bloque["id"]}"]').focus()
            page.keyboard.press('Enter')
            page.click(f'[data-entrar="{bloque["id"]}"]')
            page.wait_for_selector('.marco-puzzle')
            pz = next(z for z in juego(page)['puzzles'] if z['id'] == bloque['puzzle'])
            pieza = next(e for e in pz['page']['elements'] if e['kind'] == 'text')
            rec('puzzle por dentro: se ven sus piezas para elegirlas', page.locator('.capa-cajas .caja').count() == len(pz['page']['elements']))
            page.locator(f'.caja[data-elemento="{pieza["id"]}"]').focus()
            page.keyboard.press('Enter')
            page.locator(f'.caja[data-elemento="{pieza["id"]}"]').focus()
            page.keyboard.press('ArrowDown')
            page.wait_for_function(f"""window.__app && __app.juego.puzzles.find(z => z.id === '{pz['id']}').page.elements.find(e => e.id === '{pieza['id']}').y !== {pieza['y']}""")
            pz2 = next(z for z in juego(page)['puzzles'] if z['id'] == pz['id'])
            y2 = next(e for e in pz2['page']['elements'] if e['id'] == pieza['id'])['y']
            rec('puzzle por dentro: una pieza se mueve dentro del puzzle (y la página no cambia)', abs(y2 - (pieza['y'] + 0.5)) < 1e-6
                and juego(page)['pages'][2]['elements'] == g0['pages'][2]['elements'], f"{pieza['y']} → {y2}")
            n_piezas = len(pz2['page']['elements'])
            page.click('.barra-mesa .herramientas button:has-text("Texto fijo")')
            page.wait_for_function(f"window.__app && __app.juego.puzzles.find(z => z.id === '{pz['id']}').page.elements.length === {n_piezas + 1}")
            rec('puzzle por dentro: un texto nuevo va dentro del puzzle', True)
            page.click('.aviso-dentro button:has-text("Salir del puzzle")')
            page.wait_for_selector('.marco-puzzle', state='detached')
            lienzo_listo(page)
            rec('puzzle por dentro: salir vuelve a la página', page.locator(f'.caja[data-elemento="{bloque["id"]}"]').count() == 1)

            # ---------------- Formulario ----------------
            page.click('.nav a:has-text("Formulario")')
            page.wait_for_selector('.tarjeta-campo[data-campo=NOMBRE_CUMPLE]')
            page.click('.tarjeta-campo[data-campo=NOMBRE_CUMPLE]')
            page.wait_for_selector('[data-cabida=NOMBRE_CUMPLE][data-capacidad]')
            cabida = page.inner_text('[data-cabida=NOMBRE_CUMPLE]')
            rec('formulario: lo que cabe en cada página, medido como el PDF', 'En la página 1 caben 39 letras' in cabida and 'El tope (12) entra' in cabida, cabida.replace('\n', ' / ')[:140])
            page.fill('#campo-NOMBRE_CUMPLE-q-es', '¿Cómo se llama quien cumple años?')
            page.press('#campo-NOMBRE_CUMPLE-q-es', 'Tab')
            page.wait_for_function("document.querySelector('label[for=comprador-NOMBRE_CUMPLE]') && document.querySelector('label[for=comprador-NOMBRE_CUMPLE]').textContent.includes('quien cumple')")
            rec('formulario: la pregunta cambia y la vista del comprador la enseña', juego(page)['fields']['NOMBRE_CUMPLE']['q']['es'] == '¿Cómo se llama quien cumple años?')
            limpiar_avisos(page)
            page.fill('#campo-NOMBRE_CUMPLE-cap', '3')
            page.press('#campo-NOMBRE_CUMPLE-cap', 'Tab')
            page.wait_for_selector('#avisos .aviso-flotante.error')
            rec('formulario: un tope que deja fuera los ejemplos se rechaza', juego(page)['fields']['NOMBRE_CUMPLE']['cap'] == 12 and 'tope' in ' '.join(avisos_error(page)), ' '.join(avisos_error(page))[:120])

            page.click('button:has-text("Sección nueva")')
            page.fill('#dlg-es', 'Los invitados')
            page.fill('#dlg-en', 'The guests')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.seccion-item[data-seccion=los-invitados][aria-current=true]')
            page.click('button:has-text("Pregunta nueva")')
            page.fill('#dlg-es', '¿Quién es el invitado más bromista?')
            page.fill('#dlg-en', 'Who is the funniest guest?')
            page.select_option('#dlg-tipo', 'name')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.tarjeta-campo[aria-current=true]')
            g = juego(page)
            sec = next(s for s in g['form']['sections'] if s['id'] == 'los-invitados')
            nuevo_campo = sec['fields'][0] if sec['fields'] else None
            rec('formulario: sección nueva con una pregunta nueva', nuevo_campo is not None and g['fields'][nuevo_campo]['type'] == 'name' and g['fields'][nuevo_campo]['cap'] == 12, f'{nuevo_campo}')
            page.fill(f'#campo-{nuevo_campo}-codigo', 'INVITADO_BROMISTA')
            page.press(f'#campo-{nuevo_campo}-codigo', 'Tab')
            page.wait_for_selector('.tarjeta-campo[data-campo=INVITADO_BROMISTA]')
            g = juego(page)
            rec('formulario: el código de la pregunta se cambia en todo el juego', 'INVITADO_BROMISTA' in g['fields'] and nuevo_campo not in g['fields'] and 'INVITADO_BROMISTA' in next(s for s in g['form']['sections'] if s['id'] == 'los-invitados')['fields'])
            page.fill('#campo-INVITADO_BROMISTA-q-en', '')
            page.press('#campo-INVITADO_BROMISTA-q-en', 'Tab')
            nota = page.locator('#campo-INVITADO_BROMISTA-q-en').locator('xpath=ancestor::div[contains(@class,"campo")][1]').inner_text()
            rec('formulario: una pregunta a medias (sin inglés) no se guarda y se avisa', 'Falta en inglés' in nota and juego(page)['fields']['INVITADO_BROMISTA']['q']['en'] == 'Who is the funniest guest?', nota[-90:])
            rec('formulario: la vista del comprador sigue la sección abierta', 'Los invitados' in page.inner_text('.vista-comprador .movil h3'))

            # ---------------- Puzzles ----------------
            page.click('.nav a:has-text("Puzzles y soluciones")')
            page.wait_for_selector('.tarjeta-puzzle[data-puzzle=mensaje-interceptado]')
            page.fill('#pz-mensaje-interceptado-sol-es', 'El mensaje dice «LA PALABRA SECRETA ES CONFETI». Respuesta: CONFETI.')
            page.press('#pz-mensaje-interceptado-sol-es', 'Tab')
            page.wait_for_function("window.__app && __app.juego.puzzles.find(z => z.id === 'mensaje-interceptado').solution.es.endsWith('Respuesta: CONFETI.')")
            rec('puzzles: la solución se cambia', True)
            pistas0 = len(next(z for z in juego(page)['puzzles'] if z['id'] == 'mensaje-interceptado')['hints'])
            page.click('.tarjeta-puzzle[data-puzzle=mensaje-interceptado] button:has-text("Añadir pista")')
            page.fill('#dlg-es', 'Empezad por las palabras de dos letras.')
            page.fill('#dlg-en', 'Start with the two-letter words.')
            page.click('#dialogo button[type=submit]')
            page.wait_for_function(f"window.__app && __app.juego.puzzles.find(z => z.id === 'mensaje-interceptado').hints.length === {pistas0 + 1}")
            rec('puzzles: pista nueva en los dos idiomas', True)
            limpiar_avisos(page)
            np = len(juego(page)['pages'])
            page.click('button:has-text("Del catálogo")')
            page.click('[data-puzzle-bib^="puzzle-ticks@"]')
            page.wait_for_selector('#avisos .aviso-flotante.error')
            rec('puzzles: un puzzle del catálogo sin sus preguntas se rechaza y dice cuáles', len(juego(page)['pages']) == np and 'DEBILIDAD' in ' '.join(avisos_error(page)), ' '.join(avisos_error(page))[:140])

            # ---------------- Vista previa ----------------
            page.click('.nav a:has-text("Vista previa")')
            page.wait_for_selector('.previa-paginas[data-listo]', timeout=60000)
            figuras = page.locator('.previa-paginas figure').count()
            rec('vista previa: todas las páginas compuestas', figuras == len(juego(page)['pages']), f'{figuras} páginas')
            rec('vista previa: sin errores', page.locator('.mensaje.error').count() == 0 and 'Sin errores' in page.inner_text('.mensajes'))
            with page.expect_download() as d:
                page.click('button:has-text("Descargar el PDF")')
            ruta_pdf = os.path.join(tmp, 'previa.pdf')
            d.value.save_as(ruta_pdf)
            texto = subprocess.run(['pdftotext', '-raw', ruta_pdf, '-'], capture_output=True, text=True).stdout
            rec('vista previa: el PDF se descarga, con la marca y los cambios', open(ruta_pdf, 'rb').read(4) == b'%PDF' and 'VISTAPREVIA' in ''.join(texto.split()) and 'Bienvenidos' in texto)

            # ---------------- Sugerencias de Claude y «a presupuestar» ----------------
            lapiz = next(e['id'] for e in juego(page)['pages'][0]['elements'] if e['kind'] == 'art' and e['ref'].startswith('decoracion-lapiz-verde@'))
            page.evaluate("""(lapiz) => window.__app.cambiar('Prueba: sugerencias de Claude', (g) => {
                g.suggestions = [{ id: 's1', text: 'La especialidad da la pista de la prueba 3.', field: 'ESPECIALIDAD' },
                                 { id: 's2', text: 'Un lápiz para decorar la ficha.', page: 'p1', element: lapiz }];
                g.changes.push({ date: '2026-10-13', text: 'Sugerencias para la ficha.', presupuestar: ['Mensaje en código morse: no está en el catálogo.'] });
            })""", lapiz)
            page.click('.nav a.revisar')
            page.wait_for_selector('[data-prueba=cifra-sugerencias]')
            rec('revisar: las sugerencias de Claude y lo que hay que presupuestar', page.inner_text('[data-prueba=cifra-sugerencias] .valor') == '2'
                and 'morse' in page.inner_text('[data-prueba=presupuestar]'))
            page.click('[data-sugerencia=s2] button:has-text("Descartar")')
            page.wait_for_function("window.__app && !(__app.juego.suggestions || []).some(s => s.id === 's2')")
            rec('sugerencia descartada: se quita lo sugerido', not any(e['id'] == lapiz for e in juego(page)['pages'][0]['elements']))
            page.goto(base + f'#/juego/{F3}/formulario/ESPECIALIDAD')
            page.wait_for_selector('.tarjeta-campo[data-campo=ESPECIALIDAD] [data-sugerencia=s1]')
            page.click('[data-sugerencia=s1] button:has-text("Aceptar")')
            page.wait_for_function("window.__app && !__app.juego.suggestions")
            rec('sugerencia aceptada: la pregunta se queda y el aviso desaparece', 'ESPECIALIDAD' in juego(page)['fields'] and page.locator('[data-sugerencia]').count() == 0)

            # ---------------- Revisar ----------------
            page.click('.nav a.revisar')
            page.wait_for_selector('.item-revision[data-item=p1][aria-current=true]')
            page.click('button:has-text("Marcar como revisada")')
            page.wait_for_selector('.item-revision[data-item=p2][aria-current=true]')
            rec('revisar: marcar como revisada cuenta y pasa a la siguiente', page.inner_text('[data-prueba=cifra-revisados] .valor').startswith('1 /') and juego(page)['review']['items'].get('p1') is True)
            page.fill('#nota-claude', 'Que los carnets tengan un hueco para la huella.')
            page.click('button:has-text("Guardar nota")')
            page.wait_for_selector('.nota')
            notas = juego(page)['notes']
            rec('revisar: la nota para Claude queda en el juego', any(n['page'] == 'p2' and n['author'] == 'cliente' and not n['done'] and n['id'] for n in notas), json.dumps(notas)[-160:])
            page.click('button:has-text("Marcar los cambios como vistos")')
            page.wait_for_function("!document.querySelector('.nav a.revisar .contador')")
            g = juego(page)
            rec('revisar: cambios vistos (se apaga el contador de la cabecera)', g['review']['changes'] == len(g['changes']))
            esperar_guardado(page)

            # ---------------- Ida y vuelta: el validador de Claude ----------------
            guardado = page.evaluate(f"async () => {{ const {{ app }} = await import('./app.js'); return (await app.almacen.load('{F3}')).game; }}")
            carpeta = os.path.join(tmp, F3)
            shutil.copytree(os.path.join(ROOT, 'ensayos', 'f3', F3), carpeta)
            with open(os.path.join(carpeta, 'game.json'), 'w', encoding='utf8') as f:
                json.dump(guardado, f, ensure_ascii=False, indent=2)
            # La imagen subida vive solo en la biblioteca de la pestaña: para el validador se quita.
            for p_ in guardado['pages']:
                p_['elements'] = [e for e in p_['elements'] if not (e['kind'] == 'art' and e['ref'].startswith('decoracion-sello-de-prueba@'))]
            with open(os.path.join(carpeta, 'game.json'), 'w', encoding='utf8') as f:
                json.dump(guardado, f, ensure_ascii=False, indent=2)
            r = subprocess.run(['node', 'tools/game/validate.mjs', carpeta], cwd=ROOT, capture_output=True, text=True)
            rec('ida y vuelta: lo guardado por el creador pasa el validador de Claude', r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1][:160] if (r.stdout + r.stderr).strip() else '')

            # ---------------- Juego antiguo: solo lectura y duplicar ----------------
            page.goto(base + '#/juego/final3/previa')
            preparar(page)
            page.wait_for_selector('[data-prueba=estado-guardado]')
            rec('juego antiguo: se abre en solo lectura', 'solo lectura' in page.inner_text('[data-prueba=estado-guardado]') and page.locator('button:has-text("Enviar al estudio")').count() == 0)
            page.goto(base + '#/')
            preparar(page)
            page.wait_for_selector('.tarjeta-juego[data-juego=final3]')
            page.click('.tarjeta-juego[data-juego=final3] button:has-text("Duplicar")')
            page.fill('#nuevo-nombre', 'El regalo robado 2')
            page.click('#dialogo button[type=submit]')
            page.wait_for_url(re.compile(r'#/juego/el-regalo-robado-2/paginas'))
            lienzo_listo(page, 60000)
            g = juego(page)
            rec('duplicar: el juego antiguo se copia en el formato nuevo y se puede editar', g['schema'] == 'pme-game/2' and g['status'] == 'borrador' and 'Borrador' in page.inner_text('[data-prueba=estado-guardado]'), f"{len(g['pages'])} páginas")

            # ---------------- Juego en blanco con una página de la biblioteca ----------------
            page.goto(base + '#/')
            preparar(page)
            page.wait_for_selector('.tarjeta-accion')
            page.click('.tarjeta-accion:has-text("Empezar en blanco")')
            page.fill('#nuevo-nombre', 'Prueba en blanco')
            page.fill('#nuevo-paginas', '1')
            page.click('#dialogo button[type=submit]')
            page.wait_for_url(re.compile(r'#/juego/prueba-en-blanco/paginas'))
            lienzo_listo(page)
            # La ficha del cumpleañero entra con lo que necesita: la sección del cumpleañero, los 8 sospechosos y el
            # puzzle que calcula los apodos con su prefijo.
            page.click('.pestanas button:has-text("Páginas")')
            page.click('[data-pagina-bib^="ficha-cumpleanero@"]')
            page.wait_for_selector('#dialogo button:has-text("Añadirlo todo")')
            explicacion = page.inner_text('#dialogo')
            page.click('#dialogo button:has-text("Añadirlo todo")')
            page.wait_for_function("window.__app && __app.juego.pages.length === 2")
            lienzo_listo(page)
            g = juego(page)
            secs = [s['id'] for s in g['form']['sections']]
            rec('biblioteca: una página de otro juego entra con las secciones y el puzzle que necesita', g['pages'][1]['from'].startswith('ficha-cumpleanero@')
                and secs[:1] == ['victima'] and [f's{n}' for n in range(1, 9)] == secs[1:] and [z['from'] for z in g['puzzles']] == ['puzzle-prefix@1'],
                f"{secs} · {[z['from'] for z in g['puzzles']]}")
            rec('biblioteca: … con las fotos de ejemplo de las secciones copiadas al juego', g['examples'][0]['photos'].get('FOTO_1') == 'fotos/retrato-1.jpg',
                str(g['examples'][0].get('photos'))[:120])
            # Formulario desde la biblioteca: la sección de la misión (trae las preguntas del puzzle de tiras).
            page.click('.nav a:has-text("Formulario")')
            page.wait_for_selector('[data-seccion-bib^="mision-escondite@"]')
            antes = len(g['form']['sections'])
            page.click('[data-seccion-bib^="mision-escondite@"]')
            page.wait_for_function(f"window.__app && __app.juego.form.sections.length === {antes + 1}")
            g = juego(page)
            rec('biblioteca: sección reutilizada con sus preguntas y ejemplos', {'TEST_LUGAR', 'TEST_RESULTADO'} <= set(g['fields'])
                and g['examples'][0]['values']['es'].get('TEST_LUGAR'), f"{len(g['fields'])} preguntas, {len(g['examples'])} ejemplos")
            # Un puzzle del catálogo que ya tiene sus preguntas entra en una página nueva.
            page.click('.nav a:has-text("Puzzles y soluciones")')
            page.click('button:has-text("Del catálogo")')
            page.click('[data-puzzle-bib^="puzzle-strips@"]')
            page.wait_for_function("window.__app && __app.juego.pages.length === 3")
            g = juego(page)
            rec('biblioteca: puzzle del catálogo en una página nueva, con los huecos de sus respuestas', g['puzzles'][-1]['from'].startswith('puzzle-strips@')
                and [e['kind'] for e in g['pages'][2]['elements']] == ['field', 'field', 'puzzle'], str([e.get('field', e['kind']) for e in g['pages'][2]['elements']]))
            lienzo_listo(page, 30000)
            page.click('.nav a:has-text("Vista previa")')
            page.wait_for_selector('.previa-paginas[data-listo]', timeout=60000)
            rec('biblioteca: el juego nuevo se compone sin errores', page.locator('.previa-paginas figure').count() == 3 and page.locator('.mensaje.error').count() == 0,
                ' | '.join(page.locator('.mensaje.error').all_inner_texts())[:200])

            b.close()
        rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:300])
    finally:
        srv.terminate()
        srv.wait(timeout=5)
        shutil.rmtree(tmp, ignore_errors=True)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
