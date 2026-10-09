"""Pruebas E2E de la demo PrintMyEscape (Chromium headless + Playwright).

Uso:
  PME_DEMO=ruta/a/demo/index.html PME_OUT=salida python3 tools/qa/e2e-demo.py

Las fotos de tools/qa/fixtures/ son SINTÉTICAS (ninguna es una persona real).
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


def wait_done(pg):
    pg.wait_for_function("() => { const s = document.getElementById('genstatus'); return s && (s.textContent.startsWith('Listo') || document.getElementById('err').style.display !== 'none'); }", timeout=180000)
    return err_text(pg)


def err_text(pg):
    return pg.evaluate("() => document.getElementById('err').style.display !== 'none' ? document.getElementById('err').textContent : ''")


def download_pdf(pg, name):
    with pg.expect_download(timeout=60000) as di:
        pg.click('#pdflink')
    path = os.path.join(OUT, name + '.pdf')
    di.value.save_as(path)
    return path


def fill_and_finish(pg):
    """Camino real: 'Rellenar ejemplo' (acepta el aviso) -> Terminar."""
    pg.evaluate("() => fillExample()")
    pg.evaluate("() => { view = 'steps'; finish(); }")


def photo_dims(pg, key):
    return pg.evaluate("""(k) => new Promise(r => { if (!photos[k]) { r(null); return; } const i = new Image();
        i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = photos[k]; })""", key)


def upload_photo(pg, fid, filename):
    pg.evaluate("(f) => { photoTarget = f; }", fid)
    pg.set_input_files('#filepick', os.path.join(FIX, filename))
    pg.wait_for_timeout(700)


with sync_playwright() as p:
    # ---------- A. carga y ejemplos del flujo real ----------
    b, pg, errs = open_demo(p)
    rec('A0 carga sin errores JS', not errs, '; '.join(errs)[:200])
    fill_and_finish(pg)
    for n in (1, 2, 3):
        try:
            pg.click("button.exbtn:has-text('Ejemplo %d')" % n)
            e = wait_done(pg)
            rec('A%d ejemplo %d genera PDF' % (n, n), not e, e or download_pdf(pg, 'ejemplo-%d' % n))
        except Exception as ex:
            rec('A%d ejemplo %d genera PDF' % (n, n), False, str(ex)[:200])
    b.close()

    # ---------- B. fotos: formatos, resolución y orientación ----------
    b, pg, errs = open_demo(p)
    fill_and_finish(pg)
    upload_photo(pg, 'FOTO_1', 'retrato-2.webp')
    d = photo_dims(pg, 'photo_FOTO_1')
    is_jpeg = pg.evaluate("() => !!photos.photo_FOTO_1 && photos.photo_FOTO_1.indexOf('data:image/jpeg') === 0")
    rec('B1 WebP 800x1000 se acepta y se guarda como JPEG', d == [800, 1000] and is_jpeg, 'dims=%s jpeg=%s' % (d, is_jpeg))
    pg.evaluate("() => { delete photos.photo_FOTO_2; }")   # que no quede la de muestra
    upload_photo(pg, 'FOTO_2', 'pequena.jpg')
    e = err_text(pg)
    rejected = pg.evaluate("() => !photos.photo_FOTO_2")
    rec('B2 foto de 300 px de lado corto se rechaza con mensaje', 'demasiado pequeña' in e and rejected, e or '(sin mensaje)')
    upload_photo(pg, 'FOTO_3', 'movil-exif6.jpg')
    d = photo_dims(pg, 'photo_FOTO_3')
    # La foto guardada debe venir ya enderezada y sin etiqueta EXIF (los visores de PDF la ignoran).
    sin_exif = pg.evaluate("() => { const b = atob(photos.photo_FOTO_3.split(',')[1]); return b.indexOf('Exif') < 0; }")
    rec('B3 foto de móvil con EXIF orientation 6 queda enderezada y sin EXIF', d == [800, 1000] and sin_exif,
        'dims=%s sin_exif=%s (el archivo original está en 1000x800 con orientation=6)' % (d, sin_exif))
    b.close()

    # ---------- C. foto normal de principio a fin ----------
    b, pg, errs = open_demo(p)
    fill_and_finish(pg)
    upload_photo(pg, 'FOTO_1', 'retrato-1.jpg')
    pg.click("button.exbtn:has-text('Ejemplo 1')")
    e = wait_done(pg)
    rec('C1 JPG normal genera PDF', not e, e or download_pdf(pg, 'foto-jpg'))
    b.close()

    # ---------- D. fotos obligatorias ----------
    b, pg, errs = open_demo(p)
    pg.evaluate("() => fillExample()")
    pg.evaluate("() => { photos = {}; view = 'steps'; finish(); }")
    v = pg.evaluate("() => view")
    rec('D1 no se puede terminar sin las 9 fotos', v != 'done', 'view=%s · aviso: %s' % (v, err_text(pg)[:120]))
    pg.evaluate("() => { view = 'steps'; generatePDFNow(); }")
    pg.wait_for_timeout(800)
    rec('D2 generar sin fotos se bloquea con aviso (sin foto de muestra)', 'Faltan fotos' in err_text(pg), err_text(pg)[:160])
    b.close()

    # ---------- E. saltos de línea del chat ----------
    b, pg, errs = open_demo(p)
    fill_and_finish(pg)
    pg.evaluate("() => { answers.MENSAJE_PERSONALIZADO = 'Hola\\nAdiós'; view = 'steps'; finish(); }")
    pg.click("#bGen")   # genera con MIS datos (Ejemplo N los sustituye)
    wait_done(pg)
    p_nl = download_pdf(pg, 'chat-con-salto')
    b.close()
    b, pg, errs = open_demo(p)
    fill_and_finish(pg)
    pg.evaluate("() => { answers.MENSAJE_PERSONALIZADO = 'Hola Adiós'; view = 'steps'; finish(); }")
    pg.click("#bGen")   # genera con MIS datos (Ejemplo N los sustituye)
    wait_done(pg)
    p_sp = download_pdf(pg, 'chat-con-espacio')
    b.close()
    t1 = subprocess.run(['pdftotext', '-raw', p_nl, '-'], capture_output=True, text=True).stdout
    t2 = subprocess.run(['pdftotext', '-raw', p_sp, '-'], capture_output=True, text=True).stdout
    rec('E1 el salto de línea del chat llega al PDF', t1 != t2, 'con \\n y con espacio dan textos %s' % ('distintos' if t1 != t2 else 'IGUALES (el salto se pierde)'))

    # ---------- F. límites de caracteres (informativo) ----------
    b, pg, errs = open_demo(p)
    lim = pg.evaluate("() => ({NOMBRE_CUMPLE: LIMITS.NOMBRE_CUMPLE, NOMBRE_1: LIMITS['NOMBRE_1'], NOMBRE_4_2: LIMITS['NOMBRE_4.2'], APODO_1: LIMITS.APODO_1, APODO_8: LIMITS.APODO_8, FAMA: LIMITS.FAMA, B_INFO: LIMITS.B_INFO})")
    nombres = {k: v for k, v in lim.items() if k not in ('FAMA', 'B_INFO')}
    rec('F1 límite de nombres y apodos = 12 (política)', all(v == 12 for v in nombres.values()) and lim['B_INFO'] == 200,
        json.dumps(lim) + ' · VARIABLES-Y-FOTOS.md: 12')
    b.close()

    # ---------- G. móvil y escritorio ----------
    b, pg, errs = open_demo(p, vw=390, vh=844, mobile=True)
    sw = pg.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    rec('G1 móvil 390px sin scroll horizontal', sw[0] <= sw[1], 'scrollWidth/clientWidth=%s' % (sw,))
    pg.screenshot(path=os.path.join(OUT, 'movil-inicio.png'))
    b.close()
    b, pg, errs = open_demo(p, vw=1366, vh=768)
    pg.screenshot(path=os.path.join(OUT, 'escritorio-inicio.png'))
    b.close()

    # ---------- H. borrador ----------
    b, pg, errs = open_demo(p)
    pg.evaluate("() => { answers.NOMBRE_CUMPLE = 'Clara'; answers.intro_ok = '1'; saveDraft(); }")
    pg.reload(); pg.wait_for_timeout(600)
    val = pg.evaluate("() => answers.NOMBRE_CUMPLE || ''")
    rec('H1 borrador se restaura al recargar', val == 'Clara', 'NOMBRE_CUMPLE=%r' % val)
    b.close()

    # ---------- I. ejemplos no machacan datos si se cancela el aviso ----------
    DLG['accept'] = False
    b, pg, errs = open_demo(p)
    pg.evaluate("() => fillExample()")          # sin datos previos: no hay aviso
    pg.evaluate("() => { answers.NOMBRE_CUMPLE = 'Zoe'; view = 'steps'; finish(); }")
    # sin listener el aviso se descarta (dismiss): deben conservarse los datos
    pg.click("button.exbtn:has-text('Ejemplo 2')")
    pg.wait_for_timeout(300)
    v = pg.evaluate("() => answers.NOMBRE_CUMPLE")
    DLG['accept'] = True
    rec('I1 "Ejemplo N" pide confirmación y, si se cancela, conserva tus datos', v == 'Zoe', 'NOMBRE_CUMPLE=%r' % v)
    b.close()

    print('\nRESUMEN: %d/%d OK' % (sum(r['ok'] for r in RES), len(RES)))
    with open(os.path.join(OUT, 'resultados-e2e.json'), 'w', encoding='utf-8') as f:
        json.dump(RES, f, ensure_ascii=False, indent=1)
