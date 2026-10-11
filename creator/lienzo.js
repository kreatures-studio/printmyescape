// Lienzo de una página (T5.3): capas y huecos en % de la página, con selección, arrastre,
// redimensión y teclado. No guarda nada: avisa a la aplicación con cada cambio (alMover, alRedimensionar,
// alSeleccionar, alEditar) y la aplicación redibuja.
const PASO = 0.5;       // % por pulsación de flecha
const PASO_GRANDE = 5;  // % con Mayús + flecha
const MIN_TAMANO = 1;   // % mínimo de un hueco
const MOVIMIENTO_MIN = 3; // px: menos es un clic, no un arrastre

const redondear = (v) => Math.round(v * 100) / 100;
const acotar = (v, min, max) => Math.min(Math.max(v, min), max);

/** Dibuja la página. op = { seleccion, alSeleccionar(k), alMover(k, cambios), alRedimensionar(k, cambios) }. */
export function pintarPagina(contenedor, pagina, op) {
  contenedor.replaceChildren();
  const lienzo = document.createElement('div');
  lienzo.className = 'lienzo';
  lienzo.setAttribute('role', 'group');
  lienzo.setAttribute('aria-label', `Página ${pagina.id}`);

  for (const c of pagina.layers || []) {
    const d = document.createElement('div');
    d.className = 'capa';
    d.dataset.asset = c.asset;
    Object.assign(d.style, { left: `${c.x}%`, top: `${c.y}%`, width: `${c.w}%`, height: `${c.h}%`, transform: `rotate(${c.angle || 0}deg)` });
    d.textContent = c.asset;
    lienzo.append(d);
  }

  (pagina.slots || []).forEach((s, k) => {
    const d = document.createElement('div');
    d.className = 'hueco' + (k === op.seleccion ? ' sel' : '');
    d.dataset.k = String(k);
    d.tabIndex = 0;
    d.setAttribute('role', 'button');
    d.setAttribute('aria-pressed', String(k === op.seleccion));
    d.setAttribute('aria-label', `Hueco ${s.field}`);
    Object.assign(d.style, { left: `${s.x}%`, top: `${s.y}%`, width: `${s.w}%`, height: `${s.h}%` });
    const etiqueta = document.createElement('span');
    etiqueta.textContent = s.field;
    d.append(etiqueta);
    if (k === op.seleccion) {
      const asa = document.createElement('div');
      asa.className = 'asa';
      asa.dataset.asa = String(k);
      d.append(asa);
    }
    lienzo.append(d);
  });

  lienzo.addEventListener('pointerdown', (ev) => iniciarArrastre(ev, lienzo, pagina, op));
  lienzo.addEventListener('keydown', (ev) => teclado(ev, pagina, op));
  contenedor.append(lienzo);
  return lienzo;
}

function iniciarArrastre(ev, lienzo, pagina, op) {
  const el = ev.target.closest('.hueco');
  if (!el) return;
  const k = Number(el.dataset.k);
  const s = pagina.slots[k];
  const redim = ev.target.classList.contains('asa');
  const r = lienzo.getBoundingClientRect();
  const inicio = { x: ev.clientX, y: ev.clientY, sx: s.x, sy: s.y, sw: s.w, sh: s.h };
  let movido = false;
  el.setPointerCapture(ev.pointerId);
  ev.preventDefault();

  const aPct = (e) => ({ dx: ((e.clientX - inicio.x) / r.width) * 100, dy: ((e.clientY - inicio.y) / r.height) * 100 });

  const mover = (e) => {
    const { dx, dy } = aPct(e);
    if (!movido && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) < MOVIMIENTO_MIN) return;
    movido = true;
    if (redim) {
      el.style.width = `${acotar(redondear(inicio.sw + dx), MIN_TAMANO, 100 - s.x)}%`;
      el.style.height = `${acotar(redondear(inicio.sh + dy), MIN_TAMANO, 100 - s.y)}%`;
    } else {
      el.style.left = `${acotar(redondear(inicio.sx + dx), 0, 100 - s.w)}%`;
      el.style.top = `${acotar(redondear(inicio.sy + dy), 0, 100 - s.h)}%`;
    }
  };

  const soltar = (e) => {
    el.removeEventListener('pointermove', mover);
    el.removeEventListener('pointerup', soltar);
    el.removeEventListener('pointercancel', soltar);
    if (!movido) return op.alSeleccionar(k);
    const { dx, dy } = aPct(e);
    if (redim) {
      const cambios = {};
      const w = acotar(redondear(inicio.sw + dx), MIN_TAMANO, 100 - s.x);
      const h = acotar(redondear(inicio.sh + dy), MIN_TAMANO, 100 - s.y);
      if (w !== s.w) cambios.w = w;
      if (h !== s.h) cambios.h = h;
      if (Object.keys(cambios).length) op.alRedimensionar(k, cambios);
      else op.alSeleccionar(k);
    } else {
      const cambios = {};
      const x = acotar(redondear(inicio.sx + dx), 0, 100 - s.w);
      const y = acotar(redondear(inicio.sy + dy), 0, 100 - s.h);
      if (x !== s.x) cambios.x = x;
      if (y !== s.y) cambios.y = y;
      if (Object.keys(cambios).length) op.alMover(k, cambios);
      else op.alSeleccionar(k);
    }
  };

  el.addEventListener('pointermove', mover);
  el.addEventListener('pointerup', soltar);
  el.addEventListener('pointercancel', soltar);
}

/** Flechas: mueven el hueco seleccionado (Mayús: paso grande). */
function teclado(ev, pagina, op) {
  const el = ev.target.closest('.hueco');
  if (!el) return;
  const k = Number(el.dataset.k);
  const s = pagina.slots[k];
  const paso = ev.shiftKey ? PASO_GRANDE : PASO;
  const mapa = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, -paso], ArrowDown: [0, paso] };
  if (!mapa[ev.key]) {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); op.alSeleccionar(k); }
    return;
  }
  ev.preventDefault();
  const [dx, dy] = mapa[ev.key];
  const cambios = {};
  const x = acotar(redondear(s.x + dx), 0, 100 - s.w);
  const y = acotar(redondear(s.y + dy), 0, 100 - s.h);
  if (x !== s.x) cambios.x = x;
  if (y !== s.y) cambios.y = y;
  if (Object.keys(cambios).length) op.alMover(k, cambios);
}

/** Panel de propiedades del hueco k: cada cambio llama a alEditar(k, campo, valor). */
export function pintarPropiedades(contenedor, slot, k, alEditar) {
  contenedor.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = `Hueco ${slot.field}`;
  const form = document.createElement('form');
  form.className = 'propiedades';
  const campos = [['x', 'Posición X (%)'], ['y', 'Posición Y (%)'], ['w', 'Ancho (%)'], ['h', 'Alto (%)'], ['size', 'Tamaño de letra'], ['angle', 'Giro (°)']];
  for (const [clave, texto] of campos) {
    if (slot[clave] === undefined && !['x', 'y', 'w', 'h'].includes(clave)) continue;
    const id = `prop-${clave}`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = texto;
    const input = document.createElement('input');
    input.id = id;
    input.type = 'number';
    input.step = clave === 'size' ? '0.01' : '0.1';
    input.value = slot[clave] ?? '';
    input.dataset.campo = clave;
    input.addEventListener('change', () => {
      if (input.value === '') return;
      alEditar(k, clave, Number(input.value));
    });
    form.append(label, input);
  }
  contenedor.append(h, form);
}
