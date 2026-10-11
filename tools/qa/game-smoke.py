#!/usr/bin/env python3
"""Prueba de humo de un juego (T3.3 de PLAN-CREADOR.md).

Uso (desde la raíz del repo):
  python3 tools/qa/game-smoke.py --game games/final3

Compone con la CLI (tools/compose.js, el mismo motor que la demo):
  1. cada ejemplo, en cada idioma: falla si la composición lanza una excepción;
  2. valores generados, en cada idioma:
       - «una letra»: cada campo de texto con una sola letra;
       - «límite W»: cada campo de texto con la letra W hasta su límite (tools/game/limites.mjs).
     Aquí falla también un campo que se encoge («valor encogido», el aviso del motor para un
     hueco de campo): con el límite bien calculado, ningún campo debe encogerse fuerte.
Los avisos de los ejemplos son informativos: el artista puede haber dejado huecos justos.
Código 0 si todo pasa; 1 si algo falla.
"""
import argparse, json, os, subprocess, sys, tempfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SALIDA = os.path.join(ROOT, 'salidas', 'smoke')


def run(cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def compose(game_dir, ejemplo, lang, out_name, values_file=None):
    out = os.path.relpath(os.path.join(SALIDA, out_name), ROOT)
    cmd = ['node', 'tools/compose.js', '--game', game_dir, '--example', ejemplo, '--lang', lang, '--out', out]
    if values_file:
        cmd += ['--values-file', values_file]
    r = run(cmd)
    lineas = (r.stdout + r.stderr).strip().splitlines()
    ultima = lineas[-1] if lineas else ''
    avisos = []
    if 'avisos:' in ultima:
        avisos = [a.strip() for a in ultima.split('avisos:', 1)[1].split(';') if a.strip()]
    return r.returncode == 0, ultima, avisos


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--game', default='games/final3')
    args = ap.parse_args()
    game_dir = os.path.abspath(os.path.join(ROOT, args.game))
    with open(os.path.join(game_dir, 'game.json'), encoding='utf-8') as f:
        game = json.load(f)
    r = run(['node', 'tools/game/limites.mjs', game_dir, '--json'])
    if r.returncode != 0:
        print('FALLO no se pudieron medir los límites:', r.stderr.strip())
        return 1
    limites = json.loads(r.stdout)
    campos_texto = {k: v for k, v in game['fields'].items() if v['type'] in ('name', 'text', 'long')}
    fallos = 0
    os.makedirs(SALIDA, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='smoke-', dir=SALIDA)

    # 1. ejemplos: solo cuenta la excepción
    for ex in game.get('examples', []):
        for lang in game['languages']:
            ok, ult, avisos = compose(args.game, ex['id'], lang, f"ej{ex['id']}-{lang}.pdf")
            info = f"{len(avisos)} aviso(s)" if ok else ult
            print(('OK    ' if ok else 'FALLO ') + f"ejemplo {ex['id']} ({lang}): {info}")
            fallos += 0 if ok else 1

    # 2. valores generados
    base_ex = game['examples'][0]['id'] if game.get('examples') else None
    if base_ex is None:
        print('FALLO el juego no tiene ejemplos (la prueba usa sus fotos)')
        return 1
    variantes = {
        'una-letra': lambda cid, lang: 'A',
        'limite-W': lambda cid, lang: 'W' * max(1, int(limites.get(cid, {}).get('limite') or 1)),
    }
    for nombre, valor in variantes.items():
        for lang in game['languages']:
            vals = {}
            for cid, c in campos_texto.items():
                if c.get('options'):
                    vals[cid] = '||'.join(o[lang] for o in c['options'][:1])
                else:
                    vals[cid] = valor(cid, lang)
            vf = os.path.join(tmp, f'{nombre}-{lang}.json')
            with open(vf, 'w', encoding='utf-8') as f:
                json.dump(vals, f, ensure_ascii=False)
            ok, ult, avisos = compose(args.game, base_ex, lang, f'{nombre}-{lang}.pdf', vf)
            encogidos = [a for a in avisos if a.endswith(': valor encogido')]
            ok = ok and not encogidos
            detalle = ult if not ok and not encogidos else (', '.join(encogidos) if encogidos else f'{len(avisos)} aviso(s)')
            print(('OK    ' if ok else 'FALLO ') + f'{nombre} ({lang}): {detalle}')
            fallos += 0 if ok else 1

    print(f"\nRESUMEN: {'OK' if not fallos else str(fallos) + ' fallo(s)'}")
    return 1 if fallos else 0


if __name__ == '__main__':
    sys.exit(main())
