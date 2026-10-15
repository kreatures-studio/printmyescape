// Herramientas MCP de presupuestos: Claude hace, cambia y exporta presupuestos con un prompt («hazme un presupuesto
// para…»), con las mismas tarifas, cuentas, PDF y Excel que el creador (tools/presupuesto/). Los presupuestos son
// presupuestos/<id>.json en la copia local del repositorio de juegos; sync_budgets los trae de la rama principal o
// los sube a ella (sin tocar la rama del juego en la que se esté trabajando).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TARIFAS_INICIALES, NIVELES, completarTarifas, conceptoDe, nivelesDe, horasDe, lineaDe, conComplejidad, totales,
  siguienteId, presupuestoNuevo, lineasDesdeJuego, lineasCambioDeTema, erroresDe, piezasDeLinea, euros,
} from '../tools/presupuesto/calculo.mjs';
import { presupuestoPdf } from '../tools/presupuesto/pdf.mjs';
import { presupuestoXlsx } from '../tools/presupuesto/xlsx.mjs';
import { buscar } from '../tools/biblioteca/indice.mjs';
import { aV1 } from '../tools/game/v2.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CAMPOS = ['titulo', 'descripcion', 'estado', 'gestion', 'descuento', 'iva', 'condiciones', 'mostrarHoras', 'validez', 'fecha', 'juego'];

export function herramientasPresupuestos({ raiz, almacen, cargarCrudo, ErrorHerramienta: E, esquema }) {
  const S = { type: 'string' };
  const dir = path.join(raiz, 'presupuestos');
  const fichero = (id) => {
    if (!/^P-\d{4}-\d{3,}$/.test(id || '')) throw new E('invalid', `número de presupuesto no válido: «${id}» (P-AAAA-NNN)`);
    return path.join(dir, `${id}.json`);
  };
  const tarifas = () => {
    const f = path.join(dir, 'tarifas.json');
    return completarTarifas(fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null);
  };
  const ids = () => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^P-.+\.json$/.test(n)).map((n) => n.slice(0, -5)).sort() : []);
  const leer = (id) => {
    const f = fichero(id);
    if (!fs.existsSync(f)) throw new E('not-found', `no hay un presupuesto ${id} (¿falta sync_budgets pull?)`);
    return JSON.parse(fs.readFileSync(f, 'utf8'));
  };
  const escribir = (p) => {
    const errores = erroresDe(p);
    if (errores.length) throw new E('invalido', 'el presupuesto no es válido; no se ha guardado', errores);
    p.actualizado = new Date().toISOString();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fichero(p.id), JSON.stringify(p, null, 2) + '\n');
  };
  const juegoLocal = async (id) => { try { return await cargarCrudo(id); } catch { return null; } };
  const vista = (p) => {
    const t = totales(p);
    const tf = tarifas();
    return {
      ...p,
      lineas: t.lineas.map((l) => ({ ...l, concepto_nombre: (conceptoDe(tf, l.concepto) || {}).nombre || l.concepto })),
      totales: { base: t.base, gestion: t.gestion, descuento: t.descuento, imponible: t.imponible, iva: t.iva, total: t.total, horas: t.horas,
        por_seccion: t.porSeccion.map((s) => ({ seccion: s.id, nombre: s.nombre, importe: s.importe, horas: s.horas })) },
      total_texto: euros(t.total, tf.moneda),
    };
  };
  /** Comprueba las anclas contra el juego (si está en la copia local): páginas y elementos que existen. */
  const comprobarAnclas = (anclas, juego) => {
    if (anclas === undefined) return;
    if (!Array.isArray(anclas)) throw new E('invalid', 'anclas es una lista de { pagina, elemento?, x?, y? }');
    if (!juego || !juego.pages) return;
    for (const a of anclas) {
      const pg = juego.pages.find((x) => x.id === a.pagina);
      if (!pg) throw new E('not-found', `el juego ${juego.id} no tiene la página «${a.pagina}»`);
      if (a.elemento && !pg.elements.some((e) => e.id === a.elemento)) throw new E('not-found', `no hay elemento «${a.elemento}» en ${a.pagina}`);
    }
  };
  /** Línea desde lo que pide Claude: concepto y complejidad (las horas y la tarifa salen de las tarifas si no se dan). */
  const lineaPedida = (tf, spec, juego) => {
    if (!spec || !spec.concepto) throw new E('invalid', 'cada línea necesita concepto (get_rates da la lista)');
    if (!conceptoDe(tf, spec.concepto)) throw new E('not-found', `no hay concepto «${spec.concepto}»; los que hay: ${tf.conceptos.map((c) => c.id).join(', ')}`);
    const l = lineaDe(tf, spec.concepto, { descripcion: spec.descripcion || '', complejidad: spec.complejidad || 'media', cantidad: spec.cantidad ?? 1 });
    if (spec.horas !== undefined) l.horas = Number(spec.horas);
    if (spec.tarifa !== undefined) l.tarifa = Number(spec.tarifa);
    if (spec.anclas !== undefined) { comprobarAnclas(spec.anclas, juego); if (spec.anclas.length) l.anclas = spec.anclas; }
    return l;
  };
  const buscarLinea = (p, ref) => {
    const t = totales(p);
    const porN = typeof ref === 'number' || /^\d+$/.test(String(ref)) ? t.lineas.find((l) => l.n === Number(ref)) : null;
    const id = porN ? porN.id : ref;
    const i = p.lineas.findIndex((l) => l.id === id);
    if (i < 0) throw new E('not-found', `no hay línea «${ref}» (usa su id o su número)`);
    return i;
  };
  const LINEA = { type: 'object', description: '{ concepto (id de get_rates), complejidad? (sencilla | media | compleja | muy-compleja), cantidad?, descripcion?, horas?, tarifa?, anclas?: [{ pagina, elemento?, x?, y? }] }' };
  const git = (args, cwd = raiz) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() }; };

  return [
    {
      name: 'list_budgets', description: 'Lista los presupuestos (presupuestos/ de la copia local): número, título, cliente, juego, estado y total.',
      schema: esquema({}),
      run: async () => ids().map((id) => { const v = vista(leer(id)); return { id, titulo: v.titulo, cliente: v.cliente, juego: v.juego, estado: v.estado, total: v.totales.total, lineas: v.lineas.length }; }),
    },
    {
      name: 'get_budget', description: 'Un presupuesto entero con sus cuentas: cada línea con su número (n), precio por unidad e importe, y los totales por sección.',
      schema: esquema({ id: S }, ['id']),
      run: async ({ id }) => vista(leer(id)),
    },
    {
      name: 'get_rates', description: 'Tarifas del estudio: €/h de cada perfil y los conceptos (id, sección, unidad, horas fijas u horas por nivel de complejidad, y su precio). '
        + 'Úsalo antes de presupuestar para elegir conceptos y complejidades.',
      schema: esquema({}),
      run: async () => {
        const tf = tarifas();
        return { ...tf, niveles: NIVELES, conceptos: tf.conceptos.map((c) => {
          const tarifa = (tf.perfiles[c.perfil] || {}).tarifa || 0;
          const ns = nivelesDe(c);
          return { ...c, tarifa, precios: ns.length ? Object.fromEntries(ns.map((n) => [n.id, horasDe(c, n.id) * tarifa])) : { fijo: horasDe(c) * tarifa } };
        }) };
      },
    },
    {
      name: 'set_rates', description: 'Cambia las tarifas del estudio (presupuestos/tarifas.json). perfiles: { id: { nombre?, tarifa? } }; conceptos: altas o cambios por id '
        + '({ id, nombre?, seccion?, perfil?, unidad?, horas?, niveles?: { sencilla, media, compleja, muy-compleja }, ayuda? }); quitar_conceptos: ids. Los presupuestos ya hechos no cambian.',
      schema: esquema({ perfiles: { type: 'object' }, conceptos: { type: 'array' }, quitar_conceptos: { type: 'array' }, iva: { type: 'number' }, gestion: { type: 'number' }, condiciones: S, estudio: { type: 'object' } }),
      run: async ({ perfiles = {}, conceptos = [], quitar_conceptos = [], iva, gestion, condiciones, estudio }) => {
        const tf = tarifas();
        for (const [id, pf] of Object.entries(perfiles)) tf.perfiles[id] = { ...(tf.perfiles[id] || { nombre: id, tarifa: 0 }), ...pf };
        for (const c of conceptos) {
          if (!c.id) throw new E('invalid', 'cada concepto necesita id');
          const i = tf.conceptos.findIndex((x) => x.id === c.id);
          const nuevo = { ...(i >= 0 ? tf.conceptos[i] : { seccion: 'otros', perfil: Object.keys(tf.perfiles)[0], unidad: 'unidad', horas: 1, ayuda: '' }), ...c };
          if (!tf.perfiles[nuevo.perfil]) throw new E('not-found', `no hay perfil «${nuevo.perfil}»`);
          if (i >= 0) tf.conceptos[i] = nuevo; else tf.conceptos.push(nuevo);
        }
        tf.conceptos = tf.conceptos.filter((c) => !quitar_conceptos.includes(c.id));
        if (iva !== undefined) tf.iva = iva;
        if (gestion !== undefined) tf.gestion = gestion;
        if (condiciones !== undefined) tf.condiciones = condiciones;
        if (estudio) tf.estudio = { ...tf.estudio, ...estudio };
        tf.schema = TARIFAS_INICIALES.schema;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'tarifas.json'), JSON.stringify(tf, null, 2) + '\n');
        return { perfiles: tf.perfiles, conceptos: tf.conceptos.map((c) => c.id) };
      },
    },
    {
      name: 'create_budget', description: 'Crea un presupuesto (número P-AAAA-NNN siguiente). empezar: blanco (por defecto), presupuestar (las notas «A presupuestar» del juego) o tema '
        + '(un cambio de tema del juego, con cada pieza señalada). lineas: las que se añaden además. Con juego, cada línea puede llevar anclas: dónde va en el escape '
        + '(página y, si es una pieza que ya existe, su elemento), para verla encima de las páginas en el creador y en el PDF.',
      schema: esquema({ titulo: S, cliente: S, contacto: S, juego: S, descripcion: S, empezar: { type: 'string', enum: ['blanco', 'presupuestar', 'tema'] }, tema: S, lineas: { type: 'array', items: LINEA },
        gestion: { type: 'number' }, descuento: { type: 'number' }, mostrarHoras: { type: 'boolean' } }, ['titulo']),
      run: async ({ titulo, cliente = '', contacto = '', juego = null, descripcion = '', empezar = 'blanco', tema = '', lineas = [], gestion, descuento, mostrarHoras }) => {
        const tf = tarifas();
        const g = juego ? await juegoLocal(juego) : null;
        if (juego && !g) throw new E('not-found', `no hay un juego «${juego}» en la copia local (sync pull del juego primero)`);
        const p = presupuestoNuevo(tf, siguienteId(ids()), { titulo, juego, cliente });
        p.cliente.contacto = contacto;
        p.descripcion = descripcion;
        if (empezar === 'presupuestar') p.lineas.push(...lineasDesdeJuego(tf, g));
        if (empezar === 'tema') p.lineas.push(...lineasCambioDeTema(tf, g, tema || (g.theme && g.theme.name) || ''));
        for (const spec of lineas) p.lineas.push(lineaPedida(tf, spec, g));
        if (gestion !== undefined) p.gestion = gestion;
        if (descuento !== undefined) p.descuento = descuento;
        if (mostrarHoras !== undefined) p.mostrarHoras = mostrarHoras;
        p.lineas = p.lineas.map((l, i) => ({ ...l, id: `l${i + 1}` }));
        escribir(p);
        return vista(p);
      },
    },
    {
      name: 'update_budget', description: 'Cambia un presupuesto: cambios (titulo, cliente, contacto, juego, descripcion, estado, gestion, descuento, iva, condiciones, '
        + 'mostrarHoras, validez, fecha), anadir (líneas nuevas), cambiar ([{ linea: id o número, concepto?, complejidad?, cantidad?, descripcion?, horas?, tarifa?, anclas? }]; '
        + 'al cambiar complejidad las horas pasan a las de ese nivel) y quitar (ids o números de línea).',
      schema: esquema({ id: S, cambios: { type: 'object' }, anadir: { type: 'array', items: LINEA }, cambiar: { type: 'array' }, quitar: { type: 'array' } }, ['id']),
      run: async ({ id, cambios = {}, anadir = [], cambiar = [], quitar = [] }) => {
        const tf = tarifas();
        const p = leer(id);
        for (const [k, v] of Object.entries(cambios)) {
          if (k === 'cliente') p.cliente = { ...(p.cliente || {}), nombre: v };
          else if (k === 'contacto') p.cliente = { ...(p.cliente || {}), contacto: v };
          else if (CAMPOS.includes(k)) p[k] = v;
          else throw new E('invalid', `no se puede cambiar «${k}»`);
        }
        const g = p.juego ? await juegoLocal(p.juego) : null;
        for (const c of cambiar) {
          const i = buscarLinea(p, c.linea);
          let l = p.lineas[i];
          if (c.concepto && c.concepto !== l.concepto) {
            const n = lineaPedida(tf, { concepto: c.concepto, complejidad: c.complejidad || l.complejidad, cantidad: l.cantidad, descripcion: l.descripcion }, g);
            n.id = l.id; if (l.anclas) n.anclas = l.anclas; l = n;
          } else if (c.complejidad) l = conComplejidad(tf, l, c.complejidad);
          for (const k of ['cantidad', 'descripcion', 'horas', 'tarifa']) if (c[k] !== undefined) l[k] = k === 'descripcion' ? c[k] : Number(c[k]);
          if (c.anclas !== undefined) { comprobarAnclas(c.anclas, g); if (c.anclas.length) l.anclas = c.anclas; else delete l.anclas; }
          p.lineas[i] = l;
        }
        const fuera = new Set(quitar.map((q) => p.lineas[buscarLinea(p, q)].id));
        p.lineas = p.lineas.filter((l) => !fuera.has(l.id));
        let n = Math.max(0, ...p.lineas.map((l) => Number(String(l.id).replace(/^l/, '')) || 0));
        for (const spec of anadir) p.lineas.push({ ...lineaPedida(tf, spec, g), id: `l${++n}` });
        escribir(p);
        return vista(p);
      },
    },
    {
      name: 'export_budget', description: 'Exporta un presupuesto a PDF (con las miniaturas de las piezas y, si el juego está en la copia local, las páginas del escape con cada línea señalada) '
        + 'y/o a Excel con fórmulas. Escribe salidas/presupuestos/<id>.pdf|.xlsx y devuelve las rutas.',
      schema: esquema({ id: S, formato: { type: 'string', enum: ['pdf', 'xlsx', 'ambos'] } }, ['id']),
      run: async ({ id, formato = 'ambos' }) => {
        const p = leer(id);
        const tf = tarifas();
        const salida = path.join(raiz, 'salidas', 'presupuestos');
        fs.mkdirSync(salida, { recursive: true });
        const out = {};
        if (formato !== 'pdf') { out.xlsx = path.join(salida, `${id}.xlsx`); fs.writeFileSync(out.xlsx, presupuestoXlsx(p, tf)); }
        if (formato !== 'xlsx') {
          const g = p.juego ? await juegoLocal(p.juego) : null;
          let juegoPdf = null;
          if (g) {
            try {
              const { componerJuego } = await import('./motor.mjs');
              const v1 = g.schema === 'pme-game/2' ? aV1(g) : g;
              const ejemplo = (v1.examples || []).some((e) => e.id === '2') ? '2' : ((v1.examples || [])[0] || {}).id ?? null;
              juegoPdf = (await componerJuego(v1, { dir: almacen.carpeta(g.id), lang: v1.languages[0], example: ejemplo })).bytes;
            } catch (e) { out.aviso = `sin las páginas del escape: ${e.message}`; }
          }
          const miniaturas = {};
          for (const l of p.lineas) for (const ref of piezasDeLinea(l, g)) {
            const pieza = buscar('arte', ref);
            if (pieza && pieza.thumb && !miniaturas[ref]) { try { miniaturas[ref] = fs.readFileSync(path.join(pieza.dir, pieza.thumb)); } catch { /* sin miniatura */ } }
          }
          const { cargarMotor } = await import('./motor.mjs');
          cargarMotor();  // pdf-lib y fontkit como globales (tools/node_modules o .pme/node_modules)
          const fuente = (f) => fs.readFileSync(path.join(ROOT, 'assets', 'fonts', f));
          const bytes = await presupuestoPdf(p, tf, { PDFLib: globalThis.PDFLib, fontkit: globalThis.fontkit, fuentes: { regular: fuente('OpenSans-Regular.ttf'), bold: fuente('OpenSans-Bold.ttf'), titular: fuente('Anton-Regular.ttf') },
            miniaturas, juego: g && g.schema === 'pme-game/2' ? g : null, juegoPdf: g && g.schema === 'pme-game/2' ? juegoPdf : null });
          out.pdf = path.join(salida, `${id}.pdf`);
          fs.writeFileSync(out.pdf, bytes);
        }
        return { ...out, total: vista(p).total_texto };
      },
    },
    {
      name: 'sync_budgets', description: 'Sincroniza presupuestos/ con la rama principal de origin. pull: trae los del creador (no pisa uno local más nuevo). '
        + 'push: sube los locales a la rama principal (en una copia aparte: no cambia la rama del juego en la que estás); se niega si uno de origin es más nuevo.',
      schema: esquema({ direction: { type: 'string', enum: ['pull', 'push'] }, message: S }, ['direction']),
      run: async ({ direction, message }) => {
        if (!git(['rev-parse', '--is-inside-work-tree']).ok) throw new E('no-git', `«${raiz}» no es un repositorio git`);
        const f = git(['fetch', 'origin']);
        if (!f.ok) throw new E('sin-remoto', `no se pudo leer origin: ${f.err}`);
        const principal = (git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']).out || 'origin/main').replace(/^origin\//, '');
        const remotos = git(['ls-tree', '--name-only', `origin/${principal}`, 'presupuestos/']).out.split('\n').filter((n) => n.endsWith('.json'));
        const remoto = (n) => { const r = git(['show', `origin/${principal}:${n}`]); return r.ok ? r.out + '\n' : null; };
        const fecha = (texto) => { try { return JSON.parse(texto).actualizado || ''; } catch { return ''; } };
        if (direction === 'pull') {
          const traidos = [], conservados = [];
          fs.mkdirSync(dir, { recursive: true });
          for (const n of remotos) {
            const local = path.join(raiz, n);
            const txt = remoto(n);
            if (txt === null) continue;
            if (fs.existsSync(local)) {
              const l = fs.readFileSync(local, 'utf8');
              if (l.trim() === txt.trim()) continue;
              if (fecha(l) > fecha(txt)) { conservados.push(path.basename(n)); continue; }
            }
            fs.writeFileSync(local, txt);
            traidos.push(path.basename(n));
          }
          return { status: 'ok', rama: principal, traidos, conservados_mas_nuevos: conservados };
        }
        // push: copia aparte de origin/<principal>, con los presupuestos locales encima
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pme-presupuestos-'));
        try {
          const wt = git(['worktree', 'add', '--detach', tmp, `origin/${principal}`]);
          if (!wt.ok) throw new E('git', `no se pudo preparar la copia: ${wt.err}`);
          const locales = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith('.json')) : [];
          const masNuevos = [];
          fs.mkdirSync(path.join(tmp, 'presupuestos'), { recursive: true });
          for (const n of locales) {
            const destino = path.join(tmp, 'presupuestos', n);
            const l = fs.readFileSync(path.join(dir, n), 'utf8');
            if (fs.existsSync(destino)) {
              const r = fs.readFileSync(destino, 'utf8');
              if (r.trim() !== l.trim() && fecha(r) > fecha(l)) { masNuevos.push(n); continue; }
            }
            fs.writeFileSync(destino, l);
          }
          if (masNuevos.length) throw new E('conflicto', `en origin hay versiones más nuevas de ${masNuevos.join(', ')}: haz sync_budgets pull primero. No se ha subido nada.`);
          git(['add', 'presupuestos'], tmp);
          if (git(['diff', '--cached', '--quiet'], tmp).ok) return { status: 'sin-cambios', rama: principal };
          const c = git(['commit', '-m', message || 'Presupuestos (Claude)'], tmp);
          if (!c.ok) throw new E('git', `no se pudo confirmar: ${c.err}`);
          const p = git(['push', 'origin', `HEAD:${principal}`], tmp);
          if (!p.ok) throw new E('rechazado', `origin no aceptó los presupuestos (¿cambios nuevos? sync_budgets pull): ${p.err}`);
          return { status: 'ok', rama: principal, commit: git(['rev-parse', '--short', 'HEAD'], tmp).out };
        } finally {
          git(['worktree', 'remove', '--force', tmp]);
          fs.rmSync(tmp, { recursive: true, force: true });
        }
      },
    },
  ];
}
