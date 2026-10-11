// Genera las piezas de prueba del fondo por capas (T4.2). No son arte del kit: son figuras
// sencillas creadas para esta prueba, con licencia CC0-1.0 declarada en el manifiesto de prueba.
// Uso (desde la raíz del repo): node tools/qa/fixtures/capas/generar.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { PDFDocument, rgb } = require(path.join(HERE, '..', '..', '..', 'node_modules', 'pdf-lib'));
const PIEZAS = path.join(HERE, 'kit', 'piezas');

// PDF vectorial de una página: rectángulo rojo con borde negro.
async function pdfRojo() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([120, 80]);
  page.drawRectangle({ x: 4, y: 4, width: 112, height: 72, color: rgb(0.8, 0.1, 0.1), borderColor: rgb(0, 0, 0), borderWidth: 3 });
  return doc.save();
}

// PDF vectorial de una página: círculo azul.
async function pdfAzul() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([80, 80]);
  page.drawEllipse({ x: 40, y: 40, xScale: 36, yScale: 36, color: rgb(0.1, 0.3, 0.8) });
  return doc.save();
}

// PNG RGBA 300 × 200: degradado horizontal de verde a amarillo.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => (buf.reduce((c, b) => CRC[(c ^ b) & 0xff] ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function pngDegradado(w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 4 + 1) + 1 + x * 4, t = x / (w - 1);
      raw[o] = Math.round(40 + 200 * t); raw[o + 1] = Math.round(160 + 80 * t);
      raw[o + 2] = Math.round(60 * (1 - t)); raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

fs.writeFileSync(path.join(PIEZAS, 'rojo.pdf'), await pdfRojo());
fs.writeFileSync(path.join(PIEZAS, 'azul.pdf'), await pdfAzul());
fs.writeFileSync(path.join(PIEZAS, 'degradado.png'), pngDegradado(300, 200));
console.log('piezas de prueba escritas en', path.relative(process.cwd(), PIEZAS));
