// Presupuesto en PDF (A4), con pdf-lib y las fuentes del motor (Anton para el titular, Open Sans para el texto).
// Funciona en el navegador (creador) y en Node. Uso:
//   const bytes = await presupuestoPdf(p, tarifas, { PDFLib, fontkit, fuentes: { regular, bold, titular } })
// fuentes: bytes .ttf. Las secciones van como bloques; si una página se llena, la tabla sigue en la siguiente con su
// cabecera. Las horas solo salen si el presupuesto tiene mostrarHoras.
import { ESTADOS, totales, conceptoDe, euros, horasTexto } from './calculo.mjs';

const A4 = [595.28, 841.89];
const M = 48; // margen
const TINTA = [0.047, 0.165, 0.184];
const VERDE = [0.055, 0.455, 0.388];
const TENUE = [0.36, 0.42, 0.42];
const CLARO = [0.89, 0.933, 0.914];

export async function presupuestoPdf(p, tarifas, { PDFLib, fontkit, fuentes }) {
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
  const t = totales(p);
  const conHoras = !!p.mostrarHoras;
  const ancho = A4[0] - 2 * M;
  // Columnas de la tabla (x de la derecha de cada número)
  const C = conHoras
    ? { concepto: M, cant: M + ancho - 230, horas: M + ancho - 165, unidad: M + ancho - 85, importe: M + ancho }
    : { concepto: M, cant: M + ancho - 190, unidad: M + ancho - 95, importe: M + ancho };
  const anchoConcepto = (conHoras ? C.cant - 40 : C.cant - 40) - M;

  let page = null;
  let y = 0;
  const paginas = [];
  const nueva = () => { page = doc.addPage(A4); paginas.push(page); y = A4[1] - M; };
  const texto = (s, x, yy, { f = F.r, tam = 10, c = TINTA, derecha = false } = {}) => {
    const w = f.widthOfTextAtSize(s, tam);
    page.drawText(s, { x: derecha ? x - w : x, y: yy, size: tam, font: f, color: color(c) });
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
  y -= 78;
  page.drawLine({ start: { x: M, y }, end: { x: M + ancho, y }, thickness: 1.5, color: color(TINTA) });
  y -= 22;

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
  y -= n * 14 + 10;
  if ((p.descripcion || '').trim()) {
    for (const l of partir(p.descripcion, F.r, 10, ancho)) { sitio(14); texto(l, M, y, { tam: 10 }); y -= 14; }
    y -= 8;
  }

  // ---- Tabla
  function cabeceraTabla() {
    page.drawRectangle({ x: M, y: y - 18, width: ancho, height: 22, color: color(TINTA) });
    const b = { f: F.b, tam: 8.5, c: [1, 1, 1] };
    texto('CONCEPTO', C.concepto + 8, y - 11, b);
    texto('CANT.', C.cant, y - 11, { ...b, derecha: true });
    if (conHoras) texto('HORAS', C.horas, y - 11, { ...b, derecha: true });
    texto('PRECIO UNIDAD', C.unidad, y - 11, { ...b, derecha: true });
    texto('IMPORTE', C.importe - 8, y - 11, { ...b, derecha: true });
    y -= 30;
  }
  cabeceraTabla();
  for (const s of t.porSeccion) {
    sitio(72); // la cabecera de sección no se queda sola al pie de la página
    page.drawRectangle({ x: M, y: y - 6, width: ancho, height: 18, color: color(CLARO) });
    texto(s.nombre.toUpperCase(), M + 8, y, { f: F.b, tam: 8.5, c: VERDE });
    texto(euros(s.importe, tarifas.moneda), C.importe - 8, y, { f: F.b, tam: 8.5, c: VERDE, derecha: true });
    y -= 22;
    for (const l of s.lineas) {
      const c = conceptoDe(tarifas, l.concepto);
      const nombre = `${c ? c.nombre : l.concepto}${l.complejidad && l.complejidad !== 'media' ? ` (${l.complejidad})` : ''}`;
      const desc = partir(l.descripcion || '', F.r, 8.5, anchoConcepto);
      const alto = 14 + (l.descripcion ? desc.length * 11 : 0) + 6;
      sitio(alto);
      texto(nombre, C.concepto + 8, y, { f: F.b, tam: 9.5 });
      const unidad = c ? c.unidad : '';
      texto(`${fmtNum(l.cantidad)}${unidad && unidad !== 'hora' ? ` ${plural(unidad, l.cantidad)}` : ''}`, C.cant, y, { tam: 9.5, derecha: true });
      if (conHoras) texto(horasTexto(l.horasTotal), C.horas, y, { tam: 9.5, derecha: true });
      texto(euros(l.precioUnidad, tarifas.moneda), C.unidad, y, { tam: 9.5, derecha: true });
      texto(euros(l.importe, tarifas.moneda), C.importe - 8, y, { tam: 9.5, derecha: true });
      if (l.descripcion) desc.forEach((d, i) => texto(d, C.concepto + 8, y - 13 - i * 11, { tam: 8.5, c: TENUE }));
      y -= alto;
      page.drawLine({ start: { x: M, y: y + 11 }, end: { x: M + ancho, y: y + 11 }, thickness: 0.4, color: color([0.82, 0.85, 0.84]) });
    }
    y -= 4;
  }

  // ---- Totales
  const filas = [['Base', t.base]];
  if (Number(p.gestion)) filas.push([`Coordinación y gestión (${fmtNum(p.gestion)} %)`, t.gestion]);
  if (Number(p.descuento)) filas.push([`Descuento (${fmtNum(p.descuento)} %)`, -t.descuento]);
  if (Number(p.gestion) || Number(p.descuento)) filas.push(['Base imponible', t.imponible]);
  filas.push([`IVA (${fmtNum(p.iva)} %)`, t.iva]);
  const altoTotales = filas.length * 16 + 44;
  if (y - altoTotales < M + 30) nueva();
  y -= 6;
  const xEtiqueta = M + ancho - 250;
  for (const [et, v] of filas) {
    texto(et, xEtiqueta, y, { tam: 9.5, c: TENUE });
    texto(euros(v, tarifas.moneda), C.importe - 8, y, { tam: 9.5, derecha: true });
    y -= 16;
  }
  page.drawRectangle({ x: xEtiqueta - 10, y: y - 22, width: M + ancho - xEtiqueta + 10, height: 30, color: color(VERDE) });
  texto('TOTAL', xEtiqueta, y - 13, { f: F.t, tam: 14, c: [1, 1, 1] });
  texto(euros(t.total, tarifas.moneda), C.importe - 8, y - 13, { f: F.t, tam: 14, c: [1, 1, 1], derecha: true });
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

  // ---- Pie
  paginas.forEach((pg, i) => {
    page = pg;
    texto(`${estudio} · Presupuesto ${p.id}`, M, 26, { tam: 7.5, c: TENUE });
    texto(`Página ${i + 1} de ${paginas.length}`, M + ancho, 26, { tam: 7.5, c: TENUE, derecha: true });
  });
  return doc.save();
}

function fechaEs(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${Number(m[3])}/${Number(m[2])}/${m[1]}` : (iso || '');
}
const fmtNum = (x) => String(Math.round((Number(x) || 0) * 100) / 100).replace('.', ',');
const plural = (u, n) => (Number(n) === 1 ? u : ({ pieza: 'piezas', página: 'páginas', puzzle: 'puzzles', pregunta: 'preguntas', mecánica: 'mecánicas', campo: 'campos', juego: 'juegos' }[u] || u));
