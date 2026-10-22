#!/usr/bin/env node
// Ajustes del 22-10 en Regalo robado (por piezas): nombre del cumpleañero en «¡Alguien ha robado el regalo de…!»,
// más aire en «¿Cómo funciona?», la información importante sobre las líneas del papel, el mensaje cifrado del
// sospechoso 2, «Posibles ubicaciones» (números que caben en su insignia, textos de dos líneas centrados, sin
// números repetidos y sin «del despacho»).
// Uso: node tools/juegos/ajustes-22-10.cjs <game.json>   (lo reescribe)
const fs = require('fs');
const P = process.argv[2];
const g = JSON.parse(fs.readFileSync(P, 'utf8'));
const pag = (id) => g.pages.find((p) => p.id === id);
const el = (p, id) => { const e = pag(p).elements.find((x) => x.id === id); if (!e) throw new Error(`no hay ${id}`); return e; };
const r3 = (x) => Math.round(x * 1000) / 1000;

// 1. «¡Alguien ha robado el regalo de Ian!» llevaba el nombre del ejemplo escrito a mano: ahora es el nombre del
//    cumpleañero dentro de la frase (transformación «frase»), con el mismo estilo y sitio.
{
  const p3 = pag('p3');
  const i = p3.elements.findIndex((e) => e.id === 'p3-e3');
  if (i >= 0 && p3.elements[i].kind === 'text') {
    const t = p3.elements[i];
    // El orden de los textos fijos (compat.textOrder): se quita el de este texto y se renumeran los de la página.
    const indice = p3.elements.filter((e) => e.kind === 'text').indexOf(t);
    const num = g.pages.indexOf(p3) + 1;
    if (g.compat && g.compat.textOrder) {
      g.compat.textOrder = g.compat.textOrder.filter(([pg, k]) => !(pg === num && k === indice)).map(([pg, k]) => [pg, pg === num && k > indice ? k - 1 : k]);
    }
    p3.elements[i] = { id: 'p3-e3', kind: 'field', field: 'NOMBRE_CUMPLE', x: t.x, y: t.y, w: t.w + 4, h: t.h, fontFamily: t.fontFamily, size: t.size,
      color: t.color, xscale: t.xscale, angle: 0, transform: 'frase',
      params: { text: { es: '¡Alguien ha robado el regalo de {}!', en: 'Someone has stolen {}’s gift!' } } };
    for (const l of g.languages) delete g.i18n[l][t.key];
  }
}

// 2. «¿Cómo funciona?»: la lista no cabía en su caja y el motor apretaba las líneas. Caja más ancha y alta, hasta el plano.
Object.assign(el('p3', 'p3-e2'), { x: 6.4, y: 17.9, w: 43.5, h: 8.9, size: 1.9 });

// 3. Información importante: cada línea del texto sobre una línea del papel (las del fondo van cada 2,37 % del alto),
//    y todas con la misma anchura de letra (antes la última salía más ancha que las demás).
Object.assign(el('p4', 'p4-e21'), { y: 78.05, h: 17, size: 1.9, leading: 3.35, even: 1 });

// 4. Mensaje cifrado del sospechoso 2 (pigpen): la frase confirmada y el nombre al final. Solo letras: el alfabeto
//    pigpen no tiene acentos ni signos.
el('p10', 'p10-e5').params = { prefix: {
  es: 'AUNQUE NO DEJO DE PENSAR EN TI COMO AHORA SENTADA EN MI CAMA LO NUESTRO ES IMPOSIBLE ',
  en: 'EVEN THOUGH I CANNOT STOP THINKING ABOUT YOU LIKE NOW SITTING ON MY BED WHAT WE HAVE IS IMPOSSIBLE ',
} };

// La explicación del puzzle en inglés estaba a medias.
g.i18n.en['para-identificar-al-ladron-averiguad-exa'] = 'To identify the thief, work out exactly\nwhere the suspects and the gift were at\nthe time of the crime, placing them on the\nscene. The thief was alone in the room\nwith the gift.';

// En inglés, «We know that [nombre]» seguía con «they were…»: el nombre ya es el sujeto.
Object.assign(g.i18n.en, {
  'sabemos-que-estaba-haciendo-algo': 'We know that\nwas doing something',
  'sabemos-que-estaba-mandando-una-nota-sec': 'We know that\nwas sending a secret\nnote to someone, but won\u2019t\ntell us to whom.\nWe only have an encrypted note.',
  'sabemos-que-estaba-mirando-uno-de-los-cu': 'We know that\nwas looking at one of\nthe house paintings, and made some\nnotes on an invoice\nthey had.',
  'sabemos-que-estaba-escribiendose-por-una': 'We know that\nwas messaging someone\nthrough an app.',
  'sabemos-que-trae-una-mochila-al-abrirla-': 'We know that\ncarries a backpack.\nOpening it we found\nlots of random stuff, and',
});

// 5. Posibles ubicaciones.
//    5a. «Al lado de la trituradora de papeles» (sin «del despacho»), en una línea.
g.i18n.es['al-lado-de-la-trituradora-de-papeles'] = 'Al lado de la trituradora de papeles.';
g.i18n.en['al-lado-de-la-trituradora-de-papeles'] = 'Next to the paper shredder.';
//    5b. El sospechoso 3 tenía dos «3»: el de su segundo escondite pasa a 4.
el('p5', 'p5-e8').key = '4';
//    5c. Las tres ubicaciones que ocupaban dos líneas quedaban pegadas al borde de su etiqueta: ahora caben en una.
const quitarTexto = (pid, id) => {
  const p = pag(pid);
  const t = p.elements.find((e) => e.id === id);
  if (!t) return;
  const indice = p.elements.filter((e) => e.kind === 'text').indexOf(t);
  const num = g.pages.indexOf(p) + 1;
  if (g.compat && g.compat.textOrder) {
    g.compat.textOrder = g.compat.textOrder.filter(([pg, k]) => !(pg === num && k === indice)).map(([pg, k]) => [pg, pg === num && k > indice ? k - 1 : k]);
  }
  p.elements = p.elements.filter((e) => e !== t);
  if (!g.pages.some((x) => x.elements.some((e) => e.key === t.key))) for (const l of g.languages) delete g.i18n[l][t.key];
};
const UNA_LINEA = {
  'en-el-sofa-viendo-arte-en-su': ['En el sofá, viendo arte en el móvil.', 'On the sofa, viewing art on a phone.'],
  'estaba-en-un-sillon-con-un-ordenador': ['Estaba en un sillón con un portátil.', 'In an armchair with a laptop.'],
  'apoyandose-en-la-encimera-de-la-cocina': ['Apoyándose en la encimera.', 'Leaning on the kitchen counter.'],
};
for (const [k, [es, en]] of Object.entries(UNA_LINEA)) { g.i18n.es[k] = es; g.i18n.en[k] = en; }
quitarTexto('p5', 'p5-e30');   // «smartphone.»
quitarTexto('p6', 'p6-e16');   // «portátil.»
for (const id of ['p5', 'p6']) {
  const p = pag(id);
  const numeros = p.elements.filter((e) => e.kind === 'text' && /^\d+$/.test(e.key));
  const fila = (y) => numeros.reduce((a, n) => (Math.abs(n.y - y) < Math.abs(a.y - y) ? n : a), numeros[0]);
  //  5d. Números: todos del mismo tamaño y los de tres cifras más estrechos, para que quepan dentro de su insignia.
  for (const n of numeros) { n.size = 1.15; n.xscale = n.key.length >= 3 ? 0.8 : 1; }
  //  5e. Todas las ubicaciones (fijas y las del comprador) con el mismo ancho, hasta el final de su etiqueta: las
  //      cajas estrechas encogían los textos más largos (y casi todos en inglés).
  for (const t of p.elements.filter((e) => (e.kind === 'text' || e.kind === 'field') && e.fontFamily === 'OpenSans-Regular' && e.h <= 1.3)) t.w = 23;
  //  5f. Cada ubicación de una línea, a la altura de su número.
  for (const t of p.elements.filter((e) => e.kind === 'text' && (UNA_LINEA[e.key] || e.key === 'al-lado-de-la-trituradora-de-papeles'))) {
    const n = fila(t.y + (t.h > 2 ? t.h / 2 - 0.6 : 0.4));
    Object.assign(t, { y: n.y, h: 1.25, w: Math.max(t.w, 23) });
    delete t.tight;
  }
}

fs.writeFileSync(P, JSON.stringify(g, null, 2) + '\n');
