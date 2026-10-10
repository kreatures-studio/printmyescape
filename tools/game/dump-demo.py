"""Volcado del formulario actual (demo) a games/final3/_dump.json (T0.2 de PLAN-CREADOR.md).

Abre la demo con Chromium headless y copia las variables globales de su formulario:
Q, SECDEF, SUS_EXTRA, LIMITS, WEAK y los seis ejemplos. Son `var` de nivel superior,
así que están en `window`.

Uso:
  python3 tools/game/dump-demo.py                  # lee demo/index.html
  PME_DEMO=ruta/index.html python3 tools/game/dump-demo.py
  PME_DUMP=ruta/salida.json python3 tools/game/dump-demo.py

Aceptación: 9 secciones en SECDEF y 6 ejemplos.
"""
import json, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
DEMO = os.path.abspath(os.environ.get('PME_DEMO', os.path.join(ROOT, 'demo', 'index.html')))
OUT = os.path.abspath(os.environ.get('PME_DUMP', os.path.join(ROOT, 'games', 'final3', '_dump.json')))

GLOBALS = ['Q', 'SECDEF', 'SUS_EXTRA', 'LIMITS', 'WEAK',
           'EJEMPLO', 'EJEMPLO2', 'EJEMPLO3', 'EJEMPLO_EN', 'EJEMPLO2_EN', 'EJEMPLO3_EN']
EXAMPLES = ['EJEMPLO', 'EJEMPLO2', 'EJEMPLO3', 'EJEMPLO_EN', 'EJEMPLO2_EN', 'EJEMPLO3_EN']


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--no-sandbox'])
        pg = b.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto('file://' + DEMO)
        pg.wait_for_timeout(600)
        data = pg.evaluate(
            """(names) => {
                const out = {};
                for (const k of names) {
                    if (typeof window[k] === 'undefined') throw new Error('no existe la global ' + k);
                    out[k] = window[k];
                }
                return out;
            }""", GLOBALS)
        b.close()
    if errs:
        raise SystemExit('Errores de página al abrir la demo: ' + '; '.join(errs))

    secciones = len(data['SECDEF'])
    ejemplos = [k for k in EXAMPLES if k in data]
    print('secciones:', secciones, '| ejemplos:', len(ejemplos), '| preguntas Q:', len(data['Q']))
    if secciones != 9 or len(ejemplos) != 6:
        raise SystemExit('Aceptación T0.2 fallida: se esperaban 9 secciones y 6 ejemplos')

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write('\n')
    print('escrito', os.path.relpath(OUT, ROOT))


if __name__ == '__main__':
    main()
