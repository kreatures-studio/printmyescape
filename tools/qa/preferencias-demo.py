#!/usr/bin/env python3
"""Pruebas de la barra de preferencias del formulario (idioma, país y formato de papel), de las pantallas que junta
el juego (screenBreaks) y del PDF en US Letter. Monta la demo del juego por piezas (con y sin pantalla de control).
Uso (desde la raíz del repo):  python3 tools/qa/preferencias-demo.py
"""
import os, sys, json, subprocess, tempfile
from playwright.sync_api import sync_playwright
ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
S=tempfile.mkdtemp()
for args in (['--out', os.path.join(S, 'index.html')], ['--out', os.path.join(S, 'final.html'), '--final']):
    subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'build-demo.py'), '--game', 'demo/el-regalo-robado-piezas',
                    *[os.path.relpath(a, ROOT) if a.startswith(S) else a for a in args]], cwd=ROOT, check=True, capture_output=True)
URL='file://'+S+'/index.html'; FIN='file://'+S+'/final.html'
R=[]
def rec(n,ok,d=''): R.append(ok); print(('OK    ' if ok else 'FALLO ')+n+(' | '+str(d) if d else ''),flush=True)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--no-sandbox'])
    # 1) versión final, navegador de EE. UU.
    ctx=b.new_context(viewport={'width':1366,'height':900}, locale='en-US', timezone_id='America/New_York', accept_downloads=True)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto(FIN); pg.wait_for_timeout(800)
    rec('final: idioma detectado (en) y barra visible', pg.locator('.prefs-bar').count()==1 and pg.input_value('#pref-lang')=='en')
    rec('final: país detectado (US) y US Letter sugerido', pg.input_value('#pref-country')=='US' and pg.input_value('#pref-paper')=='letter', pg.inner_text('.prefs-bar .pref-note'))
    pg.screenshot(path=S+'/i01-en.png')
    pg.select_option('#pref-country','ES'); pg.wait_for_timeout(200)
    rec('cambiar el país a España cambia el formato sugerido a A4', pg.input_value('#pref-paper')=='a4')
    pg.select_option('#pref-paper','letter'); pg.wait_for_timeout(200)
    pg.select_option('#pref-country','FR'); pg.wait_for_timeout(200)
    rec('tras elegir el formato a mano, cambiar el país lo respeta', pg.input_value('#pref-paper')=='letter' and 'you' in pg.inner_text('.prefs-bar .pref-note').lower())
    pg.reload(); pg.wait_for_timeout(600)
    rec('las preferencias se guardan en el borrador', pg.input_value('#pref-country')=='FR' and pg.input_value('#pref-paper')=='letter')
    pg.select_option('#pref-lang','es'); pg.wait_for_timeout(300)
    rec('cambiar el idioma en la barra traduce el formulario', 'Antes de empezar' in pg.inner_text('body') and pg.input_value('#pref-country')=='FR')
    ctx.close()
    # 2) España: A4; ejemplo 1 + PDF en carta tras elegirlo
    ctx=b.new_context(viewport={'width':1366,'height':900}, locale='es-ES', timezone_id='Europe/Madrid', accept_downloads=True)
    pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('dialog', lambda d: d.accept())
    pg.goto(URL); pg.wait_for_timeout(800)
    pg.click('.lang-card >> nth=0'); pg.wait_for_timeout(200)
    pg.click('.ex-card:has-text("Rellenar ejemplo 1") button'); pg.wait_for_timeout(500)
    rec('España: A4 sugerido', pg.input_value('#pref-paper')=='a4' and pg.input_value('#pref-country')=='ES')
    pg.screenshot(path=S+'/i01-es.png')
    # pantallas del sospechoso 1
    scr=pg.evaluate("() => SCREENS.filter(s => s.sec === 's1').map(s => s.fields.map(f => f.id))")
    rec('S1A: escondites juntos y lugar + resultado en la misma pantalla', ['S1_HIDEA','S1_HIDEB'] in scr and ['TEST_LUGAR','TEST_RESULTADO'] in scr, scr)
    i=pg.evaluate("() => screenOfField('TEST_LUGAR')"); pg.evaluate(f"() => {{ idx = {i}; render(); }}"); pg.wait_for_timeout(300)
    pg.screenshot(path=S+'/s1a.png')
    for f in ['FAMA','S2_SECRET_LOVE','Nombre_Empresa','BUSQUEDA_1','NOMBRE_DEST','PERSONALIZADO_1','APP_1','B_INFO']:
        i=pg.evaluate(f"() => screenOfField('{f}')"); pg.evaluate(f"() => {{ idx = {i}; render(); }}"); pg.wait_for_timeout(150)
        pg.screenshot(path=f'{S}/campo-{f}.png')
    pg.evaluate("() => { PREFS.paper = 'letter'; PREFS.paperManual = true; renderReview($('answer')); }"); pg.wait_for_timeout(300)
    rec('la revisión dice el formato y el país', 'US Letter' in pg.inner_text('.review-prefs') and 'España' in pg.inner_text('.review-prefs'), pg.inner_text('.review-prefs'))
    pg.evaluate("() => finish()"); pg.wait_for_timeout(500)
    pg.click('#bGen'); pg.wait_for_selector('#dl', state='visible', timeout=240000)
    with pg.expect_download() as d: pg.click('#pdflink')
    out=S+'/carta.pdf'; d.value.save_as(out)
    info=subprocess.run(['pdfinfo',out],capture_output=True,text=True).stdout
    rec('el PDF sale en US Letter (612 × 792)', '612 x 792' in info and d.value.suggested_filename.endswith('-letter.pdf'), [l for l in info.splitlines() if 'size' in l.lower()]+[d.value.suggested_filename])
    ctx.close(); b.close()
rec('sin errores de JavaScript', not errs, errs[:3])
print('\nRESUMEN: %d/%d OK' % (sum(R), len(R)) + ('' if all(R) else ' (fallos)'))
sys.exit(0 if all(R) else 1)
