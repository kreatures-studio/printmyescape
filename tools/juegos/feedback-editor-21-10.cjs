#!/usr/bin/env node
// Cambios del «Feedback del editor de personalización» (21-10) en Regalo robado (por piezas).
// Uso: node tools/juegos/feedback-editor-21-10.cjs <game.json>   (lo reescribe; se puede aplicar una sola vez o varias)
const fs = require('fs');
const P = process.argv[2];
const g = JSON.parse(fs.readFileSync(P, 'utf8'));
const F = g.fields;
const T = (k, campo, es, en) => {
  if (!F[k]) throw new Error(`no hay campo ${k}`);
  if (es === null) { delete F[k][campo]; return; }
  F[k][campo] = { es, en };
};
const EJ = (id, k, es, en) => {
  const e = g.examples.find((x) => x.id === id);
  if (e.values.es[k] === undefined) throw new Error(`ejemplo ${id} sin ${k}`);
  e.values.es[k] = es; e.values.en[k] = en;
};

// 02 · C01: dos ejemplos en la ayuda de «¿Por qué se le conoce?» (el segundo, acortado para que quepa en 30)
T('FAMA', 'ej', null);
T('FAMA', 'desc', 'Ejemplos: Por comer hamburguesas. Por decir siempre «yo no fui».',
  'Examples: For eating burgers. For saying "it wasn\'t me".');
// G01: frases a medias → preguntas, como las de al lado
T('DEBILIDAD_TEXTO', 'q', '¿Cuál es su mayor debilidad?', 'What is their biggest weakness?');
T('TALENTO', 'q', '¿Cuál es su mayor talento?', 'What is their greatest talent?');
// 03 · C02: ayuda en los dos campos largos (decorativos)
T('B_INFO', 'q', 'Información que sus amigos y familiares consideran importante sobre esta persona.',
  'Information that their friends and family consider important about this person.');
T('B_INFO', 'desc', 'Añade una anécdota o un detalle divertido para personalizar la historia. Esta información es decorativa y no afecta a los puzles ni a su resolución.',
  'Add an anecdote or a funny detail to personalise the story. This information is decorative and does not affect the puzzles or how they are solved.');
T('B_NOTES', 'desc', 'Puedes incluir manías, costumbres o curiosidades que hagan gracia. Estos detalles son decorativos y no afectan a los puzles ni a su resolución.',
  'You can include quirks, habits or curiosities that are fun. These details are decorative and do not affect the puzzles or how they are solved.');

// Con sus ayudas, los dos campos largos ya no caben juntos sin desplazar la tarjeta: cada uno en su pantalla.
g.form.sections.find((x) => x.id === 'victima').screenBreaks = ['B_NOTES'];

// G01: escondites de los 8 sospechosos, con punto
for (let n = 1; n <= 8; n++) {
  T(`S${n}_HIDEA`, 'q', 'Escribe un lugar donde se escondería esta persona si robase algo.',
    'Write a place where this person would hide if they stole something.');
  T(`S${n}_HIDEB`, 'q', 'Ahora escribe otro posible lugar donde se escondería esta persona si robase algo.',
    'Now write another possible hiding place for this person if they stole something.');
}
// 04 · S1A: el lugar del test (con punto y sin la errata «que le da vergüenza ir»), justo encima del resultado
T('TEST_LUGAR', 'q', 'Imagina un sitio al que le da vergüenza ir, que no le diría a nadie y al que va a por un tipo de resultado.',
  'Imagine a place they are embarrassed to go to, that they would never tell anyone about, and that they go to for one particular kind of result.');
T('TEST_LUGAR', 'desc', 'Ejemplos: Club de monedas, la Tuna o Granjero busca novia.',
  'Examples: Coin club, the folk group or Farmer seeks wife.');
const s1 = g.form.sections.find((s) => s.id === 's1');
s1.screenBreaks = ['TEST_LUGAR'];

// 05 · S2A: amor secreto, sin la referencia a las runas
T('S2_SECRET_LOVE', 'q', 'Escribe el nombre de alguien por quien esta persona sentiría un amor secreto que le daría vergüenza confesar.',
  'Write the name of someone this person would secretly be in love with and would be embarrassed to confess.');
T('S2_SECRET_LOVE', 'desc', 'Puede ser una persona real, un amor platónico o un personaje de dibujos animados.',
  'It can be a real person, a platonic love or a cartoon character.');

// 06 · TP01: tienda y producto, por parejas y para todos los públicos
T('Nombre_Empresa', 'q', 'Una tienda en la que le daría vergüenza comprar algo.', 'A shop where they would be embarrassed to buy something.');
T('Nombre_Empresa', 'desc', 'Ejemplos: Club del Peluche, Moda de Cuento o Todo Karaoke.', 'Examples: Teddy Bear Club, Fairy Tale Fashion or All Karaoke.');
T('CONCEPTO', 'q', 'El producto que compraría.', 'The product they would buy.');
T('CONCEPTO', 'desc', 'Ejemplos: Oso con chupete, Pijama de hada o Micro de ducha.', 'Examples: Teddy with dummy, Fairy pyjamas or Shower mic.');
EJ('1', 'Nombre_Empresa', 'Club del Peluche', 'Teddy Bear Club');
EJ('1', 'CONCEPTO', 'Oso con chupete', 'Teddy with dummy');

// G01: sospechoso 4
T('NOMBRE_4.2', 'q', 'Pon el nombre de una persona con la que se escondería para hablar con ella.', 'Write the name of a person they would hide with to talk to them.');
T('MENSAJE_PERSONALIZADO', 'q', 'Escribe un mensaje que le confesaría este sospechoso a esa persona.', 'Write a message this suspect would confess to that person.');

// 07 · S5A: webs inventadas para todos los públicos
T('BUSQUEDA_1', 'q', 'Escribe un sitio web donde le daría vergüenza que le pillasen mirando.', 'Write a website where they would be embarrassed to be caught browsing.');
T('BUSQUEDA_1', 'desc', 'Ejemplos inventados: fansdelasiesta.com, clubdelpeluche.es o Reyes del Karaoke.', 'Made-up examples: siestafans.com, teddyclub.co.uk or Karaoke Kings.');
T('BUSQUEDA_2', 'q', 'Escribe otro sitio web donde le daría vergüenza que le pillasen mirando.', 'Write another website where they would be embarrassed to be caught browsing.');

// 08 · S6A: destinatario de la postal
T('NOMBRE_DEST', 'q', 'El nombre de una persona a la que le escribiría una postal.', 'The name of a person they would send a postcard to.');
T('NOMBRE_DEST', 'desc', 'Puede ser una persona real, un dibujo animado, un actor o actriz.', 'It can be a real person, a cartoon character, an actor or an actress.');
T('TEXTO_POSTAL', 'q', 'Lo que le escribiría en esa postal.', 'What they would write on that postcard.');
T('NOTA_PERSONALIZADA', 'q', 'Una nota que no quiere que vea nadie.', 'A note they do not want anyone to see.');

// 09 · S7A: aficiones
T('PERSONALIZADO_1', 'q', 'Una afición secreta que le daría vergüenza admitir.', 'A secret hobby they would be embarrassed to admit.');
T('PERSONALIZADO_1', 'desc', 'Ejemplos: Ensayar discursos de agradecimiento, inventar coreografías frente al espejo o celebrar cumpleaños de sus peluches.',
  'Examples: Rehearsing thank-you speeches, making up dance routines in front of the mirror or throwing birthday parties for their teddies.');
T('PERSONALIZADO_2', 'q', 'Otra afición que le daría vergüenza admitir.', 'Another hobby they would be embarrassed to admit.');

// 10 · APP01: enunciado y ayuda separados, sin nombres de aplicaciones
T('APP_1', 'q', 'Escribe el nombre de una aplicación que podría tener en su tableta o móvil y que le dé vergüenza admitir.',
  'Write the name of an app they might have on their tablet or phone and would be embarrassed to admit to.');
T('APP_1', 'desc', 'Puede ser una aplicación real o inventada.', 'It can be a real or a made-up app.');
T('APP_2', 'q', 'Escribe el nombre de otra aplicación que le dé vergüenza admitir.', 'Write the name of another app they would be embarrassed to admit to.');
T('APP_3', 'q', 'Escribe el nombre de una tercera aplicación que le dé vergüenza admitir.', 'Write the name of a third app they would be embarrassed to admit to.');
T('APP_4', 'q', 'Escribe el nombre de una cuarta aplicación que le dé vergüenza admitir.', 'Write the name of a fourth app they would be embarrassed to admit to.');
EJ('1', 'APP_1', 'Horóscopo', 'Horoscope');

fs.writeFileSync(P, JSON.stringify(g, null, 2) + '\n');
