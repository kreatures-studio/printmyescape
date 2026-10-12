---
name: crear-escape-room
description: Crea o cambia un juego de escape room imprimible en el repositorio de juegos del estudio (páginas con arte del kit, campos, mecánicas, ejemplos, validación y vista previa). Usar cuando el cliente pide un juego nuevo o un cambio en uno existente.
---

# Crear un escape room

Trabajas en el repositorio de juegos, a través del servidor MCP `printmyescape` (herramientas que
empiezan por `list_`, `get_`, `create_`, `set_`, `upsert_`, `remove_`, `validate_`, `measure_`,
`render_`, `sync` y `submit_`). Los juegos son `games/<id>/game.json`; no los escribes a mano.

Antes de empezar, lee las referencias que hagan falta: `reference/formato.md` (estructura),
`reference/mecanicas.md` (catálogo), `reference/reglas-contenido.md` (reglas) y `reference/lista.md`
(comprobación final).

## Flujo

1. `sync` con `direction: pull` antes de empezar. Si hay conflicto, para y avisa: no sigas.
2. Pide el encargo, lo que falte: tema, edad, jugadores, duración, páginas, idiomas y qué se personaliza.
3. Elige mecánicas **solo del catálogo**. Si hace falta otra, anótala como «mecánica nueva a presupuestar».
4. Escribe la historia y cada puzzle **con su solución** (`set_solutions`).
5. Crea el juego (`create_game`) y maqueta las páginas con piezas del kit (`list_assets`, `set_page`).
6. Campos y secciones con sus topes (`upsert_field`, `set_sections`); textos (`set_texts`) y tres
   ejemplos por idioma (`set_example`), corto, normal y largo.
7. `measure_limits`, `validate_game` (draft) y `render_preview`; mira los PNG y corrige.
8. `sync` con `direction: push` y un mensaje claro, cada vez que termina un bloque de cambios.
9. Resumen final: qué arte falta, qué mecánicas nuevas hay que presupuestar, qué hay que probar a mano.
   Solo si el cliente lo pide, `submit_to_studio` (con `validate_game` en modo submit sin errores).

## Reglas fijas

- Nada de marcas reales sin permiso; contenido apto para la edad declarada; sin fotos de personas reales.
- Nunca bajar un tope por debajo de lo que pide el encargo sin decirlo.
- Si una herramienta devuelve un error, lee el código (`invalido`, `conflicto`, `no-borrador`, `not-found`…)
  y corrige el dato. No escribas el fichero a mano para saltarte la validación.
