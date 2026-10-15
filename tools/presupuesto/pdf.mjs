// Presupuesto en PDF (A4), con pdf-lib y las fuentes del motor (Anton para el titular, Open Sans para el texto).
// Funciona en el navegador (creador), en Node y en el servidor de Claude. Uso:
//   const bytes = await presupuestoPdf(p, tarifas, { PDFLib, fontkit, fuentes: { regular, bold, titular },
//                                                    miniaturas?, juego?, juegoPdf? })
//   fuentes: bytes .ttf. miniaturas: { 'id@versión': bytes PNG } de las piezas a las que apuntan las líneas.
//   juego (pme-game/2) y juegoPdf (el juego compuesto): con los dos, un anexo «Dónde va cada cosa» con las páginas
//   del escape y el número de cada línea encima de donde va.
// Cabecera, resumen visual (total y reparto por secciones), líneas numeradas con su color de sección y la miniatura
// de la pieza, totales y condiciones. Las horas solo salen si el presupuesto tiene mostrarHoras.
import { ESTADOS, SECCIONES, COLOR_SECCION, totales, conceptoDe, euros, horasTexto, marcas, piezasDeLinea, nombreConNivel } from './calculo.mjs';

const A4 = [595.28, 841.89];
const M = 44; // margen
const TINTA = [0.047, 0.165, 0.184];
const VERDE = [0.122, 0.357, 0.29];
const TENUE = [0.36, 0.42, 0.42];
const FONDO = [0.965, 0.957, 0.937];
const hexA = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const claro = (c, k = 0.85) => c.map((v) => v + (1 - v) * k);

export async function presupuestoPdf(p, tarifas, { PDFLib, fontkit, fuentes, miniaturas = {}, juego = null, juegoPdf = null }) {
  const { PDFDocument, rgb } = PDFLib;
  const color = (c) => rgb(c[0], c[1], c[2]);
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Presupuesto ${p.id}${p.titulo ? ` · ${p.titulo}` : ''}`);
  doc.setAuthor((tarifas.estudio && tarifas.estudio.nombre) || '');
  doc.setCreator('PrintMyEscape · Creador');
  const F = {
    r: await doc.embedFont(fuentes.regular, { subset: true }),
    b: await doc.embedFont(fuentes.bold, { subset: true }),
    t: await doc.embedFont(fuentes.titular, { subset: true }),
  };
  const imgs = {};
  for (const [ref, bytes] of Object.entries(miniaturas || {})) { try { imgs[ref] = await doc.embedPng(bytes); } catch { /* sin miniatura */ } }
  const t = totales(p);
  const conHoras = !!p.mostrarHoras;
  const ancho = A4[0] - 2 * M;
  const C = conHoras
    ? { concepto: M + 58, cant: M + ancho - 232, horas: M + ancho - 168, unidad: M + ancho - 88, importe: M + ancho - 6 }
    : { concepto: M + 58, cant: M + ancho - 190, unidad: M + ancho - 95, importe: M + ancho - 6 };
  const anchoConcepto = C.cant - 50 - C.concepto;
  const colSeccion = (s) => hexA(COLOR_SECCION[s] || COLOR_SECCION.otros);
  const nombreSeccion = Object.fromEntries(SECCIONES.map((s) => [s.id, s.nombre]));

  let page = null;
  let y = 0;
  const paginas = [];
  const nueva = () => { page = doc.addPage(A4); paginas.push(page); y = A4[1] - M; };
  const texto = (s, x, yy, { f = F.r, tam = 10, c = TINTA, derecha = false, centro = false } = {}) => {
    const w = f.widthOfTextAtSize(s, tam);
    page.drawText(s, { x: derecha ? x - w : centro ? x - w / 2 : x, y: yy, size: tam, font: f, color: color(c) });
    return w;
  };
  const partir = (s, f, tam, max) => {
    const out = [];
    for (const parrafo of String(s || '').split('\n')) {
      let lin = '';
      for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
        const prueba = lin ? `${lin} ${palabra}` : palabra;
        if (f.widthOfTextAtSize(prueba, tam) <= max || !lin) lin = prueba; else { out.push(lin); lin = palabra; }
      }
      out.push(lin);
    }
    return out;
  };
  const chapa = (n, cx, cy, c, r = 9) => {
    page.drawCircle({ x: cx, y: cy, size: r, color: color(c), borderColor: rgb(1, 1, 1), borderWidth: 1.2 });
    texto(String(n), cx, cy - (r > 8 ? 3.4 : 2.8), { f: F.b, tam: r > 8 ? 9 : 7.5, c: [1, 1, 1], centro: true });
  };
  const sitio = (alto) => { if (y - alto < M + 30) { nueva(); cabeceraTabla(); } };

  // ---- Cabecera
  nueva();
  const estudio = (tarifas.estudio && tarifas.estudio.nombre) || 'Estudio';
  texto(estudio.toUpperCase(), M, y - 22, { f: F.t, tam: 24, c: VERDE });
  if (tarifas.estudio && tarifas.estudio.datos) partir(tarifas.estudio.datos, F.r, 8.5, 260).forEach((l, i) => texto(l, M, y - 38 - i * 11, { tam: 8.5, c: TENUE }));
  texto('PRESUPUESTO', M + ancho, y - 16, { f: F.t, tam: 16, c: TINTA, derecha: true });
  texto(p.id, M + ancho, y - 32, { f: F.b, tam: 11, derecha: true });
  texto(`Fecha: ${fechaEs(p.fecha)} · Válido ${p.validez || 30} días`, M + ancho, y - 46, { tam: 9, c: TENUE, derecha: true });
  if (p.estado && p.estado !== 'borrador') texto(ESTADOS[p.estado] || p.estado, M + ancho, y - 59, { f: F.b, tam: 9, c: VERDE, derecha: true });
  y -= 74;
  page.drawLine({ start: { x: M, y }, end: { x: M + ancho, y }, thickness: 1.5, color: color(TINTA) });
  y -= 20;

  // ---- Cliente y proyecto
  const cliente = [p.cliente && p.cliente.nombre, p.cliente && p.cliente.contacto].filter(Boolean).join(' · ');
  texto('CLIENTE', M, y, { f: F.b, tam: 8, c: TENUE });
  texto('PROYECTO', M + ancho / 2, y, { f: F.b, tam: 8, c: TENUE });
  y -= 14;
  const lc = partir(cliente || '—', F.r, 10.5, ancho / 2 - 20);
  const lp = partir(p.titulo || '—', F.b, 10.5, ancho / 2);
  lc.forEach((l, i) => texto(l, M, y - i * 14, { tam: 10.5 }));
  lp.forEach((l, i) => texto(l, M + ancho / 2, y - i * 14, { f: F.b, tam: 10.5 }));
  let n = Math.max(lc.length, lp.length);
  if (p.juego) { texto(`Juego: ${p.juego}`, M + ancho / 2, y - n * 14, { tam: 9, c: TENUE }); n += 1; }
  y -= n * 14 + 8;

  // ---- Resumen visual: total y reparto por secciones
  const alto = 84;
  page.drawRectangle({ x: M, y: y - alto, width: ancho, height: alto, color: color(FONDO) });
  const xTotal = M + ancho - 170;
  page.drawRectangle({ x: xTotal, y: y - alto, width: 170, height: alto, color: color(VERDE) });
  texto('TOTAL (IVA INCLUIDO)', xTotal + 14, y - 22, { f: F.b, tam: 8, c: [1, 1, 1] });
  texto(euros(t.total, tarifas.moneda), xTotal + 14, y - 50, { f: F.t, tam: 24, c: [1, 1, 1] });
  if (conHoras) texto(`${horasTexto(t.horas)} de trabajo`, xTotal + 14, y - 64, { tam: 8, c: claro(VERDE, 0.7) });
  const barraX = M + 14, barraW = xTotal - M - 28;
  texto('REPARTO', barraX, y - 18, { f: F.b, tam: 8, c: TENUE });
  let bx = barraX;
  for (const s of t.porSeccion) {
    const w = t.base ? (s.importe / t.base) * barraW : 0;
    if (w > 0) page.drawRectangle({ x: bx, y: y - 36, width: w, height: 12, color: color(colSeccion(s.id)) });
    bx += w;
  }
  let lx = barraX, ly = y - 52;
  for (const s of t.porSeccion) {
    const etiqueta = `${s.nombre} ${euros(s.importe, tarifas.moneda)} (${t.base ? Math.round((s.importe / t.base) * 100) : 0} %)`;
    const w = F.r.widthOfTextAtSize(etiqueta, 8) + 22;
    if (lx + w > barraX + barraW) { lx = barraX; ly -= 12; }
    page.drawRectangle({ x: lx, y: ly - 1, width: 7, height: 7, color: color(colSeccion(s.id)) });
    texto(etiqueta, lx + 10, ly, { tam: 8 });
    lx += w;
  }
  y -= alto + 16;
  if ((p.descripcion || '').trim()) {
    for (const l of partir(p.descripcion, F.r, 10, ancho)) { if (y < M + 40) nueva(); texto(l, M, y, { tam: 10 }); y -= 14; }
    y -= 8;
  }

  // ---- Tabla
  function cabeceraTabla() {
    page.drawRectangle({ x: M, y: y - 18, width: ancho, height: 22, color: color(TINTA) });
    const b = { f: F.b, tam: 8.5, c: [1, 1, 1] };
    texto('Nº', M + 10, y - 11, b);
    texto('CONCEPTO', C.concepto, y - 11, b);
    texto('CANT.', C.cant, y - 11, { ...b, derecha: true });
    if (conHoras) texto('HORAS', C.horas, y - 11, { ...b, derecha: true });
    texto('PRECIO UNIDAD', C.unidad, y - 11, { ...b, derecha: true });
    texto('IMPORTE', C.importe, y - 11, { ...b, derecha: true });
    y -= 30;
  }
  cabeceraTabla();
  for (const s of t.porSeccion) {
    sitio(76);
    const cs = colSeccion(s.id);
    page.drawRectangle({ x: M, y: y - 6, width: ancho, height: 18, color: color(claro(cs)) });
    page.drawRectangle({ x: M, y: y - 6, width: 4, height: 18, color: color(cs) });
    texto(s.nombre.toUpperCase(), M + 12, y, { f: F.b, tam: 8.5, c: cs });
    texto(euros(s.importe, tarifas.moneda), C.importe, y, { f: F.b, tam: 8.5, c: cs, derecha: true });
    y -= 24;
    for (const l of s.lineas) {
      const c = conceptoDe(tarifas, l.concepto);
      const nombre = partir(nombreConNivel(c, l.complejidad, l.concepto), F.b, 9.5, anchoConcepto);
      const desc = partir(l.descripcion || '', F.r, 8.5, anchoConcepto);
      const pags = [...new Set((l.anclas || []).map((a) => a.pagina))];
      const refs = piezasDeLinea(l, juego).filter((r) => imgs[r]);
      const altoTexto = 14 + (nombre.length - 1) * 12 + (l.descripcion ? desc.length * 11 : 0) + (pags.length ? 11 : 0);
      const altoFila = Math.max(altoTexto, refs.length ? 36 : 0) + 8;
      sitio(altoFila);
      chapa(l.n, M + 14, y + 3, cs);
      if (refs.length) {
        const im = imgs[refs[0]];
        const k = Math.min(30 / im.width, 30 / im.height);
        page.drawImage(im, { x: M + 28 + (26 - im.width * k) / 2, y: y + 8 - im.height * k, width: im.width * k, height: im.height * k });
        if (refs.length > 1) texto(`+${refs.length - 1}`, M + 41, y - 32, { f: F.b, tam: 7, c: TENUE, centro: true });
      }
      nombre.forEach((n, k) => texto(n, C.concepto, y - k * 12, { f: F.b, tam: 9.5 }));
      const unidad = c ? c.unidad : '';
      texto(`${fmtNum(l.cantidad)}${unidad && unidad !== 'hora' ? ` ${plural(unidad, l.cantidad)}` : ''}`, C.cant, y, { tam: 9.5, derecha: true });
      if (conHoras) texto(horasTexto(l.horasTotal), C.horas, y, { tam: 9.5, derecha: true });
      texto(euros(l.precioUnidad, tarifas.moneda), C.unidad, y, { tam: 9.5, derecha: true });
      texto(euros(l.importe, tarifas.moneda), C.importe, y, { tam: 9.5, derecha: true });
      let yy = y - 13 - (nombre.length - 1) * 12;
      if (l.descripcion) desc.forEach((d) => { texto(d, C.concepto, yy, { tam: 8.5, c: TENUE }); yy -= 11; });
      if (pags.length) texto(`Va en: ${pags.map((x) => `página ${x.replace('p', '')}`).join(', ')}`, C.concepto, yy, { f: F.b, tam: 7.5, c: cs });
      y -= altoFila;
      page.drawLine({ start: { x: M, y: y + 11 }, end: { x: M + ancho, y: y + 11 }, thickness: 0.4, color: color([0.85, 0.86, 0.85]) });
    }
    y -= 4;
  }

  // ---- Totales
  const filas = [['Base', t.base]];
  if (Number(p.gestion)) filas.push([`Coordinación y gestión (${fmtNum(p.gestion)} %)`, t.gestion]);
  if (Number(p.descuento)) filas.push([`Descuento (${fmtNum(p.descuento)} %)`, -t.descuento]);
  if (Number(p.gestion) || Number(p.descuento)) filas.push(['Base imponible', t.imponible]);
  filas.push([`IVA (${fmtNum(p.iva)} %)`, t.iva]);
  if (y - (filas.length * 16 + 48) < M + 30) nueva();
  y -= 6;
  const xEtiqueta = M + ancho - 250;
  for (const [et, v] of filas) {
    texto(et, xEtiqueta, y, { tam: 9.5, c: TENUE });
    texto(euros(v, tarifas.moneda), C.importe, y, { tam: 9.5, derecha: true });
    y -= 16;
  }
  page.drawRectangle({ x: xEtiqueta - 10, y: y - 22, width: M + ancho - xEtiqueta + 10, height: 30, color: color(VERDE) });
  texto('TOTAL', xEtiqueta, y - 13, { f: F.t, tam: 14, c: [1, 1, 1] });
  texto(euros(t.total, tarifas.moneda), C.importe, y - 13, { f: F.t, tam: 14, c: [1, 1, 1], derecha: true });
  if (conHoras) texto(`Horas estimadas: ${horasTexto(t.horas)}`, M, y - 13, { tam: 8.5, c: TENUE });
  y -= 44;

  // ---- Condiciones
  if ((p.condiciones || '').trim()) {
    const lineas = partir(p.condiciones, F.r, 8.5, ancho);
    if (y - (lineas.length * 11 + 20) < M + 20) nueva();
    y -= 6;
    texto('CONDICIONES', M, y, { f: F.b, tam: 8, c: TENUE });
    y -= 13;
    for (const l of lineas) { texto(l, M, y, { tam: 8.5, c: TENUE }); y -= 11; }
  }

  // ---- Anexo: dónde va cada cosa (las páginas del escape con el número de cada línea)
  const mk = juego && juegoPdf ? marcas(p, juego) : [];
  if (mk.length) {
    const fuente = await PDFDocument.load(juegoPdf);
    const indices = [...new Set(mk.map((m) => m.indice))].sort((a, b) => a - b).filter((i) => i < fuente.getPageCount());
    const incrustadas = await doc.embedPdf(fuente, indices);
    const COLS = 3, FILAS = 2;
    const hueco = 14;
    const w = (ancho - hueco * (COLS - 1)) / COLS;
    for (let k = 0; k < indices.length; k++) {
      const pos = k % (COLS * FILAS);
      if (pos === 0) {
        nueva();
        texto('DÓNDE VA CADA COSA', M, y - 14, { f: F.t, tam: 16 });
        texto('Cada número es una línea del presupuesto, sobre la página del escape donde va.', M, y - 30, { tam: 9, c: TENUE });
        y -= 48;
      }
      const emb = incrustadas[k];
      const h = (w * emb.height) / emb.width;
      const col = pos % COLS, fila = Math.floor(pos / COLS);
      const x0 = M + col * (w + hueco), yTop = y - fila * (h + 34);
      page.drawRectangle({ x: x0 - 1, y: yTop - h - 1, width: w + 2, height: h + 2, color: color([0.85, 0.86, 0.85]) });
      page.drawPage(emb, { x: x0, y: yTop - h, width: w, height: h });
      for (const m of mk.filter((x) => x.indice === indices[k])) {
        chapa(m.n, x0 + (m.x / 100) * w, yTop - (m.y / 100) * h, colSeccion(m.seccion), 8);
      }
      texto(`Página ${indices[k] + 1}`, x0 + w / 2, yTop - h - 14, { f: F.b, tam: 8.5, c: TENUE, centro: true });
      if (pos === COLS * FILAS - 1 || k === indices.length - 1) {
        // Leyenda de la hoja
        let ly2 = yTop - h - 36;
        const enHoja = new Set(mk.filter((m) => indices.slice(k - pos, k + 1).includes(m.indice)).map((m) => m.n));
        for (const l of t.lineas.filter((x) => enHoja.has(x.n))) {
          if (ly2 < M + 20) break;
          const c = conceptoDe(tarifas, l.concepto);
          chapa(l.n, M + 8, ly2 + 3, colSeccion(l.seccion || 'otros'), 7);
          const todo = `${c ? c.nombre : l.concepto}${l.descripcion ? ` · ${l.descripcion}` : ''}`;
          const partes = partir(todo, F.r, 8.5, ancho - 40);
          const d = partes.length > 1 ? `${partes[0]}…` : partes[0];
          texto(d, M + 22, ly2, { tam: 8.5 });
          ly2 -= 13;
        }
      }
    }
  }

  // ---- Pie
  paginas.forEach((pg, i) => {
    page = pg;
    texto(`${estudio} · Presupuesto ${p.id}`, M, 24, { tam: 7.5, c: TENUE });
    texto(`Página ${i + 1} de ${paginas.length}`, M + ancho, 24, { tam: 7.5, c: TENUE, derecha: true });
  });
  void nombreSeccion;
  return doc.save();
}

function fechaEs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : (iso || '');
}
const fmtNum = (x) => String(Math.round((Number(x) || 0) * 100) / 100).replace('.', ',');
const plural = (u, n) => (Number(n) === 1 ? u : ({ pieza: 'piezas', página: 'páginas', puzzle: 'puzzles', prop: 'props', ajuste: 'ajustes', pregunta: 'preguntas', mecánica: 'mecánicas', campo: 'campos', juego: 'juegos' }[u] || u));
