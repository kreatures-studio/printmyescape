#!/usr/bin/env python3
"""Prueba de la copia de «El regalo robado» por piezas (tools/biblioteca/regalo-por-piezas.py).

  - se construye y valida (pme-game/2, sin PDF de fondo: todas las páginas son piezas de la biblioteca);
  - compone los tres ejemplos en los dos idiomas;
  - en las páginas de sospechoso (9-12, 14-16) la polaroid y la nota con clip están en el mismo sitio, y la foto
    y el nombre siguen dentro de la polaroid; las dos listas de «Posibles ubicaciones» coinciden;
  - las páginas que no se alinean (1, 3, 4, 5, 7, 8) se ven como el juego con el PDF (diferencias de borde, < 1 %).
Uso (desde la raíz del repo):  python3 tools/qa/regalo-piezas-test.py
"""
import json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image, ImageChops

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
JUEGO = 'ensayos/f5/el-regalo-robado-piezas'
KIT = 'biblioteca/arte/el-regalo-robado/manifest.json'
RES = []


def rec(nombre, ok, detalle=''):
    RES.append(bool(ok))
    print(('OK    ' if ok else 'FALLO ') + nombre + (f' | {detalle}' if detalle else ''), flush=True)


def run(cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def main():
    r = run([sys.executable, 'tools/biblioteca/regalo-por-piezas.py'])
    rec('se construye', r.returncode == 0, (r.stdout + r.stderr).strip().splitlines()[-1] if (r.stdout + r.stderr).strip() else '')
    r = run(['node', 'tools/game/validate.mjs', JUEGO])
    rec('es válido', r.returncode == 0, r.stdout.strip().splitlines()[-1] if r.stdout.strip() else r.stderr[:200])
    g = json.load(open(os.path.join(ROOT, JUEGO, 'game.json'), encoding='utf-8'))
    rec('ninguna página usa el PDF del artista', all(p['background']['kind'] != 'pdf' for p in g['pages']))

    def arte(pid, ref_pref):
        p = next(p for p in g['pages'] if p['id'] == pid)
        return [e for e in p['elements'] if e['kind'] == 'art' and e['ref'].startswith(ref_pref)]

    sospechosos = ['p9', 'p10', 'p11', 'p12', 'p14', 'p15', 'p16']
    pol = {pid: (arte(pid, 'marco-foto-polaroid-verde-grande@')[0]['x'], arte(pid, 'marco-foto-polaroid-verde-grande@')[0]['y']) for pid in sospechosos}
    def la_nota(pid):
        e = (arte(pid, 'papel-nota-kraft-clip-grande@') + arte(pid, 'papel-nota-kraft-clip-interrogacion@'))[0]
        return (e['x'], e['y'])
    nota = {pid: la_nota(pid) for pid in sospechosos}
    rec('polaroid de los sospechosos en el mismo sitio', len(set(pol.values())) == 1, str(set(pol.values())))
    rec('nota con clip de los sospechosos en el mismo sitio', len(set(nota.values())) == 1, str(set(nota.values())))
    fuera = []
    for pid in sospechosos:
        p = next(p for p in g['pages'] if p['id'] == pid)
        m = arte(pid, 'marco-foto-polaroid-verde-grande@')[0]
        for e in p['elements']:
            if e['kind'] == 'photo':
                if not (m['x'] <= e['x'] and e['x'] + e['w'] <= m['x'] + m['w'] and m['y'] <= e['y'] and e['y'] + e['h'] <= m['y'] + m['h']):
                    fuera.append(pid)
    rec('la foto sigue dentro de la polaroid', not fuera, str(fuera))
    l5, l6 = arte('p5', 'marco-lista-ubicaciones')[0], arte('p6', 'marco-lista-ubicaciones')[0]
    rec('las dos listas de ubicaciones coinciden', (l5['ref'], l5['x'], l5['y']) == (l6['ref'], l6['x'], l6['y']))

    with tempfile.TemporaryDirectory(dir=os.path.join(ROOT, 'salidas')) as tmp:
        fallos = []
        for lang in ('es', 'en'):
            for n in (1, 2, 3):
                out = os.path.join(tmp, f'{lang}{n}.pdf')
                r = run(['node', 'tools/compose.js', '--game', JUEGO, '--kit', KIT, '--example', str(n), '--lang', lang, '--out', os.path.relpath(out, ROOT)])
                if r.returncode or not os.path.exists(out):
                    fallos.append(f'{lang}{n}: {(r.stdout + r.stderr)[-200:]}')
        rec('compone los 3 ejemplos en es y en', not fallos, '; '.join(fallos))
        ref = os.path.join(tmp, 'ref.pdf')
        run(['node', 'tools/compose.js', '--game', 'games/final3', '--example', '1', '--lang', 'es', '--out', os.path.relpath(ref, ROOT)])
        for pre, pdf in (('a', ref), ('b', os.path.join(tmp, 'es1.pdf'))):
            subprocess.run(['pdftoppm', '-r', '50', '-png', pdf, os.path.join(tmp, pre)], check=True)
        malas = []
        for i in (1, 3, 4, 5, 7, 8):
            a = Image.open(os.path.join(tmp, f'a-{i:02d}.png')).convert('RGB')
            b = Image.open(os.path.join(tmp, f'b-{i:02d}.png')).convert('RGB')
            d = np.array(ImageChops.difference(a, b).convert('L')) > 60
            if d.mean() > 0.01:
                malas.append(f'p{i}: {d.mean():.2%}')
        rec('páginas sin alinear iguales al juego con PDF (bordes aparte)', not malas, ', '.join(malas))
    ok = all(RES)
    print(f'\nRESUMEN: {sum(RES)}/{len(RES)} OK' + ('' if ok else ' (fallos)'))
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
