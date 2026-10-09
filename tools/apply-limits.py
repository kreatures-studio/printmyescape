"""Aplica los límites de tools/limits.json al formulario (demo/src.html).

Política:
  - nombres de personas (NOMBRE_*, APODO_*): 12 caracteres (la capacidad medida es ~19;
    el margen cubre letras anchas y los nombres en mayúsculas de las tarjetas).
  - notas y observaciones (B_NOTES, B_INFO): como mucho 200.
  - nota cifrada (S2_SECRET_LOVE): como mucho 70.
  - resto: el límite medido (75 % de la capacidad).
Escribe LIMITS en demo/src.html (sustituye 'var LIMITS = {...};').
"""
import io, json, os, re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
data = json.loads(io.open(os.path.join(ROOT, 'tools', 'limits.json'), encoding='utf-8').read())
limits = dict(data['limits'])

NAMES = re.compile(r'^(NOMBRE_[1-8]|NOMBRE_[1-8]\.2|NOMBRE_CUMPLE|APODO_[1-8])$')
for k in list(limits):
    if NAMES.match(k):
        limits[k] = 12
if 'B_NOTES' in limits:
    limits['B_NOTES'] = min(limits['B_NOTES'], 200)
if 'B_INFO' in limits:
    limits['B_INFO'] = min(limits['B_INFO'], 200)
if 'S2_SECRET_LOVE' in limits:
    limits['S2_SECRET_LOVE'] = min(limits['S2_SECRET_LOVE'], 70)
# DEBILIDAD se elige con casillas (no se escribe): sin límite de texto
limits.pop('DEBILIDAD', None)
# campos que no se escriben en el formulario (solo iconos derivados)
for k in list(limits):
    if k.startswith('S8_ICON_'):
        del limits[k]

# tools/limits.json pasa a ser la fuente única: guarda los límites ya aplicados
data['limits'] = limits
io.open(os.path.join(ROOT, 'tools', 'limits.json'), 'w', encoding='utf-8').write(json.dumps(data, ensure_ascii=False, indent=1))

body = json.dumps(dict(sorted(limits.items())), ensure_ascii=False, indent=1)
# claves con punto (NOMBRE_4.2) entre comillas: JSON ya las trae; el objeto es JS válido
path = os.path.join(ROOT, 'demo', 'src.html')
src = io.open(path, encoding='utf-8').read()
new_src, n = re.subn(r'var LIMITS = \{[^;]*\};', 'var LIMITS = ' + body.replace('\n', '\n') + ';', src, count=1)
if n != 1:
    new_src, n = re.subn(r'var LIMITS = \{\};', 'var LIMITS = ' + body + ';', src, count=1)
assert n == 1, 'no encuentro var LIMITS en src.html'
io.open(path, 'w', encoding='utf-8').write(new_src)
for k, v in sorted(limits.items()):
    print(k.ljust(24), v)
print('campos con límite:', len(limits))
