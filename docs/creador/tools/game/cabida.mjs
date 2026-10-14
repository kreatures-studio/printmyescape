// Cabida de los campos de texto: cuántos caracteres caben en sus huecos sin que el motor los encoja más de lo
// admitido (fieldFits de tools/pme-compose-core.js, el mismo ajuste que el PDF). Sin dependencias de Node: la usan
// tools/game/limites.mjs (línea de órdenes) y el creador (formulario, «en la página N caben X»).
//
//   medirCabida(juegoV1, { fieldFits, fontMap, fuentes?, transforms?, mechanics?, campos? })
//     → { [campo]: { capacidad, porPagina: { [página]: capacidad }, cap } }   (capacidad null si no tiene hueco)
//   muestra: otro texto de medida (p. ej. letras sin espacios); por defecto, nombres o lorem ipsum.
//
// Los huecos de un campo son los suyos y los de los derivados de una mecánica que lo usa (APODO_n → APODO_n.PREF,
// nombre y alias → la ficha): los demás campos de esa mecánica entran con una muestra de su tope, así el derivado se
// mide en su peor caso. Se toma el mínimo en todos los idiomas (las transformaciones, como las runas, dependen de él).

export const PW = 595.276;
export const PH = 841.89;
export const MAX = 400; // tope de saneado del motor (CLEAN_MAX)
export const MUESTRA = {
  name: 'Mariana Jose Ana Luisa Carmen Rosa Lucia Elena Sofia Marta Irene Paula Nora',
  text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
};
export const TIPOS_TEXTO = ['name', 'text', 'long'];

/** Campos de entrada que usa una mecánica (mapa origen → derivado, o nombre + alias). */
function entradasDe(m, game) {
  const pr = m.params || {};
  const out = [];
  if (pr.map) out.push(...Object.keys(pr.map));
  if (pr.name) out.push(pr.name);
  if (pr.alias) out.push(pr.alias);
  return out.filter((k) => (game.fields || {})[k]);
}

/** Muestra de un campo que ocupa su tope (sus caracteres como mucho). */
function muestraDe(k, game) {
  const campo = game.fields[k];
  const base = ((campo.type === 'name' ? MUESTRA.name : MUESTRA.text) + ' ').repeat(10).trim();
  return campo.cap ? base.slice(0, campo.cap) : base;
}

/** Huecos donde se ve un campo: [{ s (hueco), mech (mecánica que lo deriva o null), pagina }]. */
export function huecosDe(game, id) {
  const huecos = [];
  for (const p of game.template.pages) for (const s of p.slots || []) if (s.field === id) huecos.push({ s, mech: null, pagina: p.id });
  for (const m of game.mechanics || []) {
    const pr = m.params || {};
    const destinos = [];
    if (pr.map) for (const o of Object.keys(pr.map)) if (o === id) destinos.push(pr.map[o]);
    if (pr.target && (pr.name === id || pr.alias === id)) destinos.push(pr.target);
    for (const d of destinos) {
      for (const p of game.template.pages) for (const s of p.slots || []) if (s.field === d) huecos.push({ s, mech: m, pagina: p.id });
    }
  }
  return huecos;
}

export function medirCabida(game, { fieldFits, fontMap, fuentes = null, transforms = globalThis.PMETransforms || {}, mechanics = globalThis.PMEMechanics || {}, campos = null, muestra = null }) {
  const out = {};
  const ids = campos || Object.keys(game.fields || {});
  for (const id of ids) {
    const campo = (game.fields || {})[id];
    if (!campo || !TIPOS_TEXTO.includes(campo.type)) continue;
    const huecos = huecosDe(game, id);
    if (!huecos.length) { out[id] = { capacidad: null, porPagina: {}, cap: campo.cap ?? null }; continue; }
    const base = ((muestra || (campo.type === 'name' ? MUESTRA.name : MUESTRA.text)) + ' ').repeat(10);
    const medir = (lista) => {
      let capacidad = Infinity;
      for (const lang of game.languages) {
        const cabe = (n) => {
          const texto = base.slice(0, n).trim();
          return lista.every(({ s, mech }) => {
            let t = texto;
            if (mech) {
              const vals = {};
              for (const k of entradasDe(mech, game)) if (k !== id) vals[k] = muestraDe(k, game);
              vals[id] = texto;
              t = mechanics[mech.type].derive(vals, mech.params || {})[s.field];
            }
            if (s.transform && transforms[s.transform]) t = transforms[s.transform](t, s.params || {}, lang);
            return fieldFits(s, t, fontMap, PW, PH, fuentes);
          });
        };
        let c = 0;
        if (cabe(1)) {
          let lo = 1, hi = MAX;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi + 1) / 2);
            if (cabe(mid)) lo = mid; else hi = mid - 1;
          }
          c = lo;
        }
        capacidad = Math.min(capacidad, c);
      }
      return capacidad;
    };
    const porPagina = {};
    for (const pagina of [...new Set(huecos.map((h) => h.pagina))]) porPagina[pagina] = medir(huecos.filter((h) => h.pagina === pagina));
    out[id] = { capacidad: Math.min(...Object.values(porPagina)), porPagina, cap: campo.cap ?? null };
  }
  return out;
}
