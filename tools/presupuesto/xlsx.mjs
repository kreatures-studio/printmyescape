// Presupuesto en Excel (.xlsx) sin dependencias: el libro se escribe a mano (SpreadsheetML) y se empaqueta en un ZIP
// sin comprimir. Las cuentas van como fórmulas (precio por unidad, importe, subtotales, gestión, descuento, IVA y
// total), con su valor ya calculado para los visores que no recalculan. Funciona en el navegador y en Node.
import { SECCIONES, ESTADOS, totales, conceptoDe } from './calculo.mjs';

/* ---------------- ZIP (método 0, sin comprimir) ---------------- */
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TABLA_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(ficheros) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let off = 0;
  for (const [nombre, contenido] of ficheros) {
    const n = enc.encode(nombre);
    const d = typeof contenido === 'string' ? enc.encode(contenido) : contenido;
    const crc = crc32(d);
    const loc = new DataView(new ArrayBuffer(30));
    loc.setUint32(0, 0x04034b50, true); loc.setUint16(4, 20, true); loc.setUint16(6, 0x0800, true); loc.setUint16(8, 0, true);
    loc.setUint16(10, 0, true); loc.setUint16(12, 0x21, true); loc.setUint32(14, crc, true); loc.setUint32(18, d.length, true);
    loc.setUint32(22, d.length, true); loc.setUint16(26, n.length, true); loc.setUint16(28, 0, true);
    partes.push(new Uint8Array(loc.buffer), n, d);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true);
    cen.setUint16(10, 0, true); cen.setUint16(12, 0, true); cen.setUint16(14, 0x21, true); cen.setUint32(16, crc, true);
    cen.setUint32(20, d.length, true); cen.setUint32(24, d.length, true); cen.setUint16(28, n.length, true);
    cen.setUint32(42, off, true);
    central.push(new Uint8Array(cen.buffer), n);
    off += 30 + n.length + d.length;
  }
  const tamCentral = central.reduce((a, b) => a + b.length, 0);
  const fin = new DataView(new ArrayBuffer(22));
  fin.setUint32(0, 0x06054b50, true); fin.setUint16(8, ficheros.length, true); fin.setUint16(10, ficheros.length, true);
  fin.setUint32(12, tamCentral, true); fin.setUint32(16, off, true);
  const todo = [...partes, ...central, new Uint8Array(fin.buffer)];
  const out = new Uint8Array(todo.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of todo) { out.set(b, p); p += b.length; }
  return out;
}

/* ---------------- Hoja ---------------- */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i) => { let s = ''; i += 1; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

// Estilos (índices de cellXfs): 0 normal, 1 negrita, 2 título, 3 cabecera de tabla, 4 €, 5 horas, 6 € en negrita,
// 7 porcentaje, 8 texto con salto de línea, 9 total (€ grande en negrita), 10 sección (negrita con fondo claro).
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/><numFmt numFmtId="165" formatCode="0.00"/><numFmt numFmtId="166" formatCode="0.##&quot; %&quot;"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF0C2A2F"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="13"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0E7463"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE3EEE9"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF0C2A2F"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="4" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function celda(ref, v, estilo = 0) {
  if (v === null || v === undefined || v === '') return estilo ? `<c r="${ref}" s="${estilo}"/>` : '';
  if (typeof v === 'number') return `<c r="${ref}" s="${estilo}"><v>${v}</v></c>`;
  if (typeof v === 'object' && v.f) return `<c r="${ref}" s="${estilo}"><f>${esc(v.f)}</f><v>${v.v ?? 0}</v></c>`;
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
}

/** Bytes del .xlsx del presupuesto `p` con las tarifas `tarifas` (para los nombres de los conceptos). */
export function presupuestoXlsx(p, tarifas) {
  const t = totales(p);
  const filas = []; // [numero, [[colIdx, valor, estilo]]]
  let r = 0;
  const fila = (celdas, alto = null) => { r += 1; filas.push([r, celdas, alto]); return r; };
  const estudio = (tarifas.estudio && tarifas.estudio.nombre) || 'Estudio';
  fila([[0, `${estudio} · Presupuesto ${p.id}`, 2]], 24);
  fila([[0, p.titulo || '', 1]]);
  fila([[0, 'Fecha'], [1, p.fecha], [3, 'Validez'], [4, `${p.validez || 30} días`], [6, 'Estado'], [7, ESTADOS[p.estado] || p.estado]]);
  fila([[0, 'Cliente'], [1, [p.cliente && p.cliente.nombre, p.cliente && p.cliente.contacto].filter(Boolean).join(' · ')], [6, 'Juego'], [7, p.juego || '—']]);
  if ((p.descripcion || '').trim()) fila([[0, p.descripcion, 8]], 18 * Math.min(6, Math.ceil(p.descripcion.length / 110)));
  fila([]);
  const cab = ['Sección', 'Concepto', 'Descripción', 'Complejidad', 'Cantidad', 'Horas por unidad', 'Tarifa (€/h)', 'Precio por unidad', 'Horas', 'Importe'];
  fila(cab.map((x, i) => [i, x, 3]), 30);
  const primera = r + 1;
  for (const s of t.porSeccion) {
    for (const l of s.lineas) {
      const n = r + 1;
      const c = conceptoDe(tarifas, l.concepto);
      fila([
        [0, s.nombre], [1, c ? c.nombre : l.concepto], [2, l.descripcion || '', 8], [3, l.complejidad || 'media'],
        [4, Number(l.cantidad) || 0], [5, Number(l.horas) || 0, 5], [6, Number(l.tarifa) || 0, 4],
        [7, { f: `F${n}*G${n}`, v: l.precioUnidad }, 4], [8, { f: `E${n}*F${n}`, v: l.horasTotal }, 5], [9, { f: `E${n}*H${n}`, v: l.importe }, 4],
      ]);
    }
  }
  const ultima = Math.max(r, primera);
  fila([]);
  const rBase = fila([[8, 'Base', 1], [9, { f: `SUM(J${primera}:J${ultima})`, v: t.base }, 6]]);
  const rHoras = fila([[8, 'Horas totales'], [9, { f: `SUM(I${primera}:I${ultima})`, v: t.horas }, 5]]);
  void rHoras;
  const rGes = fila([[6, 'Coordinación y gestión'], [7, Number(p.gestion) || 0, 7], [8, 'Gestión'], [9, { f: `J${rBase}*H${r + 1}/100`, v: t.gestion }, 4]]);
  const rDes = fila([[6, 'Descuento'], [7, Number(p.descuento) || 0, 7], [8, 'Descuento'], [9, { f: `-(J${rBase}+J${rGes})*H${r + 1}/100`, v: -t.descuento }, 4]]);
  const rImp = fila([[8, 'Base imponible', 1], [9, { f: `J${rBase}+J${rGes}+J${rDes}`, v: t.imponible }, 6]]);
  const rIva = fila([[6, 'IVA'], [7, Number(p.iva) || 0, 7], [8, 'IVA'], [9, { f: `J${rImp}*H${r + 1}/100`, v: t.iva }, 4]]);
  fila([[8, 'TOTAL', 1], [9, { f: `J${rImp}+J${rIva}`, v: t.total }, 9]], 22);
  fila([]);
  if ((p.condiciones || '').trim()) {
    fila([[0, 'Condiciones', 1]]);
    fila([[0, p.condiciones, 8]], 18 * Math.min(8, Math.ceil(p.condiciones.length / 110)));
  }
  const anchos = [22, 30, 48, 13, 10, 11, 11, 14, 9, 14];
  const xmlFilas = filas.map(([n, celdas, alto]) => `<row r="${n}"${alto ? ` ht="${alto}" customHeight="1"` : ''}>${celdas.map(([i, v, e]) => celda(`${col(i)}${n}`, v, e || 0)).join('')}</row>`).join('');
  const fusiones = filas.filter(([, celdas]) => celdas.length === 1 && celdas[0][0] === 0 && typeof celdas[0][1] === 'string' && celdas[0][2] === 8)
    .map(([n]) => `<mergeCell ref="A${n}:J${n}"/>`);
  const hoja = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${xmlFilas}</sheetData>
${fusiones.length ? `<mergeCells count="${fusiones.length}">${fusiones.join('')}</mergeCells>` : ''}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
  // Hoja 2: las tarifas con las que se hizo (perfiles y conceptos), para que el estudio vea de dónde sale cada precio.
  const f2 = [];
  let r2 = 0;
  const fila2 = (c) => { r2 += 1; f2.push(`<row r="${r2}">${c.map(([i, v, e]) => celda(`${col(i)}${r2}`, v, e || 0)).join('')}</row>`); };
  fila2([[0, 'Tarifas por hora', 2]]);
  fila2([[0, 'Perfil', 3], [1, '€/h', 3]]);
  for (const [, pf] of Object.entries(tarifas.perfiles)) fila2([[0, pf.nombre], [1, Number(pf.tarifa) || 0, 4]]);
  fila2([]);
  fila2([[0, 'Complejidad', 3], [1, 'Multiplica las horas', 3]]);
  for (const [k, v] of Object.entries(tarifas.complejidad)) fila2([[0, k], [1, Number(v) || 0, 5]]);
  fila2([]);
  fila2([[0, 'Concepto', 3], [1, 'Unidad', 3], [2, 'Horas (media)', 3], [3, 'Qué incluye', 3]]);
  for (const c of tarifas.conceptos) fila2([[0, c.nombre], [1, c.unidad], [2, Number(c.horas) || 0, 5], [3, c.ayuda || '', 8]]);
  const hoja2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="40" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/><col min="4" max="4" width="80" customWidth="1"/></cols><sheetData>${f2.join('')}</sheetData></worksheet>`;
  const libro = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Presupuesto" sheetId="1" r:id="rId1"/><sheet name="Tarifas" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`;
  return zip([
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', libro],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ['xl/worksheets/sheet1.xml', hoja],
    ['xl/worksheets/sheet2.xml', hoja2],
  ]);
}

export { SECCIONES };
