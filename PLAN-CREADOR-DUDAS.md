# Dudas del plan del creador

Registro de decisiones tomadas al implementar `PLAN-CREADOR.md` (lo escribe quien implementa).

## Rama de M0

- El plan pide la rama `creador/m0`, pero ya existe la rama `creador`, y git no permite
  `creador/m0` junto a `creador`. Se usa **`creador-m0`**. Las siguientes ramas de hito serán
  `creador-m1`, `creador-m2`, etc.

## T0.1

- `schema/pme-game-1.schema.json` no impone idiomas concretos en `q`, `desc` ni `options`: así
  `roto.json` pasa el esquema y lo rechaza la validación cruzada de T0.3 («cada pregunta tiene
  todos los idiomas» y «cada campo de una sección existe»), como pide la aceptación.
- `background` acepta `pdf` (fondo del juego) o `layers` (piezas del kit). El contrato 3.1 solo
  muestra `layers` para páginas nuevas; se deja también a nivel de juego para no bloquear M4.
- Verificado con Python `jsonschema` (Draft 2020-12). El ajv instalado en esta máquina es 6.x y no
  sirve para 2020-12. T0.3 instala `ajv` 8 en `tools/` (usar `ajv/dist/2020`).
