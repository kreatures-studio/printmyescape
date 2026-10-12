# Puzzles

Hay dos clases. Ningún puzzle llega a la venta sin que una persona lo haya jugado: dilo en el resumen.

| Clase | Ejemplos | Cómo se añade |
| --- | --- | --- |
| De contenido | Acertijo, buscar el error, mapa, cifrado con texto fijo, recortes fijos | `add_puzzle` con `puzzle` (kind `contenido`) |
| Con datos del comprador | Nombre en runas, inicial, casillas marcadas, tiras, apodo con prefijo | Del catálogo: `add_puzzle` con `from` |

## Del catálogo (datos)

- `list_library` tipo `puzzle`: cada uno dice su mecánica, los campos que lee (`needs`) y los que calcula
  (`derives`). Los campos de `needs` tienen que existir antes (`insert_section` o `upsert_field`).
- Sus coordenadas son las de la página de la que salieron: el bloque ocupa la página entera y va una sola vez.
  Úsalo en una página con el mismo arte (normalmente la página de la biblioteca que lo traía).
- Los campos calculados (`derives`) se colocan como cualquier campo (`add_element` kind `field`); no se crean
  con `upsert_field`.
- Si el encargo pide una mecánica que no está, **no se inventa**: «mecánica nueva a presupuestar» en el resumen.

## De contenido

`add_puzzle` con `puzzle`:

```json
{ "id": "tres-en-raya", "name": "Tres en raya", "kind": "contenido",
  "difficulty": 2, "minAge": 8, "minutes": 5,
  "solution": { "es": "…", "en": "…" },
  "hints": [ { "es": "…", "en": "…" } ],
  "page": { "elements": [ { "kind": "art", "ref": "…", "x": 0, "y": 0, "w": 100 },
                          { "kind": "text", "texts": { "es": "…", "en": "…" }, "x": 0, "y": 0, "w": 100, "h": 10 } ] } }
```

y `box` (caja en % de la página donde va). Los elementos del puzzle van en % de su caja.

## Cada puzzle, siempre

- Ficha: nombre, dificultad (1–5), edad mínima y minutos aproximados.
- Qué necesita del comprador: los campos y sus límites.
- Solución en cada idioma; si depende de los datos del comprador, con `{{CAMPO}}`.
- Pistas por nivel cuando el puzzle puede atascar.
- Comprobado con los tres ejemplos (corto, normal y largo): siempre tiene solución y cabe.
