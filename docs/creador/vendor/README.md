# Bibliotecas del editor (copias fijas)

- `pdf-lib-1.17.1.min.js`: pdf-lib 1.17.1 (MIT). Copia de `tools/node_modules/pdf-lib/dist/pdf-lib.min.js`.
- `fontkit-1.1.1.umd.min.js`: @pdf-lib/fontkit 1.1.1 (MIT). Copia de `@pdf-lib/fontkit/dist/fontkit.umd.min.js`.

Las licencias están junto a los ficheros. No se cargan de una CDN: el editor debe funcionar sin
red externa y el repositorio fija las versiones.
- `pdfjs/`: pdf.js 4.10.38 (Apache-2.0), compilación «legacy» de `pdfjs-dist` (`pdf.min.mjs` y `pdf.worker.min.mjs`).
  El lienzo del creador pinta con ella la página que compone el motor.
- `fuentes-ui/`: letras de la interfaz (no del juego), SIL OFL 1.1: Bricolage Grotesque (variable de peso,
  @fontsource-variable 5.3.0) e Instrument Sans 400–700 (@fontsource 5.3.0), solo el juego latino.
