/* Mecánica «join»: une un nombre y su alias en un campo derivado, «Nombre "Alias"» (la ficha
   del cumpleañero, p. ej. NOMBRE_CUMPLE + B_ALIAS → NOMBRE_CUMPLE_FICHA). Sin alias, solo el
   nombre. No dibuja nada: solo calcula el valor del campo derivado. Contrato 3.2 de
   PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});

  M.join = {
    type: 'join',
    layer: 'none',
    label: { es: 'Nombre con alias', en: 'Name with alias' },
    params: { type: 'object', required: ['name', 'alias', 'target'] },
    derive(valores, params) {
      const nombre = String(valores[params.name] || '').trim();
      const alias = String(valores[params.alias] || '').trim();
      return { [params.target]: nombre && alias ? nombre + ' "' + alias + '"' : nombre };
    },
    validate(game, m) {
      const p = m.params || {};
      const campos = game.fields || {};
      const errs = [];
      [p.name, p.alias].forEach((f) => {
        if (!campos[f]) errs.push({ path: 'params', message: `no existe el campo «${f}»` });
      });
      if (!(m.derives || []).includes(p.target)) {
        errs.push({ path: 'params.target', message: `«${p.target}» debe estar en derives` });
      }
      return errs;
    },
  };
})();
