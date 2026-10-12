# Ensayo F3.3: «Misión Secreta: Operación Cumpleaños»

Primer juego compuesto desde cero por Claude en una sesión limpia: un agente sin contexto previo, con el skill
`crear-escape-room` y las herramientas MCP del paquete `.pme/` (llamadas con `node .pme/mcp/cli.mjs`), en un
repositorio de juegos nuevo con su biblioteca. El estudio hizo de cliente: escribió el encargo y aprobó la
estructura antes de maquetar.

## Encargo

Cumpleaños para 9–12 años, 2–6 jugadores, unos 45 minutos, español e inglés. 6 páginas, sin sospechosos, 2 puzzles
de contenido y 1 del catálogo, con el arte que ya hay en la biblioteca. Se personaliza nombre, edad y foto (el
agente añadió nombre en clave, «superpoder», quien dirige la misión, el escondite y un mensaje secreto).

## Resultado

| Página | Contenido | Puzzle |
| --- | --- | --- |
| p1 | Expediente: historia, ficha del agente con foto, contraseña | — |
| p2 | 8 carnets de agente para recortar (el del cumpleaños, relleno) | — |
| p3 | Mensaje en runas (Pigpen) con su clave | Mensaje interceptado (contenido): CONFETI / CONFETTI |
| p4 | Móvil con un chat de frutas que suman | El móvil del cifrador (contenido): 20 |
| p5 | Documento triturado, va en un sobre | Tiras, `puzzle-strips@1` (catálogo): FELICIDAD / CELEBRATE y el escondite |
| p6 | Hoja para quien dirige la misión: preparación, fichas, soluciones y pistas | — |

`validate_game` sin errores ni avisos en borrador y para enviar; todos los campos caben con su tope; vista previa
revisada por el agente (36 PNG) y por el estudio (las 6 páginas del ejemplo largo en los dos idiomas; el orden de
las tiras comprobado contra la permutación). Sin arte nuevo que encargar ni mecánicas que presupuestar.

## Lo que encontró el agente y qué se hizo

| Hallazgo | Arreglo |
| --- | --- |
| No se podía cambiar ni quitar un puzzle ya añadido (ficha, solución y pistas del de catálogo) | Herramientas `update_puzzle` y `remove_puzzle` (antes de maquetar) |
| La línea de órdenes del validador buscaba el arte en el kit antiguo y daba 38 errores | `tools/game/validate.mjs` usa la biblioteca en juegos v2, como el servidor |
| «→» salía como recuadro: Open Sans, Caveat y Courier no la tienen, y nadie avisaba | Aviso nuevo: carácter que la fuente de un texto o campo no tiene |
| Dos claves de texto sin usar que no se podían borrar | `set_texts` con `null` las quita; aviso de claves que ningún texto usa |
| `update_puzzle` repetía ids si unos elementos traían id y otros no | Ids libres teniendo en cuenta los que llegan en la misma petición |
| El arte que va después del primer texto se dibuja encima de todos los textos | Documentado en el skill (`formato.md`): el motor tiene dos bandas |
| El puzzle de tiras no se dejaba añadir antes de colocar sus campos | Documentado en `puzzles.md` |
| Opciones de estilo del motor no descritas (`tight`, `vTop`, `wrap`, frases con datos) | Documentado en `formato.md` |
| `puzzles.md` citaba «nombre en runas» como puzzle del catálogo, y no lo es | Corregido |
| La sección `cumpleanero@1` y la página `ficha-cumpleanero@1` son de «quién ha sido» (adultos) | Pendiente: guardar en la biblioteca una sección infantil desde este juego |
| La hoja rayada de la p9 original tiene 9 rayas que se confunden con las 8 guías de corte | El agente usó otra hoja; pendiente para quien use el puzzle de tiras |
| Al plano `puzzle-plano-casa-cuadricula@1` le falta la «D» de las columnas | Pendiente para Kreatures |

## Para la partida de prueba (persona)

Imprimir `mision-secreta-prueba-es.pdf` (o `-en`), la p6 aparte para quien dirige y la p5 dentro de un sobre.
Observar y anotar:

1. Prueba 1: ¿se distinguen los espacios entre palabras del mensaje en runas? ¿Cuánto tardan?
2. Prueba 2: ¿ven que en la tercera fila hay dos mangos (uno detrás del otro)? ¿Algún «+» pegado a un plátano molesta?
3. Prueba final: ¿se recortan bien las tiras (unos 19,6 mm) con tijeras infantiles? ¿Se ven las guías al imprimir?
4. Tamaño de letra de las etiquetas de los carnets (unos 5 pt) y de las soluciones de p6 (unos 7,7 pt).
5. Tiempo total frente a los 45 minutos previstos, y si alguna pista hizo falta.
