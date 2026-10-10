# Plan: creador de escape rooms (para implementar con Haiku)

Estado: propuesta · 2026-10-10 · Base: rama `studio/artista` (commit `6564314`)

## 0. Resumen

Sí se puede. El creador es la evolución natural de lo que ya existe: el motor de
composición (`tools/pme-compose-core.js`) ya funciona en navegador y en Node, y la extracción
desde Illustrator ya saca posiciones. Lo que falta es un **formato de juego único**
(`game.json`) que describan por igual el editor web, el servidor MCP y el skill, y sacar del
motor todo lo que hoy es propio del juego actual.

Reparto final del trabajo:

| Quién | Qué hace |
| --- | --- |
| Cliente, con Claude Code + MCP + skill | Historia, puzzles con su solución, páginas maquetadas con el kit de arte, preguntas, ejemplos. Sale un `game.json` validado y una vista previa con marca de agua |
| Nuestros artistas | Arte propio del juego cuando el kit no basta; piezas nuevas para el kit |
| Programación | Mecánicas nuevas (se programan una vez y entran en el catálogo), revisión y publicación |

Lo que el creador **no** resuelve: el arte final de calidad y la calidad de los puzzles. El
skill obliga a escribir soluciones y la herramienta comprueba lo comprobable, pero una persona
debe jugar cada juego antes de venderlo.

## 1. Reglas para quien implementa (Haiku)

1. **Una tarea por sesión.** Lee solo la tarea, las secciones de contratos que cita y los
   archivos que lista. Si necesitas otro archivo, léelo, pero no lo modifiques salvo que la
   tarea lo diga.
2. **Los contratos de la sección 3 no se cambian.** Si una tarea no se puede hacer sin
   cambiarlos, para y escribe en `PLAN-CREADOR-DUDAS.md` qué cambiarías y por qué.
3. **Cada tarea termina con su comprobación** (apartado «Aceptación»). Si falla dos veces
   seguidas, para y deja el error en `PLAN-CREADOR-DUDAS.md`. No relajes una prueba para que pase.
4. **La prueba dorada manda** (`tools/qa/golden.py`, tarea T0.5): desde M0, ningún cambio
   puede alterar un solo píxel de los PDF de ejemplo del juego actual, salvo que la tarea lo diga.
5. **Rama por hito:** `creador/m0`, `creador/m1`... desde `creador`. Un commit por tarea, con
   el identificador al principio: `T1.2: quitar constantes del formulario`.
6. **Sin dependencias nuevas** salvo las de la sección 2. Nada de frameworks ni empaquetadores.
7. **No edites archivos generados** (`demo/index.html`, `docs/index.html`, `games/*/build/`).
8. `tools/node_modules` tiene que existir (`npm install --prefix tools`). No lo subas a git.
9. Ante una ambigüedad, elige lo más simple que cumpla la aceptación y anótalo en el commit.

## 2. Arquitectura objetivo

```
games/<id>/game.json            el juego: única fuente de verdad (contrato 3.1)
games/<id>/art/                  arte propio del juego (PDF del artista, o piezas)
assets/kit/manifest.json         catálogo de piezas de arte reutilizables (contrato 3.4)
assets/kit/<categoria>/*.pdf     piezas vectoriales, una por PDF, + miniatura .png
schema/pme-game-1.schema.json    JSON Schema del juego
mechanics/index.js               registro de mecánicas (contrato 3.2)
mechanics/<tipo>.js              una mecánica por archivo
tools/pme-compose-core.js        motor: ya no conoce campos ni páginas concretas
tools/game/*.mjs                 cargar, validar, migrar, medir límites (Node)
tools/compose.js                 CLI, ahora con --game
tools/build-demo.py              ahora con --game
creator/                         editor web (HTML, CSS, JS en módulos; sin framework)
mcp/server.mjs                   servidor MCP por stdio (contrato 3.3)
.mcp.json                        registro del servidor para Claude Code (ámbito proyecto)
.claude/skills/crear-escape-room/SKILL.md   el skill
```

Tecnologías fijadas:

- **Node 22** para herramientas y MCP. Código nuevo de Node en `.mjs` (ES modules). El motor
  sigue siendo un script clásico que rellena `globalThis.PMECompose`; desde `.mjs` se carga
  con `import '../pme-compose-core.js'` tras cargar pdf-lib y fontkit en `globalThis`, igual
  que hace `tools/compose.js`.
- **Dependencias nuevas permitidas** (en `tools/package.json`): `ajv` (versión 8, validación
  de esquema) y `@modelcontextprotocol/sdk` (versión 1.x; en npm, la 1.32.1 a 2026-10-10).
  Si la API del SDK instalado no coincide con lo que se describe aquí, sigue el README del
  paquete y anótalo.
- **Navegador:** módulos ES servidos por `creator/serve.mjs` (servidor estático mínimo con
  `node:http`), porque `file://` no permite importar módulos.
- **Pruebas:** Python con Playwright, como las actuales (`tools/qa/`).

## 3. Contratos (fijos: no los cambia Haiku)

### 3.1 Formato del juego: `game.json` (`"schema": "pme-game/1"`)

Diseñado para que la migración del juego actual sea casi una copia: `template`, `texts` e
`i18n` son literalmente los archivos actuales de `templates/final3/`.

```json
{
  "schema": "pme-game/1",
  "id": "final3",
  "version": "1.0.0",
  "name": { "es": "La fiesta robada", "en": "The stolen party" },
  "languages": ["es", "en"],
  "background": { "kind": "pdf", "file": "Final3-Clean.pdf" },
  "template": { "...": "contenido de templates/final3/template.json, sin cambios en M0" },
  "texts": [ "...contenido de templates/final3/texts.json..." ],
  "i18n": { "es": { "clave": "texto" }, "en": { "clave": "text" } },
  "fields": {
    "NOMBRE_1": { "type": "name", "required": true, "cap": 12,
                  "q": { "es": "Nombre", "en": "Name" } },
    "TEST_RESULTADO": { "type": "long", "required": true, "cap": 180,
                  "q": { "es": "Imagina ahora el resultado…", "en": "Now imagine…" },
                  "desc": { "es": "Ejemplo: …", "en": "Example: …" } },
    "DEBILIDAD": { "type": "multi", "required": true, "allowOther": true, "otherField": "OTRO",
                  "options": [ { "es": "Llegar tarde", "en": "Being late" } ],
                  "q": { "es": "Delitos conocidos", "en": "Known offences" } },
    "EDAD": { "type": "number", "required": true, "min": 1, "max": 110,
              "q": { "es": "¿Cuántos años cumple?", "en": "How old are they turning?" } },
    "FOTO_1": { "type": "photo", "required": true, "q": { "es": "Sube su foto", "en": "Upload their photo" } }
  },
  "form": {
    "sections": [
      { "id": "s1", "title": { "es": "Sospechoso 1", "en": "Suspect 1" },
        "hint": { "es": "…", "en": "…" },
        "nameField": "NOMBRE_1", "photoField": "FOTO_1",
        "fields": ["NOMBRE_1", "APODO_1", "FOTO_1", "S1_HIDEA", "S1_HIDEB", "TEST_LUGAR", "TEST_RESULTADO"] }
    ]
  },
  "mechanics": [
    { "type": "ticks", "page": "p4", "params": { "field": "DEBILIDAD", "half": 0.6,
      "boxes": [ { "x": 9.95, "y": 55.86 } ] } }
  ],
  "examples": [
    { "id": "1", "values": { "es": { "NOMBRE_1": "Isabel" }, "en": { "NOMBRE_1": "Isabel" } },
      "photos": { "FOTO_1": "assets/retratos/retrato-1.jpg" } }
  ],
  "solutions": [
    { "id": "tiras-p9", "page": "p9", "dependsOn": ["TEST_LUGAR", "TEST_RESULTADO"],
      "how": { "es": "Ordenar las tiras para leer el resultado del test", "en": "…" } }
  ]
}
```

Reglas del formato:

- `fields[*].type`: `name` | `text` | `long` | `number` | `photo` | `choice` | `multi`.
- `cap` = tope de producto en caracteres. El límite real es `min(cap, capacidad medida × 0,75)`
  (nombres: `min(cap, capacidad)`); se calcula en el build, nunca se escribe a mano.
- Un campo que no se pregunta (derivado por una mecánica) no está en `fields`; lo declara su mecánica.
- Todo texto visible tiene versión en cada idioma de `languages`.
- `solutions` es obligatorio para publicar (el validador avisa en borrador y falla en publicación).

### 3.2 Interfaz de una mecánica (`mechanics/<tipo>.js`)

Script clásico, como el motor, que se registra en `globalThis.PMEMechanics`:

```js
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});
  M.ticks = {
    type: 'ticks',
    label: { es: 'Casillas marcadas', en: 'Ticked boxes' },
    // JSON Schema de params: lo usan el validador, el editor y el MCP
    params: { type: 'object', required: ['field', 'boxes'], properties: { /* … */ } },
    // valores derivados antes de dibujar (p. ej. inicial de una app); devuelve un objeto
    derive(values, params, lang) { return {}; },
    // dibujo extra en su página, después de los huecos; ctx = { page, PW, PH, rgb, values, lang }
    drawPage(ctx, params) { /* … */ },
    // errores de configuración: [{ path, message }]
    validate(game, params) { return []; },
  };
})();
```

Mecánicas que salen del juego actual (M2): `ticks` (casillas, p4), `initial` (icono con la
inicial de la app, `S8_ICON_N`), `join` (nombre + alias en la ficha), `prefix` (la coma del
apodo), `runes-panel` (fondo de la nota cifrada, p10) y `strips` (hoja de tiras, hoy
`template.shuffle`). La transformación a runas pasa a ser una propiedad del hueco:
`"transform": "runes"`, con el prefijo por idioma en `params`.

### 3.3 Herramientas del servidor MCP

Todas trabajan sobre `games/<id>/game.json`. Las que modifican: validan antes de guardar,
rechazan un estado inválido, escriben de forma atómica y guardan copia en `games/<id>/.history/`.

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `list_games` | — | `[{ id, name, version }]` |
| `get_game` | `id`, `part` (`summary` \| `form` \| `fields` \| `pages` \| `mechanics` \| `full`) | JSON de esa parte |
| `create_game` | `id`, `name`, `languages`, `pages` (número) | juego vacío con páginas en blanco |
| `list_assets` | `tag?` | piezas del kit (contrato 3.4) |
| `list_mechanics` | — | `[{ type, label, params }]` del registro |
| `set_page` | `id`, `page`, `layers` | página con sus capas de arte |
| `upsert_slot` / `remove_slot` | `id`, `page`, `slot` | hueco creado o cambiado |
| `upsert_field` / `remove_field` | `id`, `field`, `def` | campo creado o cambiado |
| `set_sections` | `id`, `sections` | secciones del formulario |
| `upsert_mechanic` / `remove_mechanic` | `id`, `mechanic` | mecánica configurada |
| `set_texts` | `id`, `lang`, `entries` | textos fijos e i18n |
| `set_example` | `id`, `example` | ejemplo guardado |
| `set_solutions` | `id`, `solutions` | soluciones guardadas |
| `validate_game` | `id`, `mode` (`draft` \| `publish`) | `{ errors, warnings }` |
| `measure_limits` | `id` | capacidad y límite de cada campo |
| `render_preview` | `id`, `lang`, `example`, `pages?` | rutas a un PDF y a PNG por página, con marca de agua «BORRADOR» |

### 3.4 Kit de arte (`assets/kit/manifest.json`)

```json
{ "pieces": [
  { "id": "papel-rasgado-1", "file": "papel/papel-rasgado-1.pdf", "thumb": "papel/papel-rasgado-1.png",
    "kind": "background", "widthMm": 190, "heightMm": 140, "tags": ["papel", "nota"],
    "slots": [ { "role": "text", "x": 8, "y": 10, "w": 84, "h": 70 } ] }
] }
```

- Cada pieza es un **PDF de una página** (vector, se incrusta con `embedPdf` de pdf-lib, que sí
  lo admite; SVG no) y una miniatura PNG de 300 px para el editor.
- `kind`: `background` | `frame` | `photo-frame` | `decor` | `icon`.
- `slots` (opcional): zonas útiles de la pieza en %, para que el creador sugiera huecos.

## 4. Hitos y tareas

### M0 · Formato de juego y migración del juego actual

**T0.1 Esquema.** Escribe `schema/pme-game-1.schema.json` (JSON Schema 2020-12) con el contrato
3.1, y dos ejemplos: `schema/examples/minimo.json` (válido, 1 página, 1 campo) y
`schema/examples/roto.json` (un campo sin `q.en`, una sección que cita un campo inexistente).
*Aceptación:* T0.3 valida el primero y rechaza el segundo con esos dos errores.

**T0.2 Volcado del formulario actual.** `tools/game/dump-demo.py`: abre `demo/index.html` con
Playwright y guarda en `games/final3/_dump.json` las constantes `Q`, `SECDEF`, `SUS_EXTRA`,
`LIMITS`, `WEAK`, `EJEMPLO`, `EJEMPLO2`, `EJEMPLO3`, `EJEMPLO_EN`, `EJEMPLO2_EN`, `EJEMPLO3_EN`
leyéndolas de `window`. *Aceptación:* el JSON tiene 9 secciones y los 6 ejemplos.

**T0.3 Cargar y validar.** `tools/game/load.mjs` exporta `loadGame(dir)` y
`toEngineDeps(game, lang)` → `{ template, fixed, i18n, i18nAll }` exactamente como los usa
`composeGame`. `tools/game/validate.mjs <dir|archivo> [--publish]`: esquema con ajv más
comprobaciones cruzadas (cada campo de una sección existe; cada `slot.field` es un campo o un
derivado de una mecánica; cada pregunta tiene todos los idiomas). Sale con código 1 si hay errores.
*Aceptación:* T0.1 como se describe.

**T0.4 Migración.** `tools/game/migrate-final3.mjs`: construye `games/final3/game.json` con
`templates/final3/*`, `_dump.json` y los topes actuales (`LIMITS` de `demo/src.html` como `cap`).
*Aceptación:* `node tools/game/validate.mjs games/final3` sin errores.

**T0.5 CLI y prueba dorada.** `tools/compose.js --game games/final3 --lang es --example 3 --out …`
(usa `toEngineDeps` y las fotos del ejemplo). `tools/qa/golden.py`: compone los 6 ejemplos
desde `game.json` y compara a 60 ppp con `demo/ejemplos/*.pdf`.
*Aceptación:* 96 de 96 páginas idénticas.

**Revisión humana:** esquema y migración, antes de seguir.

### M1 · Formulario generado desde el juego

**T1.1 Inyectar el juego en la demo.** `build-demo.py --game games/final3` mete `game.json` en
`PME_DEMO_DATA.game`. En `demo/src.html`, una función `formFromGame(game)` construye las mismas
estructuras que hoy (`Q`, `SECDEF`, `LIMITS`, `WEAK`, ejemplos) y sustituye a las constantes.
*Aceptación:* E2E 30/30, límites 26/26, paridad 96/96, dorada 96/96.

**T1.2 Quitar las constantes** que ya no se usan de `demo/src.html`.
*Aceptación:* la misma, y `grep -c "SUS_EXTRA = {" demo/src.html` da 0.

**T1.3 Tipos genéricos.** `choice` (opción única) y `multi` con opciones del juego (desaparece
`WEAK`). *Aceptación:* la misma, y una prueba nueva con `schema/examples/minimo.json` ampliado
con un campo de cada tipo.

### M2 · Mecánicas fuera del motor

**T2.1 Registro y `ticks`.** `mechanics/index.js` y `mechanics/ticks.js`; el motor llama a
`derive` y `drawPage` de las mecánicas declaradas en `game.mechanics`; se borra
`delitosMarcados` y `TICK_BOX` del motor. *Aceptación:* dorada 96/96.

**T2.2 `initial`, `join`, `prefix`.** Igual, una por commit. *Aceptación:* dorada 96/96.

**T2.3 Runas.** `"transform": "runes"` en el hueco y `runes-panel` para el fondo de p10.
*Aceptación:* dorada 96/96.

**T2.4 Tiras.** `template.shuffle` pasa a la mecánica `strips`. *Aceptación:* dorada 96/96.

**T2.5 Motor limpio.** Los tipos salen de `fields` (`number`, `name`, `long`), no de los
nombres de campo: desaparecen la regla `EDAD` y la expresión `NAME_RE` (`NOMBRE_`, `APODO_`…)
de `kindOf` y `cleanValues`; el motor recibe los tipos en `deps.fieldTypes`.
*Aceptación:* este comando no imprime nada:
`grep -nE "'p[0-9]+'|NOMBRE_|APODO_|S2_|S8_|DEBILIDAD|EDAD" tools/pme-compose-core.js`.

**Revisión humana (o con un modelo grande):** el motor es la pieza más delicada.

### M3 · Validador completo y límites en el build

**T3.1 Límites.** `tools/game/limits.mjs <dir>`: mide con `fieldFits` en Node la capacidad de
cada campo (mínimo entre sus huecos) y aplica la regla de 3.1. El build y el MCP lo usan;
`tools/limits.cjs` y `tools/apply-limits.py` quedan marcados como obsoletos en su cabecera.
*Aceptación:* para `final3`, ningún límite calculado supera el `cap`, y el informe lista los
campos cuyo `cap` no cabe.

**T3.2 Validación cruzada.** Códigos `[CODIGO]` del PDF del artista (salida de `extract.py`)
contra `fields`; campos que no salen en ninguna página (aviso); ejemplos dentro de su límite;
`params` de cada mecánica contra su esquema; `solutions` obligatorias con `--publish`.
*Aceptación:* un caso de prueba por regla en `tools/qa/fixtures/games/`.

**T3.3 Prueba de humo genérica.** `tools/qa/game-smoke.py --game <dir>`: compone cada ejemplo y
además valores generados (corto: 1 carácter; largo: el límite, con letras anchas «W»). Falla si
hay excepción o aviso «encogido fuerte». *Aceptación:* pasa con `final3`.

### M4 · Kit de arte

**T4.1 Manifiesto y guía.** `assets/kit/manifest.json` (contrato 3.4) y `GUIA-KIT.md` para los
artistas: una pieza por PDF de una página, miniatura PNG, nombres en minúsculas con guiones.

**T4.2 Fondo por capas.** El motor admite `background: { "kind": "layers" }` por página: dibuja
las piezas con `embedPdf` en su posición, tamaño y ángulo sobre una página en blanco del tamaño
del juego. *Aceptación:* dorada 96/96 (final3 sigue en `kind: "pdf"`) y una página de prueba con
tres piezas comparada con su PNG de referencia.

**T4.3 Kit inicial.** Mientras los artistas preparan piezas reales, genera 6 piezas de prueba
(rectángulos con textura plana) para poder desarrollar el editor. Las reales las sustituyen sin
cambiar código.

### M5 · Editor web

Cada tarea añade su prueba de Playwright en `tools/qa/creator-*.py`.

**T5.1 Esqueleto.** `creator/serve.mjs` y `creator/index.html`: abrir y guardar `game.json`
(selector de archivo y descarga), lista de páginas.

**T5.2 Lienzo.** Página A4 con sus capas (miniaturas) y sus huecos (rectángulos con el código
del campo). Seleccionar, mover y redimensionar con el ratón; panel de propiedades del hueco
(fuente, tamaño, alineación, color, ángulo, `wrap`); deshacer.
*Aceptación:* mover un hueco 10 px y guardar cambia solo su `x` en el JSON.

**T5.3 Formulario.** Editor de secciones y campos: preguntas por idioma, tipo, tope, opciones.

**T5.4 Mecánicas.** Panel con el registro; el formulario de `params` se genera desde su esquema.

**T5.5 Vista previa y validación.** Botón que compone un ejemplo con el motor en el navegador y
lo muestra; botón que valida y lista errores con enlace al elemento.

**Revisión humana:** usabilidad, con alguien del cliente.

### M6 · Servidor MCP

**T6.1 Servidor.** `mcp/server.mjs` por stdio con las herramientas del contrato 3.3, apoyado
en `tools/game/*.mjs`. **T6.2 Marca de agua:** opción `watermark` del motor para
`render_preview`. **T6.3 Registro y prueba:** `.mcp.json` en la raíz con el servidor en ámbito
de proyecto, y `mcp/test-client.mjs`, que arranca el servidor y llama a cada herramienta.
*Aceptación:* `node mcp/test-client.mjs` crea un juego de 2 páginas, lo valida en modo borrador
sin errores y produce su vista previa.

Formato de `.mcp.json` (documentado por Claude Code; los servidores de proyecto piden
aprobación la primera vez):

```json
{ "mcpServers": { "printmyescape": { "type": "stdio", "command": "node", "args": ["mcp/server.mjs"] } } }
```

### M7 · Skill

**T7.1 Skill.** `.claude/skills/crear-escape-room/SKILL.md` con `name` y `description` en el
encabezado YAML y, en `reference/`, el resumen del formato, el catálogo de mecánicas (generado
desde el registro), las reglas de contenido y la lista de comprobación. El flujo que debe
seguir Claude:

1. Pedir el encargo: tema, edad, jugadores, duración, páginas, idiomas y qué se personaliza.
2. Elegir mecánicas **solo del catálogo** (`list_mechanics`); si hace falta otra, apuntarla como
   «mecánica nueva a presupuestar» y no inventarla.
3. Escribir la historia y cada puzzle **con su solución** (`set_solutions`).
4. Crear el juego y maquetar las páginas con el kit (`create_game`, `set_page`, `upsert_slot`).
5. Definir campos y secciones con sus topes; tres ejemplos (corto, normal, largo).
6. `measure_limits`, `validate_game` y `render_preview`; mirar los PNG y corregir.
7. Entregar un resumen: qué falta de arte, qué mecánicas nuevas, qué hay que jugar a mano.

Reglas fijas del skill: nada de marcas reales en los textos ni en los ejemplos sin permiso;
contenido apto para la edad declarada; nunca rebajar un tope por debajo de lo que pide el
encargo sin decirlo.

**T7.2 Ensayo.** En una sesión limpia de Claude Code, crear un juego de 4 páginas **sin
sospechosos** y con una mecánica distinta. Anotar cada tropiezo y corregir el texto del skill.

### M8 · Piloto y entrega al cliente

**T8.1 Piloto** con el cliente, de principio a fin, y prueba de juego real.
**T8.2 Paquete:** empaquetar skill y servidor MCP como plugin de Claude Code siguiendo la
documentación oficial de plugins vigente, con instrucciones de instalación para el cliente.

## 5. Revisiones humanas

| Después de | Qué se revisa | Por qué |
| --- | --- | --- |
| M0 | Esquema y migración | Todo lo demás se apoya en el formato |
| M2 | Motor sin lógica de juego | Es el código más delicado; un error cambia todos los PDF |
| M5 | Editor | Lo usará el cliente; la usabilidad no se prueba con Playwright |
| M7 | Skill y ensayo | Es lo que decide si el cliente obtiene juegos que encajan |

## 6. Riesgos y límites

- **El arte sigue siendo el cuello de botella.** Con el kit se hacen maquetas presentables; un
  juego vendible suele necesitar arte propio. El creador acorta ese trabajo, no lo elimina.
- **Mecánicas nuevas.** Si cada juego del cliente inventa una, el coste por juego no baja. El
  skill las detecta y las aparta para presupuestarlas.
- **Calidad de los puzzles.** La herramienta comprueba que las soluciones existen y que los
  valores caben; no sabe si un puzzle es divertido o justo. Prueba de juego obligatoria.
- **Propiedad del arte.** El kit sale de nuestros artistas. Al dar el creador al cliente, hay
  que fijar la licencia de uso. La vista previa lleva marca de agua y el PDF final se genera en
  nuestro servidor (fase de venta del plan general).
- **Hasta dónde llega Haiku.** M0, M1, M3, M5 y M6 son tareas bien acotadas con pruebas claras.
  M2 (refactorizar el motor) y el diseño del formato son delicados: por eso los contratos ya
  están fijados aquí y hay revisión humana después de M0 y M2.
