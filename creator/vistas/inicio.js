// Inicio y biblioteca (F4.1): empezar en blanco, duplicar un juego, pedírselo a Claude, lo que hay que revisar,
// tus juegos y el material para reutilizar (páginas, secciones, imágenes y puzzles de la biblioteca).

import { h, icono, enIdioma, haceCuanto, NOMBRE_IDIOMA, ESTADOS, idDeNombre } from '../dom.js';
import { componer, pintarPDF } from '../motor.js';
import { migrarAV2 } from '../../tools/game/v2.mjs';
import { abrirSubida } from '../subir.js';

const FILTROS = [['todos', 'Todos'], ['borrador', 'Borradores'], ['enviado', 'Enviados'], ['en-produccion', 'En producción']];
const EJEMPLO_CLAUDE = '«Crea un escape room de 6 páginas sobre una misión secreta de cumpleaños, para niños de 9 a 12 años, en español e inglés»';

export function pintarInicio(raiz, app) {
  const ui = app.ui.inicio || (app.ui.inicio = { filtro: 'todos' });
  const juegos = app.juegos || [];
  const paraRevisar = juegos.filter((j) => j.status === 'borrador' && (j.porRevisar > 0 || j.notasPendientes > 0 || j.sugerencias > 0));
  const visibles = juegos.filter((j) => ui.filtro === 'todos' || j.status === ui.filtro);

  raiz.replaceChildren(h('div', { class: 'inicio' },
    h('section', {},
      h('h1', {}, '¿Qué creamos hoy?'),
      h('p', { class: 'sub' }, 'Empieza de cero, parte de un juego anterior o deja que Claude prepare el borrador.'),
      h('div', { class: 'tarjetas-3' },
        h('button', { class: 'tarjeta-accion', type: 'button', onclick: () => nuevoJuego(app) },
          h('span', { class: 'icono' }, icono('mas', { color: '#1F5B4A' })),
          h('span', { class: 'titulo' }, 'Empezar en blanco'),
          h('span', { class: 'texto' }, 'Nombre, idiomas y número de páginas. Después añades fondos, imágenes y campos.')),
        h('button', { class: 'tarjeta-accion', type: 'button', onclick: () => duplicarJuego(app) },
          h('span', { class: 'icono', style: { background: 'var(--arena)' } }, icono('copiar', { color: '#8A4B12' })),
          h('span', { class: 'titulo' }, 'Duplicar un juego'),
          h('span', { class: 'texto' }, 'Copia un juego anterior con sus páginas, campos y arte, y cambia lo que haga falta.')),
        h('div', { class: 'tarjeta-accion claude' },
          h('span', { class: 'icono' }, icono('claude', { color: '#FFFFFF' })),
          h('span', { class: 'titulo' }, 'Pedírselo a Claude'),
          h('span', { class: 'texto' }, 'Describe el juego en Claude Code, abierto en vuestro repositorio de juegos. Lo crea ahí y aparece aquí para que lo revises y lo edites.'),
          h('span', { class: 'ejemplo-claude' }, EJEMPLO_CLAUDE),
          h('button', { class: 'boton pequeno contorno-claude', type: 'button', style: { alignSelf: 'flex-start' },
            onclick: () => navigator.clipboard && navigator.clipboard.writeText(EJEMPLO_CLAUDE.replace(/[«»]/g, '')).then(() => app.aviso('Ejemplo copiado'), () => {}) }, 'Copiar el ejemplo')))),

    paraRevisar.length ? h('section', { 'aria-labelledby': 'h-revisar' },
      h('div', { class: 'titulo-bloque' }, h('h2', { id: 'h-revisar' }, 'Para revisar'), h('span', { class: 'tenue' }, 'Lo que Claude ha creado o cambiado desde tu última revisión')),
      paraRevisar.map((j) => tarjetaRevisar(app, j))) : null,

    h('section', { 'aria-labelledby': 'h-juegos' },
      h('div', { class: 'titulo-bloque' }, h('h2', { id: 'h-juegos' }, 'Tus juegos'),
        h('div', { class: 'filtros', role: 'group', 'aria-label': 'Filtrar por estado' },
          FILTROS.map(([v, t]) => h('button', { type: 'button', 'aria-pressed': ui.filtro === v ? 'true' : 'false', onclick: () => { ui.filtro = v; app.repintar(); } }, t)))),
      h('div', { class: 'rejilla-juegos' },
        visibles.map((j) => tarjetaJuego(app, j)),
        h('button', { class: 'tarjeta-nueva', type: 'button', onclick: () => nuevoJuego(app) }, '+ Nuevo juego'))),

    h('section', { 'aria-labelledby': 'h-material' },
      h('div', { class: 'titulo-bloque' }, h('h2', { id: 'h-material' }, 'Material para reutilizar'), h('span', { class: 'tenue' }, 'Todo lo que ya habéis hecho se puede insertar en un juego nuevo')),
      material(app))));
  pintarPortadas(raiz, app);
}

function datosJuego(j) {
  const idiomas = (j.languages || []).map((l) => l.toUpperCase()).join(' · ');
  return `${j.paginas} página${j.paginas === 1 ? '' : 's'}${idiomas ? ` · ${idiomas}` : ''}`;
}

function tarjetaRevisar(app, j) {
  return h('div', { class: 'para-revisar', 'data-juego': j.id },
    h('div', { class: 'datos' },
      h('div', { class: 'filtros' }, h('span', { class: 'pastilla claude' }, 'Cambiado por Claude'), h('span', { class: 'pastilla' }, ESTADOS[j.status] || j.status)),
      h('div', { class: 'nombre' }, enIdioma(j.name)),
      h('div', { class: 'tenue' }, datosJuego(j), j.ultimoCambio ? ` · último cambio ${j.ultimoCambio.date}` : ''),
      j.ultimoCambio ? h('div', {}, `«${j.ultimoCambio.text}»`) : null,
      h('div', { class: 'cifras' },
        j.porRevisar ? h('span', {}, h('strong', {}, String(j.porRevisar)), ` cambio${j.porRevisar === 1 ? '' : 's'} por revisar`) : null,
        j.sugerencias ? h('span', {}, h('strong', {}, String(j.sugerencias)), ` sugerencia${j.sugerencias === 1 ? '' : 's'} de Claude`) : null,
        j.notasPendientes ? h('span', { style: { color: 'var(--aviso)' } }, h('strong', {}, String(j.notasPendientes)), ` nota${j.notasPendientes === 1 ? '' : 's'} tuya${j.notasPendientes === 1 ? '' : 's'} pendiente${j.notasPendientes === 1 ? '' : 's'}`) : null)),
    h('div', { class: 'filtros' },
      h('a', { class: 'boton claude', href: `#/juego/${encodeURIComponent(j.id)}/revisar` }, 'Revisar cambios'),
      h('a', { class: 'boton', href: `#/juego/${encodeURIComponent(j.id)}/paginas` }, 'Abrir')));
}

function tarjetaJuego(app, j) {
  const editable = j.status === 'borrador' && j.schema === 'pme-game/2';
  return h('article', { class: 'tarjeta-juego', 'data-juego': j.id },
    h('div', { class: 'portada', 'data-portada': j.id }, h('span', { class: 'tenue' }, '…')),
    h('div', { class: 'cuerpo' },
      h('div', { class: 'filtros' },
        h('span', { class: `pastilla ${j.status === 'borrador' ? '' : 'verde'}` }, ESTADOS[j.status] || j.status),
        j.cambios ? h('span', { class: 'pastilla claude' }, 'Claude') : null,
        j.schema !== 'pme-game/2' ? h('span', { class: 'pastilla aviso' }, 'Formato antiguo') : null),
      h('div', { class: 'nombre' }, enIdioma(j.name)),
      h('div', { class: 'tenue' }, datosJuego(j)),
      h('div', { class: 'acciones' },
        h('a', { class: 'boton pequeno', href: `#/juego/${encodeURIComponent(j.id)}/${editable ? 'paginas' : 'previa'}` }, editable ? 'Editar' : 'Ver'),
        h('button', { class: 'boton pequeno', type: 'button', onclick: () => duplicarJuego(app, j.id) }, 'Duplicar'))));
}

/** Portadas: la primera página de cada juego, compuesta por el motor, de una en una y solo cuando se ven. */
function pintarPortadas(raiz, app) {
  const cola = [];
  let ocupado = false;
  const siguiente = async () => {
    if (ocupado || !cola.length) return;
    ocupado = true;
    const { caja, id } = cola.shift();
    try {
      const { game } = await app.almacen.load(id);
      const primera = game.schema === 'pme-game/2' ? game.pages[0] && game.pages[0].id : null;
      if (game.schema !== 'pme-game/2' || primera) {
        const ej = (game.examples || [])[0];
        const { bytes } = await componer({ juego: game, almacen: app.almacen, biblioteca: app.biblioteca, lang: (game.languages || ['es'])[0],
          ejemplo: ej ? ej.id : null, paginas: primera ? [primera] : null });
        const canvas = h('canvas', {});
        await pintarPDF(bytes, canvas, caja.clientWidth || 240, 1);
        caja.replaceChildren(canvas);
      } else caja.replaceChildren(h('span', { class: 'tenue' }, 'Sin páginas'));
    } catch {
      caja.replaceChildren(h('span', { class: 'tenue' }, 'Sin portada'));
    }
    ocupado = false;
    siguiente();
  };
  const obs = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      cola.push({ caja: e.target, id: e.target.dataset.portada });
      siguiente();
    }
  });
  raiz.querySelectorAll('[data-portada]').forEach((c) => obs.observe(c));
}

/* ---------------- Material de la biblioteca ---------------- */

function material(app) {
  const bib = app.biblioteca;
  const paginas = bib.actuales('pagina');
  const secciones = bib.actuales('seccion');
  const arte = bib.actuales('arte').filter((p) => p.status !== 'reexportar');
  const puzzles = bib.actuales('puzzle');
  const miniaturas = h('div', { class: 'miniaturas' });
  arte.slice(0, 8).forEach((p) => { const img = h('img', { alt: p.name, loading: 'lazy' }); bib.miniatura(p).then((u) => { img.src = u; }, () => {}); miniaturas.append(img); });
  const cabeza = (titulo, cuenta) => h('div', { class: 'cabeza' }, h('strong', {}, titulo), h('span', { class: 'tenue' }, cuenta));
  return h('div', { class: 'material' },
    h('div', { class: 'tarjeta-material' },
      cabeza('Páginas y puzzles', `${paginas.length} páginas · ${puzzles.length} puzzles`),
      h('ul', { class: 'lista-simple' }, [...paginas.slice(0, 3).map((p) => h('li', {}, h('span', {}, p.name), h('span', { class: 'tenue' }, p.coleccion))),
        ...puzzles.slice(0, 3).map((z) => h('li', {}, h('span', {}, z.name), h('span', { class: 'tenue' }, 'puzzle')))]),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => verBiblioteca(app, 'pagina') }, 'Ver páginas y puzzles')),
    h('div', { class: 'tarjeta-material' },
      cabeza('Campos y secciones', `${secciones.reduce((n, s) => n + Object.keys(s.fieldDefs).length, 0)} campos · ${secciones.length} secciones`),
      h('ul', { class: 'lista-simple' }, secciones.slice(0, 5).map((s) => h('li', {}, h('span', {}, s.name), h('span', { class: 'tenue' }, `${s.section.fields.length} campos`)))),
      h('button', { class: 'boton pequeno', type: 'button', onclick: () => verBiblioteca(app, 'seccion') }, 'Ver las secciones')),
    h('div', { class: 'tarjeta-material' },
      cabeza('Imágenes', `${arte.length} piezas`),
      miniaturas,
      h('div', { class: 'filtros' },
        h('button', { class: 'boton pequeno', type: 'button', onclick: () => verBiblioteca(app, 'arte') }, 'Ver todas'),
        h('button', { class: 'boton pequeno', type: 'button', onclick: () => abrirSubida(app).then((r) => r && app.repintar()) }, icono('subir', { tam: 16 }), 'Subir'))));
}

/** Navegador de la biblioteca (solo consulta; para insertar se usa desde la página o el formulario). */
export function verBiblioteca(app, tipo = 'arte') {
  const bib = app.biblioteca;
  const pestanas = [['arte', 'Imágenes'], ['pagina', 'Páginas'], ['seccion', 'Secciones'], ['puzzle', 'Puzzles']];
  let actual = tipo;
  let etiqueta = '';
  return app.dialogo((cerrar) => {
    const cuerpo = h('div', {});
    const pintar = () => {
      const lista = bib.actuales(actual).filter((e) => !etiqueta || (e.tags || []).includes(etiqueta));
      const contenido = actual === 'arte'
        ? h('div', { class: 'galeria', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' } }, lista.map((p) => {
          const img = h('img', { alt: '' });
          bib.miniatura(p).then((u) => { img.src = u; }, () => {});
          return h('figure', { class: 'pieza', style: { cursor: 'default' } }, img, h('figcaption', {}, p.name, h('br', {}), `${p.widthMm} × ${p.heightMm} mm · ${p.author}`));
        }))
        : h('ul', { class: 'lista-simple' }, lista.map((e) => h('li', {}, h('span', {}, h('strong', {}, e.name), h('br', {}), h('span', { class: 'tenue' },
          actual === 'pagina' ? `${e.page.elements.length} elementos · campos: ${e.fields.join(', ') || 'ninguno'}`
            : actual === 'seccion' ? `campos: ${e.section.fields.join(', ')}`
              : `${e.mechanic} · necesita: ${e.needs.map((n) => n.field).join(', ') || 'nada'}`)),
          h('span', { class: 'tenue' }, `${e.id}@${e.version}`))));
      cuerpo.replaceChildren(
        h('div', { class: 'pestanas', role: 'tablist' }, pestanas.map(([t, txt]) => h('button', { type: 'button', role: 'tab', 'aria-selected': t === actual ? 'true' : 'false', onclick: () => { actual = t; etiqueta = ''; pintar(); } }, txt))),
        h('div', { class: 'filtros' }, ['', ...bib.etiquetas(actual).slice(0, 14)].map((t) => h('button', { type: 'button', 'aria-pressed': t === etiqueta ? 'true' : 'false', onclick: () => { etiqueta = t; pintar(); } }, t || 'Todas'))),
        lista.length ? contenido : h('div', { class: 'vacio' }, 'No hay nada con esa etiqueta.'));
    };
    pintar();
    return h('div', { class: 'dialogo' }, h('h2', {}, 'Biblioteca'), h('p', { class: 'tenue' }, 'Lo que se puede reutilizar en cualquier juego. Para insertarlo, abre un juego: páginas, imágenes y puzzles desde «Páginas»; secciones desde «Formulario».'),
      cuerpo, h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar() }, 'Cerrar')));
  }, { ancho: true });
}

/* ---------------- Juego nuevo y duplicar ---------------- */

function formularioNombre({ titulo, explicacion, nombreInicial = '', conIdiomas = true, conPaginas = true, origen = null, juegos = [] }, cerrar) {
  const nombre = h('input', { id: 'nuevo-nombre', required: true, value: nombreInicial, autocomplete: 'off' });
  const id = h('input', { id: 'nuevo-id', required: true, pattern: '[a-z0-9][a-z0-9\\-]*', value: idDeNombre(nombreInicial || 'juego'), autocomplete: 'off' });
  let idTocado = false;
  nombre.addEventListener('input', () => { if (!idTocado) id.value = idDeNombre(nombre.value); });
  id.addEventListener('input', () => { idTocado = true; });
  const idiomas = ['es', 'en'].map((l) => h('label', { class: 'casilla' }, h('input', { type: 'checkbox', value: l, checked: true, name: 'idioma' }), NOMBRE_IDIOMA[l]));
  const paginas = h('input', { id: 'nuevo-paginas', type: 'number', min: 0, max: 50, value: 6 });
  const fuente = origen === undefined ? null : h('select', { id: 'nuevo-origen' }, juegos.map((j) => h('option', { value: j.id, selected: j.id === origen }, `${enIdioma(j.name)} (${j.id})`)));
  return h('form', { class: 'dialogo', onsubmit: (e) => {
    e.preventDefault();
    const langs = idiomas.map((l) => l.querySelector('input')).filter((i) => i.checked).map((i) => i.value);
    if (conIdiomas && !langs.length) return;
    cerrar({ nombre: nombre.value.trim(), id: id.value.trim(), idiomas: langs, paginas: Number(paginas.value), origen: fuente ? fuente.value : null });
  } },
  h('h2', {}, titulo), h('p', { class: 'tenue' }, explicacion),
  fuente ? h('div', { class: 'campo' }, h('label', { for: 'nuevo-origen' }, 'Juego que se copia'), fuente) : null,
  h('div', { class: 'campo' }, h('label', { for: 'nuevo-nombre' }, 'Nombre del juego'), nombre),
  h('div', { class: 'campo' }, h('label', { for: 'nuevo-id' }, 'Identificador'), id, h('span', { class: 'ayuda' }, 'Minúsculas, números y guiones. Es el nombre de la carpeta y de la rama en GitHub.')),
  conIdiomas ? h('fieldset', { class: 'campo', style: { border: 0, padding: 0, margin: 0 } }, h('legend', { class: 'rotulo' }, 'Idiomas'), h('div', { class: 'filtros' }, idiomas)) : null,
  conPaginas ? h('div', { class: 'campo' }, h('label', { for: 'nuevo-paginas' }, 'Páginas en blanco para empezar'), paginas, h('span', { class: 'ayuda' }, 'Tamaño A4. Luego se añaden, se quitan o se copian de la biblioteca.')) : null,
  h('div', { class: 'botones' }, h('button', { class: 'boton', type: 'button', onclick: () => cerrar(null) }, 'Cancelar'), h('button', { class: 'boton primario', type: 'submit' }, 'Crear')));
}

async function nuevoJuego(app) {
  const d = await app.dialogo((cerrar) => formularioNombre({ titulo: 'Empezar en blanco', explicacion: 'Un juego nuevo en borrador. Solo lo ves tú (y Claude) hasta que lo envíes al estudio.' }, cerrar));
  if (!d) return;
  const nombre = Object.fromEntries(d.idiomas.map((l) => [l, d.nombre]));
  const g = {
    schema: 'pme-game/2', id: d.id, version: '0.1.0', status: 'borrador', name: nombre, languages: d.idiomas, pageSize: 'A4',
    pages: Array.from({ length: Math.max(0, Math.min(50, d.paginas || 0)) }, (_, i) => ({ id: `p${i + 1}`, title: `Página ${i + 1}`, background: { kind: 'color', value: '#FFFFFF' }, elements: [] })),
    i18n: Object.fromEntries(d.idiomas.map((l) => [l, {}])), fields: {}, form: { sections: [] },
    mechanics: [], examples: [], solutions: [], puzzles: [], notes: [], changes: [],
  };
  try {
    await app.almacen.create(g.id, g, `Crear ${g.id} desde el creador`);
    app.navegar(`#/juego/${encodeURIComponent(g.id)}/paginas`);
  } catch (e) {
    app.aviso(e.code === 'exists' ? `Ya hay un juego «${g.id}»: cambia el identificador.` : `No se pudo crear: ${e.message}`, { tipo: 'error' });
  }
}

async function duplicarJuego(app, origen = undefined) {
  const juegos = app.juegos || [];
  if (!juegos.length) { app.aviso('Aún no hay juegos que duplicar.'); return; }
  const inicial = origen ? juegos.find((j) => j.id === origen) : juegos[0];
  const d = await app.dialogo((cerrar) => formularioNombre({ titulo: 'Duplicar un juego', explicacion: 'Se copian sus páginas, textos, campos, ejemplos y ficheros. El original no cambia.',
    nombreInicial: `Copia de ${enIdioma(inicial.name)}`, conIdiomas: false, conPaginas: false, origen: inicial.id, juegos }, cerrar));
  if (!d) return;
  try {
    const { game: fuente } = await app.almacen.load(d.origen);
    const g = migrarAV2(fuente);
    g.id = d.id;
    g.version = '0.1.0';
    g.status = 'borrador';
    g.name = Object.fromEntries(g.languages.map((l) => [l, d.nombre]));
    g.notes = [];
    g.changes = [{ date: new Date().toISOString().slice(0, 10), text: `Copia de «${d.origen}» (versión ${fuente.version}) hecha en el creador.` }];
    g.review = { changes: 1 };
    await app.almacen.create(g.id, g, `Copiar ${d.origen} en ${g.id}`);
    // Ficheros de la carpeta del juego (las rutas que salen de ella siguen valiendo: misma profundidad).
    const rutas = new Set([...g.pages.filter((p) => p.background && p.background.kind === 'pdf').map((p) => p.background.file),
      ...(g.examples || []).flatMap((e) => Object.values(e.photos || {}))]);
    for (const rel of rutas) {
      if (rel.startsWith('../') || rel.startsWith('/')) continue;
      const bytes = await app.almacen.leerFichero(d.origen, rel);
      await app.almacen.escribirFichero(g.id, rel, bytes, `Copiar ${rel} de ${d.origen}`, { sobrescribir: false });
    }
    app.aviso(`Copiado: «${d.nombre}»`, { tipo: 'bien' });
    app.navegar(`#/juego/${encodeURIComponent(g.id)}/paginas`);
  } catch (e) {
    app.aviso(e.code === 'exists' ? `Ya hay un juego «${d.id}»: cambia el identificador.` : `No se pudo duplicar: ${e.message}`, { tipo: 'error' });
  }
}

export { haceCuanto };
