"""Pruebas de límites de la demo PrintMyEscape (Chromium headless + Playwright).

Comprueban que ningún campo deja escribir más de lo que cabe en su hueco (sin avisos
de "no caben"), que los borradores antiguos se recortan al cargarse y que el ejemplo
de prueba "al tope" genera el PDF sin bloqueos.

Uso:
  PME_DEMO=ruta/a/demo/index.html PME_OUT=salida python3 tools/qa/limites-demo.py
"""
import json, os
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.abspath(os.environ.get('PME_DEMO', os.path.join(HERE, '..', '..', 'demo', 'index.html')))
URL = 'file://' + DEMO
OUT = os.path.abspath(os.environ.get('PME_OUT', os.path.join(HERE, 'salida-qa')))
os.makedirs(OUT, exist_ok=True)
DRAFT = 'pme-demo-draft-v3'
RES = []


def rec(name, ok, detail=''):
    RES.append({'test': name, 'ok': bool(ok), 'detail': detail})
    print(('OK    ' if ok else 'FALLO ') + name + ' | ' + str(detail)[:300], flush=True)


def open_demo(p):
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept())
    pg.goto(URL)
    pg.wait_for_timeout(600)
    return b, pg, errs


def mount(pg, fid):
    """Monta en la página el control real de un campo (el mismo que usa la demo) y devuelve su input."""
    pg.evaluate("""(fid) => {
        document.querySelectorAll('.test-mount').forEach(n => n.remove());
        var wrap = document.createElement('div'); wrap.className = 'test-mount';
        wrap.appendChild(fieldControl(mkField(fid))); document.body.appendChild(wrap);
    }""", fid)
    return pg.locator('.test-mount [data-fid="%s"]' % fid).first


def type_into(pg, loc, text):
    loc.click()
    loc.fill('')
    loc.press_sequentially(text, delay=0)
    pg.wait_for_timeout(120)
    return loc.input_value()


def main():
    with sync_playwright() as p:
        b, pg, errs = open_demo(p)
        pg.click('#langSwitch button[data-lang="es"]')
        pg.wait_for_timeout(150)

        # 1) Escribir hasta el tope: el campo deja de admitir letras (no aparece aviso)
        cases = [('APP_1', 10), ('S1_HIDEA', 30), ('BUSQUEDA_1', 20), ('NOMBRE_CUMPLE', 12), ('OTRO', 40)]
        for fid, lim in cases:
            inp = mount(pg, fid)
            val = type_into(pg, inp, 'x' * (lim + 15) if fid != 'APP_1' else 'abcdefghijklmnopqrstu')
            rec('%s se corta en %d caracteres' % (fid, lim), len(val) == lim, 'len=%d' % len(val))

        # 2) Nota (200) y postal (50): se escriben enteras, con texto de 200 y 50 caracteres
        inp = mount(pg, 'NOTA_PERSONALIZADA')
        val = type_into(pg, inp, ('Palabra larga sin fin ' * 12)[:200])
        rec('nota: se admiten 200 caracteres', len(val) == 200, 'len=%d' % len(val))
        inp = mount(pg, 'TEXTO_POSTAL')
        val = type_into(pg, inp, ('Te echo de menos, nos vemos el sábado en el parque ' * 2)[:50])
        rec('postal: se admiten 50 caracteres', len(val) == 50, 'len=%d' % len(val))

        # 2b) Edad: por encima del máximo se pone el máximo; por debajo del mínimo, el mínimo (con aviso)
        inp = mount(pg, 'EDAD')
        inp.click(); inp.fill('')
        inp.press_sequentially('150', delay=0); pg.wait_for_timeout(120)
        rec('edad 150 -> 110', inp.input_value() == '110', 'valor=%s' % inp.input_value())
        toast = pg.inner_text('#toast')
        rec('edad 150: aviso de máximo', '110' in toast and ('máxima' in toast or 'maximum' in toast.lower()), toast)
        inp.fill('0'); inp.press('Tab'); pg.wait_for_timeout(120)
        rec('edad 0 -> 1', inp.input_value() == '1', 'valor=%s' % inp.input_value())
        toast = pg.inner_text('#toast')
        rec('edad 0: aviso de mínimo', '1' in toast and ('mínima' in toast or 'minimum' in toast.lower()), toast)
        rec('edad: el valor corregido queda guardado', pg.evaluate("() => answers.EDAD") == '1', pg.evaluate("() => answers.EDAD"))

        # 3) Pegar un texto enorme en un hueco corto deja el trozo que cabe
        inp = mount(pg, 'APP_2')
        inp.click(); inp.fill('')
        pg.evaluate("(sel) => { var el = document.querySelector(sel); el.value = 'z'.repeat(40); el.dispatchEvent(new Event('input', {bubbles: true})); }", '.test-mount [data-fid="APP_2"]')
        pg.wait_for_timeout(100)
        rec('pegar texto largo en APP_2 deja como máximo 10', len(inp.input_value()) <= 10, 'len=%d' % len(inp.input_value()))

        # 4) Opciones de debilidades: una tercera opción no se añade si no cabe
        mount(pg, 'DEBILIDAD')
        pills = pg.locator('.test-mount .pill[data-v]')
        n = pills.count()
        for i in range(n):
            pills.nth(i).click()
            pg.wait_for_timeout(60)
        on = pg.locator('.test-mount .pill.on[data-v]').count()
        rec('debilidades: no se marcan más opciones que las que caben', on <= 2, 'marcadas=%d de %d' % (on, n))

        # 5) Ejemplo de prueba "al tope": genera el PDF sin avisos ni bloqueos
        pg.evaluate("() => document.querySelectorAll('.test-mount').forEach(n => n.remove())")
        pg.click('.ex-card:not(.blank-card) button >> nth=2')
        pg.wait_for_timeout(300)
        bad = pg.evaluate("async () => await textProblems()")
        rec('ejemplo 3 (al tope): ningún campo fuera de su hueco', bad == [], 'fuera=%s' % bad)

        # 6) Borrador antiguo con textos más largos que los límites nuevos: se recorta al cargar
        draft = pg.evaluate("(k) => JSON.parse(localStorage.getItem(k) || 'null')", DRAFT)
        if draft:
            draft['answers']['APP_1'] = 'abcdefghijklmnop'
            draft['answers']['S1_HIDEA'] = 'Un texto de borrador antiguo muy largo'
            draft['answers']['NOTA_PERSONALIZADA'] = 'q' * 400
            draft['answers']['DEBILIDAD'] = 'Llegar tarde||Robar comida ajena||Contar chistes malos||Otro: Ronquidos'
            pg.evaluate("([k, v]) => localStorage.setItem(k, JSON.stringify(v))", [DRAFT, draft])
            pg.reload(); pg.wait_for_timeout(700)
            pg.click('#langSwitch button[data-lang="es"]'); pg.wait_for_timeout(150)
            ans = pg.evaluate("() => answers")
            rec('borrador: APP_1 recortado a 10', len(ans.get('APP_1', '')) == 10, 'len=%d' % len(ans.get('APP_1', '')))
            rec('borrador: pista S1 recortada a 30', len(ans.get('S1_HIDEA', '')) <= 30, 'len=%d' % len(ans.get('S1_HIDEA', '')))
            rec('borrador: nota recortada a lo que cabe', 0 < len(ans.get('NOTA_PERSONALIZADA', '')) < 200, 'len=%d' % len(ans.get('NOTA_PERSONALIZADA', '')))
            kept = [x for x in (ans.get('DEBILIDAD', '') or '').split('||') if x and not x.startswith('Otro')]
            rec('borrador: debilidades sobrantes quitadas, "Otro" se conserva', len(kept) <= 2 and any(x.startswith('Otro') for x in ans.get('DEBILIDAD', '').split('||')), 'opciones=%s' % kept)
            bad2 = pg.evaluate("async () => await textProblems()")
            rec('borrador recortado: sin avisos de texto largo', bad2 == [], 'fuera=%s' % bad2)

        rec('sin errores de JavaScript', not errs, errs[:2])
        b.close()

    ok = sum(1 for r in RES if r['ok'])
    with open(os.path.join(OUT, 'limites.json'), 'w', encoding='utf-8') as fh:
        json.dump(RES, fh, ensure_ascii=False, indent=1)
    print('\nRESUMEN: %d/%d OK' % (ok, len(RES)))


if __name__ == '__main__':
    main()
