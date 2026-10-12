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
  observar en la partida). *Pendiente:* la partida de prueba de una persona; guardar en la biblioteca una sección
  infantil desde este juego.
- *Aceptación:* validado sin errores, vista previa revisada por Claude, y una partida de prueba hecha por una persona.

### F4 · Creador web

- **F4.1** Biblioteca (empezar, duplicar, reutilizar). **F4.2** Diseñar página (elementos, subir imágenes ≤ 5 MB optimizadas).
- **F4.3** Formulario (crear campos y secciones, vista del comprador). **F4.4** Revisión (cambios de Claude, notas).
- **F4.5** Guía para crear el token de GitHub y entrar.
- *Aceptación:* el cliente revisa y retoca el juego de F3 sin ayuda del equipo (revisión humana).

### F5 · Piloto

Un juego real de principio a fin, con prueba de juego, y la lista de piezas reutilizadas.

## 4. Lo que no entra

Dibujo libre, grupos de capas y recorte avanzado; botón de IA en la web; imágenes generadas con IA; edición
simultánea; venta, canje y PDF en servidor (proyecto aparte).
