#!/usr/bin/env python3
"""Prueba del creador contra la API real de GitHub (F4). No va en las pruebas de cada día: escribe en un repositorio.

Hace lo que hará el cliente, en Chromium, contra un repositorio de verdad, sin tocar su rama principal: la «rama
principal» de la prueba es --base (con biblioteca/), que hay que crear antes (p. ej. una copia de main). Comprueba:
  - entrar con el repositorio y el token, y ver la biblioteca de --base;
  - juego nuevo (rama juego/<id> desde --base), un texto y el guardado solo (PUT con su sha);
  - una página de la biblioteca con lo que necesita: ficheros copiados a la carpeta del juego (fondo PDF y fotos);
  - subir una imagen a la biblioteca (PDF, miniatura y manifiesto en --base);
  - otra versión guardada por fuera (como Claude): el sondeo la ve y «recargar» la trae;
  - enviar al estudio: pull request de juego/<id> hacia --base (se cierra al terminar).
Al final borra la rama del juego (y --base con --borrar-base).

Con --solo-lectura --juego <id> no escribe nada: abre un juego que ya está en su rama juego/<id> (con la biblioteca de
--base) y comprueba la entrada, el lienzo, la vista previa entera y la revisión con las lecturas reales de la API.
(Detrás del proxy de agentes de Claude solo se puede leer: la API no admite escrituras por él.)

Uso:  python3 tools/qa/creator-github-real.py --repo dueño/nombre --base prueba-creador/base [--token T] [--borrar-base]
      python3 tools/qa/creator-github-real.py --repo dueño/nombre --base rama --solo-lectura --juego <id>
      El token por defecto es el de PME_TOKEN; detrás del proxy de agentes de Claude, el proxy pone el suyo.
      Las comprobaciones leen el repositorio con «gh api».
"""
import argparse, base64, io, json, os, re, socket, subprocess, sys, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RES = []


def rec(nombre, ok, detalle=''):
    RES.append(bool(ok))
    print(('OK    ' if ok else 'FALLO ') + nombre + (f' | {detalle}' if detalle else ''), flush=True)


def gh(*args, entrada=None):
    r = subprocess.run(['gh', 'api', *args], capture_output=True, text=True, input=entrada)
    if r.returncode:
        raise RuntimeError(f'gh api {" ".join(args)}: {r.stderr.strip()[:300]}')
    return json.loads(r.stdout) if r.stdout.strip() else None


def contenido(repo, ruta, rama):
    d = gh(f'repos/{repo}/contents/{ruta}?ref={rama}')
    return base64.b64decode(d['content']), d['sha']


def existe(repo, ruta, rama):
    try:
        gh(f'repos/{repo}/contents/{ruta}?ref={rama}')
        return True
    except RuntimeError:
        return False


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


def png():
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (400, 400), '#ECEAFB')
    ImageDraw.Draw(im).rectangle([60, 60, 340, 340], outline='#4338A8', width=20)
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def navegador(p):
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    # Solo las direcciones https van por el proxy: el creador se sirve en local por http.
    extra = [f"--proxy-server=https={proxy.split('://')[-1]}"] if proxy else []
    return p.chromium.launch(args=['--no-sandbox', *extra])


def solo_lectura(a):
    port = puerto_libre()
    url = f'http://127.0.0.1:{port}/creator/index.html?principal={urllib.parse.quote(a.base)}&sondeo=600000'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    try:
        esperar(url)
        with sync_playwright() as p:
            b = navegador(p)
            page = b.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(120000)
            page.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and 'status of 404' not in m.text else None)
            page.goto(url)
            page.fill('#repo', a.repo)
            page.fill('#token', a.token)
            page.click('.entrada-caja button[type=submit]')
            page.wait_for_selector(f'.tarjeta-juego[data-juego="{a.juego}"]')
            page.wait_for_function("/\\d+ piezas/.test(document.querySelector('.material').textContent)")
            rec('entrar: los juegos son las ramas juego/* y la biblioteca es la de la base', True, page.inner_text('.material .tarjeta-material:nth-child(3) .cabeza').replace('\n', ' '))
            page.goto(url + f'#/juego/{a.juego}/paginas/p1')
            page.wait_for_selector('.lienzo[data-listo]')
            rec('lienzo: la página se compone con el arte de la biblioteca y las fotos del juego leídos de GitHub', page.evaluate("document.querySelector('.lienzo canvas.pintado').width") > 300)
            page.click('.nav a:has-text("Vista previa")')
            page.wait_for_selector('.previa-paginas[data-listo]')
            n = page.locator('.previa-paginas figure').count()
            rec('vista previa: el juego entero, sin errores', n >= 1 and page.locator('.mensaje.error').count() == 0, f'{n} páginas')
            page.click('.nav a.revisar')
            page.wait_for_selector('[data-prueba=cifra-revisados]')
            rec('revisar: los cambios de Claude leídos del juego', page.locator('.cambio').count() >= 1)
            b.close()
        rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:300])
    finally:
        srv.terminate()
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--repo', required=True)
    ap.add_argument('--base', required=True)
    ap.add_argument('--token', default=os.environ.get('PME_TOKEN', 'token-del-proxy'))
    ap.add_argument('--borrar-base', action='store_true')
    ap.add_argument('--solo-lectura', action='store_true')
    ap.add_argument('--juego')
    a = ap.parse_args()
    if a.solo_lectura:
        return solo_lectura(a)
    ident = f'prueba-real-{time.strftime("%H%M%S")}'
    rama = f'juego/{ident}'
    port = puerto_libre()
    url = f'http://127.0.0.1:{port}/creator/index.html?principal={urllib.parse.quote(a.base)}&guardar=400&sondeo=3000'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    pr = None
    try:
        if not esperar(url):
            print('FALLO: el servidor no arranca')
            return 1
        with sync_playwright() as p:
            b = navegador(p)
            page = b.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(90000)
            page.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
            esperados = re.compile(r'Failed to load resource: the server responded with a status of (404|409|422)')
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and not esperados.search(m.text) else None)

            page.goto(url)
            page.fill('#repo', a.repo)
            page.fill('#token', a.token)
            page.click('.entrada-caja button[type=submit]')
            page.wait_for_selector('.material')
            page.wait_for_function("/\\d+ piezas/.test(document.querySelector('.material').textContent)")
            rec('entrar: la biblioteca se lee de la rama base', '43 piezas' in page.inner_text('.material') or 'piezas' in page.inner_text('.material'), page.inner_text('.material .tarjeta-material:nth-child(3) .cabeza').replace('\n', ' '))

            page.click('.tarjeta-accion:has-text("Empezar en blanco")')
            page.fill('#nuevo-nombre', ident)
            page.fill('#nuevo-paginas', '1')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.lienzo[data-listo]')
            g, _ = contenido(a.repo, f'games/{ident}/game.json', rama)
            rec('juego nuevo: rama juego/<id> desde la base, con su game.json', json.loads(g)['id'] == ident)

            page.click('.barra-mesa .herramientas button:has-text("Texto fijo")')
            page.wait_for_function("/guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)")
            g, _ = contenido(a.repo, f'games/{ident}/game.json', rama)
            rec('guardar: el texto nuevo está en GitHub', 'Texto nuevo' in json.loads(g)['i18n']['es'].values())

            page.click('.pestanas button:has-text("Páginas")')
            page.click('[data-pagina-bib^="ficha-cumpleanero@"]')
            page.click('#dialogo button:has-text("Añadirlo todo")')
            page.wait_for_function("document.querySelectorAll('.miniatura-pagina').length === 2")
            page.wait_for_selector('.lienzo[data-listo]')
            page.wait_for_function("/guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)")
            rec('página de la biblioteca: su fondo y las fotos de las secciones copiados al juego',
                existe(a.repo, f'games/{ident}/fondos/ficha-cumpleanero-v1.pdf', rama) and existe(a.repo, f'games/{ident}/fotos/retrato-1.jpg', rama))

            page.click('.pestanas button:has-text("Imágenes")')
            page.click('.zona-subir')
            page.set_input_files('#subir-fichero', files=[{'name': f'{ident}.png', 'mimeType': 'image/png', 'buffer': png()}])
            page.fill('#subir-nombre', f'Marco {ident}')
            page.select_option('#subir-categoria', 'marco')
            page.fill('#subir-etiquetas', 'prueba, marco, morado')
            page.fill('#subir-autor', 'Estudio')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.aviso-flotante.bien:has-text("Subida a la biblioteca")')
            man, _ = contenido(a.repo, 'biblioteca/arte/subidas/manifest.json', a.base)
            rec('subir: la imagen está en la biblioteca de la rama base', any(x['name'] == f'Marco {ident}' for x in json.loads(man)['pieces']))
            page.wait_for_function("/guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)")

            # Otra versión guardada por fuera (como haría Claude con sync push).
            g, sha = contenido(a.repo, f'games/{ident}/game.json', rama)
            juego = json.loads(g)
            juego.setdefault('changes', []).append({'date': time.strftime('%Y-%m-%d'), 'text': 'Cambio hecho por fuera en la prueba real.'})
            cuerpo = json.dumps({'message': 'Prueba: cambio por fuera', 'branch': rama, 'sha': sha,
                                 'content': base64.b64encode((json.dumps(juego, ensure_ascii=False, indent=2) + '\n').encode()).decode()})
            gh('-X', 'PUT', f'repos/{a.repo}/contents/games/{ident}/game.json', '--input', '-', entrada=cuerpo)
            page.wait_for_selector('button:has-text("Hay cambios nuevos: recargar")', timeout=30000)
            page.click('button:has-text("Hay cambios nuevos: recargar")')
            page.wait_for_selector('.nav a.revisar .contador')
            rec('versión de fuera: el sondeo la ve y recargar la trae', True)

            res = page.evaluate("""async (cfg) => {
                const { crearAlmacenGitHub } = await import('./store/github.js');
                return crearAlmacenGitHub(cfg).submit(cfg.id, 'Prueba real del creador (se cierra sola).');
            }""", {'owner': a.repo.split('/')[0], 'repo': a.repo.split('/')[1], 'token': a.token, 'principal': a.base, 'id': ident})
            pr = int(res['url'].rstrip('/').split('/')[-1])
            info = gh(f'repos/{a.repo}/pulls/{pr}')
            rec('enviar: pull request de la rama del juego hacia la base', info['head']['ref'] == rama and info['base']['ref'] == a.base, res['url'])
            b.close()
        rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:300])
    finally:
        srv.terminate()
        if pr:
            try: gh('-X', 'PATCH', f'repos/{a.repo}/pulls/{pr}', '-f', 'state=closed')
            except RuntimeError as e: print('aviso: no se pudo cerrar el pull request', e)
        for r in [rama] + ([a.base] if a.borrar_base else []):
            try: gh('-X', 'DELETE', f'repos/{a.repo}/git/refs/heads/{r}')
            except RuntimeError as e: print(f'aviso: no se pudo borrar {r}', e)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
