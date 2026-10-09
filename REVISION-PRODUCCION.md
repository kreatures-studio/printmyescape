# Revisión de la demo PrintMyEscape: estado para producción

Fecha: 2026-10-09 · Rama: `studio/artista` · Build: `demo/index.html` (plantilla `final3`, fondo `Final3-Clean.pdf`)

## Estado

- **Idioma único por juego.** La portada elige ES o EN con dos tarjetas, o con el selector ES · EN de la barra superior. El formulario, las preguntas, los ejemplos y el PDF salen en ese idioma. Cambiar de idioma conserva los datos y traduce las debilidades. Desaparece el selector "Idioma del PDF" de la pantalla final.
- **Pantalla de demostración (solo para el cliente).** La primera pantalla de la demo elige idioma (ES o EN) y ofrece "Empezar en blanco" o "Rellenar ejemplo 1 / 2 / 3". Lleva la etiqueta "no estará en la versión final". Después, el usuario ve el recorrido real: aviso ("Comprendo cómo funciona", con casilla obligatoria) → formulario → revisión → PDF. Rellenar un ejemplo pasa por el aviso, no salta a la revisión.
- **Versión final: `--final`.** El build con `--final` quita la pantalla de demostración: el primer paso es el aviso con las tarjetas de idioma.
- **Notas y observaciones:** el texto se apila desde arriba con el interlineado del diseño (antes se repartía por toda la caja).
- **Ejemplos en inglés con textos en inglés.** El amor prohibido en inglés sale como "I LOVE …" (antes salía "TE QUIERO" en el PDF inglés).
- **Nueve fotos de muestra distintas**, sintéticas, una por campo de foto (`assets/retratos/`).
- **Retirado:** el PDF original de cliente (28 MB), las fotos de personas, los fondos antiguos y las plantillas anteriores (`final`, `final2`, `recurso-1`, `testedit`, `regalo-robado`) con sus páginas de verificación.

## Verificación

- **Pruebas E2E: 30/30 OK** (`tools/qa/e2e-demo.py`). Cubren la pantalla de demostración, el aviso con casilla (bloquea hasta marcarla), "Empezar en blanco", ejemplos ES y EN (sin textos en español en el PDF inglés), nueve fotos distintas, formatos y EXIF de foto, límite de 12 caracteres en nombres, móvil sin scroll horizontal y con recorrido completo hasta la revisión, borrador, confirmación al rellenar ejemplo y "Empezar de nuevo".
- **Paridad navegador ↔ CLI: 96/96 páginas idénticas** (`tools/qa/parity.py`). Son 6 PDF (ejemplos 1–3 en ES y EN) de 16 páginas cada uno, generados por el recorrido real de la demo y comparados a 60 ppp: diferencia de píxel 0 y texto idéntico en los seis.
- **Errores corregidos durante la revisión:** (1) el aviso no dejaba avanzar aunque se marcara la casilla, porque la comprobación se hacía antes de leerla; (2) en móvil, al cambiar de sección se borraban las debilidades elegidas en otra sección. Las dos quedan cubiertas por las pruebas.
- **Avisos de maquetación:** 14 por PDF, informativos (cajas fijas de la plantilla). Revisar con el artista.

## Pendiente de decisión

- **Historial de git.** El PDF original (`Proto PMEs 1.pdf`) y las fotos de personas (`foto.JPG`, `salidas/foto-FOTO_1.jpg`) se eliminan del historial de las ramas locales. Como `studio/artista` ya estaba publicada, subir la reescritura exige `git push --force-with-lease origin studio/artista`, y quien tenga clones debe rehacerlos.
- **Herramientas del prototipo anterior.** `player/`, `studio/` y `wizard/` leen las plantillas retiradas y ya no funcionan. ¿Se eliminan también?
- **Peso del repositorio.** Los seis ejemplos suman unos 31 MB. Valorar Git LFS o publicarlos aparte.
- **Demo en el navegador.** Plantilla, fuentes, fondo y motor van dentro del HTML: quien tenga la demo puede copiar el arte y generar PDF sin pagar. Para vender, la generación final debe hacerse en servidor, con la descarga condicionada al pago.
- **Fotos reales en producción:** bucket privado, consentimiento y borrado programado.
- **Duplicados de build.** `demo/index.html` y `docs/index.html` son idénticos (7,7 MB). Propuesta: publicar solo `docs/` con GitHub Pages.

## Cómo repetir las pruebas

```
# 1. Build de la demo para el cliente (con pantalla de demostración) y copia para GitHub Pages
python3 tools/build-demo.py --tpl templates/final3 --bg Final3-Clean.pdf
cp demo/index.html docs/index.html
# Versión final (sin pantalla de demostración): --final --out <ruta>

# 2. E2E en Chromium (pip install playwright; pdftotext de poppler)
PME_DEMO=demo/index.html PME_OUT=salida python3 tools/qa/e2e-demo.py

# 3. Paridad navegador ↔ CLI (96 páginas)
PME_DEMO=demo/index.html PME_OUT=salida-paridad python3 tools/qa/parity.py
```

Las fotos de `tools/qa/fixtures/` y `assets/retratos/` son sintéticas: ninguna es una persona real.

## Entregables

- Código: `demo/src.html` (UI bilingüe), `tools/pme-compose-core.js` (motor único), `tools/compose.js` (CLI), `tools/build-demo.py`, `tools/apply-limits.py`, `tools/limits.json`, `tools/README.md`, `VARIABLES-Y-FOTOS.md`, `templates/final3/`, `demo/index.html` y `docs/index.html` (build).
- Recursos: `assets/retratos/` (nueve retratos sintéticos distintos).
- Pruebas: `tools/qa/e2e-demo.py`, `tools/qa/parity.py` y `tools/qa/fixtures/` (sintéticos).
- Ejemplos: `demo/ejemplos/ejemplo-{1,2,3}-{es,en}.pdf`.
- Ramas: `studio/artista` (la demo) y `web/demo2-edicion` (pruebas de edición web, separadas).
