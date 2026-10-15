# Formato del juego (pme-game/2)

El juego es `games/<id>/game.json`; la fuente de verdad es `.pme/schema/pme-game-2.schema.json`. Se cambia solo con
las herramientas (validan antes de guardar). `get_game` devuelve el juego entero (`full`) o una parte (`summary`,
`pages`, `fields`, `form`, `puzzles`, `texts`, `notes`, `mechanics`).

## Partes del juego y herramientas

| Parte | Qué es | Herramientas |
| --- | --- | --- |
| `id`, `name`, `languages`, `status`, `version` | Estado: `borrador` → `enviado` → `en-produccion` → `publicado`. Solo se edita en borrador | `create_game`, `duplicate_game`, `submit_to_studio` |
| `pages` | Páginas `p1`, `p2`… con `title`, `background` y `elements` | `insert_page`, `add_element`, `update_element`, `remove_element` |
| `fields` | Datos que rellena el comprador | `upsert_field`, `remove_field`, `insert_section` |
| `form.sections` | Secciones del formulario | `set_sections`, `insert_section` |
| `i18n` | Textos fijos por idioma (los elementos de texto apuntan a una clave) | `add_element` / `update_element` con `texts`, `set_texts` |
| `puzzles` | Puzzles del juego (ver `puzzles.md`) | `add_puzzle`, `insert_page` con `puzzles` |
| `examples` | Tres por idioma: corto, normal y largo | `set_example`, `insert_section` |
| `solutions` | Soluciones que no van dentro de un puzzle | `set_solutions` |
| `notes`, `changes` | Notas del cliente y resúmenes de cambios (con `presupuestar`) | `read_notes`, `write_change_summary` |
| `suggestions` | Lo que Claude sugiere y el cliente acepta o descarta en el creador | `write_change_summary` con `suggestions` |
| `review` | Lo que el cliente ya revisó en el creador (no se toca) | — |
| `theme` | Tema de color: cada color `from` del juego pasa a su `to` al componer (piezas, PDF de fondo, textos, color de página), sin tocar la biblioteca. En el creador, pestaña Tema | `set_theme` (null lo quita) |

## Páginas y elementos

- Coordenadas en **% de la página** (A4): `x`, `y` desde arriba a la izquierda, `w`, `h`; `angle` en grados.
- `background`: `{kind: "color", value: "#RRGGBB"}`, `{kind: "art", ref}`, `{kind: "pdf", file, page}` o `{kind: "none"}`.
- `elements` en orden de dibujo (el primero, debajo). `add_element` con `index: 0` lo pone debajo de todo.
  - `art`: `ref` de la biblioteca (`id@versión`; con solo el id se fija la última). Con solo `w` (o `h`), la
    herramienta completa el otro lado con la proporción de la pieza.
  - `text`: `texts: {es: "…", en: "…"}` (crea la clave de i18n) y estilo: `size` (% del ancho de página),
    `color`, `fontFamily`, `align`, `angle`.
  - `field`: `field` (id de un campo del juego) y el mismo estilo; `photo`: un campo de tipo `photo`.
  - `puzzle`: un bloque que coloca un puzzle (`add_puzzle` lo crea).
- `fontFamily`: usa uno de estos nombres (el registro acepta también los nombres antiguos de juegos migrados, pero en juegos nuevos no se usan): `Caveat` y `Caveat Bold` (manuscrita), `Anton`
  (títulos), `Open Sans` y `Open Sans Bold` (texto), `Courier Prime` y `Courier Prime Bold` (máquina de escribir),
  `Pigpen` (runas).

### Lo que conviene saber del motor (lo encontró el primer ensayo)

- **El arte va en dos bandas.** Toda pieza de arte que va antes del primer texto, campo o foto de la página se
  dibuja debajo de los textos; la que va después, encima de todos ellos. Pon primero el arte (fondo, papeles,
  marcos) y después los textos; deja después solo lo que de verdad tiene que tapar (una cinta, un clip).
- **Caracteres.** Si un texto usa un carácter que su fuente no tiene, sale un recuadro vacío; `validate_game` lo avisa.
  Las flechas (→) solo están en Anton: en las demás, usa «—» o «:».
- **Estilo de textos y campos:**
  - un texto de varias líneas se reparte por toda la altura de su caja; `tight: true` las junta arriba;
  - en un campo, `vTop: true` empieza el texto arriba de su caja;
  - un campo largo necesita `wrap: true` para partir líneas; antes de partir, el motor estrecha la letra hasta un
    80 %;
  - un texto fijo y un campo en la misma línea se recolocan juntos («Hola, {NOMBRE}»); con otra caja muy cerca, no.
    Las frases con datos, mejor cortas.
- **Textos que sobran.** `set_texts` con `null` quita una clave que ya no usa ningún texto (el validador avisa de las
  que sobran).

## Campos

`type`: `name`, `text`, `long`, `number`, `photo`, `choice`, `multi`. Cada uno: `required`, `q` (pregunta por
idioma), `cap` (máximo de caracteres, obligatorio en texto antes de enviar) y opcionalmente `corta`, `desc`, `ej`,
`options`, `allowOther`/`otherField`.

## Qué comprueba el servidor

- `validate_game` draft: forma, cajas dentro de la página, campos y textos que existen en todos los idiomas,
  arte de la biblioteca con licencia y autor, fuentes registradas, puzzles bien colocados, ejemplos dentro del tope.
- `validate_game` submit: además, `cap` en los campos de texto, soluciones y tres ejemplos por idioma.
- `measure_limits`: cuántos caracteres caben en cada campo con las fuentes del motor.
