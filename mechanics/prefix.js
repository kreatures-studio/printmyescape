/* Mecánica «prefix»: antepone un texto fijo a un campo cuando tiene valor (p. ej. la coma del
   apodo: APODO_1 → «, Apodo» en APODO_1.PREF). Sin valor, nada. params.map: { origen: derivado },
   params.prefix: el texto. No dibuja nada. Contrato 3.2 de PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});

  M.prefix = {
    type: 'prefix',
    layer: 'none',
    label: { es: 'Texto fijo delante', en: 'Fixed text before' },
    params: { type: 'object', required: ['map', 'prefix'] },
    derive(valores, params) {
      const out = {};
      Object.keys(params.map || {}).forEach((origen) => {
        const v = String(valores[origen] || '').trim();
        out[params.map[origen]] = v ? params.prefix + v : v;
      });
      return out;
    },
    validate(game, m) {
      const p = m.params || {};
      const campos = game.fields || {};
      const errs = [];
      Object.keys(p.map || {}).forEach((origen) => {
        if (!campos[origen]) errs.push({ path: 'params.map', message: `no existe el campo de origen «${origen}»` });
        if (!(m.derives || []).includes(p.map[origen])) {
          errs.push({ path: 'params.map', message: `«${p.map[origen]}» debe estar en derives` });
        }
      });
      return errs;
    },
  };
})();
