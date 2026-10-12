# Formato del juego (pme-game/1)

El juego es `games/<id>/game.json`. La fuente de verdad es `.pme/schema/pme-game-1.schema.json`.
**Nunca se escribe el JSON a mano**: se cambia con las herramientas del servidor (`create_game`,
`set_page`, `upsert_slot`, `upsert_field`, `set_sections`, `upsert_mechanic`, `set_texts`,
`set_example`, `set_solutions`…), que validan antes de guardar.

## Partes del juego

- `id` (minúsculas, números y guiones), `version`, `status` (`borrador` → `enviado` → `en-produccion` → `publicado`).
  Solo se edita en `borrador`.
- `name` y `languages`: el nombre por idioma; los idiomas del juego (p. ej. `es`, `en`).
- `background`: `{ "kind": "layers" }` (arte del kit en cada página) o `{ "kind": "pdf", "file": "…" }` (PDF del artista).
- `template.pages`: páginas `p1`, `p2`… Cada una tiene `title`, `slots` (huecos de texto) y `layers` (piezas del kit).
  - Hueco (`slots`): `field`, y `x`, `y`, `w`, `h` en % de la página, más `size`, `color`, `fontFamily`, `angle`.
  - Capa (`layers`): `asset` (id de una pieza del kit), `x`, `y`, `w`, `h` en %, `angle` opcional.
- `fields`: los campos (datos que rellena el cliente). Cada uno: `type` (`name`, `text`, `long`, `number`,
  `photo`, `choice`, `multi`), `required`, `cap` (máximo de caracteres en campos de texto), `q` (pregunta por
  idioma), y opcionalmente `corta` (etiqueta de revisión), `desc`, `ej`, `options`, `allowOther`/`otherField`.
- `form.sections`: secciones del formulario. Cada una: `id`, `title` por idioma, `fields` (lista de campos),
  y opcionalmente `nameField`, `photoField`, `hint`. Un campo está en una sola sección.
- `mechanics`: mecánicas (ver `mecanicas.md`): `type`, `page`, `params`, y `derives` si calculan campos.
- `i18n`: textos fijos por idioma (`i18n.es.CLAVE`…). `texts`: dónde va cada texto fijo en la página.
- `examples`: ejemplos (corto, normal, largo): `id`, `values` por idioma (campo → texto) y `photos` (campo → ruta).
- `solutions`: soluciones de los puzzles: `id`, `how` por idioma, y opcionalmente `page` y `dependsOn`.

## Qué comprueba el servidor

- `validate_game` en modo `draft`: forma correcta, referencias cruzadas (huecos → campos, secciones → campos,
  mecánicas → páginas, piezas del kit con licencia CC0), textos en todos los idiomas, ejemplos dentro del tope.
- `validate_game` en modo `submit`: además, `cap` en los campos de texto, al menos una solución y tres
  ejemplos por idioma.
- `measure_limits`: cuántos caracteres caben en cada campo con las fuentes del motor.
