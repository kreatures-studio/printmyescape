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
| `notes`, `changes` | Notas del cliente y resúmenes de cambios | `read_notes`, `write_change_summary` |

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
- `fontFamily`, exactamente uno de estos nombres (otro no valida): `Caveat` y `Caveat Bold` (manuscrita), `Anton`
  (títulos), `Open Sans` y `Open Sans Bold` (texto), `Courier Prime` y `Courier Prime Bold` (máquina de escribir),
  `Pigpen` (runas).

## Campos

`type`: `name`, `text`, `long`, `number`, `photo`, `choice`, `multi`. Cada uno: `required`, `q` (pregunta por
idioma), `cap` (máximo de caracteres, obligatorio en texto antes de enviar) y opcionalmente `corta`, `desc`, `ej`,
`options`, `allowOther`/`otherField`.

## Qué comprueba el servidor

- `validate_game` draft: forma, cajas dentro de la página, campos y textos que existen en todos los idiomas,
  arte de la biblioteca con licencia y autor, fuentes registradas, puzzles bien colocados, ejemplos dentro del tope.
- `validate_game` submit: además, `cap` en los campos de texto, soluciones y tres ejemplos por idioma.
- `measure_limits`: cuántos caracteres caben en cada campo con las fuentes del motor.
