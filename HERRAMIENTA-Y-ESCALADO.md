# PrintMyEscape: documentación de la herramienta y valoración de escalado

Estado a 2026-10-10 · Rama `studio/artista` · Último commit de este documento: el que lo añade.

Este documento describe cómo funciona el sistema de punta a punta, qué se edita a mano,
cómo se prueba y si sirve para producir más escape rooms imprimibles. Para los pasos
del artista ver `GUIA-ARTISTA.md`; para los campos y ejemplos del juego actual ver
`VARIABLES-Y-FOTOS.md`; para el procedimiento de extracción ver `tools/README.md`.

---

## 1. Qué hace

A partir de dos PDF que entrega el artista (Illustrator), genera un juego imprimible
personalizable: el comprador rellena un formulario (nombres, fotos, pistas, textos) y el
sistema devuelve un PDF listo para imprimir, en el idioma elegido.

La personalización se hace colocando texto y fotos en **huecos** (cajas definidas en %
de la página) sobre el fondo del artista. El fondo nunca se toca.

## 2. Mapa del sistema

```
Illustrator (artista)
   ├─ <texto>.pdf   (todo visible, con [CÓDIGOS] de variables y marcos rosa de foto)
   └─ <fondo>.pdf   (solo fondo limpio)
        │
        ▼  tools/extract.py  (automático)
templates/<juego>/
   ├─ template.json   huecos por página (x, y, w, h en %), campos, orden de la hoja de recortes
   ├─ texts.json      textos fijos extraídos del PDF (con sus líneas originales)
   └─ texts-override.json  (opcional) correcciones de textos ilegibles
        │
        ▼  traducción (manual): i18n-es.json / i18n-en.json
        │
        ▼  motor único: tools/pme-compose-core.js  (ajuste de texto, fotos, reflujo, hoja de recortes)
        │
        ├─► tools/compose.js          CLI en Node: valores JSON → PDF  (uso interno, pruebas)
        └─► tools/build-demo.py       empaqueta todo en UN HTML autocontenido
                 │  incluye: motor, pdf-lib, fontkit, fuentes, fondo, plantilla, textos, i18n
                 │  y el formulario demo/src.html (a mano, específico del juego)
                 ▼
            demo/index.html  →  copia a docs/index.html (GitHub Pages)
                 │
                 ▼  el comprador rellena el formulario en el navegador → PDF en el navegador
```

### Componentes

| Archivo | Qué es | Quién lo toca | Frecuencia |
|---|---|---|---|
| `tools/extract.py` | Saca de los PDF del artista las cajas, textos, fuentes y fondos | Desarrollo | Una vez por juego |
| `templates/final3/template.json` | Huecos por página, campos, hoja de recortes (`shuffle`) | Generado; ajustes a mano raros | Por juego |
| `templates/final3/texts.json` | Textos fijos con posición | Generado (y `texts-override.json`) | Por juego |
| `templates/final3/i18n-es.json`, `i18n-en.json` | Traducción de cada texto fijo, por clave | Traductor | Por juego e idioma |
| `tools/pme-compose-core.js` | **Motor único** de composición (navegador y Node) | Desarrollo | Raro; es el núcleo |
| `tools/compose.js` | CLI: valores JSON + fotos → PDF | Desarrollo / QA | Pruebas |
| `demo/src.html` | **Formulario**: preguntas, secciones, ejemplos, límites, textos de la interfaz | Desarrollo y revisión de textos | Cada cambio de contenido |
| `tools/limits.cjs` + `tools/limits.json` + `tools/apply-limits.py` | Mide cuántos caracteres caben en cada hueco y los escribe en `src.html` | Desarrollo | Cada cambio de huecos |
| `tools/build-demo.py` | Construye `demo/index.html` (`--tpl`, `--bg`, `--out`, `--final`) | Desarrollo | Cada versión |
| `tools/qa/*.py` | Pruebas (ver sección 4) | Desarrollo | Antes de cada entrega |
| `demo/ejemplos/*.pdf` | Seis PDF de ejemplo (3 juegos de muestra × ES/EN) | Generados por la paridad | Cada cambio visible |

## 3. Cómo se produce un juego nuevo (procedimiento actual)

1. **Artista**: entrega `<texto>.pdf` y `<fondo>.pdf` siguiendo `GUIA-ARTISTA.md` (capas,
   marcos rosa, `[CÓDIGOS]`, tres tipografías).
2. **Extracción**: `python3 tools/extract.py --doc <juego> --name "..." --src-text ... --src-bg ... --fonts assets/fonts`.
   Revisar `tools/verify-<juego>.html`: cada texto con caja azul, cada código verde, cada foto magenta.
   Los errores se corrigen en Illustrator y se reexporta; no se editan los JSON a mano.
3. **Traducción**: copiar `i18n-es.json` a `i18n-en.json` y traducir solo los valores.
4. **Formulario**: escribir en `demo/src.html` las preguntas, las secciones (`SECDEF`), las
   preguntas extra por personaje (`SUS_EXTRA`), los ejemplos (`EJEMPLO*`) y los textos de
   la interfaz. Hoy esto es **código escrito a mano**, no se genera desde la plantilla.
5. **Límites**: medir con `tools/limits.cjs` y aplicar con `tools/apply-limits.py`.
   **Ver la advertencia de la sección 6: hoy esto no es fiable.**
6. **Build**: `python3 tools/build-demo.py --tpl templates/<juego> --bg <fondo>.pdf` (demo) o con `--final` (sin pantalla de demostración). Copiar a `docs/index.html` si toca publicar.
7. **Pruebas**: sección 4. Regenerar `demo/ejemplos/` a partir de la salida de paridad.

## 4. Pruebas

Requisitos: Python con `playwright` y `pillow`; `pdftoppm` y `pdftotext` (poppler); Node con
las dependencias de `tools/` (`npm install --prefix tools`).

| Prueba | Qué comprueba | Resultado a 2026-10-10 |
|---|---|---|
| `python3 tools/qa/e2e-demo.py` | Recorrido completo del formulario, ejemplos ES/EN, PDF generado | 30/30 |
| `python3 tools/qa/limites-demo.py` | Límites de caracteres, edad, borradores, campos nuevos | 26/26 |
| `PME_OUT=salida-paridad python3 tools/qa/parity.py` | Navegador y CLI producen el mismo PDF (16 páginas × 6 ejemplos) | 96/96 páginas |

Notas operativas:

- `tools/node_modules` debe existir para que el build y la CLI funcionen. Si falta, el build
  falla sin avisar si se redirige la salida: comprobar siempre la fecha de `demo/index.html`.
  Es un enlace temporal en esta máquina y **no debe entrar en git**.
- Las pruebas largas se lanzan en segundo plano con un nombre de log nuevo. Un log antiguo
  con la marca `FIN` puede dar un falso positivo.

## 5. Reglas que el sistema da por supuestas

- Fuentes: tres familias (Anton, Open Sans, Caveat) y Segoe Script mapeada a Caveat. Otra
  familia exige cambios en `pickFont()` y en `tools/cleanfonts.py`.
- Los huecos de foto son rectángulos rosa; los de texto, cajas que el ajuste de texto
  respeta. Los fondos y textos fijos no se modifican desde el código.
- Las claves de `i18n-*.json` son el slug del texto original: cambiar un texto en el PDF
  cambia su clave y hay que retraducirlo.
- La hoja de recortes (`shuffle` en la plantilla) se aplica a la página indicada.

## 6. Estado actual y riesgos (revisar antes de entregar)

**Bloqueante para la revisión.**

- **`tools/limits.json` regenerado (2026-10-10).** Ya contiene todos los campos de texto
  de la plantilla. Son capacidades medidas al 75 %, no los límites de la demo: la demo usa
  además **topes de producto** (postal 50, notas 200, nota cifrada 70, personalizados 50, etc.)
  que hoy no están en ninguna tabla de `tools/`. **No ejecutar `apply-limits.py` hasta
  añadir esos topes a su política**: si se ejecuta tal cual, la postal pasa a 100 y las
  notas a 300. Hasta entonces, `demo/src.html` es la fuente de los límites.
- `tools/limits.cjs` usa por defecto una ruta de Chrome de Windows. En otros sistemas hay
  que pasar `CHROME=` y `PUPPETEER_CORE=` (ejemplo: `CHROME=/ruta/chrome PUPPETEER_CORE=/ruta/puppeteer-core node tools/limits.cjs`).
- La política de `apply-limits.py` (75 % de la capacidad medida, nombres fijos a 12) no
  coincide con los límites que se han fijado a mano (capacidad exacta en algunos campos).

**Otros puntos conocidos (ya en `REVISION-PRODUCCION.md`):**

- El PDF se genera en el navegador: quien tenga la demo puede copiar el arte y generar PDF.
  Para vender hace falta generación en servidor (la CLI ya es la base).
- Fotos reales: bucket privado, consentimiento y borrado programado.
- `demo/index.html` y `docs/index.html` son copias idénticas (7,7 MB); se puede publicar solo `docs/`.
- Ejemplos y repositorio: unos 31 MB de PDF en git.
- No se ha verificado sangrado ni marcas de corte para imprenta profesional. Confirmar con la imprenta antes de vender.

## 7. ¿Es escalable para más escape rooms?

**Respuesta corta: la parte de maquetación sí; la parte de formulario, lógica y pruebas no
todavía.** Una segunda sala es viable, pero copiar y pegar esta demo para cada sala no
escalaría.

### Lo que escala bien

- La cadena artista → extracción → plantilla → PDF es genérica. `extract.py`, `build-demo.py`
  y `compose.js` ya reciben la plantilla y el fondo como parámetros.
- La colocación de datos sobre el arte (huecos en %, líneas originales, ajuste de texto) no
  depende del juego.
- El motor es único: navegador y CLI usan el mismo código, y la paridad lo comprueba.
- El trabajo del artista está normalizado con una guía y una lista de comprobación.

### Lo que no escala todavía

1. **El formulario está escrito a mano para este juego.** `demo/src.html` tiene 2.280 líneas;
   las preguntas, secciones, ejemplos, límites y textos de la interfaz son constantes del juego.
   La plantilla solo dice `id`, `tipo`, `etiqueta` y `maxLength`; no sabe qué se pregunta.
2. **El motor contiene lógica de este juego.** `pme-compose-core.js` tiene reglas por página
   (`p4` para la marca de casillas, `p10` para el fondo de las runas) y por campo
   (`S2_SECRET_LOVE` en runas, `NOMBRE_CUMPLE_FICHA` con alias, `S8_ICON_N` derivado de las
   apps, `DEBILIDAD` como casillas). Cada sala nueva con mecánicas distintas (códigos,
   candados, mapas) obligaría a tocar el motor. Eso multiplica el riesgo de regresión.
3. **Los límites no son reproducibles.** Ver sección 6. Con cada sala se repetiría el
   problema.
4. **Las pruebas son de este juego.** `e2e-demo.py` (349 líneas) y `limites-demo.py` (158)
   citan campos y pantallas concretas; `parity.py` espera 6 PDF de 16 páginas.
5. **Traducción manual y por clave.** Cada texto fijo se traduce a mano; con varias salas
   el coste de traducción crece linealmente.
6. **Generación en el navegador.** No sirve para vender varias salas (ver sección 6).

### Qué haría, en orden

1. **Piloto de una sala pequeña** (3–4 páginas, pocas preguntas) antes de decidir la
   arquitectura. Sirve para comprobar qué parte es genérica de verdad y cuál no. Es la
   prueba de escalado más barata que existe.
2. **Generar el formulario desde datos**: un fichero por sala (`juego.json`) con preguntas,
   secciones, ejemplos y límites; `src.html` pasa a ser un renderizador genérico. Los
   límites se miden en el build, no a mano.
3. **Mecánicas declarativas**: en lugar de `if (pagina === 'p4')`, la plantilla declara
   `transform: "runes" | "casillas" | "alias" | "icono-app"`, `ticks: [...]`, `shuffle: {...}`.
   El motor interpreta esas declaraciones.
4. **Pruebas guiadas por la configuración**: las mismas pruebas leen la sala y recorren sus
   secciones; solo se escriben pruebas nuevas para mecánicas nuevas.
5. **Para vender**: generación en servidor con `compose.js`, cola de trabajos, almacenamiento
   de fotos privado, pedidos y verificación de impresión (sangrado, marcas de corte).
6. **Traducción**: plantilla de traducción por sala y revisión nativa.

### Lo que no haría

- Copiar `demo/src.html` y `pme-compose-core.js` para cada sala: dos copias divergen en semanas.
- Generalizar todo antes del piloto: se diseñaría para salas que no existen.

## 8. Preguntas abiertas para decidir

- ¿Las salas comparten mecánicas (formulario de nombres, fotos, cifrados) o cada una trae
  las suyas? Esto decide cuánto del motor puede ser declarativo.
- ¿Quién mantiene el formulario y los textos: desarrollo o el equipo de contenido?
- ¿Se venden como PDF descargable, impreso por la tienda o ambas cosas? Cambia el coste de
  servidor y de verificación de impresión.
- ¿Cuántas salas al año? Con 1–2, el piloto y la reorganización pueden ser manuales; con
  más, conviene la generación desde datos desde el principio.
