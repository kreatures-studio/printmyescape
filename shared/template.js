// Motor compartido maquetador <-> jugador.
// El template define CAMPOS globales (se rellenan una vez) y SLOTS por pagina
// (donde se coloca cada campo, en % sobre el fondo A4). Huecos vacios = se ve el fondo.

export async function loadTemplate(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error('No se pudo cargar ' + url);
  return res.json();
}

export function fieldMap(template) {
  const m = {};
  for (const f of template.fields) m[f.id] = f;
  return m;
}

export function defaultValues(template) {
  const v = {};
  for (const f of template.fields) v[f.id] = f.default ?? '';
  return v;
}

// Renderiza una pagina dentro de `el`: fondo + slots con los valores dados.
// En modo 'studio' dibuja marco de edicion y devuelve los nodos slot.
export function renderPage(el, template, page, values, opts = {}) {
  const mode = opts.mode ?? 'player';
  el.classList.add('pme-page');
  el.innerHTML = '';
  const bg = document.createElement('img');
  bg.className = 'pme-bg';
  bg.src = page.background;
  bg.alt = page.title;
  bg.draggable = false;
  el.appendChild(bg);
  const nodes = [];
  (page.slots ?? []).forEach((slot, i) => {
    const field = (template.fields ?? []).find(f => f.id === slot.field);
    const type = field?.type ?? 'text';
    const raw = values[slot.field] ?? '';
    const n = document.createElement(type === 'image' ? 'div' : 'div');
    n.className = 'pme-slot pme-' + type + (mode === 'studio' ? ' pme-editable' : '');
    n.dataset.slot = String(i);
    n.style.left = slot.x + '%';
    n.style.top = slot.y + '%';
    n.style.width = slot.w + '%';
    n.style.height = slot.h + '%';
    if (type === 'image') {
      if (raw) {
        n.style.backgroundImage = `url("${raw}")`;
        n.style.backgroundSize = slot.fit === 'contain' ? 'contain' : 'cover';
      } else {
        n.classList.add('pme-empty');
      }
    } else {
      let text = String(raw ?? '');
      if (slot.uppercase) text = text.toUpperCase();
      if (slot.prefix && text) text = slot.prefix + text;
      n.textContent = text;
      n.dataset.font = slot.font ?? 'type';
      if (slot.size) n.style.fontSize = `calc(var(--pme-unit) * ${slot.size})`;
      if (slot.align) n.style.textAlign = slot.align;
      if (slot.color) n.style.color = slot.color;
      if (!text) n.classList.add('pme-empty');
    }
    el.appendChild(n);
    nodes.push(n);
  });
  return nodes;
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
