# Revisión de la demo PrintMyEscape: estado para producción

Fecha: 2026-10-09 · Rama: `studio/artista` · Build: `demo/index.html` (plantilla `final3`, fondo `Final3-Clean.pdf`)

## Estado

Los 5 bloqueantes de la primera revisión siguen resueltos. En esta ronda se corrigió lo que revisó el equipo sobre el PDF y el formulario:

- **Notas y observaciones:** el texto se apila desde arriba con el interlineado de las líneas del diseño. Antes se repartía por toda la caja y dejaba saltos enormes. El mismo criterio se aplica a "Información importante".
- **Ejemplos en inglés:** los PDF en inglés llevan contenido en inglés. Antes el botón "Ejemplo N" cargaba textos en español aunque el PDF fuera en inglés. Ahora hay tres juegos en inglés, y el botón elige el juego según el idioma del PDF.
- **Nueve fotos de muestra distintas:** una por campo de foto, sintéticas, en `assets/retratos/`. Antes la demo usaba la misma imagen en todas.
- **Retirados del repositorio:** fotos de personas (`foto.JPG`, `salidas/foto-FOTO_1.jpg`) y fondos antiguos (`Final2-Clean.pdf`, `FinalLayout-Clean.pdf`, `PrintMyScape_FinalLayout.pdf`, `TestEdit*.pdf`, `juego-fondo.pdf`, `juego-con-textos.pdf`, `1.pdf` … `4.pdf`). Siguen en el historial de git.
- **Ejemplos:** seis PDF nuevos en `demo/ejemplos/` (`ejemplo-1..3-es.pdf` y `ejemplo-1..3-en.pdf`). Se retiran los dos de Lucía, que tenían textos en español en el PDF inglés.
- **Formulario:** tipografía unificada en botones, cabecera corregida, casilla de aceptación alineada, botones de ejemplo con estilo propio y foco visible para teclado. El formulario sigue en español.
- **Ejemplos y campo S2:** el campo "persona de su amor prohibido" pide un nombre; los ejemplos ahora usan nombres.

Pruebas: `tools/qa/e2e-demo.py`, **17/17 OK** (incluye ejemplo en inglés con textos en inglés y nueve fotos distintas). La paridad de 32/32 páginas entre CLI y motor se comprobó antes del cambio de notas. Navegador y CLI usan ahora el mismo código, pero no se ha vuelto a medir la paridad después de ese cambio.

## 1. Bloqueantes resueltos

| # | Problema | Solución aplicada | Verificación |
|---|---|---|---|
| 1 | La foto de muestra era una persona real | Fotos de muestra sintéticas en `assets/retratos/`; el build las incrusta | La foto real ya no está en el repo |
| 2 | Las fotos WebP (y cualquier formato no JPEG) rompían la generación | Cada foto se decodifica y se re-codifica a JPEG con canvas (máx. 2000 px) | B1: WebP 800×1000 se guarda como JPEG y genera PDF |
| 3 | Las fotos no eran obligatorias y se usaba la muestra sin avisar | Las 9 fotos son obligatorias; mínimo 600 px en el lado corto; la generación se bloquea si falta alguna | B2, D1, D2 |
| 4 | Se perdían los saltos de línea del chat | `MENSAJE_PERSONALIZADO` conserva los `\n` en el motor único | E1: con salto y con espacio, el PDF cambia |
| 5 | Repositorio: demo2 mezclado con la demo | `demo2/` se movió a la rama `web/demo2-edicion` | `studio/artista` ya no lo incluye |

Cambios adicionales: orientación EXIF corregida al cargar (B3); "Rellenar ejemplo" y "Ejemplo N" piden confirmación antes de sustituir datos (I1); mensajes de error en lenguaje humano; el build y la CLI usan `templates/final3` y `Final3-Clean.pdf` por defecto.

## 2. Pendiente antes de publicar

Decisiones que necesitan confirmación:
- **Historial de git:** las fotos de personas y el PDF original de 28 MB siguen en commits anteriores (y en `origin`). Borrarlos de la rama no los elimina. Reescribir el historial exige force-push: no se ha hecho.
- **Plantillas antiguas:** `templates/final`, `final2`, `recurso-1`, `testedit` y `regalo-robado` siguen en el repo, pero sus fondos ya no están. No las usa la demo. ¿Se borran?
- **Peso del repo:** los seis ejemplos suman unos 31 MB (cada PDF pesa unos 5 MB por las fuentes, el fondo y las fotos). Valorar Git LFS o publicarlos aparte.
- **`demo/index.html` y `docs/index.html`** son idénticos (7,4 MB cada uno) y cada build los reescribe. Propuesta: publicar solo `docs/` con GitHub Pages.

Interfaz:
- **Idioma del formulario:** las preguntas siguen en español. Si el cliente quiere la interfaz en inglés cuando el PDF sea inglés, hay que traducir las preguntas y las opciones. No se ha hecho.

Calidad y código:
- **Mensajes técnicos residuales:** los fallos de generación inesperados aún muestran el texto técnico ("Fallo al generar: …").
- **Avisos de maquetación:** cada PDF trae 14–15 avisos "encogido fuerte" en cajas fijas del artista (`concepto`, `eres-fuerte`, `hoy-tu-libro`, `pictures`…). Revisar con el artista.
- **Código muerto:** `B_ALIAS` y `S*_ALIAS` se leen al componer, pero ningún campo los define. `idb.loadAll` hace dos lecturas.
- **Calidad de foto:** no se exige proporción 4:5. El recorte la ajusta, pero puede cortar la cara.

Producción:
- **Todo va en el navegador:** plantilla, fuentes, fondo y motor. Quien tenga la demo puede copiar el arte y generar PDFs sin pagar. Para vender, la generación final debe hacerse en servidor, con la descarga condicionada al pago.
- **Fotos de personas reales** en IndexedDB del navegador. En producción: bucket privado, consentimiento y borrado programado.

## 3. Cómo repetir las pruebas

```
# 1. Build de la demo (y copia para GitHub Pages)
python3 tools/build-demo.py --tpl templates/final3 --bg Final3-Clean.pdf
cp demo/index.html docs/index.html

# 2. Pruebas E2E en Chromium (requiere pip install playwright y playwright install chromium)
PME_DEMO=demo/index.html PME_OUT=salida python3 tools/qa/e2e-demo.py

# 3. CLI: generar con el motor y rasterizar a 40 ppi
node tools/compose.js --tpl templates/final3 --bg Final3-Clean.pdf --lang es \
  --values-file valores.json --photos-file fotos.json --out salidas/prueba-ES.pdf
pdftoppm -r 40 -png salidas/prueba-ES.pdf salidas/prueba-ES
```

Las fotos de `tools/qa/fixtures/` y `assets/retratos/` son sintéticas: ninguna es una persona real.

## 4. Entregables

- Código: `demo/src.html`, `tools/pme-compose-core.js` (motor único), `tools/compose.js` (CLI), `tools/build-demo.py`, `tools/apply-limits.py`, `tools/limits.json`, `tools/README.md`, `VARIABLES-Y-FOTOS.md`, `templates/final3/template.json`, `demo/index.html` y `docs/index.html` (build).
- Recursos: `assets/retratos/` (nueve retratos sintéticos distintos).
- Pruebas: `tools/qa/e2e-demo.py` y `tools/qa/fixtures/` (todo sintético).
- Ejemplos: `demo/ejemplos/ejemplo-1..3-es.pdf` y `ejemplo-1..3-en.pdf`.
- Ramas: `studio/artista` (la demo) y `web/demo2-edicion` (pruebas de edición web, separadas).
