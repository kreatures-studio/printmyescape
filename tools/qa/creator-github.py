#!/usr/bin/env python3
"""Pruebas del creador sobre GitHub (F4 de PLAN-CREADOR-2.md; antes T5.2). Chromium + Playwright.

La API de GitHub se simula con page.route: un repositorio en memoria con la rama main (la biblioteca/ del repositorio)
y la rama juego/cumple-mision-secreta (el juego del ensayo F3). No hay red ni token real. Comprueba:
  - entrada: sin token no hay peticiones; el token va a sessionStorage (no a localStorage ni a ninguna URL) y solo
    en la cabecera Authorization;
  - inicio: los juegos son las ramas juego/*; la biblioteca se lee de main;
  - editar: el lienzo se compone con el arte de la biblioteca; un cambio se guarda solo (PUT del game.json en su
    rama, sobre su sha);
  - versiones: si Claude guarda antes (otro sha), el creador no pisa nada, avisa y recarga la versión nueva; el
    sondeo avisa aunque no se esté editando;
  - subir una imagen: PDF, miniatura y manifiesto en biblioteca/arte/subidas de main;
  - juego nuevo: rama juego/<id> desde main y su game.json; enviar al estudio: estado «enviado» y pull request;
  - token caducado (401): vuelve a la entrada con el aviso; «Salir» borra el token.
Uso (desde la raíz del repo):  python3 tools/qa/creator-github.py
Código 0 si todo pasa; 1 si no.
"""
import base64, hashlib, io, json, os, re, socket, subprocess, sys, time, urllib.parse, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REPO = 'kreatures-studio/juegos-prueba'
OWNER, NOMBRE = REPO.split('/')
TOKEN = 'github_pat_prueba'
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


def sha(b):
    return hashlib.sha1(b).hexdigest()


def leer_carpeta(carpeta, prefijo):
    out = {}
    for dirpath, _, names in os.walk(carpeta):
        for n in names:
            ruta = os.path.join(dirpath, n)
            rel = os.path.relpath(ruta, carpeta).replace(os.sep, '/')
            with open(ruta, 'rb') as f:
                out[f'{prefijo}/{rel}'] = f.read()
    return out


class GitHubSimulado:
    """Repositorio en memoria: ramas → {ruta: bytes}."""

    def __init__(self):
        self.peticiones = []
        self.ramas = {
            'main': leer_carpeta(os.path.join(ROOT, 'biblioteca'), 'biblioteca'),
            f'juego/{F3}': leer_carpeta(os.path.join(ROOT, 'ensayos', 'f3', F3), f'games/{F3}'),
            'feature/otra': {},
        }
        self.puts = []
        self.prs = []

    def juego(self, id_):
        return json.loads(self.ramas[f'juego/{id_}'][f'games/{id_}/game.json'])

    def escribir_juego(self, id_, game):
        self.ramas[f'juego/{id_}'][f'games/{id_}/game.json'] = (json.dumps(game, ensure_ascii=False, indent=2) + '\n').encode()

    def manejar(self, route):
        req = route.request
        url = urllib.parse.urlparse(req.url)
        path = urllib.parse.unquote(url.path)
        q = dict(urllib.parse.parse_qsl(url.query))
        auth = req.headers.get('authorization')
        self.peticiones.append({'method': req.method, 'url': req.url, 'auth': auth})
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'}
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        if auth != f'Bearer {TOKEN}':
            return self.json(route, 401, {'message': 'Bad credentials'}, cors)
        base = f'/repos/{OWNER}/{NOMBRE}'
        if not path.startswith(base):
            return self.json(route, 404, {'message': 'Not Found'}, cors)
        resto = path[len(base):]
        if resto == '':
            return self.json(route, 200, {'full_name': REPO, 'default_branch': 'main', 'private': True}, cors)
        if resto == '/branches':
            return self.json(route, 200, [{'name': r} for r in self.ramas], cors)
        m = re.match(r'^/git/ref/heads/(.+)$', resto)
        if m:
            r = m.group(1)
            return self.json(route, 200, {'object': {'sha': f'commit-{r}'}}, cors) if r in self.ramas else self.json(route, 404, {'message': 'Not Found'}, cors)
        if resto == '/git/refs' and req.method == 'POST':
            cuerpo = json.loads(req.post_data)
            r = cuerpo['ref'].replace('refs/heads/', '')
            if r in self.ramas:
                return self.json(route, 422, {'message': 'Reference already exists'}, cors)
            self.ramas[r] = dict(self.ramas['main'])
            return self.json(route, 201, {'ref': cuerpo['ref']}, cors)
        m = re.match(r'^/contents/(.+)$', resto)
        if m:
            ruta = m.group(1)
            if req.method == 'GET':
                rama = self.ramas.get(q.get('ref', 'main'))
                if rama is None:
                    return self.json(route, 404, {'message': 'No commit found for the ref'}, cors)
                if ruta in rama:
                    if 'raw' in (req.headers.get('accept') or ''):
                        return route.fulfill(status=200, headers={**cors, 'Content-Type': 'application/octet-stream'}, body=rama[ruta])
                    return self.json(route, 200, {'type': 'file', 'sha': sha(rama[ruta]), 'content': base64.encodebytes(rama[ruta]).decode(), 'encoding': 'base64'}, cors)
                hijos = sorted({k[len(ruta) + 1:].split('/')[0] for k in rama if k.startswith(ruta + '/')})
                if hijos:
                    return self.json(route, 200, [{'name': h, 'type': 'dir' if any(k.startswith(f'{ruta}/{h}/') for k in rama) else 'file'} for h in hijos], cors)
                return self.json(route, 404, {'message': 'Not Found'}, cors)
            if req.method == 'PUT':
                cuerpo = json.loads(req.post_data)
                rama = self.ramas.get(cuerpo.get('branch', 'main'))
                if rama is None:
                    return self.json(route, 404, {'message': 'Branch not found'}, cors)
                actual = rama.get(ruta)
                if actual is not None and cuerpo.get('sha') != sha(actual):
                    return self.json(route, 409, {'message': 'does not match'}, cors)
                if actual is None and cuerpo.get('sha'):
                    return self.json(route, 422, {'message': 'sha wasn\'t supplied'}, cors)
                datos = base64.b64decode(cuerpo['content'])
                rama[ruta] = datos
                self.puts.append({'ruta': ruta, 'rama': cuerpo.get('branch'), 'mensaje': cuerpo.get('message')})
                return self.json(route, 201 if actual is None else 200, {'content': {'sha': sha(datos)}}, cors)
        if resto == '/commits':
            return self.json(route, 200, [{'sha': 'c1', 'author': {'login': 'ana'}, 'commit': {'author': {'name': 'Ana'}, 'committer': {'date': '2026-10-12T10:00:00Z'}, 'message': 'Juego nuevo\n\ncuerpo'}}], cors)
        if resto == '/pulls' and req.method == 'POST':
            cuerpo = json.loads(req.post_data)
            if any(p['head'] == cuerpo['head'] for p in self.prs):
                return self.json(route, 422, {'message': 'A pull request already exists'}, cors)
            self.prs.append({'head': cuerpo['head'], 'base': cuerpo['base'], 'body': cuerpo.get('body'), 'html_url': f'https://github.com/{REPO}/pull/{len(self.prs) + 7}'})
            return self.json(route, 201, self.prs[-1], cors)
        if resto == '/pulls':
            return self.json(route, 200, [p for p in self.prs if f"{OWNER}:{p['head']}" == q.get('head')], cors)
        return self.json(route, 404, {'message': 'Not Found (simulado)'}, cors)

    @staticmethod
    def json(route, status, cuerpo, cors):
        route.fulfill(status=status, headers={**cors, 'Content-Type': 'application/json'}, body=json.dumps(cuerpo))


def png_de_prueba():
    from PIL import Image, ImageDraw
    im = Image.new('RGB', (500, 500), '#E3EEE9')
    ImageDraw.Draw(im).ellipse([60, 60, 440, 440], fill='#1F5B4A')
    b = io.BytesIO()
    im.save(b, 'PNG')
    return b.getvalue()


def main():
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}/creator/index.html?guardar=200&sondeo=1500'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port)], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    try:
        if not esperar(base):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        gh = GitHubSimulado()
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(30000)
            page.on('pageerror', lambda e: errores.append(f'pageerror: {e}'))
            # Los 401, 404 y 409 que la prueba provoca a propósito los registra Chromium como «Failed to load resource».
            esperados = re.compile(r'Failed to load resource: the server responded with a status of (401|404|409|422)')
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and not esperados.search(m.text) else None)
            page.route('https://api.github.com/**', gh.manejar)

            page.goto(base)
            page.wait_for_selector('.entrada-caja')
            rec('sin token: se pide la entrada', page.is_visible('#token'))
            rec('sin token: ninguna petición a GitHub', len(gh.peticiones) == 0, str(len(gh.peticiones)))

            page.fill('#repo', REPO)
            page.fill('#token', TOKEN)
            page.click('.entrada-caja button[type=submit]')
            page.wait_for_selector(f'.tarjeta-juego[data-juego={F3}]')
            rec('inicio: los juegos son las ramas juego/*', page.locator('.tarjeta-juego').count() == 1)
            rec('inicio: la biblioteca se lee de main', '43 piezas' in page.inner_text('.material'))
            rec('el token va a sessionStorage', page.evaluate("sessionStorage.getItem('pme-token')") == TOKEN)
            rec('el token no va a localStorage', page.evaluate("localStorage.getItem('pme-token')") is None)
            rec('el token solo va en Authorization', all(x['auth'] == f'Bearer {TOKEN}' for x in gh.peticiones) and not any(TOKEN in x['url'] for x in gh.peticiones) and TOKEN not in page.url)

            # ---- Editar y guardar ----
            page.goto(base + f'#/juego/{F3}/paginas/p1')
            page.wait_for_selector('.lienzo[data-listo]')
            rec('editar: el lienzo se compone con el arte de la biblioteca de main', page.evaluate("document.querySelector('.lienzo canvas.pintado').width") > 300)
            antes = gh.juego(F3)
            el = next(e for e in antes['pages'][0]['elements'] if e['kind'] == 'field')
            page.click(f'.caja[data-elemento="{el["id"]}"]')
            page.locator(f'.caja[data-elemento="{el["id"]}"]').focus()
            page.keyboard.press('ArrowDown')
            page.wait_for_function("/guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)")
            despues = gh.juego(F3)
            y = next(e for e in despues['pages'][0]['elements'] if e['id'] == el['id'])['y']
            put = [x for x in gh.puts if x['ruta'] == f'games/{F3}/game.json']
            rec('guardar: PUT del game.json en su rama con el cambio', abs(y - (el['y'] + 0.5)) < 1e-6 and put and put[-1]['rama'] == f'juego/{F3}', f"y {el['y']} → {y}; {put[-1] if put else None}")

            # ---- Claude guarda antes: sondeo y conflicto ----
            g = gh.juego(F3)
            g['changes'].append({'date': '2026-10-13', 'text': 'Claude: título de la p2 más corto.'})
            gh.escribir_juego(F3, g)
            page.wait_for_selector('button:has-text("Hay cambios nuevos: recargar")', timeout=10000)
            rec('sondeo: avisa de la versión nueva aunque no se edite', True)
            n_puts = len(gh.puts)
            page.locator(f'.caja[data-elemento="{el["id"]}"]').focus()
            page.keyboard.press('ArrowDown')
            page.wait_for_selector('.aviso-flotante.error:has-text("versión más nueva")')
            rec('conflicto: no pisa la versión de Claude', len(gh.puts) == n_puts and len(gh.juego(F3)['changes']) == len(g['changes']), f'PUT {n_puts} → {len(gh.puts)}')
            page.click('button:has-text("Hay cambios nuevos: recargar")')
            page.wait_for_function("document.querySelector('.nav a.revisar .contador') && document.querySelector('.nav a.revisar .contador').textContent === '3'")
            rec('recargar: trae la versión de Claude (3 cambios por revisar)', True)

            # ---- Subir una imagen a la biblioteca de main ----
            page.click('.zona-subir')
            page.set_input_files('#subir-fichero', files=[{'name': 'circulo.png', 'mimeType': 'image/png', 'buffer': png_de_prueba()}])
            page.fill('#subir-nombre', 'Círculo verde')
            page.select_option('#subir-categoria', 'icono')
            page.fill('#subir-etiquetas', 'circulo, verde, prueba')
            page.fill('#subir-autor', 'Kreatures')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.aviso-flotante.bien:has-text("Subida a la biblioteca")')
            main_ = gh.ramas['main']
            nuevas = sorted(k for k in main_ if k.startswith('biblioteca/arte/subidas/'))
            man = json.loads(main_.get('biblioteca/arte/subidas/manifest.json', b'{"pieces":[]}'))
            rec('subir: PDF, miniatura y manifiesto en biblioteca/arte/subidas de main', len(nuevas) == 3 and man['pieces'][0]['id'] == 'icono-circulo-verde'
                and main_[f"biblioteca/arte/subidas/{man['pieces'][0]['file']}"][:4] == b'%PDF', str(nuevas))
            rec('subir: nada de la biblioteca va a la rama del juego', not any(k.startswith('biblioteca/arte/subidas') for k in gh.ramas[f'juego/{F3}']))
            page.wait_for_function("/guardado/.test(document.querySelector('[data-prueba=estado-guardado]').textContent)")

            # ---- Juego nuevo ----
            page.goto(base + '#/')
            page.wait_for_selector('.tarjeta-accion')
            page.click('.tarjeta-accion:has-text("Empezar en blanco")')
            page.fill('#nuevo-nombre', 'Fiesta pirata')
            page.click('#dialogo button[type=submit]')
            page.wait_for_url(re.compile(r'#/juego/fiesta-pirata/paginas'))
            page.wait_for_selector('.lienzo[data-listo]')
            rec('juego nuevo: rama juego/fiesta-pirata con su game.json', 'juego/fiesta-pirata' in gh.ramas and gh.juego('fiesta-pirata')['schema'] == 'pme-game/2')

            # ---- Enviar al estudio ----
            page.goto(base + f'#/juego/{F3}/paginas')
            page.wait_for_selector('.lienzo[data-listo]')
            page.click('button:has-text("Enviar al estudio")')
            page.wait_for_selector('#nota-envio')
            page.fill('#nota-envio', 'Listo para imprimir la prueba.')
            page.click('#dialogo button[type=submit]')
            page.wait_for_selector('.aviso-flotante.bien:has-text("Enviado al estudio")')
            rec('enviar: estado «enviado» y pull request hacia main', gh.juego(F3)['status'] == 'enviado' and gh.prs and gh.prs[0]['head'] == f'juego/{F3}' and gh.prs[0]['base'] == 'main'
                and 'solo lectura' in page.inner_text('[data-prueba=estado-guardado]'), str(gh.prs[:1]))

            # ---- Token caducado y salir ----
            page.evaluate("sessionStorage.setItem('pme-token', 'caducado')")
            page.reload()
            page.wait_for_selector('.entrada-caja .mensaje.error')
            rec('token caducado: vuelve a la entrada con el aviso', 'token' in page.inner_text('.entrada-caja .mensaje.error') and page.evaluate("sessionStorage.getItem('pme-token')") is None)
            page.fill('#repo', REPO)
            page.fill('#token', TOKEN)
            page.click('.entrada-caja button[type=submit]')
            page.wait_for_selector('.cabecera .juego-titulo')
            page.click('.cabecera a[aria-label="Volver a la biblioteca"]')
            page.wait_for_selector('.cabecera button:has-text("Salir")')
            page.click('.cabecera button:has-text("Salir")')
            page.wait_for_selector('.entrada-caja')
            rec('Salir borra el token y vuelve a la entrada', page.evaluate("sessionStorage.getItem('pme-token')") is None)
            b.close()
        rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:300])
    finally:
        srv.terminate()
        srv.wait(timeout=5)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
