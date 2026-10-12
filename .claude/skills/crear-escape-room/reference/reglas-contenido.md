# Reglas de contenido y de trabajo

## Contenido
- Nada de marcas, logotipos ni nombres reales sin permiso por escrito del cliente. Si el encargo lo pide,
  se pregunta antes y, mientras, se usa un nombre inventado.
- Contenido apto para la edad declarada en el encargo. Si el tema no encaja, se dice y se propone otro.
- Nunca fotos de personas reales: solo las del ejemplo o las que aporte el cliente para ese juego.
- Un puzzle siempre con su solución (`solutions`) y el texto que la explica en cada idioma.

## Topes y textos
- Nunca bajar un `cap` por debajo de lo que pide el encargo sin decirlo en el resumen final.
- Cada campo de texto tiene `cap` antes de enviar. Usar `measure_limits` para no pasarse del espacio del hueco.
- Todo texto que sale en el juego tiene su traducción en cada idioma del juego.

## Trabajo
- Leer antes de escribir: `sync pull` al empezar (si devuelve un conflicto, parar y avisar).
- Solo mecánicas del catálogo. Una mecánica nueva se anota como «a presupuestar», no se inventa.
- Los cambios se hacen con las herramientas. Si una herramienta se niega, leer el motivo y arreglar el dato,
  no buscar otra forma de escribir el fichero.
- `sync push` con un mensaje claro cada vez que termina un bloque de cambios.
- `submit_to_studio` solo si el cliente lo pide, y solo con `validate_game` (submit) sin errores.
