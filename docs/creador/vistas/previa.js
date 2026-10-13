// Vista previa (F4): el juego entero compuesto por el motor, en el idioma y con el ejemplo elegidos, con lo que
// dice el validador (errores y avisos, con enlace a su página) y la descarga del PDF de prueba.

import { h } from '../dom.js';
import { componer, pintarPDF } from '../motor.js';
import { validar, paginaDe } from '../validar.js';
import { selectoresVista, nombresDeEjemplos } from './comun.js';

const ANCHO = 340;

export function pintarPrevia(raiz, app) {
  const g = app.juego;
  const ejemplos = nombresDeEjemplos(g);
  const ui = app.ui.previa || (app.ui.previa = { lang: g.languages[0], ejemplo: ejemplos[1] ? ejemplos[1].id : (ejemplos[0] ? ejemplos[0].id : null), marca: true, envio: false });
  if (!g.languages.includes(ui.lang)) ui.lang = g.languages[0];
  if (ui.ejemplo !== null && !ejemplos.some((e) => e.id === ui.ejemplo)) ui.ejemplo = ejemplos[0] ? ejemplos[0].id : null;

  const v = ui.envio ? validar(g, { biblioteca: app.biblioteca, registro: app.registro, submit: true }) : app.validacion;
  const paginas = h('div', { class: 'previa-paginas', 'aria-live': 'polite' }, h('p', { class: 'tenue' }, 'Componiendo el juego…'));
  const descargar = h('button', { class: 'boton primario', type: 'button', disabled: true }, 'Descargar el PDF');
  const avisosMotor = h('div', { class: 'mensajes' });

  raiz.replaceChildren(h('div', { class: 'inicio', style: { gap: '20px' } },
    h('div', { class: 'titulo-bloque', style: { marginBottom: 0, justifyContent: 'space-between', alignItems: 'center' } },
      h('h1', { style: { fontSize: '32px' } }, 'Vista previa'),
      h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' } },
        selectoresVista(app, ui),
        h('label', { class: 'casilla' }, h('input', { type: 'checkbox', checked: ui.marca, onchange: (e) => { ui.marca = e.target.checked; app.repintar(); } }), 'Marca «VISTA PREVIA»'),
        descargar)),
    mensajes(app, ui, v),
    avisosMotor,
    paginas));

  componerTodo(app, ui).then(async ({ bytes, warns }) => {
    if (!paginas.isConnected) return;
    descargar.disabled = false;
    descargar.onclick = () => {
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = h('a', { href: url, download: `${g.id}-${ui.lang}${ui.ejemplo ? `-ejemplo-${ui.ejemplo}` : ''}.pdf` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    };
    if (warns.length) avisosMotor.replaceChildren(h('div', { class: 'mensaje' }, h('strong', {}, 'El motor avisa: '), h('ul', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, warns.slice(0, 12).map((w) => h('li', {}, w)))));
    const figuras = g.pages.map((p, i) => {
      const c = h('canvas', { 'aria-label': `Página ${i + 1}` });
      return { c, fig: h('figure', { 'data-previa': p.id }, c, h('figcaption', {}, h('a', { href: app.rutaJuego('paginas', p.id) }, `Página ${i + 1}${p.title ? ` · ${p.title}` : ''}`))) };
    });
    paginas.replaceChildren(...figuras.map((f) => f.fig));
    for (let i = 0; i < figuras.length; i++) {
      if (!paginas.isConnected) return;
      await pintarPDF(bytes, figuras[i].c, ANCHO, i + 1);
    }
    paginas.dataset.listo = '1';
  }).catch((e) => { if (paginas.isConnected) paginas.replaceChildren(h('div', { class: 'mensaje error', role: 'alert' }, `No se pudo componer el juego: ${e.message}`)); });
}

async function componerTodo(app, ui) {
  const g = app.juego;
  const clave = JSON.stringify([g, ui.lang, ui.ejemplo, ui.marca]);
  if (ui.cache && ui.cache.clave === clave) return ui.cache.resultado;
  const resultado = await componer({ juego: g, almacen: app.almacen, biblioteca: app.biblioteca, lang: ui.lang, ejemplo: ui.ejemplo, watermark: ui.marca ? 'VISTA PREVIA' : null });
  ui.cache = { clave, resultado };
  return resultado;
}

function mensajes(app, ui, v) {
  const g = app.juego;
  const enlace = (m) => {
    const pid = paginaDe(m);
    const i = pid ? g.pages.findIndex((p) => p.id === pid) : -1;
    return i >= 0 ? [' ', h('a', { href: app.rutaJuego('paginas', pid) }, `Ir a la página ${i + 1}`)] : null;
  };
  return h('section', { class: 'mensajes', 'aria-label': 'Comprobaciones' },
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      h('strong', {}, v.errores.length ? `${v.errores.length} error${v.errores.length === 1 ? '' : 'es'}` : 'Sin errores'),
      h('span', { class: 'tenue' }, v.avisos.length ? `· ${v.avisos.length} aviso${v.avisos.length === 1 ? '' : 's'}` : ''),
      h('label', { class: 'casilla', style: { marginLeft: 'auto' } }, h('input', { type: 'checkbox', checked: ui.envio, onchange: (e) => { ui.envio = e.target.checked; app.repintar(); } }), 'Comprobar como para enviar al estudio')),
    v.errores.map((m) => h('div', { class: 'mensaje error' }, m, enlace(m))),
    v.avisos.slice(0, 20).map((m) => h('div', { class: 'mensaje' }, m, enlace(m))),
    v.avisos.length > 20 ? h('div', { class: 'tenue' }, `y ${v.avisos.length - 20} avisos más`) : null);
}
