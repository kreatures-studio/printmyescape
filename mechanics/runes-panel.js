/* Mecánica «runes-panel»: el fondo de color de la nota cifrada (p. ej. la página 10). Tapa el
   ejemplo que trae el artista en su PDF. Se dibuja debajo del texto (capa «under»).
   params: x, y, w, h en % de la página (y desde arriba) y color [r, g, b] en 0–1. Contrato 3.2
   de PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});

  M['runes-panel'] = {
    type: 'runes-panel',
    layer: 'under',
    label: { es: 'Fondo de la nota cifrada', en: 'Ciphered note background' },
    params: { type: 'object', required: ['x', 'y', 'w', 'h', 'color'] },
    drawPage(ctx, p) {
      const rx = (v) => (v / 100) * ctx.PW, ry = (v) => ctx.PH - (v / 100) * ctx.PH;
      const c = p.color;
      ctx.page.drawRectangle({
        x: rx(p.x), y: ry(p.y + p.h), width: rx(p.x + p.w) - rx(p.x), height: ry(p.y) - ry(p.y + p.h),
        color: ctx.rgb(c[0], c[1], c[2]),
      });
    },
    validate(game, m) {
      const p = m.params || {};
      if (!Array.isArray(p.color) || p.color.length !== 3) return [{ path: 'params.color', message: 'debe ser [r, g, b]' }];
      return [];
    },
  };
})();
