# Guía para el artista — Cómo preparar las páginas en Illustrator

> **Idea en una frase:** dibuja el juego como siempre, pero las palabras se quedan
> como palabras (como en Word). Nuestro programa las borrará y escribirá otras:
> las traducciones a otros idiomas y los nombres de cada cliente.
> Lo único prohibido es convertir el texto en dibujo.

---

## 1. Las 4 capas (el panel Capas: Ventana > Capas)

Crea estas 4 capas con **exactamente** estos nombres y dibuja cada cosa en la suya:

| Capa         | Qué va dentro                                              |
|--------------|------------------------------------------------------------|
| `FONDO`      | Todo el dibujo: papeles, marcos, polaroids vacías, adornos |
| `FIJOS`      | Textos que nunca cambian (título, instrucciones, pistas fijas) |
| `VARIABLES`  | Textos que cambian por cliente (nombres, edad, escondites) |
| `FOTOS`      | Rectángulos rosas donde irán las fotos (punto 4)           |

## 2. Los textos: 3 reglas de oro

**Regla 1 — Cada texto en su cajita.** Una caja de texto por cada cosa:
una para el título, una para cada pista, una para cada nombre.
No metas varias etiquetas distintas dentro de una misma caja gigante.

**Regla 2 — No convertir en contornos.** Cuando termines un texto, **NO**
uses *Texto > Crear contornos* ni *Objeto > Expandir* en él. Si lo haces,
las letras se vuelven dibujo y ya nadie puede cambiarlas. Los dibujos sí
puedes expandirlos; los textos, nunca.

**Regla 3 — Los datos del cliente se escriben como códigos.** Donde vaya
algo que cambia por cliente, en vez de inventarte un ejemplo escribe un
código entre corchetes. Nosotros te daremos la lista exacta; tiene esta pinta:

- `[NOMBRE_1]`, `[NOMBRE_2]` … `[NOMBRE_8]` → nombre de cada sospechoso
- `[APODO_1]` … `[APODO_8]` → su apodo
- `[EDAD]` → los años que cumple el homenajeado
- `[NOMBRE_CUMPLE]` → su nombre
- `[ESCONDITE_1_A]`, `[ESCONDITE_1_B]` … → los escondites de cada uno

Escríbelos tal cual, con corchetes y en mayúsculas. Es como dejar un hueco
con etiqueta: luego el programa pone ahí el texto de cada cliente.

## 3. Tipografías: solo 2, gratuitas

Instálalas desde Google Fonts (son gratis, también para uso comercial)
y no uses ninguna otra para textos:

- **Caveat** → nombres de personas (aspecto manuscrito).
  https://fonts.google.com/specimen/Caveat
- **Nunito** → todo lo demás (pistas, instrucciones, historia).
  https://fonts.google.com/specimen/Nunito

¿Por qué solo estas? Porque necesitamos el mismo archivo de letra para
imprimir los textos traducidos; si usas otras, no podremos replicarlas.

## 4. Los huecos de foto: rectángulos rosas

Donde vaya la foto de un sospechoso (polaroids, marcos…):

1. Dibuja un **rectángulo** del tamaño exacto del hueco, en la capa `FOTOS`.
2. Ponle **borde rosa fuerte** (`#FF00FF`), sin relleno.
3. Dale nombre: selecciónalo, y en el panel Capas haz doble clic sobre
   `<Rectángulo>` y renómbralo como `FOTO_1`, `FOTO_2`… (uno por sospechoso;
   si el mismo sospechoso sale en varias páginas, usa el mismo nombre:
   `FOTO_1` en todas).
4. Ese rosa **no se imprime**: es solo la marca para que el programa sepa
   dónde colocar cada foto.

## 5. Qué archivos exportar (2 PDF)

Cuando termines, expórtanos **2 versiones** (*Archivo > Guardar como >
Adobe PDF*):

**Archivo 1 — `juego-con-textos.pdf` (referencia).**
Con TODAS las capas visibles. De aquí sacamos la lista de textos, sus
posiciones y sus estilos.

**Archivo 2 — `juego-fondo.pdf` (el importante).**
Oculta las capas `FIJOS`, `VARIABLES` y `FOTOS` (clic en el ojo) y exporta
solo con `FONDO` visible: el dibujo limpio, sin palabras ni rectángulos
rosas. Sobre este colocará el programa todos los textos y fotos.

**Ajustes del PDF (las dos versiones):**
- Preajuste: *[Calidad de impresión]* (o *High Quality Print*).
- **Desactiva** «Conservar las funciones de edición de Illustrator»
  (esto hincha el archivo de 3 MB a 30 MB sin motivo).
- Compatibilidad: Acrobat 6 (PDF 1.5) o superior.
- Fuentes: incrustadas (o subconjunto). No contornear nada.

Los PNG de vista previa los generamos nosotros del PDF; no hace falta
que exportes imágenes.

## 6. Lista de comprobación antes de enviar

- [ ] Cada texto está en su propia caja (nada de cajas gigantes mixtas).
- [ ] Ningún texto está convertido en contornos (selecciónalo: si ves
      letras editables, bien; si ves puntos de ancla, mal).
- [ ] Los códigos `[ASI]` están en la capa `VARIABLES`, en mayúsculas.
- [ ] Los rectángulos `FOTO_*` son rosas `#FF00FF`, con nombre y en la
      capa `FOTOS`.
- [ ] Solo se usan Caveat y Nunito en los textos.
- [ ] Envías los 2 PDF: con-textos y fondo-limpio.

## 7. Qué pasa después (para que no te preocupes)

1. Sacamos del PDF la lista de textos con su posición y estilo.
2. Traducimos los fijos al inglés (y más idiomas después).
3. El cliente rellena el asistente (nombres, fotos, escondites…).
4. El programa monta el PDF final sobre tu fondo limpio.
5. **Te enseñamos pruebas en imagen de cada idioma** para que las valides
   antes de imprimir. Si algo se mueve o desborda, lo ajustas en
   Illustrator como siempre y reexportas.

¿Dudas? Pregunta antes de contornear nada. 🙂
