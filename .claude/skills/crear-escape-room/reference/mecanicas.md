# Catálogo de mecánicas

<!-- Generado por tools/build-skill-reference.mjs desde mechanics/*.js. No editar a mano. -->

Solo estas mecánicas se pueden usar en un juego. Si el encargo necesita otra, no se inventa:
se anota como «mecánica nueva a presupuestar» en el resumen final.

| Tipo | Qué hace | Parámetros obligatorios | Capa | Tiene derive |
| --- | --- | --- | --- | --- |
| `initial` | Inicial del nombre | `map` | ninguna (solo datos) | sí |
| `join` | Nombre con alias | `name`, `alias`, `target` | ninguna (solo datos) | sí |
| `prefix` | Texto fijo delante | `map`, `prefix` | ninguna (solo datos) | sí |
| `runes-panel` | Fondo de la nota cifrada | `x`, `y`, `w`, `h`, `color` | debajo del texto | no |
| `strips` | Hoja de tiras | `x0`, `x1`, `y0`, `y1`, `strips`, `perm` | pieza final (se dibuja al final) | no |
| `ticks` | Casillas marcadas | `field`, `boxes` | encima del texto | sí |

Para el significado de cada parámetro, leer `.pme/mechanics/<tipo>.js` (la mecánica explica sus
parámetros y su `validate`). Usar `list_mechanics` para ver las mismas definiciones desde el servidor.

- En un juego v2 una mecánica llega como **puzzle del catálogo**: `list_library` tipo `puzzle` y `add_puzzle` con
  `from` (o `insert_page` con `puzzles`). Ver `puzzles.md`. `upsert_mechanic` queda para juegos v1.
- `derives`: campos que la mecánica calcula y que no están en `fields` (no se crean a mano).
