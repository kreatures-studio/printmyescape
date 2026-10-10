/* Mecánica «initial»: el icono de cada app es la inicial de su nombre (p. ej. APP_1 → S8_ICON_1).
   params.map: { campo de origen: campo derivado }. La inicial es el primer carácter alfanumérico,
   en mayúscula; sin nombre, vacío. No dibuja nada. Contrato 3.2 de PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});
  const ALFANUM = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]/;

  M.initial = {
    type: 'initial',
    layer: 'none',
    label: { es: 'Inicial del nombre', en: 'Initial of the name' },
    params: { type: 'object', required: ['map'] },
    derive(valores, params) {
      const out = {};
      Object.keys(params.map || {}).forEach((origen) => {
        const nombre = String(valores[origen] || '').trim();
        const mc = ALFANUM.exec(nombre);
        out[params.map[origen]] = mc ? mc[0].toUpperCase() : '';
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
