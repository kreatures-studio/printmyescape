# Notas para el formulario (demo) — documento `final` (15 páginas)

Campos que el usuario debe rellenar, agrupados como secciones del asistente.
Tipos: `corto` (1 línea) · `largo` (varias) · `foto` (JPG/PNG) · `multi`.
` páginas` = dónde se usa (misma respuesta en todas).

## 0. Mapeos especiales (Google Form → PDF)

- `B_WEAK` (multi: Llegar tarde…) → se une con ` / ` en el hueco `DEBILIDAD`.
- El texto libre de `B_WEAK` ("Otro: ...") va al hueco `OTRO`.
- `B_ALIAS`, `B_AGE`, `B_INFO`, `B_NOTES`, `S{N}_ALIAS` y extras
  (`S1_SHAME_PLACE`…) se GUARDAN pero no tienen hueco en este PDF
  (futura maquetación). No quitarlos: el formulario los pide igual.
- `TALENTO`, `SOSPECHA` y `OTRO` como preguntas se eliminaron (sin
  equivalente en el formulario de Google); `OTRO` se deriva del "Otro:"
  libre y `TALENTO`/`SOSPECHA` solo se rellenan con el ejemplo.

## 1. La víctima

| Campo | Pregunta sugerida | Tipo | Páginas |
|-------|-------------------|------|---------|
| NOMBRE_CUMPLE | ¿Cómo se llama la persona homenajeada? | corto, oblig. | 3 (×2) |
| FAMA | ¿Por qué se le conoce? | corto | 3 |
| DEBILIDAD | Su mayor debilidad | corto | 3 |
| TALENTO | Su mayor talento | corto | 3 |
| SOSPECHA | Si fuera sospechoso, ¿de qué sería? | corto | 3 |
| OTRO | Otra debilidad (línea "Otro:") | corto | 3 |
| FOTO_CUMPLE | Foto del homenajeado | foto | 3 |

⚠ La pág. 2 dice "el regalo de Ian" en texto fijo: el nombre de víctima
NO sale ahí. Avisar al artista (falta código `[NOMBRE_CUMPLE]` en p2).
En la demo se pre-rellena "Ian" para que todo cuadre.

## 2. Sospechosos 1–8 (repetir bloque 8 veces)

| Campo | Pregunta sugerida | Tipo | Páginas |
|-------|-------------------|------|---------|
| NOMBRE_N | Nombre del sospechoso N | corto, oblig. | 1, 4/5, 8–15 |
| S{N}_HIDEA | Un lugar donde se escondería | corto, oblig. | 4/5 |
| S{N}_HIDEB | Otro lugar donde se escondería | corto, oblig. | 4/5 |
| FOTO_N | Foto del sospechoso N (vale para todas sus páginas) | foto | varias |

## 3. Pruebas y mensajes

| Campo | Pregunta sugerida | Tipo | Páginas |
|-------|-------------------|------|---------|
| RESULTADO_TEST | Resultado del test (línea "Resultados de su test de ___") | corto | 8 |
| NOMBRE_4.2 | Nombre del contacto del chat (con ♥) | corto | 11 |
| MENSAJE_PERSONALIZADO | Mensaje de la burbuja del chat (2 líneas) | largo | 11 |
| BUSQUEDA_1 | Primera búsqueda del historial | corto | 12 |
| BUSQUEDA_2 | Segunda búsqueda del historial | corto | 12 |

## Valores de ejemplo (botón "Probar con ejemplo" de la demo)

- Nombres: Celia, Nuria, Adela, Adam, Dani, Pol, Marc, Clau
- Víctima: Ian (fama "Comer hamburguesas", debilidad "Llegar tarde",
  talento "Contar chistes", sospecha "Robo de tarta", otro "Roncar")
- Escondites: los de mentira del PDF están en `texts.json` (fijos de ejemplo)
- RESULTADO_TEST: "vista", NOMBRE_4.2: "Alex", MENSAJE: "¿Vienes esta noche? / Te espero a las 9",
  BUSQUEDA_1: "cómo abrir una caja fuerte", BUSQUEDA_2: "ideas de regalos"
- Fotos: `foto.JPG` para todas (la demo permite subir una por campo)
