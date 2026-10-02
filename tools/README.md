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

## Overrides de texto (`texts-override.json`)

Si alguna caja sale ilegible (fuente con mapa roto, como le pasó a la
nota de la factura), se crea `templates/<doc>/texts-override.json`:

```json
{ "clave-de-la-caja": { "es": "Texto verdadero" } }
```

Se aplica al extraer (queda registrado en consola) y a partir de ahí
manda sobre el PDF. Traducir después en `i18n-en.json`.

## Cómo dibuja cada línea (fidelidad)

Cada caja guarda sus `lines` originales: si la traducción cabe en ellas,
cada línea va a su sitio exacto (sin reflujo). Si no cabe, se usa el
apilado clásico. Las cajas de una línea altas (títulos) se anclan arriba.

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

## Paso 6 — Demo en navegador (opcional)

`demo/index.html` es la demo operativa: formulario generado desde la
plantilla + composición con pdf-lib en el propio navegador + descarga.
Se construye (autocontenida, doble clic) con:

```bash
python3 tools/build-demo.py --tpl templates/final2 --bg Final2-Clean.pdf
```

- El núcleo (`demo/compose-browser.js`, sin `require`/`fs`) es el mismo
  motor probado en Node: se valida con el test E2E antes de cada demo.
- Soporta textos rotados (tilts e verticales) y fotos rotadas según el
  marco (ángulo medido del trazo). Fotos de marcos muy inclinados: ver QA.
- Fotos del usuario se recortan con canvas al aspecto del marco.

Advertencia conocida: el subsetter de pdf-lib rompe glifos de Caveat
(ver `tools/compose.js`, `FONTS`); Caveat se incrusta completa. Si otra
fuente sale con huecos en blanco, probar `subset: false` para ella.
