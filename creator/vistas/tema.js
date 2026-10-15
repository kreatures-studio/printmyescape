// Tema de color: cambia la paleta de todo el juego. Se mira qué colores tiene el juego (en sus páginas compuestas),
// se elige una paleta nueva (de partida, una armonía de la rueda de color o una importada de Adobe Color: .ase, CSS,
// XML, códigos pegados o una imagen de referencia) o se ajusta color a color, y se ve el resultado antes de aplicarlo. Lo aplicado se
// guarda en el juego (game.theme) y lo usa el motor al componer: piezas, PDF de fondo, textos y color de página. Las
// piezas de la biblioteca no cambian, y se puede quitar el tema cuando se quiera.

import { h, icono } from '../dom.js';
import { componer, pintarPDF } from '../motor.js';
import { PALETAS, paletaDeMuestras, asignarPaleta, rgbAHex, lab } from '../../tools/game/paletas.mjs';
import { REGLAS, puntosDeArmonia, hexARueda, ruedaAHex, colorDeRueda, tintaYPapel, tintaYPapelDePaleta, coloresDeTexto, coloresDeAse, aseDeColores, deOscuroAClaro } from '../../tools/game/armonias.mjs';
import { nuevo as nuevoPresupuesto } from './presupuestos.js';

const ANCHO_MUESTRA = 150; // px de ancho al leer los colores de cada página
const ANCHO_PREVIA = 220;
const MAX_PREVIA = 6;
const RUEDA = 244; // px de la rueda de armonías
const ADOBE = 'https://color.adobe.com/es/create/color-wheel';

export function pintarTema(raiz, app) {
  const g = app.juego;
  const ui = app.ui.tema || (app.ui.tema = { paleta: null, analizando: false, borrador: null, alcance: null, pestana: null, arm: null, imp: null });
  if (!ui.borrador) ui.borrador = g.theme ? structuredClone(g.theme) : { name: '', map: [] };
  if (ui.alcance === null) ui.alcance = (g.theme && g.theme.tolerance) || 22;
  const b = ui.borrador;
  const origen = b.palette || null;
  if (!ui.pestana) ui.pestana = origen && origen.source === 'armonia' ? 'armonias' : origen && origen.source === 'importada' ? 'adobe' : 'paletas';
  if (!ui.imp) ui.imp = { colores: origen && origen.source === 'importada' ? origen.colors.slice(0, origen.inkPaper ? -3 : undefined) : [], nombre: origen && origen.source === 'importada' ? b.name : '', aviso: '', tp: !!(origen && origen.inkPaper) };

  const lista = h('div', { class: 'tema-colores', 'data-paleta': ui.paleta ? String(ui.paleta.length) : '' });
  const previa = h('div', { class: 'tema-previa', 'aria-live': 'polite' }, h('p', { class: 'tenue' }, 'Preparando la vista previa…'));
  const destino = (from) => ((b.map || []).find((m) => m.from === from) || {}).to || from;
  const fijar = (from, to) => {
    const m = (b.map || []).filter((x) => x.from !== from);
    if (to.toUpperCase() !== from.toUpperCase()) m.push({ from, to: to.toUpperCase() });
    b.map = m;
    b.preset = undefined;
    pintarTema(raiz, app);
  };
  /** La paleta elegida (de partida, armonía o importada) pasa a ser el borrador: se reparte sobre los colores del juego. */
  const usar = (colores, { name, preset, palette }) => {
    if (!ui.paleta) return;
    ui.borrador = { name, map: asignarPaleta(ui.paleta, colores, { tintaYPapel: !!(palette && palette.inkPaper) }) };
    if (preset) ui.borrador.preset = preset;
    if (palette) ui.borrador.palette = palette;
    pintarTema(raiz, app);
  };

  if (ui.paleta) {
    if (!ui.arm) ui.arm = armoniaInicial(origen, ui.paleta);
    lista.replaceChildren(...ui.paleta.map((c) => h('div', { class: 'tema-fila', 'data-color': c.hex },
      h('span', { class: 'muestra', style: { background: c.hex }, title: c.hex }),
      h('span', { class: 'flecha', 'aria-hidden': 'true' }, '→'),
      h('input', { type: 'color', value: destino(c.hex).toLowerCase(), 'aria-label': `Nuevo color para ${c.hex}`, disabled: app.soloLectura, onchange: (e) => fijar(c.hex, e.target.value) }),
      h('span', { class: 'tenue cifra' }, `${Math.max(1, Math.round(c.peso * 100))} %`),
      destino(c.hex) !== c.hex ? h('button', { class: 'boton pequeno', type: 'button', onclick: () => fijar(c.hex, c.hex), title: 'Dejar el color como estaba' }, 'Original') : null)));
  } else {
    lista.replaceChildren(h('p', { class: 'tenue' }, 'Mirando qué colores tiene el juego…'));
  }

  const bloqueado = !ui.paleta || app.soloLectura;
  const pestanas = [['paletas', 'Paletas'], ['armonias', 'Armonías'], ['adobe', 'Adobe Color']];
  let contenido;
  if (ui.pestana === 'armonias') contenido = ui.arm ? panelArmonias(ui, bloqueado, usar, !!(b.palette && b.palette.source === 'armonia')) : h('p', { class: 'tenue' }, 'Mirando qué colores tiene el juego…');
  else if (ui.pestana === 'adobe') contenido = panelAdobe(ui, bloqueado, usar, () => pintarTema(raiz, app));
  else contenido = h('div', { class: 'tema-paletas' }, PALETAS.map((pal) => h('button', {
    type: 'button', class: 'tema-paleta', 'data-paleta-id': pal.id, 'aria-pressed': b.preset === pal.id ? 'true' : 'false', disabled: bloqueado,
    onclick: () => usar(pal.colores, { name: pal.nombre, preset: pal.id }),
  }, h('span', { class: 'franja' }, pal.colores.map((c) => h('span', { style: { background: c } }))), h('span', {}, pal.nombre))));

  const nuevos = coloresNuevos(b);
  const aplicado = !!g.theme;
  const igual = JSON.stringify(normal(g.theme)) === JSON.stringify(normal({ ...b, tolerance: ui.alcance }));
  raiz.replaceChildren(h('div', { class: 'trabajo' },
    h('aside', { class: 'columna lateral ancha tema-lateral', 'aria-label': 'Tema de color' },
      h('h2', { style: { fontSize: '22px' } }, 'Tema de color'),
      h('p', { class: 'tenue', style: { margin: 0, fontSize: '14px' } }, 'Cambia los colores de todo el juego: piezas de arte, fondo, textos y color de las páginas. Las piezas de la biblioteca no cambian, y el tema se puede quitar cuando quieras.'),
      aplicado ? h('div', { class: 'info' }, `Este juego tiene el tema «${g.theme.name || 'sin nombre'}».`) : null,
      h('div', { class: 'etiqueta-seccion' }, 'Paleta nueva'),
      h('div', { class: 'pestanas tres', role: 'tablist', 'aria-label': 'De dónde sale la paleta' }, pestanas.map(([id, texto]) => h('button', {
        type: 'button', role: 'tab', 'aria-selected': ui.pestana === id ? 'true' : 'false', 'data-pestana-tema': id,
        onclick: () => { ui.pestana = id; pintarTema(raiz, app); },
      }, texto))),
      h('div', { class: 'panel-paleta', role: 'tabpanel' }, contenido),
      h('div', { class: 'etiqueta-seccion' }, 'Colores del juego → colores nuevos'),
      lista,
      nuevos.length ? h('button', { class: 'boton pequeno', type: 'button', 'data-descargar-ase': '1', title: 'Para cargarla en Illustrator, Photoshop o InDesign (Muestras → Cargar muestras)',
        onclick: () => descargarAse(nuevos, b.name || 'tema') }, icono('descargar', { tam: 16 }), 'Descargar la paleta nueva (.ase)') : null,
      h('div', { class: 'campo' },
        h('label', { for: 'tema-alcance' }, `Alcance: ${ui.alcance}`),
        h('input', { id: 'tema-alcance', type: 'range', min: 8, max: 40, step: 1, value: ui.alcance, disabled: app.soloLectura, onchange: (e) => { ui.alcance = Number(e.target.value); pintarTema(raiz, app); } }),
        h('span', { class: 'ayuda' }, 'Cuánto tiene que parecerse un color a uno de la paleta para cambiar con él. Más alto: cambian también los tonos cercanos (sombras, luces).')),
      h('div', { class: 'campo' },
        h('label', { for: 'tema-nombre' }, 'Nombre del tema'),
        h('input', { id: 'tema-nombre', value: b.name || '', disabled: app.soloLectura, onchange: (e) => { b.name = e.target.value; } })),
      h('div', { class: 'botones-columna' },
        h('button', { class: 'boton primario', type: 'button', 'data-aplicar-tema': '1', disabled: app.soloLectura || !(b.map || []).length || igual,
          onclick: () => app.cambiar(`Tema de color «${b.name || 'nuevo'}»`, (copia) => { copia.theme = normal({ ...b, tolerance: ui.alcance }); }) }, aplicado ? 'Aplicar los cambios del tema' : 'Aplicar el tema al juego'),
        aplicado ? h('button', { class: 'boton', type: 'button', 'data-quitar-tema': '1', disabled: app.soloLectura,
          onclick: async () => { await app.cambiar('Quitar el tema de color', (copia) => { delete copia.theme; }); ui.borrador = { name: '', map: [] }; pintarTema(raiz, app); } }, 'Quitar el tema') : null,
        h('button', { class: 'boton', type: 'button', disabled: !(b.map || []).length, onclick: () => nuevoPresupuesto(app, { juego: g.id, empezar: 'tema', titulo: `${(g.name && (g.name.es || Object.values(g.name)[0])) || g.id}: cambio de tema «${b.name || 'nuevo'}»`, tema: b.name }) }, 'Presupuestar este cambio')),
      h('p', { class: 'tenue', style: { fontSize: '13px', margin: 0 } }, 'Las fotos del comprador, las imágenes de mapa de bits (como las pantallas) y los degradados no cambian de color.')),
    h('section', { class: 'mesa', 'aria-label': 'Vista previa del tema' },
      h('div', { class: 'barra-mesa' }, h('strong', {}, (b.map || []).length ? `Con el tema${b.name ? ` «${b.name}»` : ''}` : 'Sin tema'),
        nuevos.length ? h('span', { class: 'franja-mesa', 'aria-label': 'Paleta nueva' }, nuevos.map((c) => h('span', { style: { background: c }, title: c }))) : null,
        h('span', { class: 'tenue' }, `Primeras ${Math.min(MAX_PREVIA, g.pages.length)} páginas`)),
      previa)));

  if (!ui.paleta && !ui.analizando) {
    ui.analizando = true;
    paletaDelJuego(app).then((p) => { ui.paleta = p; ui.analizando = false; if (app.ruta.vista === 'tema' && app.juego === g) pintarTema(raiz, app); })
      .catch((e) => { ui.analizando = false; lista.replaceChildren(h('div', { class: 'mensaje error' }, `No se pudieron leer los colores del juego: ${e.message}`)); });
  }
  pintarPrevia(app, ui, previa, { ...b, tolerance: ui.alcance });
}

/** Colores de la paleta nueva, sin repetir y de oscuro a claro. */
function coloresNuevos(b) {
  const lista = b.palette && b.palette.colors && b.palette.colors.length ? b.palette.colors : (b.map || []).map((m) => m.to);
  return deOscuroAClaro([...new Set(lista.map((c) => c.toUpperCase()))]);
}

function descargarAse(colores, nombre) {
  const blob = new Blob([aseDeColores(colores, nombre)], { type: 'application/octet-stream' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `${nombre.replace(/[^\p{L}\p{N} _-]+/gu, ' ').replace(/\s+/g, ' ').trim() || 'tema'}.ase` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------------------------------------------------------------------------------------- Armonías

/** De qué color parte la rueda: el de la armonía guardada o el color con más presencia del juego que no sea papel ni tinta. */
function armoniaInicial(origen, paleta) {
  if (origen && origen.source === 'armonia' && origen.base) {
    return { regla: origen.rule || 'complementario', base: hexARueda(origen.base), libres: origen.rule === 'personalizado' ? origen.colors.slice(0, 5).map(hexARueda) : null, tp: !!origen.inkPaper };
  }
  const medios = paleta.filter((c) => { const L = lab(c.hex)[0]; return L > 22 && L < 80; });
  const base = (medios.sort((x, y) => y.peso - x.peso)[0] || paleta[0] || { hex: '#C2185B' }).hex;
  const p = hexARueda(base);
  return { regla: 'complementario', base: { ...p, s: Math.max(p.s, 0.55), v: Math.max(p.v, 0.6) }, libres: null, tp: true };
}

function coloresDeArmonia(a) {
  const cinco = puntosDeArmonia(a.regla, a.base, a.libres).map(ruedaAHex);
  return a.tp ? [...cinco, ...tintaYPapel(a.base)] : cinco;
}

function panelArmonias(ui, bloqueado, usar, enUso) {
  const a = ui.arm;
  const R = RUEDA / 2, RADIO = R - 12;
  const reglaDe = () => REGLAS.find((r) => r.id === a.regla) || REGLAS[0];
  const regla = reglaDe();
  const aplicar = () => usar(coloresDeArmonia(a), {
    name: `Armonía · ${reglaDe().nombre}`,
    palette: { source: 'armonia', rule: a.regla, base: ruedaAHex(a.base), colors: coloresDeArmonia(a), inkPaper: a.tp },
  });
  const posicion = (p) => { const t = (p.h * Math.PI) / 180, r = p.s * RADIO; return [R + r * Math.sin(t), R - r * Math.cos(t)]; };
  const lineas = h('svg', { width: RUEDA, height: RUEDA, viewBox: `0 0 ${RUEDA} ${RUEDA}`, 'aria-hidden': 'true' });
  const luz = h('div', { class: 'rueda-luz' });
  const marcadores = [0, 1, 2, 3, 4].map((i) => h('button', {
    type: 'button', class: `marcador${i === 2 ? ' base' : ''}`, 'data-marcador': i, disabled: bloqueado,
    'aria-label': i === 2 ? 'Color base: arrastra para girarlo en la rueda (flechas: tono y saturación)' : `Color ${i + 1} de la armonía`,
  }));
  const muestras = h('div', { class: 'armonia-muestras', 'data-armonia': a.regla });
  const pintar = () => {
    const pts = puntosDeArmonia(a.regla, a.base, a.libres);
    luz.style.opacity = String(1 - a.base.v);
    lineas.replaceChildren(...pts.map((p) => { const [x, y] = posicion(p); return h('line', { x1: R, y1: R, x2: x, y2: y, stroke: '#FFFFFF', 'stroke-width': p === pts[2] ? 2 : 1.25, opacity: 0.9 }); }));
    pts.forEach((p, i) => { const [x, y] = posicion(p); Object.assign(marcadores[i].style, { left: `${x}px`, top: `${y}px`, background: ruedaAHex(p) }); });
    const hex = coloresDeArmonia(a);
    muestras.replaceChildren(...hex.map((c, i) => h('div', { class: `muestra-armonia${i >= 5 ? ' extra' : ''}`, title: i >= 5 ? `${['Tinta', 'Papel de color', 'Papel'][i - 5]}: ${c}` : c },
      h('span', { style: { background: c } }), h('code', {}, i >= 5 ? ['tinta', 'papel', ''][i - 5] : c.slice(1)))));
  };
  // Arrastrar: el color base mueve toda la armonía; otro color la gira (como en Adobe Color); en «personalizado», cada uno va suelto.
  const mover = (i, h2, s2) => {
    if (a.regla === 'personalizado') { a.libres = a.libres || puntosDeArmonia('personalizado', a.base); a.libres[i] = { ...a.libres[i], h: h2, s: s2 }; if (i === 2) a.base = { ...a.libres[2] }; return; }
    const p = puntosDeArmonia(a.regla, a.base)[i];
    a.base = { ...a.base, h: (((a.base.h + h2 - p.h) % 360) + 360) % 360, s: i === 2 || p.s === 0 ? s2 : Math.max(0.05, Math.min(1, a.base.s * (s2 / p.s))) };
  };
  const rueda = h('div', { class: 'rueda', style: { width: `${RUEDA}px`, height: `${RUEDA}px`, background: `conic-gradient(${Array.from({ length: 37 }, (_, k) => `${colorDeRueda(k * 10)} ${k * 10}deg`).join(', ')})` } },
    h('div', { class: 'rueda-blanco' }), luz, lineas, ...marcadores);
  marcadores.forEach((m, i) => {
    m.addEventListener('pointerdown', (e) => {
      if (bloqueado) return;
      e.preventDefault(); m.setPointerCapture(e.pointerId); m.classList.add('arrastrando');
      const caja = rueda.getBoundingClientRect();
      const mueve = (ev) => {
        const dx = ev.clientX - caja.left - R, dy = ev.clientY - caja.top - R;
        mover(i, (((Math.atan2(dx, -dy) * 180) / Math.PI) + 360) % 360, Math.min(1, Math.hypot(dx, dy) / RADIO));
        pintar();
      };
      const suelta = () => { m.removeEventListener('pointermove', mueve); m.removeEventListener('pointerup', suelta); m.classList.remove('arrastrando'); aplicar(); };
      m.addEventListener('pointermove', mueve); m.addEventListener('pointerup', suelta);
    });
    m.addEventListener('keydown', (e) => {
      const p = (a.regla === 'personalizado' && a.libres ? a.libres : puntosDeArmonia(a.regla, a.base))[i];
      const d = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[e.key];
      if (!d) return;
      e.preventDefault();
      mover(i, (p.h + d[0] + 360) % 360, Math.max(0, Math.min(1, p.s + d[1])));
      aplicar();
      requestAnimationFrame(() => { const x = document.querySelector(`[data-marcador="${i}"]`); if (x) x.focus(); });
    });
  });
  pintar();
  return h('div', { class: 'panel-armonias' },
    h('div', { class: 'campo' },
      h('label', { for: 'tema-regla' }, 'Regla de armonía'),
      h('select', { id: 'tema-regla', disabled: bloqueado, onchange: (e) => {
        const antes = puntosDeArmonia(a.regla, a.base, a.libres);
        a.regla = e.target.value;
        a.libres = a.regla === 'personalizado' ? antes : null;
        aplicar();
      } }, REGLAS.map((r) => h('option', { value: r.id, selected: r.id === a.regla }, r.nombre))),
      h('span', { class: 'ayuda' }, regla.ayuda)),
    rueda,
    h('div', { class: 'campo fila-luz' },
      h('label', { for: 'tema-luz' }, 'Luz'),
      h('input', { id: 'tema-luz', type: 'range', min: 15, max: 100, step: 1, value: Math.round(a.base.v * 100), disabled: bloqueado,
        oninput: (e) => { const v = Number(e.target.value) / 100; if (a.libres) a.libres = a.libres.map((p) => ({ ...p, v: Math.max(0.05, Math.min(1, p.v * (v / (a.base.v || 1)))) })); a.base = { ...a.base, v }; pintar(); },
        onchange: aplicar })),
    muestras,
    h('label', { class: 'casilla-tema' },
      h('input', { type: 'checkbox', checked: a.tp, disabled: bloqueado, 'data-tinta-papel': '1', onchange: (e) => { a.tp = e.target.checked; aplicar(); } }),
      h('span', {}, h('strong', {}, 'Añadir tinta y papel'), ' — un oscuro y dos claros del mismo tono, para que los textos se lean y los papeles no se vuelvan chillones al imprimir.')),
    enUso ? null : h('button', { class: 'boton primario', type: 'button', 'data-usar-armonia': '1', disabled: bloqueado, onclick: aplicar }, 'Usar esta armonía'));
}

// ---------------------------------------------------------------------------------------------- Adobe Color

function panelAdobe(ui, bloqueado, usar, repintar) {
  const imp = ui.imp;
  const faltaTintaOPapel = (colores) => !colores.some((c) => lab(c)[0] < 30) || !colores.some((c) => lab(c)[0] > 88);
  const aplicar = () => {
    if (!imp.colores.length) return;
    const colores = imp.tp ? [...imp.colores, ...tintaYPapelDePaleta(imp.colores)] : [...imp.colores];
    usar(colores, { name: imp.nombre || 'Paleta de Adobe Color', palette: { source: 'importada', colors: colores, inkPaper: imp.tp } });
  };
  const recibir = (colores, nombre, aviso = '') => {
    imp.aviso = colores.length ? '' : aviso || 'No he encontrado colores. Prueba con el .ase de Adobe Color, su CSS o XML, o pega los códigos (#1A2B3C).';
    if (colores.length) { imp.colores = colores.slice(0, 12); imp.nombre = nombre; imp.tp = faltaTintaOPapel(imp.colores); aplicar(); } else repintar();
  };
  const leerArchivo = async (f) => {
    if (!f) return;
    const nombre = f.name.replace(/\.[^.]+$/, '');
    try {
      if (/\.ase$/i.test(f.name)) return recibir(coloresDeAse(new Uint8Array(await f.arrayBuffer())).map((c) => c.hex), nombre);
      if (/^image\//.test(f.type)) return recibir(await coloresDeImagen(f), nombre);
      return recibir(coloresDeTexto(await f.text()), nombre);
    } catch (e) { recibir([], nombre, `No se pudo leer «${f.name}»: ${e.message}`); }
  };
  const entrada = h('input', { type: 'file', accept: '.ase,.css,.scss,.sass,.less,.xml,.txt,.json,image/*', hidden: true, 'data-importar-paleta': '1', onchange: (e) => leerArchivo(e.target.files[0]) });
  const zona = h('label', { class: 'zona-soltar', tabindex: bloqueado ? -1 : 0 },
    entrada,
    h('strong', {}, 'Suelta aquí la paleta'),
    h('span', { class: 'tenue' }, '.ase, CSS, XML… o una imagen de referencia'));
  zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
  zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
  zona.addEventListener('drop', (e) => { e.preventDefault(); zona.classList.remove('encima'); if (!bloqueado) leerArchivo(e.dataTransfer.files[0]); });
  zona.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); entrada.click(); } });
  const pegado = h('textarea', { id: 'tema-pegar', rows: 2, placeholder: '#1D3557 #457B9D #A8DADC #F1FAEE #E63946', disabled: bloqueado });
  return h('div', { class: 'panel-adobe' },
    h('ol', { class: 'pasos-adobe' },
      h('li', {}, h('a', { class: 'boton pequeno', href: ADOBE, target: '_blank', rel: 'noopener' }, 'Abrir Adobe Color', icono('externo', { tam: 14 })), ' crea una paleta en la rueda o elige una de Explorar.'),
      h('li', {}, 'Descárgala (', h('strong', {}, '.ase'), ', CSS o XML) o copia sus códigos.'),
      h('li', {}, 'Tráela aquí:')),
    zona,
    h('div', { class: 'campo' },
      h('label', { for: 'tema-pegar' }, 'O pega los códigos'),
      pegado,
      h('button', { class: 'boton pequeno', type: 'button', 'data-leer-pegado': '1', disabled: bloqueado, onclick: () => {
        const t = pegado.value;
        recibir(coloresDeTexto(t), 'Paleta de Adobe Color', /color\.adobe\.com/.test(t) ? 'El creador no puede abrir los enlaces de Adobe Color. En la paleta, pulsa Descargar (o copia los códigos hexadecimales) y tráelo aquí.' : '');
      } }, 'Leer los colores')),
    imp.aviso ? h('div', { class: 'mensaje aviso' }, imp.aviso) : null,
    imp.colores.length ? h('div', { class: 'importada' },
      h('div', { class: 'armonia-muestras', 'data-importada': String(imp.colores.length) }, imp.colores.map((c) => h('div', { class: 'muestra-armonia' }, h('span', { style: { background: c } }), h('code', {}, c.slice(1))))),
      h('label', { class: 'casilla-tema' },
        h('input', { type: 'checkbox', checked: imp.tp, disabled: bloqueado, onchange: (e) => { imp.tp = e.target.checked; aplicar(); } }),
        h('span', {}, h('strong', {}, 'Añadir tinta y papel'), faltaTintaOPapel(imp.colores) ? ' — a esta paleta le falta un oscuro o un claro para los textos y los papeles.' : ' — la paleta ya tiene oscuros y claros.'))) : null);
}

/** Paleta de una imagen de referencia: la pinta pequeña y agrupa sus colores (como «Extraer tema» de Adobe Color). */
async function coloresDeImagen(f) {
  const img = await createImageBitmap(f);
  const k = Math.min(1, 160 / img.width);
  const c = h('canvas', { width: Math.max(1, Math.round(img.width * k)), height: Math.max(1, Math.round(img.height * k)) });
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  const muestras = {};
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 128) continue; const hex = rgbAHex([d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]); muestras[hex] = (muestras[hex] || 0) + 1; }
  return paletaDeMuestras(muestras, { max: 6, umbral: 18 }).map((x) => x.hex);
}

/** Tema sin campos vacíos (para comparar y guardar). */
function normal(t) {
  if (!t) return null;
  const out = { name: t.name || '', map: (t.map || []).map((m) => ({ from: m.from.toUpperCase(), to: m.to.toUpperCase() })) };
  if (t.preset) out.preset = t.preset;
  if (t.tolerance && t.tolerance !== 22) out.tolerance = t.tolerance;
  if (t.palette && t.palette.colors && t.palette.colors.length) {
    const p = { source: t.palette.source || 'importada' };
    if (t.palette.rule) p.rule = t.palette.rule;
    if (t.palette.base) p.base = t.palette.base.toUpperCase();
    p.colors = t.palette.colors.map((c) => c.toUpperCase());
    if (t.palette.inkPaper) p.inkPaper = true;
    out.palette = p;
  }
  return out;
}

/** Colores del juego: compone sus páginas sin tema ni ejemplo, las pinta pequeñas y cuenta los píxeles de cada color. */
async function paletaDelJuego(app) {
  const g = app.juego;
  const sinTema = { ...g };
  delete sinTema.theme;
  const { bytes } = await componer({ juego: sinTema, almacen: app.almacen, biblioteca: app.biblioteca, lang: g.languages[0], ejemplo: null });
  const muestras = {};
  const canvas = document.createElement('canvas');
  for (let i = 1; i <= g.pages.length; i++) {
    await pintarPDF(bytes, canvas, ANCHO_MUESTRA, i);
    const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
    for (let k = 0; k < d.length; k += 4) {
      const hex = rgbAHex([d[k] / 255, d[k + 1] / 255, d[k + 2] / 255]);
      muestras[hex] = (muestras[hex] || 0) + 1;
    }
  }
  // Los colores de los textos también son del tema, aunque ocupen pocos píxeles.
  for (const p of g.pages) for (const e of p.elements || []) if (e.color) muestras[e.color.toUpperCase()] = (muestras[e.color.toUpperCase()] || 0) + 400;
  return paletaDeMuestras(muestras);
}

let turno = 0;
async function pintarPrevia(app, ui, caja, tema) {
  const yo = ++turno;
  const g = app.juego;
  const paginas = g.pages.slice(0, MAX_PREVIA).map((p) => p.id);
  const clave = JSON.stringify([g.pages.map((p) => p.id), tema, app.rev]);
  try {
    let bytes;
    if (ui.cachePrevia && ui.cachePrevia.clave === clave) bytes = ui.cachePrevia.bytes;
    else {
      const juego = { ...g, theme: (tema.map || []).length ? tema : undefined };
      ({ bytes } = await componer({ juego, almacen: app.almacen, biblioteca: app.biblioteca, lang: g.languages[0], ejemplo: null, paginas }));
      ui.cachePrevia = { clave, bytes };
    }
    if (yo !== turno || !caja.isConnected) return;
    const figuras = paginas.map((pid, i) => { const c = h('canvas', { 'aria-label': `Página ${i + 1}` }); return { c, fig: h('figure', { 'data-tema-previa': pid }, c, h('figcaption', {}, `Página ${i + 1}`)) }; });
    caja.replaceChildren(...figuras.map((f) => f.fig));
    for (let i = 0; i < figuras.length; i++) {
      if (yo !== turno || !caja.isConnected) return;
      await pintarPDF(bytes, figuras[i].c, ANCHO_PREVIA, i + 1);
    }
    caja.dataset.listo = '1';
  } catch (e) {
    if (caja.isConnected) caja.replaceChildren(h('div', { class: 'mensaje error' }, `No se pudo componer: ${e.message}`));
  }
}
