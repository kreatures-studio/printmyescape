/* Mecánica «strips»: la hoja de tiras de una página (p. ej. el test de la página 9). La zona
   x0–x1, y0–y1 (en % de la página) se corta en `strips` tiras; la tira i muestra la tira perm[i]
   de la página original, y se dibujan las guías de corte y la tijera. Capa «final»: se dibuja
   sobre la página ya compuesta (la página se copia antes). params: { x0, x1, y0, y1, strips,
   perm }. Contrato 3.2 de PLAN-CREADOR.md. */
(function () {
  const M = (globalThis.PMEMechanics = globalThis.PMEMechanics || {});

  M.strips = {
    type: 'strips',
    layer: 'final',
    label: { es: 'Hoja de tiras', en: 'Strips sheet' },
    params: { type: 'object', required: ['x0', 'x1', 'y0', 'y1', 'strips', 'perm'] },
    drawPage(ctx, sh) {
      const np = ctx.page, emb = ctx.source, ops = ctx.ops;
      const PW2 = ctx.PW, PH2 = ctx.PH;
      const X = (v) => (v / 100) * PW2;
      const Y = (v) => PH2 - (v / 100) * PH2;
      const sw = (sh.x1 - sh.x0) / sh.strips;
      for (let i = 0; i < sh.strips; i++) {
        const dx0 = X(sh.x0 + i * sw), dx1 = X(sh.x0 + (i + 1) * sw);
        const sx0 = X(sh.x0 + sh.perm[i] * sw);
        const yT = Y(sh.y0), yB = Y(sh.y1);
        np.pushOperators(ops.pushGraphicsState(),
          ops.moveTo(dx0, yB), ops.lineTo(dx1, yB), ops.lineTo(dx1, yT), ops.lineTo(dx0, yT),
          ops.closePath(), ops.clip(), ops.endPath());
        np.drawPage(emb, { x: dx0 - sx0, y: 0, width: PW2, height: PH2 });
        np.pushOperators(ops.popGraphicsState());
      }
      /* Guías de corte: discontinuas en cada frontera + tijera arriba */
      const ink = ctx.rgb(0.05, 0.15, 0.16);
      const yB2 = Y(sh.y1), yT2 = Y(sh.y0);
      for (let i = 1; i < sh.strips; i++) {
        const lx = X(sh.x0 + i * sw);
        np.drawLine({ start: { x: lx, y: yB2 }, end: { x: lx, y: yT2 },
          thickness: 1, color: ink, dashArray: [6, 4], opacity: 0.3 });
      }
      const scx = X(sh.x0 + sw), scy = yT2 + 16;
      np.drawLine({ start: { x: scx - 5, y: scy + 7 }, end: { x: scx + 5, y: scy - 7 }, thickness: 1.6, color: ink });
      np.drawLine({ start: { x: scx + 5, y: scy + 7 }, end: { x: scx - 5, y: scy - 7 }, thickness: 1.6, color: ink });
      np.drawCircle({ x: scx - 6.5, y: scy + 8.5, size: 3.2, borderColor: ink, borderWidth: 1.6 });
      np.drawCircle({ x: scx + 6.5, y: scy + 8.5, size: 3.2, borderColor: ink, borderWidth: 1.6 });
    },
    validate(game, m) {
      const p = m.params || {};
      const errs = [];
      const perm = Array.isArray(p.perm) ? p.perm.slice().sort((a, b) => a - b) : [];
      const esPermutacion = Number.isInteger(p.strips) && perm.length === p.strips && perm.every((v, i) => v === i);
      if (!esPermutacion) errs.push({ path: 'params.perm', message: `perm no es una permutación de 0..${p.strips - 1}` });
      if (!(p.x0 < p.x1 && p.y0 < p.y1)) errs.push({ path: 'params', message: 'la zona de tiras tiene que tener x0<x1 e y0<y1' });
      return errs;
    },
  };
})();
