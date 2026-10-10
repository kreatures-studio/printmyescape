"""Pruebas E2E de la demo PrintMyEscape (Chromium headless + Playwright).

Uso:
  PME_DEMO=ruta/a/demo/index.html PME_OUT=salida python3 tools/qa/e2e-demo.py

Las fotos de tools/qa/fixtures/ son SINTÉTICAS (ninguna es una persona real).
Requiere 'pdftotext' (poppler) para comprobar el texto de los PDF generados.
"""
import json, os, subprocess
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
DEMO = os.path.abspath(os.environ.get('PME_DEMO', os.path.join(HERE, '..', '..', 'demo', 'index.html')))
URL = 'file://' + DEMO
FIX = os.path.join(HERE, 'fixtures')
OUT = os.path.abspath(os.environ.get('PME_OUT', os.path.join(HERE, 'salida-qa')))
os.makedirs(OUT, exist_ok=True)
RES = []
DLG = {'accept': True}  # respuesta a confirm(): True acepta, False cancela


def rec(name, ok, detail=''):
    RES.append({'test': name, 'ok': bool(ok), 'detail': detail})
    print(('OK    ' if ok else 'FALLO ') + name + ' | ' + str(detail)[:300], flush=True)


def open_demo(p, vw=1366, vh=900, mobile=False):
    b = p.chromium.launch(args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': vw, 'height': vh}, accept_downloads=True,
                        is_mobile=mobile, has_touch=mobile)
    pg = ctx.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('dialog', lambda d: d.accept() if DLG['accept'] else d.dismiss())
    pg.goto(URL)
    pg.wait_for_timeout(600)
    return b, pg, errs


def choose_lang(pg, lang):
    """Elige idioma con el selector de arriba (ES | EN)."""
    pg.click('#langSwitch button[data-lang="%s"]' % lang)
    pg.wait_for_timeout(150)


def fill_example(pg, n):
    """Pulsa 'Rellenar ejemplo n' de la portada de demostración. Lleva a la bienvenida."""
    pg.locator('.ex-card:not(.blank-card) button').nth(n - 1).click()
    pg.wait_for_timeout(300)


def to_review(pg, limit=80):
    """Avanza con 'Continuar' (bienvenida -> pasos -> revisión). True si llega a la revisión."""
    for _ in range(limit):
        if pg.evaluate("() => view") == 'review':
            return True
        pg.click(next_btn(pg))
        pg.wait_for_timeout(120)
    return pg.evaluate("() => view") == 'review'


def next_btn(pg):
    """Botón 'Continuar': el de escritorio (#dnext) o el de la barra móvil (#next), el visible."""
    return '#dnext' if pg.is_visible('#dnext') else '#next'


def generate(pg):
    """Recorrido completo -> revisión -> pantalla final -> componer. Devuelve el texto de error o ''."""
    if not to_review(pg):
        return 'no llega a la revisión'
    pg.click('#dnext')            # revisión -> pantalla final
    pg.wait_for_timeout(200)
    pg.click('#bGen')
    try:
        pg.wait_for_function("() => document.getElementById('dl').style.display === 'flex' || "
                             "(document.getElementById('err').style.display !== 'none')", timeout=180000)
    except Exception:
        return 'timeout'
    return err_text(pg)


def err_text(pg):
    return pg.evaluate("() => document.getElementById('err').style.display !== 'none' ? document.getElementById('err').textContent : ''")


def download_pdf(pg, name):
    with pg.expect_download(timeout=60000) as di:
        pg.click('#pdflink')
    path = os.path.join(OUT, name + '.pdf')
    di.value.save_as(path)
    return path


def pdf_text(path):
    return subprocess.run(['pdftotext', '-raw', path, '-'], capture_output=True, text=True).stdout


def pdf_pages(path):
    out = subprocess.run(['pdfinfo', path], capture_output=True, text=True).stdout
    for line in out.splitlines():
        if line.startswith('Pages:'):
            return int(line.split()[1])
    return -1


def photo_dims(pg, key):
    return pg.evaluate("""(k) => new Promise(r => { if (!photos[k]) { r(null); return; } const i = new Image();
        i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = photos[k]; })""", key)


def upload_photo(pg, fid, filename):
    pg.evaluate("(f) => { photoTarget = f; }", fid)
    pg.set_input_files('#filepick', os.path.join(FIX, filename))
    pg.wait_for_timeout(700)


with sync_playwright() as p:
    # ---------- L. portada: idioma antes que nada ----------
    b, pg, errs = open_demo(p)
    rec('L0 carga sin errores JS', not errs, '; '.join(errs)[:200])
    rec('L1 sin idioma no se puede continuar ni rellenar ejemplos',
        pg.is_disabled('#dnext') and all(pg.locator('.ex-card:not(.blank-card) button').nth(i).is_disabled() for i in range(3)),
        'dnext disabled=%s' % pg.is_disabled('#dnext'))
    pg.click('.lang-card >> nth=0')
    pg.wait_for_timeout(150)
    rec('L2 elegir ES en la portada: html lang=es, nav activo, ejemplos activos',
        pg.get_attribute('html', 'lang') == 'es' and not pg.is_disabled('#dnext')
        and not pg.locator('.ex-card:not(.blank-card) button').nth(0).is_disabled(), 'lang=%s' % pg.get_attribute('html', 'lang'))
    rec('L3 interfaz en español tras elegir ES', 'Continuar' in pg.inner_text('#dnext') and 'Secciones' in pg.text_content('#drawer'),
        pg.inner_text('#dnext'))
    choose_lang(pg, 'en')
    rec('L4 selector ES·EN de arriba cambia la interfaz a inglés', pg.get_attribute('html', 'lang') == 'en'
        and 'Continue' in pg.inner_text('#dnext') and 'Sections' in pg.text_content('#drawer'), pg.inner_text('#dnext'))
    rec('L5 los ejemplos muestran nombres en inglés', pg.inner_text('.ex-card:not(.blank-card) .who >> nth=1') == 'Martha', pg.inner_text('.ex-card:not(.blank-card) .who >> nth=1'))
    b.close()

    # ---------- W. bienvenida: aviso con casilla antes de rellenar ----------
    b, pg, errs = open_demo(p)
    rec('W0 la primera pantalla es la de demostración (idioma + ejemplos + en blanco)',
        pg.locator('.demo-banner').count() == 1 and pg.locator('.ex-card:not(.blank-card)').count() == 3
        and pg.locator('button:has-text("Empezar en blanco")').count() == 1,
        'banner=%s ejemplos=%s' % (pg.locator('.demo-banner').count(), pg.locator('.ex-card').count()))
    choose_lang(pg, 'es')
    pg.click('button:has-text("Empezar en blanco")')
    pg.wait_for_timeout(250)
    on_welcome = pg.evaluate("() => SCREENS[idx].welcome === true && view === 'steps'")
    checked = pg.evaluate("() => answers.intro_ok === '1'")
    rec('W1 "Empezar en blanco" lleva al aviso (sin casilla marcada)',
        on_welcome and not checked and 'Comprendo cómo funciona' in pg.text_content('#answer'),
        'bienvenida=%s casilla=%s' % (on_welcome, checked))
    pg.click('#dnext')
    pg.wait_for_timeout(200)
    still = pg.evaluate("() => SCREENS[idx].welcome === true")
    warned = pg.evaluate("() => document.getElementById('err').style.display !== 'none'")
    rec('W2 sin marcar la casilla no se avanza y se avisa', still and warned,
        'sigue en bienvenida=%s aviso=%s' % (still, warned))
    pg.click('#answer .checkline')
    pg.wait_for_timeout(120)
    pg.click('#dnext')
    pg.wait_for_timeout(200)
    rec('W3 con la casilla marcada se pasa al primer paso del formulario',
        pg.evaluate("() => !SCREENS[idx].welcome && !SCREENS[idx].landing && view === 'steps'"),
        'idx=%s' % pg.evaluate("() => idx"))
    b.close()

    b, pg, errs = open_demo(p)
    choose_lang(pg, 'en')
    fill_example(pg, 2)
    on_welcome = pg.evaluate("() => SCREENS[idx].welcome === true && view === 'steps'")
    checked = pg.evaluate("() => answers.intro_ok === '1'")
    rec('W4 ejemplo rellenado lleva a la bienvenida (no a la revisión), con casilla marcada',
        on_welcome and checked, 'bienvenida=%s casilla=%s' % (on_welcome, checked))
    b.close()

    # ---------- X. ejemplos: PDF en el idioma elegido ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    tot = pg.evaluate("() => { let n = 0, ok = 0; SCREENS.forEach(s => s.fields.forEach(f => { if (f.required) { n++; if (hasValue(f)) ok++; } })); return [ok, n]; }")
    rec('X1 ejemplo 1 (ES) rellena todos los obligatorios', tot[0] == tot[1], 'resueltos %s de %s' % (tot[0], tot[1]))
    e = generate(pg)
    if not e:
        pdf = download_pdf(pg, 'ejemplo-1-es')
        txt = pdf_text(pdf)
        rec('X2 ejemplo 1 (ES) genera PDF en español', 'Ian' in txt and 'TE QUIERO CARMEN RUIZ' in txt.upper().replace('\n', ' '),
            'páginas=%s' % pdf_pages(pdf))
    else:
        rec('X2 ejemplo 1 (ES) genera PDF', False, e)
    b.close()

    b, pg, errs = open_demo(p)
    choose_lang(pg, 'en')
    fill_example(pg, 2)
    e = generate(pg)
    if not e:
        pdf = download_pdf(pg, 'ejemplo-2-en')
        txt = pdf_text(pdf)
        flat = ' '.join(txt.split())
        sp = [w for w in ('madrugar', 'Odia', 'TE QUIERO', 'Otro', 'Tomás', 'pastas') if w in flat]
        rec('X3 ejemplo 2 (EN): el PDF sale sin textos en español', not sp and 'Martha' in flat,
            'palabras en español=%s páginas=%s' % (sp, pdf_pages(pdf)))
        rec('X4 amor prohibido en inglés: I LOVE + nombre (no TE QUIERO)', 'I LOVE TOM WALSH' in flat.upper(),
            'I LOVE presente=%s' % ('I LOVE TOM WALSH' in flat.upper()))
    else:
        rec('X3 ejemplo 2 (EN) genera PDF', False, e)
    b.close()

    b, pg, errs = open_demo(p)
    choose_lang(pg, 'en')
    fill_example(pg, 3)
    e = generate(pg)
    rec('X5 ejemplo 3 (EN) genera PDF', not e, e or 'ok')
    b.close()

    # ---------- P. nueve fotos de muestra distintas ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    n_distintas = pg.evaluate("() => { const v = Object.keys(photos).filter(k => k.indexOf('photo_') === 0).map(k => photos[k]); return [v.length, new Set(v).size]; }")
    rec('P1 nueve fotos de muestra, todas distintas', n_distintas == [9, 9], 'fotos=%s distintas=%s' % (n_distintas[0], n_distintas[1]))
    b.close()

    # ---------- M. cambio de idioma conserva datos y traduce las debilidades ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'en')
    fill_example(pg, 1)
    weak_en = pg.evaluate("() => answers.DEBILIDAD")
    choose_lang(pg, 'es')
    weak_es = pg.evaluate("() => answers.DEBILIDAD")
    name = pg.evaluate("() => answers.NOMBRE_CUMPLE")
    rec('M1 cambiar a ES conserva datos y traduce debilidades y "Otro"', name == 'Ian' and weak_es.startswith('Llegar tarde||Robar comida ajena||Otro: ')
        and 'Snoring' in weak_es, 'EN=%r ES=%r' % (weak_en, weak_es))
    b.close()

    # ---------- B. fotos: formatos, resolución y orientación ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    pg.evaluate("() => { answers.NOMBRE_CUMPLE = 'Ana'; answers.intro_ok = '1'; saveDraft(); view = 'steps'; idx = screenOfField('FOTO_CUMPLE'); render(); }")
    upload_photo(pg, 'FOTO_CUMPLE', 'retrato-2.webp')
    d = photo_dims(pg, 'photo_FOTO_CUMPLE')
    is_jpeg = pg.evaluate("() => !!photos.photo_FOTO_CUMPLE && photos.photo_FOTO_CUMPLE.indexOf('data:image/jpeg') === 0")
    rec('B1 WebP 800x1000 se acepta y se guarda como JPEG', d == [800, 1000] and is_jpeg, 'dims=%s jpeg=%s' % (d, is_jpeg))
    pg.evaluate("() => { delete photos.photo_FOTO_CUMPLE; }")
    upload_photo(pg, 'FOTO_CUMPLE', 'pequena.jpg')
    e = err_text(pg) or pg.evaluate("() => document.getElementById('toast').textContent")
    rejected = pg.evaluate("() => !photos.photo_FOTO_CUMPLE")
    rec('B2 foto de 300 px de lado corto se rechaza con mensaje', 'demasiado pequeña' in e and rejected, e or '(sin mensaje)')
    upload_photo(pg, 'FOTO_CUMPLE', 'movil-exif6.jpg')
    d = photo_dims(pg, 'photo_FOTO_CUMPLE')
    sin_exif = pg.evaluate("() => { const b = atob(photos.photo_FOTO_CUMPLE.split(',')[1]); return b.indexOf('Exif') < 0; }")
    rec('B3 foto de móvil con EXIF orientation 6 queda enderezada y sin EXIF', d == [800, 1000] and sin_exif,
        'dims=%s sin_exif=%s' % (d, sin_exif))
    b.close()

    # ---------- D. fotos obligatorias ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    pg.evaluate("() => { photos = {}; }")
    reached = to_review(pg)
    v = pg.evaluate("() => view")
    rec('D1 sin las 9 fotos no se llega a la revisión ni a la pantalla final', not reached and v == 'steps',
        'view=%s · aviso: %s' % (v, err_text(pg)[:120]))
    b.close()

    # ---------- E. saltos de línea del chat ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    pg.evaluate("() => { answers.MENSAJE_PERSONALIZADO = 'Hola\\nAdiós'; }")
    generate(pg)
    p_nl = download_pdf(pg, 'chat-con-salto')
    b.close()
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    pg.evaluate("() => { answers.MENSAJE_PERSONALIZADO = 'Hola Adiós'; }")
    generate(pg)
    p_sp = download_pdf(pg, 'chat-con-espacio')
    b.close()
    rec('E1 el salto de línea del chat llega al PDF', pdf_text(p_nl) != pdf_text(p_sp),
        'con \\n y con espacio: %s' % ('distintos' if pdf_text(p_nl) != pdf_text(p_sp) else 'IGUALES'))

    # ---------- F. límites de caracteres ----------
    b, pg, errs = open_demo(p)
    lim = pg.evaluate("() => ({NOMBRE_CUMPLE: LIMITS.NOMBRE_CUMPLE, NOMBRE_1: LIMITS['NOMBRE_1'], NOMBRE_4_2: LIMITS['NOMBRE_4.2'], APODO_1: LIMITS.APODO_1, APODO_8: LIMITS.APODO_8, B_INFO: LIMITS.B_INFO})")
    nombres = {k: v for k, v in lim.items() if k != 'B_INFO'}
    rec('F1 límite de nombres y apodos = 12 (política)', all(v == 12 for v in nombres.values()) and lim['B_INFO'] == 200,
        json.dumps(lim))
    b.close()

    # ---------- G. móvil y escritorio ----------
    b, pg, errs = open_demo(p, vw=390, vh=844, mobile=True)
    sw = pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    rec('G1 móvil 390px sin scroll horizontal (portada)', sw[0] <= sw[1], 'scrollWidth/clientWidth=%s' % (sw,))
    pg.screenshot(path=os.path.join(OUT, 'movil-inicio.png'), full_page=True)
    choose_lang(pg, 'en')
    fill_example(pg, 2)
    sw = pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    rec('G2 móvil 390px sin scroll horizontal (bienvenida)', sw[0] <= sw[1], 'scrollWidth/clientWidth=%s' % (sw,))
    reached = to_review(pg)
    sw = pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    rec('G3 móvil 390px: se llega a la revisión sin scroll horizontal', reached and sw[0] <= sw[1],
        'revisión=%s scrollWidth/clientWidth=%s' % (reached, sw))
    b.close()
    b, pg, errs = open_demo(p, vw=1366, vh=820)
    choose_lang(pg, 'es')
    pg.screenshot(path=os.path.join(OUT, 'escritorio-inicio.png'))
    b.close()

    # ---------- H. borrador ----------
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'en')
    pg.evaluate("() => { answers.NOMBRE_CUMPLE = 'Clara'; saveDraft(); }")
    pg.reload(); pg.wait_for_timeout(600)
    val = pg.evaluate("() => [answers.NOMBRE_CUMPLE || '', LANG]")
    rec('H1 borrador (datos e idioma) se restaura al recargar', val == ['Clara', 'en'], 'valor=%s' % (val,))
    b.close()

    # ---------- I. ejemplo pide confirmación; si se cancela, se conservan los datos ----------
    DLG['accept'] = False
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    pg.evaluate("() => { answers.NOMBRE_CUMPLE = 'Zoe'; saveDraft(); }")
    pg.reload(); pg.wait_for_timeout(500)
    fill_example(pg, 2)
    pg.wait_for_timeout(200)
    v = pg.evaluate("() => answers.NOMBRE_CUMPLE")
    DLG['accept'] = True
    rec('I1 rellenar ejemplo pide confirmación y, si se cancela, conserva tus datos', v == 'Zoe', 'NOMBRE_CUMPLE=%r' % v)
    b.close()

    # ---------- R. empezar de nuevo borra datos y fotos ----------
    DLG['accept'] = True
    b, pg, errs = open_demo(p)
    choose_lang(pg, 'es')
    fill_example(pg, 1)
    to_review(pg)
    pg.click('#dnext'); pg.wait_for_timeout(200)
    pg.click('button:has-text("Empezar de nuevo"), button:has-text("Start over")')
    pg.wait_for_timeout(300)
    pg.reload(); pg.wait_for_timeout(700)
    vals = pg.evaluate("() => [Object.keys(answers).filter(k => answers[k]).length, Object.keys(photos).length]")
    rec('R1 empezar de nuevo borra respuestas y fotos (también tras recargar)', vals == [0, 0], 'respuestas=%s fotos=%s' % (vals[0], vals[1]))
    b.close()

    print('\nRESUMEN: %d/%d OK' % (sum(r['ok'] for r in RES), len(RES)))
    with open(os.path.join(OUT, 'resultados-e2e.json'), 'w', encoding='utf-8') as f:
        json.dump(RES, f, ensure_ascii=False, indent=1)
