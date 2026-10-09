/* Calcula cuántos caracteres caben en cada campo de texto de la plantilla.
 * Usa el MISMO motor de ajuste que el PDF (PMECompose.fieldFits en la demo):
 * búsqueda binaria por caja; el límite de un campo es el mínimo de sus cajas.
 *
 *   PUPPETEER_CORE=<ruta a puppeteer-core> node tools/limits.cjs
 *   (la demo debe estar construida: python tools/build-demo.py ...)
 * Escribe tools/limits.json; luego tools/apply-limits.py lo copia a demo/src.html.
 */
const path = require('path');
const fs = require('fs');
const puppeteer = require(process.env.PUPPETEER_CORE || 'puppeteer-core');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SAMPLES = {
  name: 'Mariana Jose Ana Luisa Carmen Rosa Lucia Elena Sofia Marta Irene Paula Nora',
  text: 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
};

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(ROOT, 'demo', 'index.html').replace(/\\/g, '/'), { waitUntil: 'load', timeout: 120000 });
  await new Promise((r) => setTimeout(r, 1500));
  const result = await page.evaluate(async (SAMPLES) => {
    const PW = 595.276, PH = 841.89;
    const map = await formFonts();
    const kindOf = (fid) => {
      if (fid === 'EDAD') return 'num';
      if (fid === 'B_NOTES' || fid === 'B_INFO') return 'multi';
      if (/^NOMBRE_|^APODO_|_ALIAS$|^S2_SECRET_LOVE$/.test(fid)) return 'name';
      return 'text';
    };
    const out = {};
    TPL.pages.forEach((pg) => {
      (pg.slots || []).forEach((s) => {
        const fld = TPL.fields.find((x) => x.id === s.field);
        if (!fld || fld.type !== 'text') return;
        const k = kindOf(s.field);
        if (k === 'num') return;
        const base = k === 'name' ? SAMPLES.name : SAMPLES.text;
        const sample = (base + ' ').repeat(10);
        const fits = (n) => PMECompose.fieldFits(s, sample.slice(0, n).trim(), map, PW, PH);
        let lo = 0, hi = 400;
        if (!fits(1)) { lo = 0; }
        else {
          lo = 1;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi + 1) / 2);
            if (fits(mid)) lo = mid; else hi = mid - 1;
          }
        }
        const prev = out[s.field];
        out[s.field] = prev === undefined ? lo : Math.min(prev, lo);
      });
    });
    return out;
  }, SAMPLES);
  await browser.close();
  // límite recomendado: 75 % de la capacidad medida (margen para letras anchas).
  // Política de nombres (12) y topes por campo: tools/apply-limits.py
  const limits = {};
  Object.keys(result).sort().forEach((k) => { limits[k] = Math.max(1, Math.floor(result[k] * 0.75)); });
  fs.writeFileSync(path.join(__dirname, 'limits.json'), JSON.stringify({ capacity: result, limits }, null, 1));
  Object.keys(limits).sort().forEach((k) => console.log(k.padEnd(24), 'capacidad', String(result[k]).padStart(3), '-> limite', limits[k]));
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
