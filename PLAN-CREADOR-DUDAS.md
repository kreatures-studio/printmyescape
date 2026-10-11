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

## Solución «tiras-p9» (verificada por el validador)

- El validador comprueba que la hoja de tiras (`template.shuffle`) apunta a una página existente y
  que `perm` es una permutación de `0..strips-1`.
- Cada campo de la solución tiene que tener un hueco en su página, y si la página es la de la
  hoja, el hueco tiene que estar dentro de ella. `tiras-p9` cumple las tres comprobaciones.
- Cinco casos a propósito, todos detectados.
- La redacción en español y en inglés sigue siendo nuestra y la confirma el artista.
- Las etiquetas cortas de la revisión (`SHORT`) pasan a M2, como acordado.

## T2.1 (las casillas marcadas salen del motor: mecánica «ticks»)

- Mecánicas en `mechanics/`: un fichero por mecánica que se registra en `globalThis.PMEMechanics`.
  `mechanics/index.js` las carga en Node (CLI y pruebas); `tools/build-demo.py` las pega delante
  del motor en la demo, así que la misma carpeta sirve a los dos.
- `mechanics/ticks.js` (capa `over`): dibuja las X de las casillas según las opciones del campo
  `multi` indicado en `params.field`. `Otro` es la última casilla si el campo admite «Otro».
  Valida que el número de casillas coincide con las opciones (+1 con «Otro»).
- Motor: se borran `TICK_BOX`, `TICK_HALF`, `DELITOS` y `delitosMarcados`. Un despachador
  `correrMecanicas(pagina, capa, ...)` llama a las mecánicas del juego en cada página y capa. Recibe
  `{page, PW, PH, rgb, values, lang, fields}`.
- Mecánicas del juego que todavía no tienen implementación (`nombre-alias`, `inicial-app`): el
  motor avisa y no las ejecuta. Siguen resueltas en el motor hasta T2.2. T2.5 lo convierte en error.
- El juego llega al motor por `game.mechanics` y `game.fields` (`toEngineDeps`, `compose.js`,
  `src.html`). `--photos-file` se resuelve desde la raíz del repo (como dice la ayuda de la CLI); las
  fotos del ejemplo, desde la carpeta del juego.
- `tools/qa/parity.py` usa `--game games/final3` en lugar de `--tpl`.
- Verificación: golden 96/96, e2e 30/30, límites 26/26, tipos 7/7; paridad navegador/CLI 96/96.

## T2.2 (join, initial, prefix: tres commits)

- Nombres de las mecánicas, como en el plan: `join`, `initial`, `prefix`. La migración y `game.json`
  usan esos nombres (antes `nombre-alias` e `inicial-app`).
- Cada mecánica con valores derivados define `derive(valores, params)`; el motor lo llama antes de
  dibujar y mezcla el resultado en `values`. Los campos derivados no están en `fields`; sí en
  `template.fields` (igual que antes) y en `derives` de la mecánica.
- `join`: `NOMBRE_CUMPLE_FICHA` = «Nombre "Alias"». Se borra la rama `S<n>_ALIAS` de `NOMBRE_<n>`:
  ningún ejemplo ni campo del juego tiene `S<n>_ALIAS` (solo `B_ALIAS`), así que era código muerto.
- `initial`: `params.map` (APP_n → S8_ICON_n). Misma regla: primer carácter alfanumérico en mayúscula.
- `prefix`: la coma del apodo pasa a los derivados `APODO_n.PREF`; los huecos de p1 apuntan a ellos.
  El reflow reconoce `APODO_n.PREF` como `APODO_n` (la pareja NOMBRE_n/APODO_n no cambia).
- La demo no comprueba los derivados en `textProblems` (igual que antes con la ficha y el icono).
  Es una pérdida pequeña: el ajuste del PDF sigue encogiendo el texto.
- `tools/game/validate.mjs` llama a `validate` de cada mecánica con su registro.
- Verificación al cerrar T2.2: golden 96/96, paridad 96/96, e2e 30/30, límites 26/26, tipos 7/7.

## T2.3 (runas: transformación del hueco y fondo de la nota)

- Transformación `runes` (`mechanics/runes.js`, registro `PMETransforms`): un hueco con
  `"transform": "runes"` y `"params": { "prefix": { "es", "en" } }`. Schema y validador lo comprueban.
  El texto de la nota se transforma en `valorHueco(s)`, que es el único punto donde se mira `transform`.
- Mecánica `runes-panel` (capa `under`, p10): `params` x, y, w, h en % y `color` como [r, g, b] en 0–1.
  El color va en flotante (no en hexadecimal) para que el píxel sea idéntico: `#D9C4A3` daría 217/255.
- Se borran `drawRunes`, `runeWrap`, `runeInfo` y las constantes de runas: no tenían llamadas. Quedan
  `pigpen|runes` como nombre de fuente, que es cosa del motor.
- Los huecos con `transform` no entran en grupos de reflow.

## T2.4 (hoja de tiras: template.shuffle pasa a la mecánica strips)

- `mechanics/strips.js`: capa `final`. El motor copia la página ya compuesta, la sustituye y la
  mecánica dibuja encima. Solo se copian las páginas con mecánicas `final`.
- `template.shuffle` desaparece del juego y del esquema. El validador avisa si aparece, y las
  comprobaciones de perm y de geometría (la solución `tiras-p9` dentro de la zona) usan los params
  de la mecánica.
- La CLI pierde el modo `--tpl`/`--bg` (era el único que no conocía las mecánicas: habría dado
  PDF sin casillas, sin tiras y sin runas). `--game` es obligatorio. `tools/README.md` actualizado.

## T2.5 (motor limpio: los tipos salen de fields)

- `kindOf(campo)` mira el tipo del campo en el juego (`fields`): `number` → num, `name` → name,
  `long` → long (conserva los saltos de línea), el resto → text. Un campo `multi` (DEBILIDAD) limpia
  cada opción por separado. Se borran `EDAD`, `NAME_RE`, `MULTI_KEYS`, `B_NOTES`/`B_INFO` y el caso
  `DEBILIDAD`. El plan hablaba de `deps.fieldTypes`; el motor ya recibe `deps.fields` (lo necesitan
  las mecánicas) y deriva los tipos de ahí, sin un segundo mapa.
- Para que los tipos digan lo mismo que antes: `APODO_*` y `B_ALIAS` pasan a tipo `name` (son
  nombres; en la demo `name` se escribe como `text`, así que no cambia la pantalla).
- Cambio deliberado de salida: los seis campos `long` que no eran de saltos de línea
  (`TEXTO_POSTAL`, `NOTA_PERSONALIZADA`, `PERSONALIZADO_1/2`, `TEST_RESULTADO`, `S2_SECRET_LOVE`) ahora
  conservan los saltos que escribe la persona. En los huecos de una sola línea se siguen uniendo; en
  los de varias líneas aparecen tal cual. Los tres ejemplos no tienen saltos en esos campos, y la
  dorada no cambia. `S2_SECRET_LOVE` da el mismo texto cifrado (la transformación `runes` quita los
  saltos). La demo también conserva el salto al escribir en esos campos, igual que el motor.
- Reflow: el motor ya no mira nombres de campo. Un hueco tiene `"flow"` (el número de la pareja) y
  dos huecos de la misma línea con el mismo `flow` se reflujan juntos. La migración asigna `flow` a
  NOMBRE_n y APODO_n de la misma página (solo en p1). Cambio sin efecto en final3.
- Mecánica desconocida: error (era aviso desde T2.1).
- Aceptación: dorada 96/96 y `grep -nE "'p[0-9]+'|NOMBRE_|APODO_|S2_|S8_|DEBILIDAD|EDAD"
  tools/pme-compose-core.js` no imprime nada.

## T2.6 (etiquetas cortas de la revisión: van en el juego)

- Cada campo lleva `corta` (i18n): «Sección · etiqueta», o «S<n> · Nombre/Alias/Foto/Escondite n» en
  los campos de cada persona. La revisión lee `corta` de `Q`; la tabla `SHORT` de la demo desaparece.
- La migración genera `corta` desde la tabla que antes estaba en la demo (`ETIQUETA` en
  `tools/game/migrate-final3.mjs`). Comprobado: las 70 etiquetas coinciden con la regla antigua en
  español e inglés.
- `intro_ok` no es un campo del juego: su etiqueta («Sección de introducción · Aviso») sigue en la demo.
- Pendiente, anotado y no tocado: `OTRO` no está en ninguna sección, así que su etiqueta es
  «? · Otro» (igual que antes).
- El validador comprueba que `corta` tiene todos los idiomas.

## T3.1 (límites en Node: tools/game/limites.mjs)

- `limites.mjs` mide la capacidad de cada campo con `PMECompose.fieldFits` (el mismo motor que el
  PDF) y las fuentes embebidas de `tools/game/fuentes.cjs`, que ahora comparten `compose.js` y el
  medidor. Búsqueda binaria hasta 400 caracteres; el límite de un hueco es el mínimo de sus cajas y
  de sus idiomas.
- Los campos derivados (`join`, `initial`, `prefix`) se miden ejecutando su `derive` con el resto de
  entradas al `cap` (nombres de muestra de esa longitud), porque su longitud depende de otros campos.
- Regla 3.1: `min(cap, floor(capacidad × 0.75))`; en los campos `name` el margen no se aplica
  (`min(cap, capacidad)`).
- Resultado en `final3`: ningún límite supera su `cap`. Seis `cap` no caben y el informe los lista:
  `NOMBRE_DEST` (28 → 27), `PERSONALIZADO_1` (50 → 48), `PERSONALIZADO_2` (50 → 47),
  `DEBILIDAD_TEXTO`, `B_NOTES` y `TEST_RESULTADO`. El artista decide si baja el `cap` o si se
  queda así; no se cambia el juego en este commit.
- La demo sigue aplicando el `cap` como límite y no el límite calculado. Cambiarlo altera los
  límites visibles de `final3`, así que se deja para decidirlo con el resto de límites.
- `tools/limits.cjs` y `tools/apply-limits.py` llevan la marca OBSOLETO. No se borran hasta M5.

## T3.2 (validación cruzada)

- `validate.mjs` comprueba: códigos `[CODIGO]` del PDF contra `fields` (`--pdf-texto`); campos que
  no salen en ninguna página (aviso); ejemplos dentro de su `cap` (error si se pasa), que sus campos
  existan y que tengan foto/texto en cada idioma; `params` de cada mecánica contra su esquema; licencias del kit (3.4); requisitos
  de `submit` (3.6: ejemplos, `en`, fondo, foto, pieza del kit).
- Los avisos de los ejemplos son informativos, no bloquean: el artista puede dejar huecos justos.
- Un caso por regla en `tools/qa/fixtures/` (`texto-artista.pdf`, `kit/manifest-ok.json`,
  `kit/manifest-licencia.json`). `tools/qa/validador-casos.mjs` muta copias de `final3` y comprueba
  15 casos: 15/15.
- Corrección durante el trabajo: con `--pdf-texto` en el índice 0 el validador saltaba el primer
  argumento cuando no había `--pdf-texto` (`iPdf + 1 = 0`). Ahora el índice se trata aparte.
- Los `schema/examples/*.json` apuntan ahora a `../../Final3-Clean.pdf` (antes `fondo.pdf`, que no
  existe), para que el validador pueda abrir el fondo.
- Pendiente: el validador no comprueba que los `[CODIGO]` existan en `final3`, porque el repo no
  tiene el PDF de texto del artista (solo el fixture).

## T3.3 (prueba de humo: tools/qa/game-smoke.py) — ABIERTO (límites sin W, a petición)

- La herramienta compone cada ejemplo en cada idioma (falla con excepción) y dos juegos de valores
  generados: «una letra» y «límite W» (cada campo de texto con W hasta su límite de `limites.mjs`).
  Falla si un hueco se encoge («valor encogido», el aviso del motor).
- Estado actual: los límites son los de T3.1 (`min(cap, floor(capacidad × 0,75))`, nombres
  `min(cap, capacidad)`), sin tener en cuenta la W. Con ellos, «una letra» y los ejemplos pasan, y
  «límite W» falla en 25 campos en cada idioma (p. ej. NOMBRE_CUMPLE, FAMA, B_NOTES, TEXTO_POSTAL).
- Probado y revertido (T3.3 con W): un límite que incluye la W (capacidad con letra W) deja
  NOMBRE_CUMPLE y B_ALIAS en 4, B_NOTES en 12 y TEXTO_POSTAL en 22, y pasa la prueba. Bajar también
  los `cap` rompe 111 caracteres de los ejemplos del artista. Por eso se pidió volver a los límites
  anteriores.
- Pendiente de decisión: (1) aceptar que la prueba W falle y documentarlo, o (2) elegir la opción
  con W y agrandar los huecos de NOMBRE_CUMPLE, B_ALIAS, B_NOTES, TEXTO_POSTAL y NOTA_PERSONALIZADA,
  o (3) cambiar la prueba a una mezcla realista de letras anchas.
- Equivalencia del aviso: «encogido fuerte» del plan es «valor encogido» en el motor.
- Los avisos de los ejemplos son informativos y no hacen fallar la prueba.

## T4.1 (kit: manifiesto, licencias y guía)

- `assets/kit/manifest.json` existe con `pieces: []` (el kit inicial llega en T4.3). `LICENCIAS.md`
  tiene la tabla vacía. `GUIA-KIT.md` está en `assets/kit/`, junto al manifiesto (el plan no fija
  la carpeta; así el artista lo encuentra donde está el kit).
- `validate.mjs` comprueba el manifiesto (`erroresKit`): id único, `kind` de los cinco tipos,
  fichero y miniatura que existen, licencia `CC0-1.0`, `source` y `author`. El validador lo lee con
  `--kit <manifest.json>` o, por defecto, `assets/kit/manifest.json` cuando el juego lo usa.
- Caso de prueba: `tools/qa/fixtures/kit/manifest-fichero.json` (fichero que no existe). El fixture
  `papel-viejo-1` ahora tiene su fichero (`tools/qa/fixtures/kit/papel/papel-viejo-1.png`).

## T4.2 (fondo por capas en el motor)

- Decisión de forma: las capas son de **cada página**, como pide `set_page` (3.3), y no una lista
  única del juego. El fondo `"kind": "layers"` ya no lleva lista; cada página de
  `template.pages[]` tiene `layers: [{asset, x, y, w, h, angle?}]` (x, y esquina superior izquierda
  en %; angle en grados alrededor del centro). Las capas van debajo de los huecos y de las mecánicas
  `under`. Con `pdf` ninguna página puede llevar capas (error del validador).
- Motor: `composeGame` acepta `assets` (id → `{kind: 'pdf'|'png', bytes}`) y `bgBytes` nulo. Una
  página por capas es una hoja en blanco del tamaño de `template.pageSize` (A4). Las piezas PDF se
  incrustan con `embedPdf` y las PNG con `embedPng`; el giro se hace alrededor del centro de la pieza.
- CLI: `compose.js --game <juego> [--kit <manifest.json>]` (por defecto `assets/kit/manifest.json`).
- Prueba: `tools/qa/fixtures/games/capas` (el mínimo con fondo por capas y tres piezas: PNG
  degradado, PDF rojo, PDF azul girado 30°). Las piezas las genera `tools/qa/fixtures/capas/generar.mjs`
  (figuras propias, no arte de stock). `tools/qa/capas-test.py` compone, rasteriza a 60 ppp y compara
  con `tools/qa/fixtures/capas/referencia.png`: 0 píxeles distintos. La referencia se hizo con
  esta misma composición y se revisó a la vista (posiciones, tamaños y giro).
- Aceptación: dorada 96/96 (sin cambios, el juego final3 sigue con PDF), capas 0 píxeles distintos,
  validador 18/18 (tres casos nuevos de capas y uno de kit), demo 30/30, tipos 7/7, límites 26/26.
  `demo/index.html` se reconstruye con el motor nuevo (cambio de 49 líneas).
- Pendiente: el editor (M5) dibuja las capas; el validador no comprueba que las piezas se solapen con
  los huecos.

## T4.3 (kit inicial) — BLOQUEADO

- Las fuentes del kit (polyhaven.com y kenney.nl) no están en la lista de salida del entorno: desde
  la shell dan error de conexión (código 000), aunque GitHub sí responde. No se pueden descargar las
  unas 20 piezas ni generar miniaturas con datos reales.
- Lo que sí está hecho: la comprobación del manifiesto y de las licencias (T4.1). Falta
  `tools/kit/thumbs.mjs` (miniaturas de 300 px, aún sin escribir) y bajar las piezas.
- Para cerrar T4.3: o se permite el acceso a esos dos sitios, o las piezas se descargan a mano y se
  pasan al repositorio con su fila en `LICENCIAS.md` (la URL exacta de cada descarga).

## T5.1 (esqueleto del editor)

- `creator/serve.mjs` sirve la raíz del repo en local (`node creator/serve.mjs --port 8080`). No
  sirve `.git` ni `node_modules`, y no deja salir de la raíz. Es solo para desarrollo; el despliegue
  en GitHub Pages es T5.7.
- `creator/index.html` + `creator/app.js`: lista de juegos, páginas de un juego (huecos y capas) y el
  detalle de la página con sus capas. Todo el texto de los juegos va con `textContent`.
- `creator/store/memory.js`: almacén en memoria con la interfaz de 3.5 (`list`, `load`). Carga los
  juegos de rutas dadas. `save`, `history`, `submit` y `latestRev` llegan con T5.2 y T5.6.
- Prueba: `tools/qa/creator-esqueleto.py` (11 comprobaciones: lista, páginas, capas, sin errores de
  consola, sin scroll en móvil, rutas fuera del repo rechazadas).
- Nota: el editor carga los juegos desde la raíz del repo; el juego de prueba `capas` se lee de
  `tools/qa/fixtures/`. En T5.7 cambiará la fuente.
- M4 sigue abierta (T4.3 bloqueada); esta rama sale de `creador-m4`.

## T5.2 (almacén de GitHub y entrada con token)

- `creator/store/github.js` (3.5): `list` lee las ramas `juego/<id>`; `load` lee `games/<id>/game.json`
  de esa rama y rev = sha del fichero; `save` comprueba la rev con `latestRev` y además la API
  devuelve 409 si el sha ya no coincide (dos comprobaciones: la segunda cubre la carrera entre ambas);
  `history` lista los commits del fichero (aquí rev es el commit, no el sha del fichero: cargar una
  versión antigua no está en esta tarea); `submit` abre el pull request hacia `main` y, si ya hay uno
  abierto (422), devuelve ese.
- Entrada: pide el repositorio (dueño/nombre) y el token. El token va a `sessionStorage` y solo en la
  cabecera `Authorization`; nunca en una URL ni en `localStorage`. «Salir» lo borra. Con un 401 se
  vuelve a la entrada con el aviso. La plantilla no fija el nombre del repositorio de juegos (el plan
  dice «el repositorio de juegos»): se escribe en la entrada.
- Prueba: `tools/qa/creator-github.py` (19/19) con la API simulada en Playwright: carga, guardado,
  conflicto por rev vieja (sin PUT), conflicto del servidor (409), historial, pull request nuevo y
  existente, 401, token en sessionStorage y no en la URL, Salir.
- `?almacen=memoria` sigue disponible para las pruebas de la interfaz (sin red ni token).

## T5.3 (lienzo: huecos y capas)

- `creator/lienzo.js`: la página en % (A4 con la relación de la plantilla). Cada hueco se puede
  seleccionar, arrastrar, redimensionar con el asa y mover con flechas (Mayús: paso de 5 %). Un clic
  sin movimiento solo selecciona. Los cambios se acotan a la página (0–100 %) y el arrastre solo
  guarda `x` o `y` si han cambiado.
- Propiedades del hueco seleccionado: x, y, ancho, alto, tamaño de letra y giro (solo los que tenga).
- Deshacer (botón y Ctrl+Z): hasta 200 pasos, guardados como copias de las páginas.
- `creator/store/memory.js` implementa la interfaz completa (load, save con rev, history, submit,
  latestRev) para las pruebas.
- Aceptación (`tools/qa/creator-lienzo.py`, 14/14): arrastrar un hueco y guardar cambia solo su `x`,
  comparado campo a campo con `games/final3/game.json`.
- Pendiente: el lienzo no dibuja el fondo PDF de final3 (solo huecos y capas); el kit (T5.4) pondrá
  las piezas en las capas.
- T5.2 y T5.3 van en el mismo commit porque comparten `creator/app.js` e `index.html`.
