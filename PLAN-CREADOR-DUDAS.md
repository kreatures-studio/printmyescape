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
