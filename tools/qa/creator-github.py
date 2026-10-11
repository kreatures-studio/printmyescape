#!/usr/bin/env python3
"""Pruebas del almacén de GitHub del editor (T5.2 de PLAN-CREADOR.md). Chromium + Playwright.

La API de GitHub se simula con page.route (no hay red ni token real). Comprueba:
  - pantalla de entrada: sin token no hay peticiones; el token va a sessionStorage, no a localStorage
    ni a ninguna URL, y solo en la cabecera Authorization;
  - list, load (rev = sha), save normal (sha nuevo), save con rev vieja (conflict, sin PUT),
    save con conflicto del servidor (409 aunque la rev coincida), history;
  - submit: abre el pull request; si ya hay uno abierto (422), devuelve ese;
  - token no válido (401): vuelve a la pantalla de entrada; «Salir» borra el token.
Uso (desde la raíz del repo):  python3 tools/qa/creator-github.py
Código 0 si todo pasa; 1 si no.
"""
import base64, json, os, re, socket, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REPO = 'kreatures-studio/juegos-prueba'
OWNER, NOMBRE = REPO.split('/')
TOKEN = 'token-de-prueba'
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


def b64_archivo(ruta):
    with open(os.path.join(ROOT, ruta), 'rb') as f:
        return base64.b64encode(f.read()).decode()


class GitHubSimulado:
    """Estado y respuestas de la API. state['files'][id] = {'b64': ..., 'sha': ...}."""

    def __init__(self):
        self.peticiones = []
        self.puts = 0
        self.pr_abierto = False
        self.pisar_al_guardar = False
        self.n = 1
        self.files = {
            'final3': {'b64': b64_archivo('games/final3/game.json'), 'sha': 'sha-final3-1'},
            'capas': {'b64': b64_archivo('tools/qa/fixtures/games/capas/game.json'), 'sha': 'sha-capas-1'},
        }

    def manejar(self, route):
        req = route.request
        url = req.url
        path = url.split('api.github.com', 1)[1]
        auth = req.headers.get('authorization')
        self.peticiones.append({'method': req.method, 'url': url, 'auth': auth})
        cors = {'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-GitHub-Api-Version',
                'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS'}
        if req.method == 'OPTIONS':
            return route.fulfill(status=204, headers=cors)
        if auth != f'Bearer {TOKEN}':
            return self.responder(route, 401, {'message': 'Bad credentials'}, cors)
        base = f'/repos/{OWNER}/{NOMBRE}'
        if path.startswith(f'{base}/branches'):
            ramas = ['main', 'juego/final3', 'juego/capas', 'feature/x']
            return self.responder(route, 200, [{'name': r} for r in ramas], cors)
        m = re.match(rf'{base}/contents/games/([^/]+)/game\.json', path)
        if m and req.method == 'GET':
            f = self.files.get(m.group(1))
            if not f:
                return self.responder(route, 404, {'message': 'Not Found'}, cors)
            return self.responder(route, 200, {'content': f['b64'] + '\n', 'encoding': 'base64', 'sha': f['sha']}, cors)
        if m and req.method == 'PUT':
            id_ = m.group(1)
            cuerpo = json.loads(req.post_data)
            f = self.files[id_]
            self.puts += 1
            if self.pisar_al_guardar or cuerpo['sha'] != f['sha'] or cuerpo['branch'] != f'juego/{id_}':
                return self.responder(route, 409, {'message': 'does not match'}, cors)
            self.n += 1
            f['b64'] = cuerpo['content']
            f['sha'] = f'sha-{id_}-{self.n}'
            return self.responder(route, 200, {'content': {'sha': f['sha']}}, cors)
        if path.startswith(f'{base}/commits'):
            return self.responder(route, 200, [{
                'sha': 'commit-2', 'author': {'login': 'ana'},
                'commit': {'author': {'name': 'Ana'}, 'committer': {'date': '2026-10-10T10:00:00Z'},
                           'message': 'Actualizar final3\n\ncuerpo largo'}}], cors)
        if path.startswith(f'{base}/pulls') and req.method == 'POST':
            if self.pr_abierto:
                return self.responder(route, 422, {'message': 'A pull request already exists for juego/final3.'}, cors)
            self.pr_abierto = True
            return self.responder(route, 201, {'html_url': f'https://github.com/{REPO}/pull/7'}, cors)
        if path.startswith(f'{base}/pulls') and req.method == 'GET':
            lista = [{'html_url': f'https://github.com/{REPO}/pull/7'}] if self.pr_abierto else []
            return self.responder(route, 200, lista, cors)
        return self.responder(route, 404, {'message': 'Not Found (simulado)'}, cors)

    @staticmethod
    def responder(route, status, cuerpo, cors):
        route.fulfill(status=status, headers={**cors, 'Content-Type': 'application/json'}, body=json.dumps(cuerpo))


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
        gh = GitHubSimulado()
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1200, 'height': 800})
            page.on('pageerror', lambda e: errores.append(str(e)))
            # Los 401/409/422 son respuestas simuladas que la prueba provoca a propósito: Chromium los
            # registra como «Failed to load resource». Cualquier otro error de consola cuenta.
            esperados = re.compile(r'Failed to load resource: the server responded with a status of (401|409|422)')
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and not esperados.search(m.text) else None)
            page.route('https://api.github.com/**', gh.manejar)

            page.goto(base + '/creator/index.html')
            page.wait_for_selector('#entrada:not([hidden])')
            rec('sin token: se pide la entrada', page.is_visible('#entrada') and not page.is_visible('#principal'))
            rec('sin token: ninguna petición a GitHub', len(gh.peticiones) == 0, str(len(gh.peticiones)))

            page.fill('#repo', REPO)
            page.fill('#token', TOKEN)
            page.click('#entrada button[type=submit]')
            page.wait_for_selector('#juegos button')
            nombres = page.locator('#juegos button').all_inner_texts()
            rec('con token: lista los juegos de las ramas juego/*', len(nombres) == 2, ' / '.join(n.split('\n')[0] for n in nombres))
            rec('el token va a sessionStorage', page.evaluate("sessionStorage.getItem('pme-token')") == TOKEN)
            rec('el token no va a localStorage', page.evaluate("localStorage.getItem('pme-token')") is None)
            rec('el token solo va en Authorization',
                all(x['auth'] == f'Bearer {TOKEN}' for x in gh.peticiones) and not any(TOKEN in x['url'] for x in gh.peticiones))

            page.reload()
            page.wait_for_selector('#juegos button')
            rec('recargar la pestaña mantiene la sesión', page.is_visible('#principal'))

            # Almacén desde la página: las peticiones salen por la red simulada.
            res = page.evaluate("""async (cfg) => {
                const { crearAlmacenGitHub } = await import('./store/github.js');
                const a = crearAlmacenGitHub(cfg);
                const out = {};
                const L = await a.load('final3');
                out.loadId = L.game.id; out.loadRev = L.rev;
                const g = L.game; g.name = { es: 'Regalo robado (editado)', en: 'Stolen gift (edited)' };
                const s1 = await a.save('final3', g, L.rev, 'Cambio de nombre');
                out.saveRev = s1.rev;
                out.latest = await a.latestRev('final3');
                try { await a.save('final3', g, L.rev, 'con rev vieja'); out.staleCode = 'ok'; }
                catch (e) { out.staleCode = e.code; }
                out.hist = await a.history('final3');
                const cap = await a.load('capas');
                out.capasRev = cap.rev;
                try { await a.save('capas', cap.game, 'sha-equivocado', 'x'); out.badCode = 'ok'; }
                catch (e) { out.badCode = e.code; }
                return out;
            }""", {'owner': OWNER, 'repo': NOMBRE, 'token': TOKEN})
            rec('load: id y rev (sha) del juego', res['loadId'] == 'final3' and res['loadRev'] == 'sha-final3-1', res['loadRev'])
            rec('save normal: devuelve la rev nueva', res['saveRev'] != 'sha-final3-1' and res['latest'] == res['saveRev'], res['saveRev'])
            rec('save con rev vieja: conflict', res['staleCode'] == 'conflict', res['staleCode'])
            rec('save con rev vieja: no llega a PUT (solo un PUT en total)', gh.puts == 1, f'PUT={gh.puts}')
            rec('history: versiones con autor y mensaje', res['hist'] and res['hist'][0]['author'] == 'ana' and res['hist'][0]['message'] == 'Actualizar final3', str(res['hist'][:1])[:120])

            gh.pisar_al_guardar = True
            res2 = page.evaluate("""async (cfg) => {
                const { crearAlmacenGitHub } = await import('./store/github.js');
                const a = crearAlmacenGitHub(cfg);
                const L = await a.load('capas');
                try { await a.save('capas', L.game, L.rev, 'choque'); return 'ok'; }
                catch (e) { return e.code; }
            }""", {'owner': OWNER, 'repo': NOMBRE, 'token': TOKEN})
            gh.pisar_al_guardar = False
            rec('conflicto del servidor (409) con la rev correcta: conflict', res2 == 'conflict', res2)

            res3 = page.evaluate("""async (cfg) => {
                const { crearAlmacenGitHub } = await import('./store/github.js');
                const a = crearAlmacenGitHub(cfg);
                const r1 = await a.submit('final3', 'Lista para el estudio');
                const r2 = await a.submit('final3', 'Otra vez');
                return { r1: r1.url, r2: r2.url };
            }""", {'owner': OWNER, 'repo': NOMBRE, 'token': TOKEN})
            rec('submit: abre el pull request hacia main', res3['r1'].endswith('/pull/7'), res3['r1'])
            rec('submit: si ya hay uno abierto, devuelve ese', res3['r2'] == res3['r1'], res3['r2'])

            res4 = page.evaluate("""async () => {
                const { crearAlmacenGitHub } = await import('./store/github.js');
                try { await crearAlmacenGitHub({ owner: 'kreatures-studio', repo: 'juegos-prueba', token: 'mal' }).list(); return 'ok'; }
                catch (e) { return e.code; }
            }""")
            rec('token no válido: error auth', res4 == 'auth', res4)

            sessionStorage_antes = page.evaluate("sessionStorage.getItem('pme-token')")
            page.evaluate("sessionStorage.setItem('pme-token', 'mal'); location.reload()")
            page.wait_for_selector('#entrada:not([hidden])')
            rec('token caducado: vuelve a la entrada con el aviso',
                page.is_visible('#entrada') and 'válido' in page.inner_text('#entrada-error'), page.inner_text('#entrada-error'))
            page.fill('#token', TOKEN)
            page.click('#entrada button[type=submit]')
            page.wait_for_selector('#juegos button')
            page.click('#salir')
            page.wait_for_selector('#entrada:not([hidden])')
            rec('Salir borra el token y vuelve a la entrada',
                page.evaluate("sessionStorage.getItem('pme-token')") is None and page.is_visible('#entrada'), f'antes={bool(sessionStorage_antes)}')
            b.close()
        rec('sin errores de consola ni excepciones', not errores, '; '.join(errores)[:200])
    finally:
        srv.terminate()
        srv.wait(timeout=5)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' if ok else f'\nRESUMEN: {sum(RES)}/{len(RES)} OK (fallos)')
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
