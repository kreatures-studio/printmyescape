# PrintMyEscape · plataforma de personalización (MVP local)

Prototipo funcional sin backend: permite avanzar mientras se cierran Shopify/Groupon/Fever.

## Arrancar (vale con doble clic)

Abre directamente en el navegador:

- Jugador: `player/index.html`
- Maquetador: `studio/index.html`

No hace falta servidor: cada HTML lleva la maquetación incrustada y solo usa
HTML/CSS/JS sin módulos ni dependencias. Si prefieres servir por HTTP
(`python3 -m http.server`), el prototipo detecta solo el `template.json`
más reciente.

> Abriendo por doble clic (`file://`), algunos navegadores bloquean el guardado
> local: el player lo detecta, trabaja en memoria y lo indica bajo la cabecera
> («memoria temporal»). El borrador se pierde al recargar, pero escribir,
> subir fotos e imprimir funcionan igual. Con servidor HTTP el borrador sí persiste.

## Estructura

| Ruta | Qué es |
|---|---|
| `1.pdf`…`4.pdf` | Diseños originales de referencia |
| `assets/pages/page-N.png` | Fondos exportados de los PDF (150 dpi) para maquetar encima |
| `templates/regalo-robado/template.json` | **Fuente de verdad**: campos globales + huecos por página (coordenadas en %) |
| `shared/template.js` | Motor de render compartido maquetador ↔ jugador |
| `studio/index.html` | Interfaz interna: mover/redimensionar huecos, vincular campo, guardar JSON |
| `player/index.html` | Interfaz del comprador: edita **directo sobre las páginas** (clic-escribir, clic-subir foto), ve el resultado final e imprime/guardar PDF (borrador en `localStorage`) |

## Modelo de datos

**Campos globales** (se rellenan una vez, se reutilizan en varias páginas):
`victimName`, `s1..s8_name/photo` (Celia, Nuria, Adela, Adam, Dani, Pol, Marc, Clau),
`s1..s4_loc_a/b` (las 2 pistas personalizables por sospechoso de la página 3).

**Huecos**: `{ field, x, y, w, h }` en % sobre fondo A4 + estilo (`font`, `size`, `align`, `color`, `fit`, `prefix`, `uppercase`).
Hueco vacío = se ve el fondo original (permitido por diseño).

La página 2 (plano) no lleva huecos: es de juego manual con boli, incluido el
«El ladrón es: ___».

## Limitaciones conocidas del MVP (a resolver con backend/diseño)

1. El «Ian» del titular de la pág. 1 forma parte del fondo; solo la etiqueta
   «Regalo de …» es personalizable. Si queréis titular personalizable, el diseño
   debe dejar esa zona limpia o componerse por capas.
2. Fotos: máx 5 MB, solo JPG/PNG/WebP, guardadas en `localStorage` (límite ~5 MB
   total). En producción: subida a bucket privado + antivirus + strip EXIF.
3. El PDF sale del diálogo de impresión del navegador (A4, sin cabeceras).
   En producción: render server-side (Chromium) para fidelidad total.
4. Sin control de un solo uso todavía: eso llega con códigos de canje +
   sesiones en el backend cuando se integre con las tiendas.
