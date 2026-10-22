# Plan del creador de escape rooms (v2)

Sustituye a las partes de `PLAN-CREADOR.md` que hablan del editor (M5) y amplía las de MCP y skill (M6–M7).
Lo que ya está hecho se aprovecha: motor único, validador, medición de topes, almacén de GitHub, servidor
MCP, vista previa con marca de agua y prueba dorada.

Documento de decisiones (para todo el equipo): «Creador de escape rooms: plan y opinión del equipo técnico»
(Claude Docs). Maqueta de pantallas: lienzo «Creador de juegos PrintMyEscape».

## 0. Decisiones cerradas (12 de octubre de 2026)

| Tema | Decisión |
| --- | --- |
| Volumen | 12 juegos al año, uno al mes |
| Quién usa el creador | El estudio y, posiblemente, el cliente (no técnico) |
| Arte | Lo hacen artistas; se exporta en piezas sueltas con nombre y etiquetas. Sin arte generado con IA |
| Fuentes | Solo Google Fonts (licencias OFL, Apache 2.0, UFL) |
| Editor | Se sustituye el editor actual (`creator/`) por el creador de la maqueta |
| GitHub | Queda a la vista; entrada con token y guía paso a paso |
| Orden | Claude compone (F3) antes que el creador web (F4) |

## 1. Reglas para quien implementa

Las mismas que en `PLAN-CREADOR.md` §1, más estas:

1. **La prueba dorada manda:** El regalo robado da 96 de 96 páginas idénticas en cada fase.
2. **El arte del artista no se publica.** `biblioteca/` nunca se copia a `docs/`. En Pages solo va el kit CC0.
3. **Reutilizar copiando.** Páginas, secciones y puzzles se copian al insertarlos, con `from` (origen y versión).
   El arte y las fuentes se citan por id y versión fija; una pieza no se edita, se publica la versión siguiente.
4. **Nada de IA en el arte.** Toda pieza de la biblioteca tiene `author` humano.
5. **Rama por fase:** `creador2-f1`, `creador2-f2`… Un commit por tarea, con su id delante (`F1.2: …`).

## 2. Contratos nuevos

### 2.1 Juego `pme-game/2`

Cambia `template` por `pages`; el resto (campos, formulario, idiomas, ejemplos, soluciones, estado) sigue.

```jsonc
{
  "schema": "pme-game/2",
  "pageSize": "A4",
  "pages": [
    {
      "id": "p1", "title": "Ficha de la víctima",
      "background": { "kind": "pdf", "file": "../../Final3-Clean.pdf", "page": 3 }   // o { "kind": "art", "ref": "fondo-esquina-salvia@1" } o { "kind": "color", "value": "#FFFFFF" }
      "elements": [
        { "id": "e1", "kind": "art",   "ref": "marco-foto-polaroid-verde@1", "x": 5, "y": 10, "w": 30, "h": 30, "angle": 0 },
        { "id": "e2", "kind": "photo", "field": "FOTO_CUMPLE", "x": 9, "y": 13, "w": 22, "h": 19, "angle": -2 },
        { "id": "e3", "kind": "field", "field": "NOMBRE_CUMPLE", "x": 41, "y": 12, "w": 22, "h": 3, "fontFamily": "Open Sans", "size": 2, "color": "#1B2420" },
        { "id": "e4", "kind": "text",  "key": "p3.titulo", "x": 3, "y": 2, "w": 58, "h": 5, "fontFamily": "Anton", "size": 5 },
        { "id": "e5", "kind": "puzzle", "puzzle": "cifrado-1", "x": 10, "y": 50, "w": 80, "h": 30 }
      ]
    }
  ],
  "puzzles": [ { "id": "cifrado-1", "from": "puzzle-cifrado-runas@1", "mechanic": "runes", "params": {}, "solution": { "es": "…" }, "hints": [] } ],
  "notes": []   // notas del cliente para Claude (pantalla de revisión)
}
```

- Coordenadas en % de la página; `elements` en orden de dibujo (el primero, debajo).
- Los textos fijos (`kind: text`) apuntan a una clave de `i18n`; nunca llevan el texto dentro.
- `field` y `photo` sustituyen a los `slots` de v1; conservan sus opciones (`transform`, `upper`, `wrap`, `xscale`…).
- El estilo va en propiedades planas, las mismas de v1 (`fontFamily`, `size`, `color`, `align`, `xscale`, `angle`…).
- `compat` (solo en juegos migrados) guarda lo que el motor actual necesita para dar el mismo PDF: la plantilla
  heredada, el tipo de fondo y el orden original de los textos fijos.
- La migración v1 → v2 es automática y sin pérdida (F1.2).

### 2.2 Biblioteca (`biblioteca/manifest.json` por tipo)

| Tipo | Campos obligatorios |
| --- | --- |
| Arte | `id`, `version`, `file`, `thumb`, `name`, `category`, `tags` (3–6), `widthMm`, `heightMm`, `zones`, `license`, `author`, `origin` |
| Fuente | `family`, `files` (peso → fichero), `license` (OFL, Apache-2.0, UFL), `subset` (sí/no), `source` |
| Página | `id`, `version`, `name`, `tags`, la página v2 sin datos del comprador, `fields` que necesita |
| Sección | `id`, `version`, `name`, la sección con sus campos completos (tipo, tope, preguntas, tres ejemplos por idioma) |
| Puzzle | ver 2.3 |

Categorías de arte: `fondo`, `marco`, `papel`, `dispositivo`, `objeto`, `icono`, `decoracion`, `ilustracion`, `puzzle`.
Zonas: `zona-foto` y `zona-texto`, en % de la pieza (capa del artista con ese nombre, o guía magenta en piezas recuperadas).

### 2.3 Puzzle

```jsonc
{ "id": "puzzle-cifrado-runas", "version": 1, "name": "Mensaje cifrado en runas", "kind": "datos",   // «contenido» o «datos»
  "difficulty": 2, "minAge": 10, "minutes": 10,
  "needs": [ { "field": "NOMBRE", "type": "name", "min": 3, "max": 10 } ],
  "mechanic": "runes",                       // solo en «datos»: una mecánica del catálogo
  "page": { /* elementos del puzzle, como en una página v2 */ },
  "solution": { "es": "…", "en": "…" },     // con {{CAMPO}} cuando depende del comprador
  "hints": [ { "es": "…", "en": "…" } ],
  "examples": "se comprueba con los ejemplos corto, normal y largo del juego" }
```

Un puzzle de `contenido` no lleva `mechanic`. Un puzzle de `datos` sin mecánica en el catálogo no se puede crear:
se anota como «mecánica nueva a presupuestar».

### 2.4 Herramientas MCP nuevas (sobre las 21 de `PLAN-CREADOR.md` §3.3)

`list_library`, `duplicate_game`, `insert_page`, `add_element`, `update_element`, `remove_element`,
`add_puzzle`, `import_art`, `create_vector_art`, `save_to_library`, `read_notes`, `write_change_summary`.
Mismas reglas: validan antes de guardar y se niegan fuera de `borrador`.

## 3. Fases y tareas

### F1 · Formato v2 y motor

- **F1.1 Esquema** `schema/pme-game-2.schema.json` (2.1). *Aceptación:* casos del validador para cada tipo de elemento y fondo.
- **F1.2 Migración** `tools/game/migrar-v2.mjs`: v1 → v2 (slots → field/photo, texts → text, fondo PDF por página,
  layers → art). *Aceptación:* final3 y el juego de capas migran sin errores; la migración es idempotente.
- **F1.3a Motor con juegos v2 (hecho).** `loadGame` entrega la forma v1 equivalente (`aV1`) al motor, la CLI y los
  límites. *Aceptación:* final3 migrado a v2: golden 96/96.
- **F1.3b Elementos nuevos en el motor (hecho).** Fondos `color` y `art`, varios PDF de fondo (`bgFile`/`bgPage`
  por página), piezas de arte bajo y sobre los textos (`layers`/`topLayers`) y bloques de `puzzle` aplanados en su caja
  (`tools/game/v2.mjs`, `aV1`). *Aceptación:* golden 96/96 y `tools/qa/capas-v2-test.py` (píxeles conocidos y
  referencias en PNG). *Límites:* el orden entre arte y texto solo se conserva en dos bandas (baja y alta); un
  puzzle de `datos` sin elementos propios no se dibuja todavía y falla con un mensaje claro (queda para el catálogo de puzzles, F2.6).
- **F1.4 Registro de fuentes (hecho).** `assets/fonts/registro.json`: los 8 ficheros (Google Fonts con licencia libre)
  y la traducción de cada nombre que aparece en un juego (`fontFamily`, p. ej. SegoeScript → Caveat). El motor resuelve
  el nombre en el registro cuando se le pasa `fuentes` (CLI y servidor MCP); la demo del navegador conserva las reglas
  antiguas hasta F4. *Aceptación:* golden 96/96; el validador rechaza un nombre que no está en el registro (2 casos
  nuevos). La licencia de Pigpen (runas) está confirmada: es diseño propio del estudio (`propia-estudio`), así que
  no hay avisos de fuentes para El regalo robado.
- **F1.5 Validador y límites v2 (hecho).** Reglas nuevas: cajas dentro de la página (texto, campo y foto: error;
  pieza de arte que sobresale: aviso), puzzles de contenido sin mecánica, puzzles inexistentes o sin elementos,
  y que cada PDF de página exista. El esquema del puzzle admite ahora `name`, `page` y los metadatos del §2.3.
  *Aceptación:* 20 casos anteriores (v1) y 7 nuevos de v2 en `tools/qa/validador-casos.mjs` (27/27); final3 migrado
  pasa sin errores; límites 26/26.
- **F1.6 Formulario del comprador y CLI leen v2 (hecho).** La demo se monta desde un juego v2 (`build-demo.py`
  convierte con `tools/game/a-v1.mjs`), la CLI y la composición del MCP leen la forma v1 equivalente, y las herramientas
  de edición del MCP rechazan v2 con un mensaje claro (`v2-no-editable`) hasta F3. *Aceptación:* e2e de la demo 30/30
  con final3 en v2 (`PME_DEMO=salidas/demo-v2/index.html`); golden 96/96 también desde v2.
  *Pendiente:* `tools/qa/game-smoke.py` lee el JSON crudo. (Las pruebas del MCP cubren v2 desde F3.1.)

### F2 · Bibliotecas

- **F2.1 Manifiesto de la biblioteca y su validación (hecho).** Formato `pme-biblioteca/1` (tipo `arte`) en
  `schema/biblioteca-1.schema.json`; reglas en `tools/biblioteca/reglas.mjs` (licencias admitidas: `propia-estudio`
  y `CC0-1.0`; autor real; origen; zonas dentro de la pieza; ficheros y miniaturas que existen; versiones únicas;
  las piezas por reexportar avisan). CLI: `node tools/biblioteca/validar.mjs <colección>`. *Aceptación:* el validador
  rechaza piezas sin licencia o sin autor: `tools/qa/biblioteca-casos.mjs` 11/11. La colección de El regalo robado
  (40 piezas: 28 ok y 12 por reexportar; la descartada no entra) pasa.
- **F2.2 Importar arte (hecho).** `tools/biblioteca/importar-arte.py <fichero> <colección> --id … --categoria …`:
  PDF o SVG vectorial (las capas `zona-foto`/`zona-texto` pasan a zonas y no se dibujan; texto o imágenes dentro:
  se rechaza), PNG (zonas de un fichero JSON). Crea PDF, miniatura y entrada del manifiesto, y valida la colección;
  si no valida, deshace todo. *Aceptación:* `tools/qa/biblioteca-importar-test.py` 18/18 (tres formatos entran;
  rechazos sin dejar nada).
- **F2.3 Piezas de El regalo robado (hecho).** 43 piezas en `biblioteca/arte/el-regalo-robado/` (autor Kreatures),
  ninguna por reexportar. Las 12 que salieron pegadas se separaron del PDF vectorial del artista con
  `tools/biblioteca/separar-piezas.py` (rectángulos por pieza en `separar/spec.json`; también copia las imágenes y
  degradados de las pantallas) en 15 piezas: hoja con anillas, notas de casillas, de líneas, rasgadas y ancha con clip,
  tira kraft, sello, postal kraft con iconos, sobre amarillo con sello y por detrás, móvil, monitor, tableta y bombilla.
  Se importan con `importar-arte.py --tal-cual`; las pegadas se retiran (nunca se pudieron usar) y `nombres.csv` dice
  por cuáles se sustituyen. Los PNG sueltos que llegaron después (72 ppp) son el mismo arte en baja resolución: no se
  importan. *Aceptación:* `tools/qa/biblioteca-separar-test.py` (rehacer desde el spec da las mismas piezas).
- **F2.4 Fuentes (hecho).** Cuatro familias de Google Fonts, siete ficheros, con licencia libre (Caveat, Anton, Open Sans, Courier Prime; OFL o
  Apache-2.0) más Pigpen, fuente propia del estudio (`propia-estudio`). No se añaden más salvo que el estudio lo pida.
- **F2.5 Páginas y secciones guardadas desde un juego, con origen (hecho).** `tools/biblioteca/desde-juego.mjs
  <juego> <spec.json>` guarda páginas (`biblioteca/paginas/<colección>/`, con el fondo PDF de la página en
  `fondos/`) y secciones (`biblioteca/secciones/<colección>/`, con sus campos, definiciones y ejemplos). Cada entrada
  lleva su origen (juego, versión, página o sección). El esquema admite los tipos `pagina` y `seccion`. *Aceptación:*
  páginas y secciones de final3 exportadas y válidas; `tools/qa/biblioteca-paginas-test.mjs` (los errores se detectan
  y una exportación fallida no deja nada escrito).
- **F2.6 Catálogo de puzzles (hecho).** Las 6 mecánicas de El regalo robado (`ticks`, `join`, `prefix`, `strips`,
  `runes-panel`, `initial`) como puzzles de `datos` en `biblioteca/puzzles/el-regalo-robado/` (`tools/biblioteca/desde-juego.mjs`
  con `spec.puzzles`), en el formato del §2.3: parámetros, campos que leen (`needs`: campo, tipo y máximo), campos que
  calculan (`derives`) y la solución por idioma si el juego la tiene (la de las tiras de la página 9). No se inventan
  puzzles de contenido: quedan para F3. *Aceptación:* `tools/qa/biblioteca-puzzles-test.mjs` (colección real válida,
  11 casos negativos y 3 exportaciones rechazadas sin dejar nada escrito).
- **Colocar puzzles de datos y arte de la biblioteca en un juego (hecho, cierra F2).** Un bloque `puzzle` que apunta a
  un puzzle de datos se convierte en una mecánica v1 de esa página (y su solución) en `aV1`. Como sus coordenadas son las
  de la página de origen, el bloque ocupa la página entera, va directamente en una página y una sola vez (lo comprueba
  el validador). El esquema del juego admite `derives` y `needs` (§2.3) en los puzzles, la solución es obligatoria solo
  en los de contenido, y páginas y secciones guardan `from`. El arte de la biblioteca se usa como kit
  (`--kit biblioteca/arte/<colección>/manifest.json` o `PME_KIT`), con `ref` «id@versión» o «id»; una pieza «por
  reexportar» se rechaza. Arreglos encontrados por el camino: el validador rechazaba arte sobre una página con PDF o con
  color en un juego v2 (el motor sí lo dibujaba), y el motor no dibujaba los campos calculados por una mecánica si el
  juego no traía la plantilla antigua (`compat`). *Aceptación:* `tools/qa/biblioteca-juego-test.mjs`: final3 con sus 6
  mecánicas sacadas de la biblioteca da el mismo PDF píxel a píxel (16 páginas), y un juego nuevo con arte, fuente,
  página, sección y puzzle de la biblioteca valida y se compone (apodos con su prefijo, marco dibujado);
  `tools/qa/validador-casos.mjs` 36/36.
- *Aceptación de la fase (cumplida):* el validador rechaza piezas sin licencia o sin autor; un juego v2 de prueba usa
  arte, fuente, página, sección y puzzle de la biblioteca.

### F3 · Claude compone desde cero

- **F3.1 Herramientas MCP de 2.4 (hecho).** 13 herramientas nuevas en `mcp/herramientas-v2.mjs` (las 12 de 2.4 e
  `insert_section`, que hacía falta para reutilizar secciones), 34 en total. Componen juegos `pme-game/2` con la
  biblioteca: `list_library`, `insert_page` (copia fondo, elementos y textos con `from`; admite los puzzles del catálogo
  que calculan sus campos), `insert_section` (campos, el «Otro» de las opciones, ejemplos y sus fotos), `add_element`
  (texto con `texts` por idioma; arte con versión fija y la proporción de la pieza), `update_element`, `remove_element`,
  `add_puzzle` (del catálogo o de contenido en su caja), `duplicate_game` (siempre a v2), `import_art`,
  `create_vector_art` (solo formas geométricas para rejillas y casillas, a la colección «formas», con autor humano;
  no es para ilustraciones), `save_to_library`, `read_notes`, `write_change_summary`. Cuando faltan campos, el error
  dice qué sección o puzzle de la biblioteca los trae. `create_game` crea v2 por defecto; las herramientas de huecos y
  capas (`set_page`, `upsert_slot`, `remove_slot`) son solo v1 y las nuevas solo v2. El arte se valida y se compone
  con toda la biblioteca (`PME_KIT` sigue valiendo para un kit concreto). La biblioteca del servidor: `PME_BIBLIOTECA`,
  o `biblioteca/` del repositorio de juegos (el paquete la siembra la primera vez y no la pisa), o la del repositorio
  de código. El esquema v2 suma `changes` y notas con `id`. Arreglos encontrados: las secciones exportadas no traían el
  campo «Otro» de una opción múltiple ni sus fotos de ejemplo (se reexporta El cumpleañero), y un juego v2 sin ningún
  PDF no validaba (faltaba `layers: []`). *Aceptación:* `mcp/test-v2.mjs` 36/36 (un juego de 3 páginas desde cero, con
  página, sección y puzzle de la biblioteca, puzzle de contenido, notas, copia, guardado e importación; la biblioteca
  real no cambia), `mcp/test-client.mjs` 31/31 (v1), golden 96/96 desde v1 y desde v2; el paquete (.pme/) compone un
  juego v2 con la biblioteca del repositorio de juegos.
- **F3.2 Skill reescrito (hecho).** `.claude/skills/crear-escape-room/` sigue los 8 pasos del documento de decisiones
  («Cómo trabaja Claude Code»): traer y leer notas, encargo, estructura aprobada por el cliente antes de maquetar,
  puzzles (catálogo o contenido; mecánica nueva a presupuestar), páginas con la biblioteca (`[FALTA ARTE: …]` y encargo
  si no hay pieza), formulario con topes y tres ejemplos, validar y mirar cada PNG, resumen para «Revisar» y subida.
  Referencias nuevas: `biblioteca.md` y `puzzles.md`; `formato.md` pasa a v2 con la lista exacta de fuentes. El
  registro admite ahora los nombres limpios `Caveat Bold`, `Open Sans Bold`, `Courier Prime` y `Courier Prime Bold`
  (antes no había forma de pedir la máquina de escribir). *Aceptación:* `mcp/test-v2.mjs` 37/37 (las fuentes del skill
  validan); golden 96/96.
- **F3.3 Ensayo (hecho; falta la partida de una persona).** Un agente sin contexto, con el skill y las herramientas del
  paquete `.pme/` (por `mcp/cli.mjs`, cliente de línea de órdenes nuevo), compuso en un repositorio de juegos limpio
  «Misión Secreta: Operación Cumpleaños»: 6 páginas, sin sospechosos, 2 puzzles de contenido (runas y frutas) y
  `puzzle-strips@1`, en español e inglés. El estudio hizo de cliente: encargo y aprobación de la estructura antes de
  maquetar. Valida sin errores ni avisos (borrador y envío); vista previa revisada por el agente y por el estudio.
  Lo que encontró y se arregló: `update_puzzle` y `remove_puzzle` (2 herramientas más, 36 en total), validador de línea
  de órdenes con el arte de la biblioteca, avisos de caracteres que la fuente no tiene y de claves de texto sin usar,
  `set_texts` con `null`, ids libres en puzzles, y el skill documenta las dos bandas de arte, el orden de un puzzle con
  solución y las opciones de estilo del motor. Todo en `ensayos/f3/` (juego e `INFORME.md`, con la lista de qué
  observar en la partida). Del juego salieron dos secciones infantiles para la biblioteca (`mision-secreta`):
  `cumpleanero-infantil` y `mision-escondite` (esta trae los campos del puzzle de tiras). *Pendiente:* la partida de
  prueba de una persona.
- *Aceptación:* validado sin errores, vista previa revisada por Claude, y una partida de prueba hecha por una persona.

### F4 · Creador web

El creador nuevo sustituye al editor de `creator/` (fuera `lienzo.js`, `kit.js`, `vista-previa.js` y sus pruebas).
Sigue la maqueta aprobada («Creador de juegos PrintMyEscape»: inicio, página, campos y revisión). Base común:

- **Misma lógica que Claude.** `tools/game/operaciones.mjs` (nuevo, sin dependencias de Node) tiene las operaciones de
  edición v2 (insertar página o sección de la biblioteca, añadir, cambiar, mover y quitar elementos, puzzles); lo usan
  las herramientas MCP (`mcp/herramientas-v2.mjs`, ahora envoltorios finos) y el creador. Cada cambio del creador se
  valida en el navegador con las mismas reglas (`reglasV2` + `reglasCruzadas` sobre `aV1`, arte de la biblioteca) y,
  si añade un error, se rechaza explicándolo: lo que guarda el creador siempre lo puede seguir editando Claude, y al
  revés. Deshacer (Ctrl+Z), guardado solo, y aviso de versión nueva (sondeo): nunca pisa lo que Claude guardó.
- **Almacenes.** GitHub (`store/github.js`): el juego en la rama `juego/<id>` (`games/<id>/`), la biblioteca en
  `biblioteca/` de `main`; enviar al estudio abre el pull request. Memoria (`?almacen=memoria`) para pruebas y
  demostración. El lienzo y las vistas previas son el PDF del motor pintado con pdf.js (copiado en `creator/vendor/`).
- **F4.1 Biblioteca (hecho).** Inicio: empezar en blanco, duplicar (un juego antiguo v1 se copia ya en v2; los v1 se
  abren en solo lectura), pedírselo a Claude, «Para revisar» y el material de la biblioteca. Una página de la
  biblioteca entra con las secciones y puzzles que necesita (de su misma colección primero; si ningún sitio trae un
  campo, se explica y no se añade).
- **F4.2 Diseñar página (hecho).** Páginas (en blanco, de la biblioteca, duplicar, desde un PDF del artista); imágenes,
  fondos, campos y páginas para insertar; lienzo con cajas para elegir, mover, cambiar el tamaño y teclado; propiedades
  por tipo (letra del registro, tamaño en pt, color, alineación, mayúsculas o runas, varias líneas, capa del arte).
  Subir imágenes: PNG, JPG o PDF de hasta 5 MB, optimizadas a 300 ppp (A3 como mucho), envueltas en PDF con miniatura,
  a `biblioteca/arte/subidas` con autor humano, licencia y etiquetas (reglas de la biblioteca).
- **F4.3 Formulario (hecho).** Secciones (ordenar arrastrando, nueva, reutilizar de la biblioteca), preguntas (texto en
  cada idioma: un texto a medias no se guarda y se avisa; tipo, tope, mínimo y máximo, obligatoria, opciones y «Otro»,
  ejemplos corto, normal y largo, fotos de ejemplo, código para el artista que se cambia en todo el juego), traer una
  pregunta de la biblioteca, y la vista del comprador con el ejemplo elegido.
- **Puzzles y soluciones (hecho).** Ficha, solución y pistas por idioma, textos de los puzzles de contenido, lo que
  leen los de datos; añadir del catálogo (en página nueva; si tiene solución, con los huecos de sus respuestas en su
  zona) o de contenido; quitar.
- **F4.4 Revisión (hecho).** Cambios de Claude (`changes`), cada parte del juego (páginas, formulario, ejemplos,
  puzzles) con su vista previa, marcar como revisada (`review.items`), cambios vistos (`review.changes`, el contador
  de la cabecera) y notas para Claude (`notes`, que lee `read_notes`). Vista previa del juego entero con errores y
  avisos enlazados a su página y descarga del PDF.
- **F4.5 Guía del token (hecho; sustituida el 13-10 por `creator/ayuda.html`, cómo usar el creador y Claude Code, y por el enlace del estudio con el token).** Antes `creator/guia-token.html`: token de grano fino solo para el repositorio de juegos,
  Contents y Pull requests de lectura y escritura, con el enlace al formulario de GitHub ya relleno. El token vive en
  sessionStorage y solo va en la cabecera Authorization; si caduca, el creador vuelve a pedirlo.
- **Publicación.** `tools/build-creator.py` copia también las vistas y las fuentes del registro, reescribe las rutas
  que salen de `creator/` y falla si algo de `biblioteca/` se fuera a publicar o si una ruta publicada no lleva a nada.
- *Pruebas:* `tools/qa/creator-f4.py` 39/39 (el recorrido del cliente con el juego de F3, del inicio a la revisión, y
  la ida y vuelta por el validador de Claude), `tools/qa/creator-github.py` 19/19 (API simulada: token, guardado,
  conflicto con Claude, subida a main, juego nuevo, envío), `tools/qa/creator-publicado.py` 10/10; golden 96/96 y el
  resto de suites sin cambios. Hallazgo: la página `ficha-cumpleanero` de la biblioteca pide los sospechosos
  (`NOMBRE_1…8`, `APODO_1…8`) y ninguna sección de la biblioteca los trae; solo sirve para juegos con sospechosos.
- **Lo que faltaba de la maqueta (hecho, 13-10).** Cabida real en el formulario («en la página N caben X letras», con
  `tools/game/cabida.mjs`, la medida de `limites.mjs` sin Node). Sugerencias de Claude (`suggestions`: pregunta,
  página o elemento con el porqué; `write_change_summary` las escribe) con Aceptar y Descartar en el formulario, la
  página y Revisar, y «A presupuestar» (`changes[].presupuestar`) en Revisar. Editar un puzzle de contenido por
  dentro en el lienzo. La rama principal del almacén es la rama por defecto del repositorio (o `?principal=`).
- **Biblioteca (13-10).** Secciones `sospechoso-1…8` (nombre, alias y foto, de final3): la página `ficha-cumpleanero`
  ya entra en un juego nuevo con todo lo que necesita. Tableta v3 de la p16 corregida. El creador ofrece solo la última
  versión de cada entrada.
- **Arte corregido (13-10).** Páginas 8 (barquitos) y 16 (tablet) de `Final3-Clean.pdf` cambiadas por las del
  artista; la p16 reordena los iconos (notificaciones 2, 1, 2, 1, 3, 3, 2; solución 213). El «2» inglés era «= 2»
  en las p5, p6, p13 y p16. Ejemplos y demo regenerados (golden 96/96, paridad 96/96).
- **GitHub real.** Lecturas probadas contra la API real (`tools/qa/creator-github-real.py --solo-lectura`, 5/5); las
  escrituras, con la API simulada (19/19): desde la sesión de Claude la API no admite escrituras. Falta una pasada de
  escritura con el token del estudio (`creator-github-real.py` sin `--solo-lectura`).
- *Pruebas:* `creator-f4.py` 47/47, `creator-github.py` 19/19, `creator-publicado.py` 10/10, `mcp/test-v2.mjs` 47/47.
- *Aceptación (hecha, 13-10):* el estudio, haciendo de cliente, revisó y retocó el juego de F3 sin ayuda: «las pruebas
  han sido satisfactorias».

### F5 · Piloto

Un juego real de principio a fin, con prueba de juego, y la lista de piezas reutilizadas.

- **Feedback del cliente sobre el formulario (hecho, 14-10).** «Pone 200 y solo deja 30»: el cliente escribía letras
  sin espacios, y el motor no partía una palabra más ancha que la línea (una línea y el hueco «lleno»). Ahora `wrap`
  parte las palabras de 12 letras o más que no caben (las cortas, como una hora, se siguen encogiendo; golden 96/96
  sin cambios por esto). Los topes que no cabían de verdad se bajan a lo que cabe: `TEST_RESULTADO` 138,
  `PERSONALIZADO_1/2` 47, `NOMBRE_DEST` 27; y los parecidos van iguales: fama, debilidad, talento y sospecha 33 (los
  cuatro huecos de la ficha miden ya lo mismo, 27,5 % de ancho), notas e información importante 180. El ejemplo 3 se
  recorta a esos topes. `limites-demo.py` comprueba que cada campo admite su tope entero sin espacios y con palabras
  largas (29/29).
- **Copia del original por piezas (hecho, 14-10).** `tools/biblioteca/regalo-por-piezas.py` compone «Regalo robado
  (por piezas)» (`ensayos/f5/el-regalo-robado-piezas`, rama `juego/el-regalo-robado-piezas` del repositorio de juegos)
  con las piezas de la biblioteca en el sitio del artista, localizadas en `Final3-Clean.pdf` por sus trazos. Lo que no
  cuadraba de una página a otra (vídeo del cliente) se alinea: polaroid y nota de los sospechosos (p9-p16 salvo la
  p13), las dos listas de ubicaciones, la cuadrícula de fichas de la p2 y el triángulo verde. Piezas nuevas separadas
  del mismo PDF (`separar-piezas.py` admite `seqnos`): sobre de correo aéreo, hoja de carta, lupa grande, esquina
  verde, líneas de cuaderno, viñeta, factura, nota con clip grande, triángulo salvia, bombilla morada y postal con
  sobres; v2 del plano (con su papel), de los perros (con su fondo) y del maletín (el corregido). Prueba:
  `tools/qa/regalo-piezas-test.py` 9/9.
- **Más feedback (hecho, 15-10).** Formulario del comprador: las cajas de texto largo miden según su tope (unas 55
  letras por línea; antes 216 px fijos) y la tarjeta tiene menos relleno: a 1920×950 y 1440×800 ninguna pantalla
  necesita barra (`limites-demo.py` 31/31); en portátiles más bajos la tarjeta sigue desplazándose sola. El menú corta
  con puntos los nombres largos. Creador: las miniaturas, el lienzo y las propiedades se desplazan cada uno por su
  cuenta (al bajar por las páginas el lienzo ya no se va); la cabecera da su alto real (`--alto-cabecera`).
- **Presupuestos y tema de color (hecho, 15-10).** *Presupuestos* (`#/presupuestos`, junto a Biblioteca): líneas de
  arte, maquetación, programación y pruebas con complejidad (sencilla ×0,6, media, compleja ×1,8), cantidad, horas y
  €/h; gestión, descuento e IVA; descarga en PDF (pdf-lib, `tools/presupuesto/pdf.mjs`) y en Excel con fórmulas
  (`tools/presupuesto/xlsx.mjs`, sin dependencias). Tarifas editables (de partida: ilustración 30 €/h, diseño 28,
  programación 40, pruebas 25; ilustración media 16 h, icono 1,5 h, mecánica nueva 6/16 h…). Se empieza en blanco,
  con lo «A presupuestar» de un juego (también desde Revisar) o con un cambio de tema (también desde Tema). Se guardan
  en `presupuestos/` de la rama principal del repositorio de juegos. Ejemplos sobre el juego de Claude:
  `ensayos/f5/presupuestos/` (`tools/presupuesto/ejemplos.mjs`). *Tema* (pestaña de cada juego): `game.theme`
  `{ name, preset?, tolerance?, map: [{from, to}] }` en los dos esquemas; el motor recolorea al componer (trazos de las
  piezas y del PDF de fondo, textos y color de página; en Lab, conservando sombras y luces; ni fotos, ni mapas de
  bits, ni degradados). El creador saca la paleta del juego de sus páginas, ofrece 8 paletas de partida
  (`tools/game/paletas.mjs`: los oscuros siguen oscuros y los claros, claros) y una vista previa. Claude: `set_theme`.
  Pruebas: `tools/qa/presupuesto-tema-test.mjs` 21/21, `tools/qa/creator-presupuestos.py` 16/16, `mcp/test-v2.mjs`
  50/50; golden y paridad 96/96 (sin tema, igual que antes).
- **Presupuestos con las tarifas del estudio, visuales y desde Claude (hecho, 15-10).** Tarifas `pme-tarifas/2`
  (la tabla del estudio): perfiles arte, maquetación y game design 30 €/h, programación 50 €/h; conceptos con horas
  por nivel: prop 0,5/1/2/2,5 h (baja…muy alta), maquetación 5 h por escape, game design por puzzle 2/3,5/7 h y testing
  3 h, programación por puzzle 1/2/3 h y ajustes 1 h; gestión 0 % de partida. Líneas con `anclas`
  (`[{pagina, elemento?, x?, y?}]`): el editor (tarjetas por sección, botones de complejidad, reparto del total) tiene
  al lado las páginas del escape compuestas con un número donde va cada línea («Señalar en el escape»; pulsar una
  pieza la ancla a ella), y «Como lo verá el cliente». El PDF lleva el reparto, miniaturas de las piezas, «Va en:
  página…» y el anexo «Dónde va cada cosa» con las páginas y los números. Claude: `list_budgets`, `get_budget`,
  `get_rates`, `set_rates`, `create_budget` (blanco, «A presupuestar» o tema), `update_budget`, `export_budget` (PDF
  con anexo y Excel en `salidas/presupuestos/`) y `sync_budgets` (pull/push a la rama principal sin cambiar de rama,
  con guarda por `actualizado`); skill: `reference/presupuestos.md`. Pruebas: `mcp/test-presupuestos.mjs` 20/20,
  `tools/qa/presupuesto-tema-test.mjs` 23/23, `tools/qa/creator-presupuestos.py` 22/22.
- **Tema: armonías de color y Adobe Color (hecho, 15-10).** La pestaña Tema elige la paleta nueva en tres pestañas:
  *Paletas* (las de partida), *Armonías* (rueda de color RYB como la de Adobe Color, con reglas análogo,
  monocromático, tríada, complementario, complementario dividido, doble complementario, cuadrado, compuesto, matices y
  personalizado; puntos arrastrables, luz y «tinta y papel»: un oscuro y dos claros del tono para que se lea al
  imprimir) y *Adobe Color* (enlace a su rueda; importar .ase, CSS, SCSS, LESS, XML, códigos pegados o una imagen de
  referencia; los enlaces de Adobe Color no se pueden leer desde el creador). Con tinta y papel, el reparto manda los
  papeles del juego (claros y poco saturados, como el kraft) al papel de color y no al color más chillón.
  `game.theme.palette` ({ source, rule?, base?, colors, inkPaper? }, en los dos esquemas) recuerda de dónde salió.
  La paleta nueva se descarga en .ase para Illustrator o Photoshop. `tools/game/armonias.mjs` (sin dependencias).
  Claude: `color_palette` (armonía, o .ase/CSS/XML/códigos de Adobe Color) y `set_theme` con `palette` (el servidor
  saca los colores del juego con pdftoppm y reparte como el creador). Pruebas: `presupuesto-tema-test.mjs` 28/28,
  `creator-presupuestos.py` 32/32, `mcp/test-v2.mjs` 56/56.

- **Formulario publicado: Regalo robado (por piezas), con topes revisados (hecho, 16-10).** `docs/index.html` se monta
  ahora desde `demo/el-regalo-robado-piezas` (copia de la rama `juego/el-regalo-robado-piezas`, maquetada por las
  artistas en el creador): `build-demo.py` admite juegos por piezas (mete las piezas de arte que usan sus páginas y los
  PDF de fondo por página). `demo/index.html` sigue siendo el original (pruebas). Topes: todos caben con texto normal
  (los avisos con «wwww…» no cuentan: sin espacios y con la letra más ancha); nombres de otra persona 24 (con quien
  se esconde, destinatario de la postal, amor secreto), sitios que dan vergüenza 20 (lugar, tienda, web), mensajes
  cortos 42 (confesión, postal); los ejemplos de las preguntas y de la ayuda caben en su tope. Pruebas: e2e-demo
  30/30 y limites-demo 31/31 en las dos demos.

- **Feedback del editor de personalización (hecho, 21-10).** En el juego (`tools/juegos/feedback-editor-21-10.cjs`,
  aplicado a la rama del juego y a `demo/el-regalo-robado-piezas`): enunciados y ayudas con punto final, ayudas y
  ejemplos nuevos para todos los públicos (fama, campos largos, amor secreto sin runas, tienda y producto, webs,
  postal, aficiones, apps), frases a medias pasadas a pregunta, y el lugar del test en la misma pantalla que su
  resultado. `form.sections[].screenBreaks` (los dos esquemas; casilla «Empieza pantalla nueva» en el creador): el
  formulario empieza pantalla en esos campos. En el formulario, la bienvenida tiene una barra con Idioma, País y
  Formato de papel: idioma y país detectados del navegador, A4 o US Letter según el país (datos de CLDR) hasta que el
  cliente elige el formato a mano; se guarda en el borrador, sale en la revisión y el PDF se genera en ese formato
  (US Letter: cada página A4 entera y centrada). El tercer punto de «Antes de empezar» sigue igual (pendiente).
  Pruebas: `tools/qa/preferencias-demo.py` 11/11, e2e-demo 30/30 y limites-demo 31/31 en las dos demos.

- **Ajustes del 22-10 (hecho).** Formulario: «+ Otra opción» con contador de letras y que se puede desmarcar. Juego
  (`tools/juegos/ajustes-22-10.cjs`): «¡Alguien ha robado el regalo de …!» con el nombre del cumpleañero (antes
  ponía Ian siempre) gracias a la transformación nueva «frase» de un hueco (`mechanics/frase.js`: el valor dentro de
  una frase por idioma, editable en el creador; en el creador también se edita el mensaje de las runas); «¿Cómo
  funciona?» con aire; «Información importante» sobre las líneas del papel (interlineado e `even`: todas las líneas
  con la misma anchura de letra, también en el creador); mensaje pigpen del sospechoso 2 confirmado («Aunque no dejo
  de pensar en ti… lo nuestro es imposible [Nombre]»); en «Posibles ubicaciones», números que caben en su insignia,
  ubicaciones de una línea y del mismo ancho, sin «del despacho» y sin el 3 repetido; textos en inglés que decían
  «We know that [nombre] they were…» corregidos. Pruebas: preferencias-demo 14/14, e2e 30/30 y límites 31/31 en las
  dos demos, golden y paridad 96/96.

## 4. Lo que no entra

Dibujo libre, grupos de capas y recorte avanzado; botón de IA en la web; imágenes generadas con IA; edición
simultánea; venta, canje y PDF en servidor (proyecto aparte).
