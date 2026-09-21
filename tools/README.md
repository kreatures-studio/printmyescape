# Pipeline artista → PDF personalizable (sin IA)

Procedimiento completo para convertir los PDF de Illustrator en juego
personalizable en varios idiomas. No hace falta programar: solo ejecutar
comandos y revisar resultados.

## Requisitos (una vez)

- Python 3.10+ con `pymupdf` y `fonttools`: `pip install pymupdf fonttools`
- Node 18+ y una vez: `npm install --prefix tools`
- Las fuentes del proyecto en `assets/fonts/` (ya están: Anton SC,
  Open Sans, Caveat; si el artista estrena familia, ver punto 5).

## Paso 1 — Recibir los PDF del artista

Pedir **2 archivos** (ver `GUIA-ARTISTA.md`):
`juego-con-textos.pdf` (todo visible) y `juego-fondo.pdf` (solo fondo).
Dejarlos en la raíz del repo (o indicar su ruta con `--src-text/--src-bg`).

## Paso 2 — Extraer el mapa de cajas

```bash
python3 tools/extract.py --doc recurso-1 --name "Nombre del juego" \
  --src-text juego-con-textos.pdf --src-bg juego-fondo.pdf \
  --fonts assets/fonts
```

Genera: `templates/<doc>/{texts.json,template.json}`,
fondos en `assets/pages/` y `tools/verify-<doc>.html`.

**Revisar**: abrir `tools/verify-<doc>.html` con doble clic. Cada texto
debe tener su caja azul, cada `[CODIGO]` su caja verde y cada foto su
marco magenta. Si algo falla, se corrige en Illustrator y se reexporta
(nunca a mano en los JSON, que se regeneran).

`--fonts` calcula la condensación horizontal que aplicó el artista
(imprescindible para que la composición la replique).

## Paso 3 — Traducir

Copiar `templates/<doc>/i18n-es.json` a `i18n-<idioma>.json`
(el ES se genera a mano la primera vez desde `texts.json`) y traducir
**solo los valores** (las claves no se tocan). Guardar en UTF-8.
Las erratas del original se corrigen aquí... mejor: pedir al artista
que las corrija y reexporte.

## Paso 4 — Componer los PDF por idioma

```bash
node tools/compose.js --tpl templates/recurso-1 --bg juego-fondo.pdf \
  --lang es --out salidas/recurso-1-ES.pdf \
  --values-file valores.json --photos-file fotos.json
```

- `valores.json`: `{"NOMBRE": "Mariana", ...}` (datos del cliente).
- `fotos.json`: `{"FOTO_1": "salidas/foto-FOTO_1.jpg"}` (fotos ya
  recortadas al aspecto del marco; en producción lo hace el wizard).
- Repetir con `--lang en` (y cada idioma) cambiando `--out`.

**Avisos**: si sale `"X: encogido fuerte"`, esa caja va justa en ese
idioma: revisar el PDF y, si se ve mal, agrandar la caja en Illustrator.
El tamaño se bloquea por caja entre idiomas (la misma línea mide igual
en todos), así que un idioma largo puede encoger un poco a los demás:
es intencionado.

## Paso 5 — QA

Abrir los PDF de `salidas/`: comparar con el PDF de referencia del
artista (posición, tamaños, tildes). Dar el visto bueno por idioma.

## Punto 5 — Si el artista estrena tipografía

1. Conseguir el `.ttf` (licencia con incrustación) en `assets/fonts/`.
2. Si es variable, instanciar el peso: `python3 -m fontTools.varLib.instancer
   X-VF.ttf wght=700 wdth=100 -o assets/fonts/X-Bold.ttf` (fijar TODOS los ejes).
3. `python3 tools/cleanfonts.py` (añadirla antes a la lista `FONTS` del script).
4. Mapear la familia en `pickFont()` de `tools/compose.js`.

Advertencia conocida: el subsetter de pdf-lib rompe glifos de Caveat
(ver `tools/compose.js`, `FONTS`); Caveat se incrusta completa. Si otra
fuente sale con huecos en blanco, probar `subset: false` para ella.
