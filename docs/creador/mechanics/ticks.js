/* Mecánica «ticks»: una X en las casillas marcadas de un campo multi (p. ej. «Delitos
   conocidos» en la página 4). Las casillas siguen el orden de las opciones del campo; si el
   campo admite «Otro», la última casilla es «Otro». Contrato 3.2 de PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});

  /* 'a||b||Otro: x' -> índices de las casillas marcadas (la de «Otro» es opciones.length) */
  function marcadas(valor, campo) {
    const opts = campo.options || [];
    const out = [];
    String(valor || '').split('||').forEach((p) => {
      const t = p.trim();
      if (!t) return;
      if (campo.allowOther && /^(Otro|Other):/.test(t)) {
        if (out.indexOf(opts.length) < 0) out.push(opts.length);
        return;
      }
      for (let i = 0; i < opts.length; i++) {
        if ((t === opts[i].es || t === opts[i].en) && out.indexOf(i) < 0) out.push(i);
      }
    });
    return out;
  }

  M.ticks = {
    type: 'ticks',
    layer: 'over',
    label: { es: 'Casillas marcadas', en: 'Ticked boxes' },
    params: { type: 'object', required: ['field', 'boxes'] },
    derive() { return {}; },
    drawPage(ctx, params) {
      const campo = ctx.fields[params.field];
      if (!campo) throw new Error(`ticks: no existe el campo «${params.field}»`);
      const tinta = ctx.rgb(0.114, 0.114, 0.106);
      const d = (params.half || 0.6) * ctx.PW / 100;
      marcadas(ctx.values[params.field], campo).forEach((i) => {
        const b = params.boxes[i];
        if (!b) return;
        const bx = (b.x / 100) * ctx.PW, by = ctx.PH - (b.y / 100) * ctx.PH;
        ctx.page.drawLine({ start: { x: bx - d, y: by - d }, end: { x: bx + d, y: by + d }, thickness: 0.9, color: tinta });
        ctx.page.drawLine({ start: { x: bx - d, y: by + d }, end: { x: bx + d, y: by - d }, thickness: 0.9, color: tinta });
      });
    },
    validate(game, m) {
      const params = m.params || {};
      const campo = (game.fields || {})[params.field];
      if (!campo) return [{ path: 'params.field', message: `no existe el campo «${params.field}»` }];
      const casillas = (campo.options || []).length + (campo.allowOther ? 1 : 0);
      if ((params.boxes || []).length !== casillas) {
        return [{ path: 'params.boxes', message: `hay ${(params.boxes || []).length} casillas y el campo tiene ${casillas} opciones` }];
      }
      return [];
    },
  };
})();
