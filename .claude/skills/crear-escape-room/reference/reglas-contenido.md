# Reglas de contenido y de trabajo

## Contenido
- Nada de marcas, logotipos ni nombres reales sin permiso por escrito del cliente. Mientras, un nombre inventado.
- Contenido apto para la edad declarada en el encargo. Si el tema no encaja, se dice y se propone otro.
- Nunca fotos de personas reales: solo las del ejemplo o las que aporte el cliente para ese juego.
- **Sin arte generado con IA.** El arte lo hacen los artistas y toda pieza tiene autor humano. `create_vector_art`
  es solo para formas geométricas sencillas (rejillas, casillas, líneas, marcos simples), nunca ilustraciones.
- Un puzzle siempre con su solución en cada idioma.

## Topes y textos
- Nunca bajar un `cap` por debajo de lo que pide el encargo sin decirlo en el resumen.
- Cada campo de texto tiene `cap` antes de enviar; `measure_limits` para no pasarse del espacio.
- Todo texto que sale en el juego tiene su traducción en cada idioma.

## Trabajo
- `sync pull` al empezar; con conflicto, parar y avisar.
- La estructura (historia, puzzles y soluciones, datos que se piden) la aprueba el cliente antes de maquetar.
- Solo mecánicas del catálogo; una nueva se anota «a presupuestar».
- Los cambios se hacen con las herramientas. Si una se niega, leer el motivo y arreglar el dato; nunca escribir
  el fichero a mano.
- `write_change_summary` y `sync push` con un mensaje claro cada vez que termina un bloque de cambios.
- `submit_to_studio` solo si el cliente lo pide, y solo con `validate_game` (submit) sin errores.
