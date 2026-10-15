# Presupuestos

Los presupuestos son `presupuestos/P-AAAA-NNN.json` en la rama principal del repositorio de juegos, con las tarifas
del estudio en `presupuestos/tarifas.json`. Son los mismos que el estudio ve y edita en el creador (Presupuestos):
lo que hagas aquí aparece allí y al revés. **Nunca escribas estos JSON a mano**: usa las herramientas.

## Herramientas

| Herramienta | Para qué |
|---|---|
| `sync_budgets` | `pull` trae los del creador (antes de empezar); `push` sube los tuyos a la rama principal sin cambiar la rama del juego. Si se niega con `conflicto`, haz `pull` y repite el cambio. |
| `get_rates` | Perfiles (€/h) y conceptos, con horas y precio por nivel de complejidad. |
| `list_budgets` / `get_budget` | Los que hay; uno entero con sus líneas numeradas (`n`) y totales por sección. |
| `create_budget` | Uno nuevo. `empezar`: `blanco`, `presupuestar` (las notas «A presupuestar» del juego) o `tema` (cambio de tema: ajustes, retoque de cada pieza señalada y testing). `lineas`: las tuyas. |
| `update_budget` | `cambios` (título, cliente, estado, descuento, gestión…), `anadir`, `cambiar` (por id o por número de línea; al cambiar la complejidad las horas pasan a las de ese nivel) y `quitar`. |
| `export_budget` | PDF (con miniaturas de las piezas y el anexo «Dónde va cada cosa» con las páginas del escape) y Excel con fórmulas, en `salidas/presupuestos/`. |
| `set_rates` | Solo si el estudio lo pide: cambiar €/h, añadir o cambiar conceptos. Los presupuestos hechos no cambian. |

## Tarifas de partida (las del estudio)

| Concepto (`id`) | Perfil | Horas | Precio |
|---|---|---|---|
| `prop` — complejidad baja / media / alta / muy alta (`sencilla`, `media`, `compleja`, `muy-compleja`) | arte 30 €/h | 0,5 / 1 / 2 / 2,5 | 15 / 30 / 60 / 75 € |
| `maquetacion` (por escape) | maquetación 30 €/h | 5 | 150 € |
| `gamedesign-puzzle` — sencillo / medio / complejo | game design 30 €/h | 2 / 3,5 / 7 | 60 / 105 / 210 € |
| `gamedesign-testing` | game design 30 €/h | 3 | 90 € |
| `programacion-puzzle` — sencillo / medio / complejo | programación 50 €/h | 1 / 2 / 3 | 50 / 100 / 150 € |
| `programacion-ajustes` | programación 50 €/h | 1 | 50 € |
| `otro` (por horas) | maquetación 30 €/h | 1 | 30 € |

Comprueba siempre con `get_rates`: el estudio puede haberlas cambiado. IVA 21 %; gestión 0 % salvo que se pida.

## Cómo elegir

- **Una cosa por línea**, con una descripción que el cliente entienda («Tarta de cumpleaños con velas, premio de la
  prueba»). Cosas iguales, una línea con `cantidad` («Globo, confeti y gorro»: 3 props de complejidad baja).
- **Props** (cada pieza de arte que se pinta o se retoca): baja = icono, objeto simple o retoque; media = objeto con
  detalle (una tarta, una nota manuscrita); alta = personaje, dispositivo, marco elaborado; muy alta = ilustración o
  escena (un cuadro con objetos escondidos).
- **Un puzzle nuevo** lleva su game design y su programación, con la misma complejidad salvo que haya motivo: una
  contraseña con pistas es sencillo o medio; tiras recortables, cuadrículas o cifrados con varias capas, complejo.
- **Maquetación** una vez por escape que se maqueta o se rehace; **testing** una vez por entrega (partida completa
  impresa). Una pregunta nueva del formulario o un campo calculado: `programacion-ajustes`.
- Si dudas entre dos complejidades, elige y **dilo en el resumen** al estudio: es quien decide.

## Señalar dónde va cada cosa (anclas)

Si el presupuesto es de un juego (`juego`), cada línea puede llevar `anclas: [{ pagina, elemento?, x?, y? }]`:

- Una pieza que ya existe (retocarla): `{ pagina: "p1", elemento: "p1-e4" }` (ids de `get_game`). La miniatura de la
  pieza sale en la línea del PDF.
- Algo nuevo en una página: `{ pagina: "p5", x: 30, y: 40 }` (x, y en % de la página, desde arriba a la izquierda).
- Una página nueva aún no existe: ancla en la página junto a la que irá, o sin ancla.

Las anclas se comprueban contra el juego; en el creador y en el PDF salen como números sobre las páginas del escape.

## Ejemplo

«Presupuéstame una prueba nueva con un cuadro de la fiesta para el juego del cumpleaños»:

```json
create_budget {
  "titulo": "Misión Secreta: prueba nueva «El cuadro de la fiesta»", "cliente": "…", "juego": "cumple-mision-secreta",
  "descripcion": "Qué se hace y qué no, en dos o tres frases.",
  "lineas": [
    { "concepto": "prop", "complejidad": "muy-compleja", "descripcion": "Cuadro de la fiesta con cinco objetos escondidos" },
    { "concepto": "maquetacion", "descripcion": "Página nueva de la prueba", "anclas": [{ "pagina": "p5", "x": 50, "y": 6 }] },
    { "concepto": "gamedesign-puzzle", "complejidad": "media", "descripcion": "Objetos, pistas y contraseña" },
    { "concepto": "programacion-puzzle", "complejidad": "media", "descripcion": "Contraseña con las iniciales", "anclas": [{ "pagina": "p5", "elemento": "p5-e1" }] },
    { "concepto": "gamedesign-testing", "descripcion": "Partida completa impresa" }
  ]
}
```

Después `export_budget`, mira las páginas del PDF (que nada se corte ni se solape) y `sync_budgets` push.
