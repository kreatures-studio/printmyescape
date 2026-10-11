/* Transformación «runes» de un hueco (no es una mecánica: se aplica al valor de un hueco).
   El texto se escribe en el alfabeto de la fuente pigpen (mayúsculas, sin acentos ni signos)
   y va precedido del texto fijo de params.prefix en el idioma de la versión (p. ej. «TE QUIERO »
   o «I LOVE »). Un hueco con "transform": "runes" lleva
   "params": { "prefix": { "es": "...", "en": "..." } }. Contrato 3.2 de PLAN-CREADOR.md. */
(function () {
  const TRANSFORMS = (globalThis.PMETransforms = globalThis.PMETransforms || {});

  /* Mayúsculas, sin acentos ni signos; solo letras A–Z y espacios. */
  const normRunes = (s) => (s || '').toUpperCase().replace(/[ÁÀÄÂ]/g, 'A').replace(/[ÉÈËÊ]/g, 'E')
    .replace(/[ÍÌÏÎ]/g, 'I').replace(/[ÓÒÖÔ]/g, 'O').replace(/[ÚÙÜÛ]/g, 'U').replace(/Ñ/g, 'N')
    .replace(/[^A-Z ]/g, '').replace(/ +/g, ' ').trim();

  TRANSFORMS.runes = (valor, params, lang) => {
    const nv = normRunes(valor);
    return nv ? ((params.prefix && params.prefix[lang]) || '') + nv : '';
  };
})();
