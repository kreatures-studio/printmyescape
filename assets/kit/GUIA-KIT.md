# Guía del kit de arte

El kit es el catálogo de piezas de arte que un juego puede usar como fondo: papeles, marcos,
marcos de foto, adornos e iconos. Cada pieza está en `assets/kit/manifest.json` (contrato 3.4).

## Qué es una pieza

- `file`: un **PDF de una página** (vector; se incrusta tal cual) o un **PNG a 300 ppp**.
- `thumb`: miniatura PNG de 300 px de ancho para el editor (la genera `tools/kit/thumbs.mjs`, T4.3).
- `kind`: `background` (fondo), `frame` (marco), `photo-frame` (marco de foto), `decor` (adorno)
  o `icon` (icono).
- `license`, `source` y `author`: obligatorios. Solo `CC0-1.0`. Cada pieza tiene su fila en
  `LICENCIAS.md` con la página de descarga.
- `slots` (opcional): zonas útiles de la pieza, en %, para que el editor sugiera dónde escribir.

## Cómo añadir una pieza

1. Pon el fichero en `assets/kit/<carpeta>/` y la miniatura junto a él.
2. Añade la entrada en `manifest.json` con su `id` (único, en minúsculas y guiones).
3. Añade su fila en `LICENCIAS.md`.
4. Comprueba el manifiesto: `node tools/game/validate.mjs <carpeta-del-juego> --kit assets/kit/manifest.json`.

## Cómo se usa en una página

Un juego con fondo por capas (`"background": { "kind": "layers" }`) pone las piezas en cada
página, en `template.pages[].layers`. Cada capa indica la pieza y su caja, en % de la página
(x, y es la esquina superior izquierda):

```json
"layers": [
  { "asset": "papel-viejo-1", "x": 0, "y": 0, "w": 100, "h": 100 },
  { "asset": "marco-1", "x": 10, "y": 55, "w": 35, "h": 25, "angle": 30 }
]
```

Las capas se dibujan en orden, debajo de los huecos del texto.

## Lo que no va aquí

- Arte de los artistas o de clientes: no se sube al kit ni a GitHub Pages (Pages es público).
- Piezas sin licencia CC0 o sin autor y fuente.
