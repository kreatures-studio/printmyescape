# Variables y fotos del juego — lista para el artista

> Esta es la **lista cerrada** de todo lo que cambia por cliente.
> Cada código se escribe en Illustrator tal cual, **un código por caja de texto**,
> en la capa `VARIABLES`. Las fotos son rectángulos rosa `#FF00FF` con nombre,
> en la capa `FOTOS` (ver `GUIA-ARTISTA.md` para el cómo).

Los códigos son los `id` de `templates/final3/template.json`. Deben coincidir
**letra por letra**; algunos no siguen el patrón de mayúsculas (`Nombre_Empresa`,
`NOMBRE_4.2`), así que se copian tal cual.

**Máx.** = caracteres que admite el formulario (`tools/limits.json`, aplicado en
`demo/src.html`). Política de nombres: **12 caracteres** para todos los nombres y
apodos de personas.

---

## 1. Cumpleañero (la víctima)

| Código | Qué es | Máx. |
|--------|--------|------|
| `[NOMBRE_CUMPLE]` | Nombre de la persona homenajeada | 12 |
| `[EDAD]` | Años que cumple (número del 1 al 110) | 3 cifras |
| `[FAMA]` | ¿Por qué se le conoce? | 24 |
| `[DEBILIDAD]` | Su mayor debilidad. Se elige con casillas (4 opciones y "Otra") | — |
| `[OTRO]` | Debilidad escrita a mano, si marca la casilla "Otra" | 18 |
| `[TALENTO]` | Su mayor talento | 15 |
| `[SOSPECHA]` | Si fuera sospechoso de algo, ¿de qué sería? | 17 |
| `[B_INFO]` | Información importante que sus amigos y familiares consideran | 200 |
| `[B_NOTES]` | Notas y observaciones | 200 |

| Foto | Quién |
|------|-------|
| `FOTO_CUMPLE` | Retrato del homenajeado |

## 2. Sospechosos 1 a 8 (se repite 8 veces, cambiando el número N)

| Código | Qué es | Máx. |
|--------|--------|------|
| `[NOMBRE_N]` | Nombre del sospechoso | 12 |
| `[APODO_N]` | Su apodo (opcional; si está vacío no se imprime nada) | 12 |
| `[SN_HIDEA]` | Primer lugar donde se escondería si robase algo | ver tabla |
| `[SN_HIDEB]` | Otro posible lugar donde se escondería | ver tabla |

| N | `SN_HIDEA` | `SN_HIDEB` |
|---|-----------|-----------|
| 1 | 37 | 24 |
| 2 | 37 | 24 |
| 3 | 23 | 37 |
| 4 | 38 | 38 |
| 5 | 24 | 38 |
| 6 | 37 | 37 |
| 7 | 24 | 37 |
| 8 | 38 | 25 |

| Foto | Quién |
|------|-------|
| `FOTO_N` (`FOTO_1` … `FOTO_8`) | Retrato del sospechoso |

**Importante**: si un sospechoso aparece en varias páginas (tablero, ficha,
pistas…), se usa **el mismo código y el mismo `FOTO_N`** en todas.
No crear `FOTO_1` y `FOTO_1_B`: es la misma persona, el mismo nombre.

## 3. Datos propios de cada sospechoso

Cada uno aparece en una página concreta del juego.

| Código | Sospechoso | Qué es | Máx. |
|--------|-----------|--------|------|
| `[RESULTADO_TEST]` | 1 | Resultado de su test (sale en su página, pág. 9) | 26 |
| `[S2_SECRET_LOVE]` | 2 | Nombre de la persona de su amor más prohibido. Sale en runas en su nota (pág. 10), precedido de "TE QUIERO" | 70 |
| `[Nombre_Empresa]` | 3 | Nombre de la empresa de la factura | 20 |
| `[CONCEPTO]` | 3 | Concepto de la factura | 16 |
| `[NOMBRE_4.2]` | 4 | Nombre del contacto de su chat (pág. 12). Es un campo aparte de `NOMBRE_4` | 12 |
| `[MENSAJE_PERSONALIZADO]` | 4 | Mensaje de la burbuja de su chat. Admite saltos de línea (pág. 12) | 42 |
| `[BUSQUEDA_1]` | 5 | Primera búsqueda del historial de su móvil (pág. 13) | 27 |
| `[BUSQUEDA_2]` | 5 | Segunda búsqueda del historial | 27 |
| `[NOMBRE_DEST]` | 6 | Persona a la que le escribiría una postal | 20 |
| `[TEXTO_POSTAL]` | 6 | Lo que le escribiría en la postal. Admite saltos de línea | 21 |
| `[NOTA_PERSONALIZADA]` | 6 | Una nota que no quiere que vea nadie. Admite saltos de línea | 34 |
| `[PERSONALIZADO_1]` | 7 | Una afición secreta que le daría vergüenza admitir | 48 |
| `[PERSONALIZADO_2]` | 7 | Otra afición secreta | 47 |
| `[APP_1]` | 8 | Una app de su tablet que le da vergüenza admitir | 21 |
| `[APP_2]` | 8 | Segunda app | 24 |
| `[APP_3]` | 8 | Tercera app | 24 |
| `[APP_4]` | 8 | Cuarta app | 26 |

`[S8_ICON_1]` … `[S8_ICON_4]` no se escriben: el motor pone solo la inicial de
cada app (APP_1 … APP_4).

## 4. Fotos

| Foto | Quién |
|------|-------|
| `FOTO_CUMPLE` | Cumpleañero |
| `FOTO_1` … `FOTO_8` | Sospechosos 1 a 8 |

- Vertical 4:5. Se recorta sola al marco; conviene que la cara quede centrada.
- Formatos: JPG, PNG o WebP. Mínimo 600 px en el lado corto; máximo 10 MB por foto.
- Recomendación para fotos de cliente: 600 × 750 px como mínimo.

## 5. Resumen de cuentas

- **62 campos de texto** en la plantilla `final3`:
  - 57 se escriben a mano.
  - 1 (`DEBILIDAD`) se elige con casillas.
  - 4 (`S8_ICON_1` … `S8_ICON_4`) se derivan solos.
- **9 fotos**: 1 del cumpleañero y 8 de sospechosos, todas verticales 4:5.

---

*Documento vivo: si el diseño añade o quita un dato, o cambia un límite, se
actualiza aquí primero (con `templates/final3/template.json` y `tools/limits.json`)
y luego en Illustrator.*
