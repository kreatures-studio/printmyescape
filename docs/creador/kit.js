// Panel del kit (T5.4): piezas del manifiesto (contrato 3.4), filtro por etiqueta y arrastre a la página.
// El manifiesto se lee desde su URL; las rutas de los ficheros son relativas a esa URL.

import { erroresKitDatos } from './tools/game/reglas.mjs';

export const TIPO_ARRASTRE = 'application/x-pme-pieza';

/**
 * Lee el manifiesto. Devuelve { piezas, porId: Map, base: URL del manifiesto, errores }; errores son
 * las reglas del kit (3.4) sin comprobar ficheros (en el navegador no se pueden mirar).
 */
export async function cargarKit(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`no se pudo leer el kit (${res.status})`);
  const m = await res.json();
  const { errores, piezas: porId } = erroresKitDatos(m, null);
  const piezas = Array.isArray(m.pieces) ? m.pieces : [];
  return { piezas, porId, base: new URL(url, location.href), errores };
}

/** Etiquetas de todas las piezas, sin repetir y ordenadas. */
export function etiquetasDe(kit) {
  return [...new Set(kit.piezas.flatMap((p) => p.tags || []))].sort();
}

/** Pinta el panel: filtro por etiqueta y una lista de piezas arrastrables. */
export function pintarKit(contenedor, kit, filtro = '') {
  contenedor.replaceChildren();
  const h = document.createElement('h3');
  h.textContent = 'Kit de arte';
  const label = document.createElement('label');
  label.htmlFor = 'kit-filtro';
  label.textContent = 'Etiqueta';
  const select = document.createElement('select');
  select.id = 'kit-filtro';
  select.append(new Option('Todas', ''));
  for (const t of etiquetasDe(kit)) select.append(new Option(t, t));
  select.value = filtro;
  select.addEventListener('change', () => pintarKit(contenedor, kit, select.value));

  const lista = document.createElement('ul');
  lista.className = 'kit-piezas';
  const visibles = kit.piezas.filter((p) => !filtro || (p.tags || []).includes(filtro));
  if (!visibles.length) {
    const vacio = document.createElement('li');
    vacio.className = 'nota';
    vacio.textContent = kit.piezas.length ? 'Ninguna pieza con esa etiqueta.' : 'El kit todavía no tiene piezas.';
    lista.append(vacio);
  }
  for (const p of visibles) {
    const li = document.createElement('li');
    li.className = 'kit-pieza';
    li.draggable = true;
    li.dataset.pieza = p.id;
    li.setAttribute('aria-label', `Pieza ${p.id}, arrástrala a la página`);
    li.textContent = p.id;
    const meta = document.createElement('small');
    meta.textContent = `${p.kind} · ${p.widthMm}×${p.heightMm} mm`;
    li.append(meta);
    li.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData(TIPO_ARRASTRE, p.id);
      ev.dataTransfer.effectAllowed = 'copy';
    });
    lista.append(li);
  }
  contenedor.append(h, label, select, lista);
}
