# Revisión de la demo PrintMyEscape: estado para producción

Fecha: 2026-10-09 · Rama: `studio/artista` · Build: `demo/index.html` (plantilla `final3`, fondo `Final3-Clean.pdf`)

## Estado

Los 5 bloqueantes de la primera revisión siguen resueltos y verificados con pruebas. En esta fase se cerraron las decisiones de producto y se limpió el repositorio:

- **Límite de nombres y apodos: 12 caracteres.** La UI (`LIMITS`), `tools/limits.json` y `VARIABLES-Y-FOTOS.md` coinciden. La prueba F1 lo comprueba.
- **Motor único:** `tools/pme-compose-core.js`. Lo inserta el build en la demo y lo usa `tools/compose.js` desde Node. Antes había dos copias (unas 1.100 líneas de diferencia). Comprobado: 32 de 32 páginas (16 × 2 idiomas) idénticas a 40 ppi respecto al motor anterior.
- **PDF retirados:** el original de cliente generado con IA (`Proto PMEs 1.pdf`, 28 MB) y su duplicado (`demo/PrintMyScape_Original.pdf`), y las salidas generadas antiguas (`salidas/*.pdf`, `demo/*.v05.pdf`, `demo/escape-personalizado-es.pdf`, `salidas/tests/`, `noText`/`withText`).
- **Pruebas E2E: 15/15 OK** sobre el build nuevo.

Resultado de la batería: `tools/qa/e2e-demo.py`, 15/15 OK.

## 1. Bloqueantes resueltos

| # | Problema | Solución aplicada | Verificación |
|---|---|---|---|
| 1 | La foto de muestra era una persona real | Muestra sintética en `assets/placeholder-retrato.jpg`; `build-demo.py` la usa | El build ya no contiene la foto real |
| 2 | Las fotos WebP (y cualquier formato no JPEG) rompían la generación | Cada foto se decodifica y se re-codifica a JPEG con canvas (máx. 2000 px) | B1: WebP 800×1000 se guarda como JPEG y genera PDF |
| 3 | Las fotos no eran obligatorias y se usaba la muestra sin avisar | Las 9 fotos son obligatorias; mínimo 600 px en el lado corto; la generación se bloquea si falta alguna | B2, D1, D2 |
| 4 | Se perdían los saltos de línea del chat | `MENSAJE_PERSONALIZADO` conserva los `\n` en el motor único | E1: con salto y con espacio, el PDF cambia |
| 5 | Repositorio: demo2 mezclado con la demo | `demo2/` se movió a la rama `web/demo2-edicion` | `studio/artista` ya no lo incluye |

Cambios adicionales:
- **Orientación EXIF:** las fotos de móvil se enderezan al cargarlas y se guardan sin etiqueta EXIF (B3).
- **Ejemplos:** "Rellenar ejemplo" y "Ejemplo N" piden confirmación antes de sustituir tus datos (I1).
- **Mensajes de error:** el aviso de foto pequeña, de formato o de fotos que faltan está en lenguaje humano.
- **Build:** por defecto usa `templates/final3` y `Final3-Clean.pdf`. El CLI `tools/compose.js` usa los mismos valores por defecto.

## 2. Pendiente antes de publicar

Decisiones que necesitan confirmación:
- **Historial de git:** el PDF de 28 MB sigue en los commits anteriores (y en `origin`). Borrarlo de la rama no lo elimina. Reescribir el historial exige un force-push: no se ha hecho.
- **Fotos de personas reales versionadas:** `foto.JPG` (raíz) y `salidas/foto-FOTO_1.jpg` siguen en el repositorio. El build ya no las usa. Recomendación: retirarlas.
- **PDFs de fondo antiguos:** `Final2-Clean.pdf`, `FinalLayout-Clean.pdf`, `PrintMyScape_FinalLayout.pdf` y `TestEdit*.pdf` no se usan en `final3`. Se han dejado para decidir. No tocar: `Final3-Clean.pdf` (fondo del build), `juego-con-textos.pdf`, `juego-fondo.pdf` y `1-4.pdf` (entradas de `tools/extract.py`).
- **Peso del repo:** `demo/index.html` y `docs/index.html` son idénticos (7 MB cada uno) y cada build los reescribe. Propuesta: publicar solo `docs/` con GitHub Pages y dejar de versionar `demo/index.html`.

Calidad y código:
- **Mensajes técnicos residuales:** los fallos de generación inesperados aún muestran el texto técnico ("Fallo al generar: …").
- **Avisos de maquetación:** cada PDF trae 14–15 avisos "encogido fuerte" en cajas fijas del artista (`concepto`, `eres-fuerte`, `hoy-tu-libro`, `pictures`…). Revisar con el artista.
- **Ejemplo inconsistente:** `S2_SECRET_LOVE` pide el nombre de una persona, pero el ejemplo de la demo es una frase.
- **Código muerto:** `B_ALIAS` y `S*_ALIAS` se leen al componer, pero ningún campo los define. `idb.loadAll` hace dos lecturas.
- **Calidad de foto:** no se exige proporción 4:5. El recorte la ajusta, pero puede cortar la cara.

Producción:
- **Todo va en el navegador:** plantilla, fuentes, fondo y motor. Quien tenga la demo puede copiar el arte y generar PDFs sin pagar. Para vender, la generación final debe hacerse en servidor, con la descarga condicionada al pago.
- **Fotos de personas reales** en IndexedDB del navegador. En producción: bucket privado, consentimiento y borrado programado.
- **Git LFS:** quedan PDFs de 2–3 MB versionados (`Final3-Clean.pdf`, `Final2-Clean.pdf`, `FinalLayout-Clean.pdf`, `PrintMyScape_FinalLayout.pdf`). Valorar LFS.

## 3. Cómo repetir las pruebas

```
# 1. Build de la demo (y copia para GitHub Pages)
python3 tools/build-demo.py --tpl templates/final3 --bg Final3-Clean.pdf
cp demo/index.html docs/index.html

# 2. Pruebas E2E en Chromium (requiere pip install playwright y playwright install chromium)
PME_DEMO=demo/index.html PME_OUT=salida python3 tools/qa/e2e-demo.py

# 3. Paridad CLI / demo: generar con la CLI y rasterizar
node tools/compose.js --tpl templates/final3 --bg Final3-Clean.pdf --lang es \
  --values-file valores.json --photos-file fotos.json --out salidas/prueba-ES.pdf
pdftoppm -r 40 -png salidas/prueba-ES.pdf salidas/prueba-ES
```

Las fotos de `tools/qa/fixtures/` son sintéticas: ninguna es una persona real.

## 4. Entregables

- Código: `demo/src.html`, `tools/pme-compose-core.js` (motor único), `tools/compose.js` (CLI), `tools/build-demo.py`, `tools/apply-limits.py`, `tools/limits.json`, `tools/README.md`, `VARIABLES-Y-FOTOS.md`, `templates/final3/template.json`, `assets/placeholder-retrato.jpg`, `demo/index.html` y `docs/index.html` (build).
- Pruebas: `tools/qa/e2e-demo.py` y `tools/qa/fixtures/` (todo sintético).
- Ejemplos nuevos: `demo/ejemplos/ejemplo-4-lucia-ES.pdf` y `ejemplo-5-lucia-EN.pdf` (retratos sintéticos).
- Ramas: `studio/artista` (la demo) y `web/demo2-edicion` (pruebas de edición web, separadas).
