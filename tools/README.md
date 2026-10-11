# Pipeline artista → PDF personalizable (sin IA)

Procedimiento completo para convertir los PDF de Illustrator en juego
personalizable en varios idiomas. No hace falta programar: solo ejecutar
comandos y revisar resultados.

## Requisitos (una vez)

- Python 3.10+ con `pymupdf` y `fonttools`: `pip install pymupdf fonttools`
- Node 18+ y una vez: `npm install --prefix tools`
- Las fuentes del proyecto en `assets/fonts/` (ya están: Anton Regular,
  Open Sans, Caveat Regular y Bold; si el artista estrena familia, ver punto 5).
  OJO: titulares en Anton **Regular** (no SC: las minúsculas cambian) y
  manuscritas en Segoe Script (regular→Caveat Regular, bold→Caveat Bold).

## Paso 1 — Recibir los PDF del artista

Pedir **2 archivos** (ver `GUIA-ARTISTA.md`):
`<texto>.pdf` (todo visible) y `<fondo>.pdf` (solo fondo).
Dejarlos en la raíz del repo (o indicar su ruta con `--src-text/--src-bg`).

## Paso 2 — Extraer el mapa de cajas

```bash
python3 tools/extract.py --doc <nueva-plantilla> --name "Nombre del juego" \
  --src-text <texto>.pdf --src-bg <fondo>.pdf \
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
node tools/compose.js --game games/final3 \
  --lang es --out salidas/final3-ES.pdf \
  --values-file valores.json --photos-file fotos.json
```

- `valores.json`: `{"NOMBRE_CUMPLE": "Mariana", ...}` (datos del cliente;
  los códigos están en `VARIABLES-Y-FOTOS.md`).
- `fotos.json`: `{"FOTO_1": "ruta/a/foto.jpg"}` (rutas desde la raíz del
  repo, JPG o PNG; el recorte al marco lo hace el motor).
- Repetir con `--lang en` (y cada idioma) cambiando `--out`.

**Avisos**: si sale `"X: encogido fuerte"`, esa caja va justa en ese
idioma: revisar el PDF y, si se ve mal, agrandar la caja en Illustrator.
El tamaño se bloquea por caja entre idiomas (la misma línea mide igual
en todos), así que un idioma largo puede encoger un poco a los demás:
es intencionado.

## Paso 5 — QA

Abrir los PDF de `salidas/`: comparar con el PDF de referencia del
artista (posición, tamaños, tildes). Dar el visto bueno por idioma.

## Validar y medir un juego (M3)

Un juego es una carpeta con `game.json` (formato `pme-game/1`, ver `schema/`).

- Validar: `node tools/game/validate.mjs games/final3 [--submit] [--pdf-texto <pdf>]`.
  Imprime `ERROR` (bloquea) y `AVISO` (informativo). `--pdf-texto` compara los códigos
  `[CODIGO]` del PDF del artista con los `fields`. `--submit` exige los requisitos de envío.
- Límites: `node tools/game/limites.mjs games/final3 [--json]`. Mide la capacidad de cada campo
  con el motor (fuentes embebidas) y aplica la regla de 3.1 (`min(cap, floor(capacidad × 0.75))`;
  en los nombres, `min(cap, capacidad)`). Informa de los `cap` que no caben.
  `tools/limits.cjs` y `tools/apply-limits.py` están obsoletos.
- Casos del validador: `node tools/qa/validador-casos.mjs` (15 casos sobre copias de `final3`).
- Prueba de humo: `python3 tools/qa/game-smoke.py --game games/final3` compone los ejemplos y
  valores generados («una letra» y «límite W»). Las salidas van a `salidas/smoke/` (no se versionan).
- Kit de arte: `assets/kit/manifest.json` (contrato 3.4), `assets/kit/LICENCIAS.md` y
  `assets/kit/GUIA-KIT.md` para los artistas. El validador comprueba el manifiesto con
  `--kit <manifest.json>`.
- Fondo por capas (T4.2): un juego con `"background": { "kind": "layers" }` pone sus piezas en
  `template.pages[].layers`. Se compone con `node tools/compose.js --game <juego> [--kit <manifest.json>]`.
  Prueba: `python3 tools/qa/capas-test.py` (compara con su PNG de referencia).

## Punto 5 — Si el artista estrena tipografía

1. Conseguir el `.ttf` (licencia con incrustación) en `assets/fonts/`.
2. Si es variable, instanciar el peso: `python3 -m fontTools.varLib.instancer
   X-VF.ttf wght=700 wdth=100 -o assets/fonts/X-Bold.ttf` (fijar TODOS los ejes).
3. `python3 tools/cleanfonts.py` (añadirla antes a la lista `FONTS` del script).
4. Mapear la familia en `pickFont()` de `tools/pme-compose-core.js`.

## Paso 6 — Demo en navegador (opcional)

`demo/index.html` es la demo operativa: formulario generado desde la
plantilla + composición con pdf-lib en el propio navegador + descarga.
Se construye (autocontenida, doble clic) con:

```bash
python3 tools/build-demo.py --game games/final3          # demo para el cliente
python3 tools/build-demo.py --game games/final3 --final  # versión final
```

- Sin `--final`, la demo empieza con una **pantalla de demostración** (`DEMO_CONTROL = true`): elegir ES o EN, y "Empezar en blanco" o "Rellenar ejemplo 1/2/3". Esa pantalla no estará en la versión final. Con `--final` (`DEMO_CONTROL = false`) el primer paso es la bienvenida con las tarjetas de idioma.

- El motor es **único**: `tools/pme-compose-core.js`. Lo inserta el build en
  la demo y lo usa `tools/compose.js` desde Node. No hay dos copias que mantener.
  Antes de cada demo: `python3 tools/qa/e2e-demo.py` (flujo completo, 30 pruebas) y `python3 tools/qa/parity.py` (navegador ↔ CLI, 96 páginas).
- Soporta textos rotados (tilts e verticales) y fotos rotadas según el
  marco (ángulo medido del trazo). Fotos de marcos muy inclinados: ver QA.
- Fotos del usuario: se decodifican, se corrige la orientación EXIF y se re-codifican a JPEG con canvas (máx. 2000 px, mín. 600 px en el lado corto). El recorte al marco se hace al componer.
- Fotos de muestra de la demo: nueve retratos sintéticos distintos en `assets/retratos/` (uno por campo de foto: `retrato-CUMPLE.jpg` y `retrato-1.jpg` … `retrato-8.jpg`). El build los incrusta; nunca usar fotos de personas reales.

Advertencia conocida: el subsetter de pdf-lib rompe glifos de Caveat
(ver `FONTS` en `tools/compose.js`); Caveat se incrusta completa. Si otra
fuente sale con huecos en blanco, probar `subset: false` para ella.

## Editor (M5, en curso)

- Servidor local: `node creator/serve.mjs --port 8080` → `http://localhost:8080/creator/index.html`.
- Pruebas: `python3 tools/qa/creator-esqueleto.py` (Playwright; levanta el servidor solo).
