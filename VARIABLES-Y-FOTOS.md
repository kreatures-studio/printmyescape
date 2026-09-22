# Variables y fotos del juego — lista para el artista

> Este documento es la **lista cerrada** de todo lo que cambia por cliente.
> Cada código se escribe en Illustrator tal cual (mayúsculas, corchetes),
> **un código por caja de texto**, en la capa `VARIABLES`.
> Las fotos son rectángulos rosa `#FF00FF` con nombre, en la capa `FOTOS`
> (ver `GUIA-ARTISTA.md` para el cómo).

Reglas de los códigos: mayúsculas, sin eñes ni tildes ni espacios
(usar `_`). Deben coincidir **letra por letra** con esta lista.

---

## 1. Persona homenajeada (la víctima)

| Código | Qué es | Máx. | Ejemplo |
|--------|--------|------|---------|
| `[NOMBRE_CUMPLE]` | Nombre del homenajeado | 24 letras | Mariana |
| `[EDAD]` | Años que cumple | 3 cifras | 30 |

| Foto | Quién | Formato |
|------|-------|---------|
| `FOTO_CUMPLE` | Retrato del homenajeado | Vertical 4:5 (solo si su ficha lleva foto, como el piloto) |

## 2. Sospechosos 1 a 8 (se repite 8 veces, cambiando el número)

| Código | Qué es | Máx. | Ejemplo |
|--------|--------|------|---------|
| `[NOMBRE_1]` … `[NOMBRE_8]` | Nombre del sospechoso | 20 letras | Lucía |
| `[APODO_1]` … `[APODO_8]` | Su apodo (opcional; si está vacío no se imprime nada) | 24 letras | La Veloz |
| `[ESCONDITE_1_A]` … `[ESCONDITE_8_A]` | Lugar 1 donde se escondería | 70 letras | Al lado de la basura de la cocina |
| `[ESCONDITE_1_B]` … `[ESCONDITE_8_B]` | Lugar 2 donde se escondería | 70 letras | Estaba sentada frente al ordenador |

| Foto | Quién | Formato |
|------|-------|---------|
| `FOTO_1` … `FOTO_8` | Retrato del sospechoso | Vertical 4:5 |

**Importante**: si un sospechoso aparece en varias páginas (tablero,
ficha, pistas…), se usa **el mismo código y el mismo `FOTO_N`** en todas.
No crear `FOTO_1` y `FOTO_1_B`: es la misma persona, el mismo nombre.

## 3. Resumen de cuentas

- Textos variables: **34** (2 del homenajeado + 8 × 4 de sospechosos).
- Fotos: **9** (1 + 8), todas verticales 4:5.
- Recomendación de resolución mínima para las fotos de cliente:
  600 × 750 px (el asistente las recorta solo).

## 4. Anexo: contenidos extra del formulario (pendientes de maquetación)

El cuestionario recoge además estos datos por personaje, por si el diseño
les da página propia. **No crear códigos todavía**: cuando el diseño decida
dónde van, les asignamos `[CODIGO]` siguiendo el mismo patrón.

- S1: sitio que le da vergüenza + noticia que le darían allí.
- S2: persona de su amor prohibido.
- S3: tienda que le da vergüenza + producto que compraría.
- S4: persona con la que se escondería + mensaje que le confesaría.
- S5: dos webs que le da vergüenza que le pillen mirando.
- S6: destinatario de postal + texto + nota secreta de la mochila.
- S7: dos aficiones secretas.
- S8: cuatro apps que le da vergüenza admitir.
- Cumpleañero: alias, por qué se le conoce, debilidad, info importante, notas.

---

*Documento vivo: si el diseño añade o quita un dato, se actualiza aquí
primero y luego en Illustrator.*
