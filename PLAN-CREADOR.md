# Plan: creador de escape rooms (para implementar con Haiku)

Estado: propuesta · 2026-10-10 · Base: rama `studio/artista` (commit `6564314`)
Decisión tomada: **opción B (herramienta alojada por nosotros)**, empezando en **GitHub Pages**
con **arte de stock** para las pruebas.

## 0. Resumen

Una herramienta web para crear escape rooms nuevos. El cliente la usa de dos formas, que trabajan
**sobre el mismo juego**:

- **A mano**, en el navegador.
- **Con Claude Code**, conectado por MCP y con un skill que le enseña las reglas.

Cuando el juego está listo, el cliente pulsa «Enviar al estudio» y nosotros hacemos el arte que
falte, programamos alguna mecánica si hace falta y lo revisamos.

GitHub Pages solo sirve archivos estáticos: no guarda juegos, no tiene cuentas y no puede alojar un
servidor MCP. Por eso hay dos fases con las mismas piezas:

| | Fase 1: pruebas (este plan, M0–M8) | Fase 2: producción (M9) |
| --- | --- | --- |
| Editor web | En GitHub Pages | En nuestro servidor |
| Dónde se guardan los juegos | Un repositorio de GitHub (una rama por juego) | Base de datos propia |
| Cuentas | Cuentas de GitHub | Cuentas propias |
| Claude Code | MCP local (stdio) sobre una copia del repositorio; comparte cambios con `git push` | MCP remoto por HTTP (Claude Code lo admite con `claude mcp add --transport http <nombre> <url>`, con OAuth o token) |
| Arte | Solo arte de stock CC0 (Pages es público) | Arte propio, privado; la vista previa lleva marca de agua |
| Entrega al estudio | Estado del juego + pull request | Estado del juego + aviso en nuestro panel |

Lo que no cambia entre fases: el formato del juego, el motor, las mecánicas, el validador, el editor
y la lista de herramientas MCP. Solo cambian el **almacén** (contrato 3.5) y el transporte del MCP.

## 1. Reglas para quien implementa (Haiku)

1. **Una tarea por sesión.** Lee solo la tarea, los contratos que cita y los archivos que lista.
2. **Los contratos de la sección 3 no se cambian.** Si una tarea no se puede hacer sin cambiarlos,
   para y escribe en `PLAN-CREADOR-DUDAS.md` qué cambiarías y por qué.
3. **Cada tarea termina con su comprobación** («Aceptación»). Si falla dos veces seguidas, para y
   deja el error en `PLAN-CREADOR-DUDAS.md`. No relajes una prueba para que pase.
4. **La prueba dorada manda** (`tools/qa/golden.py`, T0.5): desde M0, ningún cambio puede alterar
   un píxel de los PDF de ejemplo del juego actual, salvo que la tarea lo diga.
5. **Rama por hito:** `creador/m0`, `creador/m1`... desde `creador`. Un commit por tarea, con el
   identificador delante: `T1.2: quitar constantes del formulario`.
6. **Sin dependencias nuevas** salvo las de la sección 2. Nada de frameworks ni empaquetadores.
7. **No edites archivos generados** (`demo/index.html`, `docs/`, `games/*/build/`).
8. **Seguridad:** nunca escribas un token, una contraseña ni una clave en el código, en un commit
   ni en el sitio de Pages. Todo lo que va a Pages es público.
9. `tools/node_modules` tiene que existir (`npm install --prefix tools`). No lo subas a git.
10. Ante una ambigüedad, elige lo más simple que cumpla la aceptación y anótalo en el commit.

## 2. Arquitectura

### Fase 1

```
Navegador del cliente ── GitHub Pages: editor + motor + mecánicas + kit de stock
        │  API REST de GitHub (token del cliente, solo en la pestaña)
        ▼
Repositorio de juegos (privado): games/<id>/game.json, una rama juego/<id> por juego
        ▲
        │  git pull / git push
Copia local del repositorio ── Claude Code + skill + MCP local (stdio)
```

Los dos caminos escriben en la misma rama. El editor comprueba cada 15 segundos si la rama ha
cambiado y ofrece recargar.

### Directorios (repositorio de código)

```
games/<id>/game.json            (solo ejemplos y pruebas; los juegos reales van al repo de juegos)
assets/kit/manifest.json         catálogo de piezas de arte (contrato 3.4)
assets/kit/<categoria>/*         piezas (PDF o PNG) + miniatura + LICENCIAS.md
schema/pme-game-1.schema.json    JSON Schema del juego
mechanics/index.js               registro de mecánicas (contrato 3.2)
mechanics/<tipo>.js              una mecánica por archivo
tools/pme-compose-core.js        motor: ya no conoce campos ni páginas concretas
tools/game/*.mjs                 cargar, validar, migrar, medir límites (Node)
tools/compose.js                 CLI, ahora con --game
tools/build-demo.py              ahora con --game
tools/build-creator.py           copia el editor y sus recursos a docs/creador/
creator/                         editor web (HTML, CSS, JS en módulos; sin framework)
creator/store/github.js          almacén GitHub (contrato 3.5)
mcp/server.mjs                   servidor MCP (stdio en fase 1)
mcp/store-fs.mjs                 almacén de archivos para el MCP local
.mcp.json                        registro del servidor para Claude Code (ámbito proyecto)
.claude/skills/crear-escape-room/SKILL.md   el skill
```

### Tecnologías fijadas

- **Node 22** para herramientas y MCP; código nuevo de Node en `.mjs`. El motor sigue siendo un
  script clásico que rellena `globalThis.PMECompose`; desde `.mjs` se carga con un `import` de
  efecto tras poner pdf-lib y fontkit en `globalThis`, como hace `tools/compose.js`.
- **Dependencias nuevas permitidas** (en `tools/package.json`): `ajv` 8 y
  `@modelcontextprotocol/sdk` 1.x (en npm, la 1.32.1 a 2026-10-10). Si la API instalada no
  coincide con este plan, sigue el README del paquete y anótalo.
- **Navegador:** módulos ES. En local, `creator/serve.mjs` (servidor estático con `node:http`,
  porque `file://` no permite importar módulos); en Pages, `docs/creador/`.
- **API de GitHub desde el navegador:** `fetch` contra `https://api.github.com` con la cabecera
  `Authorization: Bearer <token>`. Sin librerías.
- **Pruebas:** Python con Playwright, como las actuales (`tools/qa/`).

## 3. Contratos (fijos: no los cambia Haiku)

### 3.1 Formato del juego: `game.json` (`"schema": "pme-game/1"`)

La migración del juego actual es casi una copia: `template`, `texts` e `i18n` son literalmente los
archivos de `templates/final3/`.

```json
{
  "schema": "pme-game/1",
  "id": "final3",
  "version": "1.0.0",
  "status": "borrador",
  "name": { "es": "La fiesta robada", "en": "The stolen party" },
  "languages": ["es", "en"],
  "background": { "kind": "pdf", "file": "Final3-Clean.pdf" },
  "template": { "...": "contenido de templates/final3/template.json" },
  "texts": [ "...contenido de templates/final3/texts.json..." ],
  "i18n": { "es": { "clave": "texto" }, "en": { "clave": "text" } },
  "fields": {
    "NOMBRE_1": { "type": "name", "required": true, "cap": 12, "q": { "es": "Nombre", "en": "Name" } },
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
  "form": { "sections": [
    { "id": "s1", "title": { "es": "Sospechoso 1", "en": "Suspect 1" }, "hint": { "es": "…", "en": "…" },
      "nameField": "NOMBRE_1", "photoField": "FOTO_1",
      "fields": ["NOMBRE_1", "APODO_1", "FOTO_1", "S1_HIDEA", "S1_HIDEB", "TEST_LUGAR", "TEST_RESULTADO"] }
  ] },
  "mechanics": [
    { "type": "ticks", "page": "p4", "params": { "field": "DEBILIDAD", "half": 0.6, "boxes": [ { "x": 9.95, "y": 55.86 } ] } }
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

Reglas:

- `fields[*].type`: `name` | `text` | `long` | `number` | `photo` | `choice` | `multi`.
- `cap` = tope de producto en caracteres. El límite real es `min(cap, capacidad × 0,75)`
  (nombres: `min(cap, capacidad)`); lo calcula el build, nunca se escribe a mano.
- Un campo derivado por una mecánica no está en `fields`; lo declara su mecánica.
- Todo texto visible tiene versión en cada idioma de `languages`.
- `solutions` es obligatorio para enviar al estudio (contrato 3.6).
- Una página nueva usa `"background": { "kind": "layers", "layers": [...] }` con piezas del kit.

### 3.2 Interfaz de una mecánica (`mechanics/<tipo>.js`)

Script clásico, como el motor; se registra en `globalThis.PMEMechanics`:

```js
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});
  M.ticks = {
    type: 'ticks',
    label: { es: 'Casillas marcadas', en: 'Ticked boxes' },
    params: { type: 'object', required: ['field', 'boxes'], properties: { /* JSON Schema */ } },
    derive(values, params, lang) { return {}; },   // valores derivados antes de dibujar
    drawPage(ctx, params) { },                      // ctx = { page, PW, PH, rgb, values, lang }
    validate(game, params) { return []; },          // [{ path, message }]
  };
})();
```

Mecánicas que salen del juego actual (M2): `ticks` (casillas, p4), `initial` (icono con la inicial
de la app), `join` (nombre + alias en la ficha), `prefix` (la coma del apodo), `runes-panel` (fondo
de la nota cifrada, p10) y `strips` (hoja de tiras, hoy `template.shuffle`). Las runas pasan a ser
una propiedad del hueco: `"transform": "runes"`, con el prefijo por idioma en `params`.

### 3.3 Herramientas del servidor MCP

Trabajan a través del almacén (3.5). Las que modifican: validan antes de guardar, rechazan un
estado inválido y se niegan si el juego no está en `borrador` (3.6).

| Herramienta | Entrada | Salida |
| --- | --- | --- |
| `list_games` | — | `[{ id, name, version, status }]` |
| `get_game` | `id`, `part` (`summary` \| `form` \| `fields` \| `pages` \| `mechanics` \| `full`) | JSON de esa parte |
| `create_game` | `id`, `name`, `languages`, `pages` (número) | juego vacío en `borrador` |
| `list_assets` | `tag?` | piezas del kit (3.4) |
| `list_mechanics` | — | `[{ type, label, params }]` |
| `set_page` | `id`, `page`, `layers` | página con sus capas de arte |
| `upsert_slot` / `remove_slot` | `id`, `page`, `slot` | hueco creado o cambiado |
| `upsert_field` / `remove_field` | `id`, `field`, `def` | campo creado o cambiado |
| `set_sections` | `id`, `sections` | secciones del formulario |
| `upsert_mechanic` / `remove_mechanic` | `id`, `mechanic` | mecánica configurada |
| `set_texts` | `id`, `lang`, `entries` | textos fijos e i18n |
| `set_example` | `id`, `example` | ejemplo guardado |
| `set_solutions` | `id`, `solutions` | soluciones guardadas |
| `validate_game` | `id`, `mode` (`draft` \| `submit`) | `{ errors, warnings }` |
| `measure_limits` | `id` | capacidad y límite de cada campo |
| `render_preview` | `id`, `lang`, `example`, `pages?` | rutas a un PDF y a PNG por página, con marca de agua «BORRADOR» |
| `sync` | `id`, `direction` (`pull` \| `push`), `message?` | resultado de git; si hay conflicto, para y lo explica |
| `submit_to_studio` | `id`, `note` | valida en modo `submit`, cambia a `enviado` y abre el pull request |

### 3.4 Kit de arte (`assets/kit/manifest.json`)

```json
{ "pieces": [
  { "id": "papel-viejo-1", "file": "papel/papel-viejo-1.png", "thumb": "papel/papel-viejo-1.thumb.png",
    "kind": "background", "widthMm": 210, "heightMm": 297, "tags": ["papel", "fondo"],
    "license": "CC0-1.0", "source": "https://polyhaven.com/…", "author": "Poly Haven",
    "slots": [ { "role": "text", "x": 10, "y": 12, "w": 80, "h": 70 } ] }
] }
```

- `file`: un **PDF de una página** (vector, se incrusta con `embedPdf` de pdf-lib) o un **PNG** a
  300 ppp (`embedPng`). Miniatura PNG de 300 px de ancho para el editor.
- `kind`: `background` | `frame` | `photo-frame` | `decor` | `icon`.
- `license`, `source` y `author` son **obligatorios**. En fase 1 solo se admite `CC0-1.0`; el
  validador rechaza cualquier otra. Fuentes CC0 comprobadas a 2026-10-10:
  [Poly Haven](https://polyhaven.com/license) (texturas: papel, madera, metal) y
  [Kenney](https://kenney.nl/support) (iconos e interfaz; sin usar su logotipo).
- `slots` (opcional): zonas útiles de la pieza en %, para que el editor sugiera huecos.

### 3.5 Almacén (una interfaz, tres implementaciones)

```js
// Todas las funciones devuelven promesas.
store.list()                          // → [{ id, name, version, status }]
store.load(id)                        // → { game, rev }   rev = versión leída (sha en GitHub)
store.save(id, game, rev, message)    // → { rev }  o error { code: 'conflict' } si rev no es la última
store.history(id)                     // → [{ rev, date, author, message }]
store.submit(id, note)                // → { url }  (fase 1: URL del pull request)
store.latestRev(id)                   // → rev actual, para avisar de cambios ajenos
```

| Implementación | Dónde | Cómo guarda |
| --- | --- | --- |
| `store-github` (editor en Pages) | navegador | API REST de GitHub: leer y escribir `games/<id>/game.json` en la rama `juego/<id>` del repositorio de juegos, con el `sha` como `rev`; `submit` abre un pull request hacia `main` |
| `store-fs` (MCP local) | Node | archivos de la copia local; `rev` = hash del archivo; `sync` hace `git pull --rebase` y `git push` |
| `store-api` (fase 2) | navegador y MCP remoto | API de nuestro servidor |

Reglas: `save` nunca pisa una versión más nueva (si `rev` no coincide, devuelve `conflict` y el editor
pide recargar). El token de GitHub vive solo en `sessionStorage` de la pestaña y se pide al entrar.

### 3.6 Estados del juego y entrega

```
borrador ──(submit_to_studio: validación en modo submit)──► enviado ──(estudio)──► en-produccion ──► publicado
   ▲                                                            │
   └──────────────────────(estudio lo devuelve con notas)────────┘
```

- Solo `borrador` se puede editar, por el cliente y por Claude.
- `enviado` exige: validación sin errores, `solutions` completas y tres ejemplos (corto, normal,
  largo) por idioma.
- En fase 1, el estado vive en `game.json` y el cambio a `enviado` abre el pull request; el estudio
  lo pasa a `en-produccion` al empezar a trabajar en él.

## 4. Hitos y tareas

### M0 · Formato de juego y migración del juego actual

**T0.1 Esquema.** `schema/pme-game-1.schema.json` (JSON Schema 2020-12) con el contrato 3.1, más
`schema/examples/minimo.json` (válido, 1 página, 1 campo) y `schema/examples/roto.json` (un campo
sin `q.en`; una sección que cita un campo inexistente). *Aceptación:* T0.3 valida el primero y
rechaza el segundo con esos dos errores.

**T0.2 Volcado del formulario actual.** `tools/game/dump-demo.py`: abre `demo/index.html` con
Playwright y guarda en `games/final3/_dump.json` las variables globales `Q`, `SECDEF`, `SUS_EXTRA`,
`LIMITS`, `WEAK`, `EJEMPLO`, `EJEMPLO2`, `EJEMPLO3`, `EJEMPLO_EN`, `EJEMPLO2_EN`, `EJEMPLO3_EN`
(son `var` de nivel superior: están en `window`). *Aceptación:* 9 secciones y 6 ejemplos.

**T0.3 Cargar y validar.** `tools/game/load.mjs` exporta `loadGame(dir)` y
`toEngineDeps(game, lang)` → `{ template, fixed, i18n, i18nAll }` como los usa `composeGame`.
`tools/game/validate.mjs <dir|archivo> [--submit]`: esquema con ajv más comprobaciones cruzadas
(cada campo de una sección existe; cada `slot.field` es un campo o un derivado de una mecánica;
cada pregunta tiene todos los idiomas). Código de salida 1 si hay errores.

**T0.4 Migración.** `tools/game/migrate-final3.mjs` construye `games/final3/game.json` desde
`templates/final3/*`, `_dump.json` y los `LIMITS` actuales como `cap`.
*Aceptación:* `node tools/game/validate.mjs games/final3` sin errores.

**T0.5 CLI y prueba dorada.** `tools/compose.js --game games/final3 --lang es --example 3 --out …`.
`tools/qa/golden.py` compone los 6 ejemplos desde `game.json` y los compara a 60 ppp con
`demo/ejemplos/*.pdf`. *Aceptación:* 96 de 96 páginas idénticas.

**Revisión humana:** esquema y migración.

### M1 · Formulario generado desde el juego

**T1.1** `build-demo.py --game games/final3` mete el juego en `PME_DEMO_DATA.game`; en
`demo/src.html`, `formFromGame(game)` construye las estructuras de hoy (`Q`, `SECDEF`, `LIMITS`,
`WEAK`, ejemplos). *Aceptación:* E2E 30/30, límites 26/26, paridad 96/96, dorada 96/96.

**T1.2** Quitar las constantes que ya no se usan. *Aceptación:* la misma, y
`grep -c "SUS_EXTRA = {" demo/src.html` da 0.

**T1.3** Tipos `choice` y `multi` con opciones del juego (desaparece `WEAK`).
*Aceptación:* la misma, más una prueba con un campo de cada tipo.

### M2 · Mecánicas fuera del motor

**T2.1** `mechanics/index.js` y `ticks`; el motor llama a `derive` y `drawPage`; se borran
`delitosMarcados` y `TICK_BOX` del motor. **T2.2** `initial`, `join`, `prefix` (un commit cada una).
**T2.3** Runas: `"transform": "runes"` y `runes-panel`. **T2.4** `template.shuffle` pasa a `strips`.
*Aceptación de cada una:* dorada 96/96.

**T2.5 Motor limpio.** Los tipos salen de `fields` (`number`, `name`, `long`): desaparecen la regla
`EDAD` y `NAME_RE` de `kindOf` y `cleanValues`; el motor recibe `deps.fieldTypes`.
*Aceptación:* dorada 96/96 y este comando no imprime nada:
`grep -nE "'p[0-9]+'|NOMBRE_|APODO_|S2_|S8_|DEBILIDAD|EDAD" tools/pme-compose-core.js`.

**Revisión humana (o con un modelo grande):** el motor es la pieza más delicada.

### M3 · Validador completo y límites

**T3.1** `tools/game/limits.mjs <dir>`: capacidad de cada campo con `fieldFits` en Node y la regla
de 3.1. `tools/limits.cjs` y `tools/apply-limits.py` quedan marcados como obsoletos.
*Aceptación:* en `final3`, ningún límite supera el `cap`; el informe lista los `cap` que no caben.

**T3.2** Validación cruzada: códigos `[CODIGO]` del PDF del artista contra `fields`; campos que no
salen en ninguna página (aviso); ejemplos dentro de su límite; `params` de cada mecánica contra su
esquema; licencias del kit (3.4); requisitos de `submit` (3.6).
*Aceptación:* un caso de prueba por regla en `tools/qa/fixtures/games/`.

**T3.3** `tools/qa/game-smoke.py --game <dir>`: compone cada ejemplo y valores generados (1 carácter
y el límite con «W»). Falla con excepción o aviso «encogido fuerte». *Aceptación:* pasa con `final3`.

### M4 · Kit de stock

**T4.1** `assets/kit/manifest.json` (3.4), `assets/kit/LICENCIAS.md` (una fila por pieza: id,
fuente, autor, licencia) y `GUIA-KIT.md` para los artistas.

**T4.2** Fondo por capas en el motor (`background.kind: "layers"`): piezas PDF con `embedPdf` y PNG
con `embedPng`, con posición, tamaño y ángulo. *Aceptación:* dorada 96/96 y una página de prueba
con tres piezas comparada con su PNG de referencia.

**T4.3 Kit inicial.** Unas 20 piezas CC0 descargadas de Poly Haven y Kenney: 4 fondos de papel, 4
marcos, 4 marcos de foto, 8 iconos o adornos. Miniaturas con `tools/kit/thumbs.mjs`.
*Aceptación:* el validador acepta el manifiesto y todas las licencias son `CC0-1.0`.

### M5 · Editor web en GitHub Pages

Cada tarea añade su prueba de Playwright en `tools/qa/creator-*.py`. Para las pruebas, el almacén
GitHub se sustituye por uno en memoria con la misma interfaz (`creator/store/memory.js`).

**T5.1 Esqueleto.** `creator/serve.mjs`, `creator/index.html`, lista de juegos y páginas.

**T5.2 Almacén GitHub.** `creator/store/github.js` (3.5): pantalla de entrada que pide el token
(guardado solo en `sessionStorage`), `list`, `load`, `save` con `sha` y error `conflict`,
`history`, `submit` (pull request), `latestRev`. *Aceptación:* pruebas con respuestas de la API
simuladas: guardado normal, conflicto y pull request.

**T5.3 Lienzo.** Página con sus capas y huecos; seleccionar, mover y redimensionar; panel de
propiedades del hueco; deshacer. *Aceptación:* mover un hueco y guardar cambia solo su `x`.

**T5.4 Kit.** Panel con las piezas del manifiesto (filtro por etiqueta); arrastrar una pieza a la
página añade una capa.

**T5.5 Formulario y mecánicas.** Editor de secciones y campos; panel de mecánicas con `params`
generado desde su esquema.

**T5.6 Vista previa, validación y entrega.** Componer un ejemplo en el navegador con marca de agua;
validar y listar errores con enlace al elemento; botón «Enviar al estudio» (3.6); aviso «hay cambios
nuevos: recargar» cuando `latestRev` cambia (consulta cada 15 s).

**T5.7 Publicación.** `tools/build-creator.py` copia el editor, el motor, las mecánicas y el kit a
`docs/creador/`. *Aceptación:* abrir `docs/creador/index.html` servido en local funciona igual.

**Revisión humana:** usabilidad con el cliente, y manejo del token.

### M6 · Servidor MCP (local, fase 1)

**T6.1** `mcp/server.mjs` por stdio con las herramientas de 3.3, sobre `mcp/store-fs.mjs` y
`tools/game/*.mjs`. **T6.2** Opción `watermark` del motor para `render_preview`. **T6.3** `sync` y
`submit_to_studio` (con `gh pr create` o la API REST; si no hay `gh`, explica qué falta).
**T6.4 Paquete para el repositorio de juegos.** El cliente trabaja en el repositorio de juegos, no
en el de código. `tools/build-mcp-bundle.py <ruta-repo-juegos>` copia a su carpeta `.pme/` el
servidor, el motor, las mecánicas, el esquema, el kit y el skill, con un `package.json` propio
(`npm install --prefix .pme`). En la raíz de ese repositorio quedan `.mcp.json` y
`.claude/skills/crear-escape-room/`.
**T6.5 Prueba.** `mcp/test-client.mjs` arranca el servidor y llama a cada herramienta.
*Aceptación:* sobre un repositorio de juegos de prueba, `node .pme/mcp/test-client.mjs` crea un
juego de 2 páginas con piezas del kit, lo valida en borrador sin errores y genera su vista previa.

```json
{ "mcpServers": { "printmyescape": { "type": "stdio", "command": "node", "args": [".pme/mcp/server.mjs"] } } }
```

### M7 · Skill

**T7.1** `.claude/skills/crear-escape-room/SKILL.md` (encabezado YAML con `name` y `description`) y
`reference/` con el formato, el catálogo de mecánicas (generado desde el registro), las reglas de
contenido y la lista de comprobación. Flujo que debe seguir Claude:

1. `sync pull` antes de empezar.
2. Pedir el encargo: tema, edad, jugadores, duración, páginas, idiomas y qué se personaliza.
3. Elegir mecánicas **solo del catálogo**; si hace falta otra, apuntarla como «mecánica nueva a
   presupuestar» y no inventarla.
4. Escribir la historia y cada puzzle **con su solución**.
5. Crear el juego y maquetar las páginas con el kit.
6. Campos y secciones con sus topes; tres ejemplos (corto, normal, largo) por idioma.
7. `measure_limits`, `validate_game` y `render_preview`; mirar los PNG y corregir.
8. `sync push` con un mensaje claro, cada vez que termina un bloque de cambios.
9. Resumen final: qué arte falta, qué mecánicas nuevas, qué hay que jugar a mano. Solo si el
   cliente lo pide, `submit_to_studio`.

Reglas fijas: nada de marcas reales sin permiso; contenido apto para la edad declarada; nunca
rebajar un tope por debajo de lo que pide el encargo sin decirlo.

**T7.2 Ensayo.** En una sesión limpia de Claude Code, crear un juego de 4 páginas **sin
sospechosos** y con otra mecánica, mientras otra persona edita el mismo juego en el editor de
Pages. Anotar cada tropiezo (incluidos conflictos) y corregir el skill.

### M8 · Piloto con el cliente

**T8.1** Un juego real de principio a fin en fase 1, con arte de stock, y prueba de juego.
**T8.2** Empaquetar skill y servidor MCP como plugin de Claude Code siguiendo la documentación
oficial vigente, con instrucciones de instalación para el cliente.

### M9 · Fase 2: servidor propio (fuera del alcance de Haiku sin revisión)

Servidor con cuentas, base de datos (`store-api`), MCP remoto por HTTP con OAuth, arte privado,
vista previa con marca de agua y generación del PDF final para la venta. Se planifica aparte
cuando M8 haya terminado; seguridad y datos personales (fotos) requieren revisión experta.

## 5. Revisiones humanas

| Después de | Qué se revisa | Por qué |
| --- | --- | --- |
| M0 | Esquema y migración | Todo se apoya en el formato |
| M2 | Motor sin lógica de juego | Un error cambia todos los PDF |
| M5 | Editor y manejo del token | Lo usa el cliente; el token da acceso al repositorio |
| M7 | Skill y ensayo | Decide si los juegos del cliente encajan |
| M9 | Todo el servidor | Cuentas, pagos y datos personales |

## 6. Riesgos y límites de la fase 1

- **GitHub Pages es público.** Salvo con GitHub Enterprise Cloud, cualquiera con la URL ve el editor,
  el motor y el kit ([docs](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)).
  Por eso en fase 1 solo hay arte CC0. El arte de los artistas no se sube a Pages.
- **Plan de GitHub.** Con GitHub Free, Pages solo funciona desde repositorios públicos; con Pro, Team
  o Enterprise también desde privados ([docs](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)).
  Hay que confirmar el plan de `kreatures-studio`.
- **El token en el navegador.** Debe ser un token de grano fino limitado al repositorio de juegos,
  con permiso de contenidos y pull requests, y caducidad corta. Es aceptable para pruebas con un
  cliente; no para venta.
- **Conflictos.** Si el cliente y Claude cambian el juego a la vez, uno de los dos tendrá que
  recargar. El almacén nunca pisa cambios ajenos.
- **El cliente necesita cuenta de GitHub** y, para Claude Code, saber clonar el repositorio. Es
  asumible en pruebas; en fase 2 desaparece.
- **El arte sigue siendo el cuello de botella**, y la calidad de los puzzles necesita prueba de
  juego humana, como en el plan general.

## 7. Decisiones abiertas

- **Repositorio de juegos aparte** (recomendado): `kreatures-studio/pme-juegos`, privado. El cliente
  solo tiene acceso a ese repositorio, no al código.
- **Plan de GitHub** de la organización (ver riesgos).
- **Quién pasa un juego a `en-produccion`** y cómo se avisa al cliente de que se lo devolvemos.
