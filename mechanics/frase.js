/* Transformación «frase» de un hueco (como «runes», no es una mecánica): mete el valor del campo en una frase fija
   del idioma de la versión, p. ej. «¡Alguien ha robado el regalo de {}!» → «¡Alguien ha robado el regalo de Ana!».
   Así un texto de la página lleva el nombre del comprador sin depender de dónde acabe la línea. Un hueco con
   "transform": "frase" lleva "params": { "text": { "es": "… {} …", "en": "… {} …" } }. Sin valor, no se dibuja. */
(function () {
  const TRANSFORMS = (globalThis.PMETransforms = globalThis.PMETransforms || {});

  TRANSFORMS.frase = (valor, params, lang) => {
    const v = String(valor || '').trim();
    if (!v) return '';
    const t = (params && params.text && (params.text[lang] ?? params.text.es)) || '{}';
    return t.split('{}').join(v);
  };
})();
