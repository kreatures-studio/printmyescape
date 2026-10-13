---
name: crear-escape-room
description: Crea o cambia un juego de escape room imprimible en el repositorio de juegos del estudio, desde cero o a partir de otro, con la biblioteca (arte, páginas, secciones y puzzles), el formulario del comprador, ejemplos, validación y vista previa. Usar cuando el cliente pide un juego nuevo, un cambio en uno existente o atender sus notas de revisión.
---

# Crear un escape room

Trabajas en el repositorio de juegos a través del servidor MCP `printmyescape` (si no lo tienes registrado, las
mismas herramientas desde la terminal: `node .pme/mcp/cli.mjs list` y `node .pme/mcp/cli.mjs <herramienta> '<json>'`). Los juegos son
`games/<id>/game.json` en formato `pme-game/2` (páginas con elementos); **nunca escribes el JSON a mano**: cada
herramienta valida antes de guardar y se niega si el cambio deja el juego mal. Lee las referencias cuando las
necesites:

- `reference/formato.md` — cómo es un juego v2 y qué herramienta cambia cada parte.
- `reference/biblioteca.md` — qué hay en la biblioteca y cómo se reutiliza (siempre copiando, con `from`).
- `reference/puzzles.md` — puzzles del catálogo y de contenido, y qué necesita cada uno.
- `reference/mecanicas.md` — las mecánicas que existen (generado del motor).
- `reference/reglas-contenido.md` — lo que no se hace nunca.
- `reference/lista.md` — comprobación antes de dar el trabajo por terminado.

## Flujo

1. **Traer y leer.** `sync` con `direction: pull`. Si hay conflicto, para y avisa. Si el juego ya existe,
   `read_notes` con `pending: true`: las notas del cliente son lo primero que se atiende.
2. **Encargo.** Pregunta lo que falte: tema, edad, jugadores, duración, número de páginas, idiomas y qué se
   personaliza (nombres, fotos, aficiones…). No inventes datos del cliente.
3. **Estructura, y aprobación.** Propón la historia, la lista de puzzles **con su solución** y qué datos pide cada
   uno al comprador. Mira antes qué hay en la biblioteca (`list_library` de `puzzle`, `pagina`, `seccion` y `arte`)
   para proponer lo que ya existe. **No maquetes hasta que el cliente apruebe la estructura.**
4. **Puzzles.** Del catálogo (`add_puzzle` con `from`) o de contenido (`add_puzzle` con `puzzle`, kind
   `contenido`). Si hace falta una mecánica que no existe, no la inventes: anótala como «mecánica nueva a
   presupuestar» en el resumen (`presupuestar` de `write_change_summary`).
5. **Páginas.** Empieza en blanco (`create_game`) o desde otro juego (`duplicate_game`). Añade páginas
   (`insert_page`, de la biblioteca o en blanco) y elementos (`add_element`: arte, textos, campos, fotos). Si falta
   arte, deja un texto marcado `[FALTA ARTE: …]` donde iría y escribe el encargo para el artista en el resumen.
   El arte lo hacen los artistas; `create_vector_art` solo para formas sencillas (rejillas, casillas, líneas).
6. **Formulario.** Secciones de la biblioteca (`insert_section`) o propias (`upsert_field`, `set_sections`), con
   topes (`cap`) en los campos de texto. `measure_limits` para comprobar que caben. Tres ejemplos por idioma
   (corto, normal y largo) con `set_example`, y las soluciones con `set_solutions` si no van en el puzzle.
7. **Validar y mirar.** `validate_game` (draft) sin errores; `render_preview` de cada idioma y del ejemplo
   largo; **mira cada PNG** y corrige lo que no cabe, se solapa o no se lee.
8. **Resumen y subida.** `write_change_summary` con qué hiciste y por qué (y las notas atendidas en
   `notes_done`): es lo que el cliente lee en «Revisar». Lo que añadiste sin que el cliente lo pidiera (una pregunta,
   una página, un elemento) va en `suggestions` con el porqué: el cliente lo acepta o lo descarta en el creador. Lo
   que hay que presupuestar (mecánicas nuevas, encargos de arte) va en `presupuestar`, una línea por cosa.
   Después `sync` con `direction: push` y un mensaje claro.
   Solo si el cliente lo pide, `submit_to_studio` (con `validate_game` en modo submit sin errores).

## Cuando una herramienta se niega

Lee el código y el mensaje, y arregla el dato:

- `faltan-campos`: el mensaje dice qué campos faltan y qué sección o puzzle de la biblioteca los trae.
- `invalido`: `detalles` lista los errores del validador (caja fuera de la página, campo inexistente…).
- `solo-v1` / `solo-v2`: herramienta de otro formato (`duplicate_game` pasa un juego v1 a v2).
- `no-borrador`: el juego ya está enviado; no se edita.
- `conflicto` / `rechazado`: alguien cambió el juego; `sync pull` y vuelve a empezar el bloque.
