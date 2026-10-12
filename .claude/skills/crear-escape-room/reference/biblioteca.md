# Biblioteca

La biblioteca está en `biblioteca/` del repositorio de juegos (nunca se publica). `list_library` con `tipo`
(`arte`, `pagina`, `seccion`, `puzzle`) y, si quieres, `tag` o `coleccion`. Cada entrada trae su `ref`
(`id@versión`), que es lo que se pasa a las demás herramientas.

| Tipo | Qué es | Cómo se usa |
| --- | --- | --- |
| `arte` | Piezas sueltas de los artistas (papel, marcos, dispositivos, iconos…), con tamaño en mm y zonas útiles (`zona-foto`, `zona-texto`) | `add_element` kind `art`, o fondo `{kind: "art"}` |
| `pagina` | Páginas enteras guardadas de un juego: fondo, elementos y textos | `insert_page` con `from` |
| `seccion` | Secciones del formulario con sus campos, definiciones y ejemplos | `insert_section` |
| `puzzle` | Catálogo de puzzles de datos (una mecánica con sus parámetros) | `add_puzzle` con `from`, o `insert_page` con `puzzles` |

## Reglas

- **Reutilizar es copiar.** Páginas, secciones y puzzles se copian al juego con `from`; cambiarlos después no toca
  la biblioteca. El arte se cita con versión fija y no se edita: una pieza nueva es una versión nueva.
- Una página de la biblioteca puede usar campos que calcula un puzzle (p. ej. los apodos con su coma, de
  `puzzle-prefix`). Si `insert_page` dice `faltan-campos`, el mensaje nombra la sección o el puzzle que los trae:
  inserta antes la sección, o pasa el puzzle en `puzzles` de la misma `insert_page`.
- Las zonas de una pieza (`zones`, en % de la pieza) dicen dónde va la foto o el texto: coloca ahí el campo.
- Para guardar algo bueno de un juego: `save_to_library` (página, sección o mecánica). Arte nuevo de un artista:
  `import_art` (autor humano y licencia propia-estudio o CC0-1.0).
- Si no hay pieza para algo, no la dibujes: deja `[FALTA ARTE: …]` y escribe el encargo (qué es, tamaño en mm,
  estilo, zonas) en el resumen.
