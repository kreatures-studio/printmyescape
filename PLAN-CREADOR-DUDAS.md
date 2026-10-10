# Dudas del plan del creador

Registro de decisiones tomadas al implementar `PLAN-CREADOR.md` (lo escribe quien implementa).

## Rama de M0

- El plan pide la rama `creador/m0`, pero ya existe la rama `creador`, y git no permite
  `creador/m0` junto a `creador`. Se usa **`creador-m0`**. Las siguientes ramas de hito serán
  `creador-m1`, `creador-m2`, etc.

## T0.1

- `schema/pme-game-1.schema.json` no impone idiomas concretos en `q`, `desc` ni `options`: así
  `roto.json` pasa el esquema y lo rechaza la validación cruzada de T0.3 («cada pregunta tiene
  todos los idiomas» y «cada campo de una sección existe»), como pide la aceptación.
- `background` acepta `pdf` (fondo del juego) o `layers` (piezas del kit). El contrato 3.1 solo
  muestra `layers` para páginas nuevas; se deja también a nivel de juego para no bloquear M4.
- Verificado con Python `jsonschema` (Draft 2020-12). El ajv instalado en esta máquina es 6.x y no
  sirve para 2020-12. T0.3 instala `ajv` 8 en `tools/` (usar `ajv/dist/2020`).

## T0.3 (validación)

- Añadidos al esquema dos claves opcionales que el contrato 3.1 no lista, porque la demo las
  necesita para reproducir el formulario actual:
  - `mechanics[].derives`: campos que calcula una mecánica (el contrato dice que los declara la
    mecánica; aquí queda escrito).
  - `fields[].ej`: ejemplo de respuesta que la demo muestra en cursiva, aparte de `desc`.
    Fundirlo con `desc` cambiaría la pantalla.
- `validate.mjs` no comprueba que los ficheros referenciados (`background.file`) existan; eso
  llega con el CLI de M1/T1.x.

## T0.4 (migración de final3)

- `games/final3/game.json` se genera con `tools/game/migrate-final3.mjs`; no se edita a mano.
- Reglas copiadas de la demo (`mkField`, `isRequiredField`): tipo, requerido y cap
  (`LIMITS[campo] || q.max || tope de plantilla || 70`).
- `status`: `borrador`. El juego actual está en revisión con el estudio; pasar a
  `en-produccion` es decisión humana.
- `background.file` = `../../Final3-Clean.pdf`: relativo a la carpeta del juego. Hoy el PDF
  está en la raíz del repositorio, igual que pide `build-demo.py --bg`.
- `template` se copia tal cual. Sus `pages[].background` son rutas relativas a
  `templates/final3/` y no se han reescrito: hace falta resolverlas al mover el juego (M2).
- `OTRO` se añade como campo (`otherField` de DEBILIDAD); su etiqueta («Otro»/«Other») viene
  de la tabla de revisión de la demo, no del volcado.
- Mecánicas declaradas (`ticks` p4, `nombre-alias` p4, `inicial-app` p16) pero el motor sigue
  con su código propio hasta M2. Las runas de p10 (S2_SECRET_LOVE) no se declaran aún: van en M2.
- Ejemplos: 3 (es y en juntos); los seis de la demo son 3 pares.
- Solución `tiras-p9`: la tira mezclada de la página 9 (`shuffle`) con TEST_LUGAR y
  TEST_RESULTADO. Es la misma que el ejemplo del contrato 3.1; el texto en inglés es nuestra
  traducción y el artista debe revisarlo.

## T0.5 (CLI y prueba dorada)

- Rutas de ficheros dentro de un juego (fondo y fotos de ejemplo): **relativas a la carpeta del
  juego**. El CLI antiguo (`--tpl`, `--bg`, `--photos-file`) sigue usando la raíz del repositorio.
- `tools/compose.js` carga `tools/game/load.mjs` con `import()` dinámico (un CJS no puede
  importar ESM de forma síncrona en todas las versiones).
- `tools/qa/golden.py`: 96/96 páginas idénticas a 60 ppp. Comprobado también con una copia del
  juego con un nombre cambiado: 4 páginas dejan de coincidir y el script termina con código 1.
- `tools/qa/salida-golden/` añadido a `.gitignore`.
- El `--tpl` antiguo y `--game` dan el mismo texto para el ejemplo 1 (`pdftotext`).
- Pendiente para M2: el motor todavía tiene dentro los casos de p4, p10 y p16 (ticks, runas,
  inicial de la app) y los campos NOMBRE_CUMPLE_FICHA / S8_ICON_N. Las mecánicas ya están
  declaradas en el juego, pero el motor las ignora.

## Revisión de M0 (antes de M2)

Lo que se revisó: el esquema contra el contrato 3.1, el validador con errores a propósito y la
migración contra la demo.

Corregido en esta revisión:
- El validador dejaba pasar un `nameField`/`photoField` fuera de los campos de su sección.
  Ahora da error.
- Un `texts.page` que no existe pasaba. El motor usa el número como índice (`pi + 1`), así que
  la comprobación es «entre 1 y el número de páginas».
- El esquema dejaba `options` en campos que no son choice/multi, `allowOther`/`otherField` fuera
  de multi, `min`/`max` fuera de number y `cap` en fotos. Ahora cada caso falla con error de esquema.
  Los mensajes de ajv dicen «must NOT be valid»: son poco claros, pero el fallo sí se señala.
- Seis casos a propósito, todos detectados: nombre fuera de la sección, página 99, opciones en
  number, cap en foto, min en texto, allowOther en texto. Los juegos buenos (minimo, final3) pasan.

Comprobado sin cambios:
- La migración reproduce `games/final3/game.json` byte a byte.
- Todas las páginas tienen textos y todos los textos apuntan a una página existente.

Pendiente (no bloquea M2):
- El validador no comprueba que existan los ficheros (`background.file`, fotos de ejemplo). Va
  con T3.2. Hay que decidir antes qué hacer con `minimo.json`, que apunta a `fondo.pdf`, inexistente.
- La solución `tiras-p9` es una propuesta nuestra: el artista debe confirmar la descripción y la
  traducción al inglés.
- `games/final3/_dump.json` ya no lo lee la demo (desde T1.1). Sigue siendo la fuente de la
  migración, así que se conserva como registro del formulario anterior.
- `status` de final3 queda en `borrador`: pasar a `en-produccion` es decisión humana.

## T1.1 (la demo se construye desde el juego)

- `build-demo.py` lee `--game` (por defecto `games/final3`). `--tpl` y `--bg` desaparecen: la
  plantilla, los textos, los idiomas, el fondo y las fotos de muestra salen del juego.
- `demo/src.html`: `formFromGame(game)` construye `Q`, `SECDEF`, `LIMITS`, `WEAK` y los ejemplos.
  Los literales a mano (`EJEMPLO*`, `WEAK`, `Q`, `SUS_EXTRA`, `SECDEF`, `LIMITS`) se borraron
  en este commit, porque el juego los reemplaza: `SUS_EXTRA` ya no existe.
- Comprobación de equivalencia (no se commitea): la demo anterior y la nueva dan lo mismo en
  `SECDEF`, `LIMITS`, `WEAK`, los seis ejemplos, las secciones y `mkField` de todos los campos
  del formulario. En `Q` solo cambian entradas vacías (`desc: ''`, `long: 0`), `req` (sin uso) y
  `Q.max` (que `mkField` no lee: usa `LIMITS` primero), y aparece `OTRO`, que ninguna sección muestra.
- Tamaño de `demo/index.html`: 7,4 → 7,5 MB, porque el juego se incrusta además de la plantilla
  y los textos. Se puede quitar la duplicación en un paso posterior.
- Pruebas: E2E 30/30, límites 26/26, paridad 96/96, dorada 96/96.

## T1.2 (constantes sin uso)

- `grep -c "SUS_EXTRA = {" demo/src.html` da 0 desde T1.1.
- Recuento de referencias de todos los nombres de nivel superior de `demo/src.html` (266):
  ninguno aparece solo en su definición. `fitsOptions` y la rama de `DEBILIDAD` en `checkValue`
  sí se usan (el clic de las píldoras y la comprobación de la revisión), así que no se tocan.
- Sin cambios de código: las mismas pruebas de T1.1 siguen valiendo porque el build no cambia.

## T1.3 (choice y multi con las opciones del campo; WEAK desaparece)

- `WEAK` ya no existe. Las opciones viven en cada campo `multi`/`choice`; `translateOptions(q, v,
  to)` traduce cualquiera de los dos al cambiar de idioma. `Q[fid].other` marca el campo donde
  se guarda el «Otro» (el `otherField` del juego). `checkValue`, `textProblems`, `trimStored` y
  `collectMulti` dejan de depender del nombre `DEBILIDAD`.
- Nuevo control `choice` (píldoras de elección única; se guarda el texto de la opción en el idioma
  activo y pasa por `readControl`). Obligatorio como un texto.
- Tipo `photo` del juego: la demo lo reconoce aunque la plantilla no lo marque como `image`.
- `name` se trata igual que `text` (la demo nunca tuvo un control aparte para el nombre). Sin
  cambio de comportamiento para final3.
- Prueba: `tools/qa/tipos-demo.py` con `tools/qa/fixtures/games/tipos/` (un campo de cada tipo,
  3 ejemplos, la misma foto sintética). Recorre el formulario entero, cambia a inglés a mitad,
  genera el PDF y comprueba el texto. 7/7.
- Pendiente, no tocado aquí: la tabla `SHORT` de etiquetas de la revisión sigue escrita en la
  demo. Un campo sin entrada en `SHORT` aparece en la revisión con su identificador. El juego
  debería traer esa etiqueta (decisión para M2 o M5).
- Equivalencia con la demo anterior en final3: sin diferencias de valor en `SECDEF`, `LIMITS`,
  ejemplos, secciones ni descriptores de campo; solo aparecen las opciones y el «Otro» de DEBILIDAD.
