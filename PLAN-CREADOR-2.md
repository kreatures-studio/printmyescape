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
  nuevos). *Pendiente:* la licencia de Pigpen (runas) es «por confirmar»: el validador lo avisa.
- **F1.5 Validador y límites v2 (hecho).** Reglas nuevas: cajas dentro de la página (texto, campo y foto: error;
  pieza de arte que sobresale: aviso), puzzles de contenido sin mecánica, puzzles inexistentes o sin elementos,
  y que cada PDF de página exista. El esquema del puzzle admite ahora `name`, `page` y los metadatos del §2.3.
  *Aceptación:* 20 casos anteriores (v1) y 7 nuevos de v2 en `tools/qa/validador-casos.mjs` (27/27); final3 migrado
  pasa sin errores; límites 26/26.
- **F1.6 Formulario del comprador y CLI leen v2 (hecho).** La demo se monta desde un juego v2 (`build-demo.py`
  convierte con `tools/game/a-v1.mjs`), la CLI y la composición del MCP leen la forma v1 equivalente, y las herramientas
  de edición del MCP rechazan v2 con un mensaje claro (`v2-no-editable`) hasta F3. *Aceptación:* e2e de la demo 30/30
  con final3 en v2 (`PME_DEMO=salidas/demo-v2/index.html`); golden 96/96 también desde v2.
  *Pendiente:* `tools/qa/game-smoke.py` lee el JSON crudo; las pruebas del MCP cubren solo juegos v1.

### F2 · Bibliotecas

- **F2.1 Manifiesto de la biblioteca y su validación (hecho).** Formato `pme-biblioteca/1` (tipo `arte`) en
  `schema/biblioteca-1.schema.json`; reglas en `tools/biblioteca/reglas.mjs` (licencias admitidas: `propia-estudio`
  y `CC0-1.0`; autor real; origen; zonas dentro de la pieza; ficheros y miniaturas que existen; versiones únicas;
  las piezas por reexportar avisan). CLI: `node tools/biblioteca/validar.mjs <colección>`. *Aceptación:* el validador
  rechaza piezas sin licencia o sin autor: `tools/qa/biblioteca-casos.mjs` 11/11. La colección de El regalo robado
  (40 piezas: 28 ok y 12 por reexportar; la descartada no entra) pasa.
- **F2.2 Importar arte** de los artistas (PDF con capas `zona-foto`/`zona-texto`, PNG, SVG) con miniatura y tamaño.
- **F2.3 Piezas de El regalo robado:** las 28 listas (`biblioteca/arte/el-regalo-robado/`) y las 12 reexportadas.
- **F2.4 Fuentes de Google Fonts** elegidas por el estudio, con licencia.
- **F2.5 Páginas y secciones** guardadas desde un juego, con origen.
- **F2.6 Catálogo de puzzles:** las 6 mecánicas actuales como puzzles de `datos` y 3 puzzles de `contenido` de ejemplo.
- *Aceptación de la fase:* el validador rechaza piezas sin licencia o sin autor; un juego v2 de prueba usa arte,
  fuente, página, sección y puzzle de la biblioteca.

### F3 · Claude compone desde cero

- **F3.1** Herramientas MCP de 2.4. **F3.2** Skill reescrito (flujo del documento de decisiones).
- **F3.3 Ensayo** en una sesión limpia: juego de 6 páginas, sin sospechosos, con 2 puzzles de contenido y 1 del catálogo.
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
