#!/usr/bin/env python3
"""Prueba de la copia publicada del creador (T5.7 de PLAN-CREADOR.md; F4 de PLAN-CREADOR-2.md). Chromium + Playwright.

Construye docs/creador/ (tools/build-creator.py) y sirve docs/ con creator/serve.mjs --raiz docs. Comprueba:
  - lo publicado no lleva la biblioteca (es del repositorio privado) ni fotos ni PDF de artista;
  - sin token se pide la entrada, y la guía del token se abre con el enlace al formulario de GitHub ya relleno;
  - con GitHub (API simulada, la de creator-github.py) el creador publicado compone una página con el arte de la
    biblioteca de main: motor, mecánicas, reglas y fuentes llegan por sus rutas publicadas;
  - en modo demostración (memoria, sin biblioteca) lista los dos juegos y el antiguo avisa de que falta el PDF del
    artista en la vista previa, sin fallar en silencio.
Uso (desde la raíz del repo):  python3 tools/qa/creator-publicado.py
Código 0 si todo pasa; 1 si no.
"""
import importlib.util, os, re, socket, subprocess, sys, time, urllib.request
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


def simulador():
    spec = importlib.util.spec_from_file_location('creator_github', os.path.join(os.path.dirname(__file__), 'creator-github.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def main():
    r = subprocess.run([sys.executable, 'tools/build-creator.py'], cwd=ROOT, capture_output=True, text=True)
    rec('build-creator: genera docs/creador/', r.returncode == 0, (r.stdout + r.stderr).strip()[:300])
    if r.returncode:
        return 1
    publicados = [os.path.relpath(os.path.join(d, n), os.path.join(ROOT, 'docs', 'creador')) for d, _, ns in os.walk(os.path.join(ROOT, 'docs', 'creador')) for n in ns]
    privados = [x for x in publicados if x.startswith('biblioteca/') or '/fotos/' in x or x.endswith('.pdf') or x.endswith('.jpg')]
    rec('lo publicado no lleva biblioteca, fotos ni PDF', not privados, str(privados[:5]))
    gh_mod = simulador()
    port = puerto_libre()
    base = f'http://127.0.0.1:{port}/creador/index.html'
    srv = subprocess.Popen(['node', 'creator/serve.mjs', '--port', str(port), '--raiz', 'docs'], cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    errores = []
    no_encontrados = []
    try:
        if not esperar(base):
            print('FALLO: el servidor no arranca', srv.stderr.read())
            return 1
        with sync_playwright() as p:
            b = p.chromium.launch(args=['--no-sandbox'])
            page = b.new_page(viewport={'width': 1440, 'height': 1000})
            page.set_default_timeout(30000)
            page.on('pageerror', lambda e: errores.append(str(e)))
            page.on('console', lambda m: errores.append(m.text) if m.type == 'error' and not m.text.startswith('Failed to load resource') else None)
            page.on('response', lambda r: no_encontrados.append(r.url) if r.status == 404 and '127.0.0.1' in r.url else None)
            gh = gh_mod.GitHubSimulado()
            page.route('https://api.github.com/**', gh.manejar)

            page.goto(base)
            page.wait_for_selector('.entrada-caja')
            rec('sin token: pide la entrada', page.is_visible('#token'))
            with page.context.expect_page() as nueva:
                page.click('a:has-text("Guía paso a paso")')
            guia = nueva.value
            guia.wait_for_load_state()
            guia.fill('#propietario', 'kreatures-studio')
            enlace = guia.get_attribute('#ir', 'href')
            rec('guía del token: enlace al formulario de GitHub con permisos y propietario', enlace.startswith('https://github.com/settings/personal-access-tokens/new?')
                and 'contents=write' in enlace and 'pull_requests=write' in enlace and 'target_name=kreatures-studio' in enlace, enlace[:140])
            guia.close()

            page.click('summary:has-text("Otro repositorio")')

            page.fill('#repo', gh_mod.REPO)
            page.fill('#token', gh_mod.TOKEN)
            page.click('.entrada-caja button[type=submit]')
            page.wait_for_selector(f'.tarjeta-juego[data-juego={gh_mod.F3}]')
            page.goto(base + f'#/juego/{gh_mod.F3}/paginas/p1')
            page.wait_for_selector('.lienzo[data-listo]')
            rec('con GitHub: el creador publicado compone la página con el arte de la biblioteca', page.evaluate("document.querySelector('.lienzo canvas.pintado').width") > 300)
            page.click('.nav a:has-text("Vista previa")')
            page.wait_for_selector('.previa-paginas[data-listo]', timeout=60000)
            rec('con GitHub: vista previa entera sin errores', page.locator('.previa-paginas figure').count() == 6 and page.locator('.mensaje.error').count() == 0)
            page.evaluate("localStorage.clear(); sessionStorage.clear()")

            page.goto(base + '?almacen=memoria')
            page.wait_for_selector('.tarjeta-juego')
            juegos = sorted(page.locator('.tarjeta-juego').evaluate_all('els => els.map(e => e.dataset.juego)'))
            rec('demostración: lista los dos juegos de muestra', juegos == ['cumple-mision-secreta', 'final3'], str(juegos))
            page.goto(base + '?almacen=memoria#/juego/final3/previa')
            page.wait_for_selector('.mensaje.error:has-text("No se pudo componer")')
            rec('demostración: sin el PDF del artista la vista previa lo dice', 'Final3-Clean.pdf' in page.inner_text('.mensaje.error:has-text("No se pudo componer")'),
                page.inner_text('.mensaje.error:has-text("No se pudo componer")')[:140])
            rec('lo único que falta es el PDF del artista (no se publica)', no_encontrados and all(u.endswith('/Final3-Clean.pdf') for u in no_encontrados), ', '.join(sorted(set(no_encontrados)))[:240])
            rec('sin excepciones de página', not errores, '; '.join(errores)[:300])
            b.close()
    finally:
        srv.terminate()
        srv.wait(timeout=5)
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
