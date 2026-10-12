// Herramientas del servidor MCP (T6.1; contrato 3.3). Trabajan a través del almacén (3.5). Las que
// modifican: cargan el juego, aplican el cambio sobre una copia, validan y solo guardan si no hay
// errores (con la rev leída, así no pisan una versión más nueva). Se niegan si el juego no está en
// «borrador» (3.6). Errores: ErrorHerramienta con un código («no-borrador», «invalido», «not-found»…).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateGame, avisosGame } from '../tools/game/validate.mjs';
import { medirLimites } from '../tools/game/limites.mjs';
import { crearAlmacenFs } from './store-fs.mjs';
import { cargarMotor, componerJuego, manifiestoDelKit, arteDisponible } from './motor.mjs';
import { aV1 } from '../tools/game/v2.mjs';
import { herramientasV2 } from './herramientas-v2.mjs';

/* Un juego pme-game/2 se compone y se miden sus límites en su forma v1 equivalente (aV1). Se edita con las
   herramientas de herramientas-v2.mjs (F3.1) y con las de campos, formulario, textos, ejemplos y soluciones,
   que son iguales en los dos formatos. */
const vistaV1 = (g) => (g.schema === 'pme-game/2' ? aV1(g) : g);
const esV2 = (g) => g.schema === 'pme-game/2';

export class ErrorHerramienta extends Error {
  constructor(code, message, detalles = null) {
    super(message);
    this.code = code;
    this.detalles = detalles;
  }
}

const PREVIA_BORRADOR = 'BORRADOR';
const MAX_PAGINAS = 50;

/* ---- Git y gh (sync y submit_to_studio). Se llaman desde la copia local del repositorio. ---- */

function correr(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || (r.error && r.error.message) || '').trim() };
}
const git = (args, cwd) => correr('git', args, cwd);
const ghDisponible = (cwd) => correr('gh', ['--version'], cwd).ok;

function repoGit(raiz) {
  if (!git(['rev-parse', '--is-inside-work-tree'], raiz).ok) {
    throw new ErrorHerramienta('no-git', `«${raiz}» no es un repositorio git: no se puede sincronizar`);
  }
}

/* ---- Comprobación de argumentos según el esquema de cada herramienta ---- */

function comprobarArgs(nombre, esquema, args) {
  for (const k of esquema.required || []) {
    if (args[k] === undefined) throw new ErrorHerramienta('invalid', `${nombre}: falta «${k}»`);
  }
  for (const [k, def] of Object.entries(esquema.properties || {})) {
    const v = args[k];
    if (v === undefined || def.type === undefined) continue; // sin tipo fijo (p. ej. name: texto u objeto)
    const ok = def.type === 'integer' ? Number.isInteger(v)
      : def.type === 'number' ? typeof v === 'number'
      : def.type === 'array' ? Array.isArray(v)
      : def.type === 'object' ? (typeof v === 'object' && v !== null && !Array.isArray(v))
      : typeof v === def.type;
    if (!ok) throw new ErrorHerramienta('invalid', `${nombre}: «${k}» debe ser ${def.type}`);
    if (def.enum && !def.enum.includes(v)) throw new ErrorHerramienta('invalid', `${nombre}: «${k}» debe ser ${def.enum.join(' | ')}`);
  }
}

const esquema = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const S = { type: 'string' };
const ID = { type: 'string', description: 'id del juego (minúsculas, números y guiones)' };
const PAGINA = { type: 'string', description: 'id de la página, p. ej. p1' };

/** Herramientas (3.3) sobre la copia local `raiz` del repositorio de juegos. */
export function crearHerramientas({ raiz }) {
  const almacen = crearAlmacenFs(raiz);

  /* En borrador, una lista vacía (sin secciones, sin campos aún) es contenido que falta, no un error:
     se admite mientras se edita. Para enviar (submit) cuenta como error, como en el validador. */
  async function validar(game, { submit = false, dir }) {
    // El arte: PME_KIT si se da; si no, todo el arte de la biblioteca (F3.1).
    const opciones = process.env.PME_KIT ? { kit: manifiestoDelKit() } : { kitDatos: (await arteDisponible()).manifiesto };
    const errors = validateGame(game, { submit, dir, ...opciones })
      .filter((e) => submit || !/must NOT have fewer than 1 items/.test(e));
    return { errors, warnings: avisosGame(game) };
  }

  /** Carga el juego, aplica `cambiar` sobre una copia, valida y guarda. formato: 'v1', 'v2' o 'ambos' (las
   *  herramientas que solo tienen sentido en uno de los dos formatos se niegan con el otro). */
  async function mutar(id, mensaje, cambiar, { formato = 'ambos' } = {}) {
    const { game, rev } = await almacen.load(id);
    if (formato === 'v1' && esV2(game)) {
      throw new ErrorHerramienta('solo-v1', `«${id}» está en pme-game/2: usa insert_page, add_element, update_element y remove_element`);
    }
    if (formato === 'v2' && !esV2(game)) {
      throw new ErrorHerramienta('solo-v2', `«${id}» está en pme-game/1: esta herramienta es para juegos v2 (duplicate_game hace una copia en v2)`);
    }
    if (game.status !== 'borrador') {
      throw new ErrorHerramienta('no-borrador', `«${id}» está en «${game.status}»: solo se edita en borrador`);
    }
    const nuevo = structuredClone(game);
    const resultado = await cambiar(nuevo);
    const { errors } = await validar(nuevo, { dir: almacen.carpeta(id) });
    if (errors.length) throw new ErrorHerramienta('invalido', 'el cambio dejaría el juego inválido; no se ha guardado', errors);
    await almacen.save(id, nuevo, rev, mensaje);
    return resultado;
  }

  const pagina = (g, id) => {
    const p = g.template.pages.find((x) => x.id === id);
    if (!p) throw new ErrorHerramienta('not-found', `no hay página «${id}»`);
    return p;
  };
  const resumen = (g) => ({
    id: g.id, schema: g.schema, name: g.name, version: g.version, status: g.status, languages: g.languages,
    paginas: esV2(g) ? g.pages.length : g.template.pages.length, campos: Object.keys(g.fields || {}).length,
    mecanicas: (g.mechanics || []).length, ejemplos: (g.examples || []).length, soluciones: (g.solutions || []).length,
    ...(esV2(g) ? { puzzles: (g.puzzles || []).length, notas_pendientes: (g.notes || []).filter((n) => !n.done).length } : {}),
  });
  const cargarCrudo = async (id) => (await almacen.load(id)).game;
  const cargar = async (id) => vistaV1(await cargarCrudo(id));

  /** Sincroniza la rama juego/<id> del juego con origin (pull o push). */
  function sincronizar(id, direccion, mensaje) {
    repoGit(raiz);
    const rama = `juego/${id}`;
    const dirJuego = path.posix.join('games', id);
    if (direccion === 'pull') {
      if (git(['status', '--porcelain', '--', dirJuego], raiz).out) {
        throw new ErrorHerramienta('sucio', `hay cambios sin enviar en ${dirJuego}: haz sync push antes de traer cambios`);
      }
      const f = git(['fetch', 'origin'], raiz);
      if (!f.ok) throw new ErrorHerramienta('sin-remoto', `no se pudo leer origin: ${f.err}`);
      if (!git(['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${rama}`], raiz).ok) {
        return { status: 'sin-remoto', rama, detalle: `origin no tiene la rama ${rama} todavía` };
      }
      const cambio = git(['checkout', rama], raiz).ok ? { ok: true } : git(['checkout', '-b', rama, `origin/${rama}`], raiz);
      if (!cambio.ok) throw new ErrorHerramienta('git', `no se pudo cambiar a ${rama}: ${cambio.err}`);
      const tr = git(['pull', '--rebase', 'origin', rama], raiz);
      if (!tr.ok) {
        git(['rebase', '--abort'], raiz);
        throw new ErrorHerramienta('conflicto', `hay conflicto con origin/${rama}; no se ha cambiado nada. Revísalo a mano.`, tr.err);
      }
      return { status: 'ok', rama, commit: git(['rev-parse', '--short', 'HEAD'], raiz).out };
    }
    // push
    const cambio = git(['checkout', rama], raiz).ok ? { ok: true } : git(['checkout', '-b', rama], raiz);
    if (!cambio.ok) throw new ErrorHerramienta('git', `no se pudo crear ${rama}: ${cambio.err}`);
    git(['add', '--', dirJuego], raiz);
    if (git(['diff', '--cached', '--quiet', '--', dirJuego], raiz).ok) {
      return { status: 'sin-cambios', rama };
    }
    const c = git(['commit', '-m', mensaje || `Editar ${id}`, '--', dirJuego], raiz);
    if (!c.ok) throw new ErrorHerramienta('git', `no se pudo confirmar: ${c.err}`);
    const p = git(['push', '-u', 'origin', rama], raiz);
    if (!p.ok) throw new ErrorHerramienta('rechazado', `origin no aceptó el cambio (¿hay cambios nuevos? haz sync pull): ${p.err}`);
    return { status: 'ok', rama, commit: git(['rev-parse', '--short', 'HEAD'], raiz).out };
  }

  const herramientas = [
    {
      name: 'list_games', description: 'Lista los juegos de la copia local.',
      schema: esquema({}),
      run: async () => almacen.list(),
    },
    {
      name: 'get_game', description: 'Devuelve un juego o una parte: summary, form, fields, pages, mechanics, puzzles, texts (i18n), notes o full. Un juego v2 se devuelve en v2 (páginas con elementos).',
      schema: esquema({ id: ID, part: { type: 'string', enum: ['summary', 'form', 'fields', 'pages', 'mechanics', 'puzzles', 'texts', 'notes', 'full'] } }, ['id']),
      run: async ({ id, part = 'summary' }) => {
        const g = await cargarCrudo(id);
        const partes = { summary: () => resumen(g), form: () => g.form, fields: () => g.fields,
          pages: () => (esV2(g) ? g.pages : g.template.pages), mechanics: () => g.mechanics, puzzles: () => g.puzzles || [],
          texts: () => g.i18n, notes: () => g.notes || [], full: () => g };
        return partes[part]();
      },
    },
    {
      name: 'create_game', description: 'Crea un juego vacío en borrador, con N páginas. format v2 (por defecto): páginas en blanco con elementos (insert_page, add_element…); v1: capas y huecos (set_page, upsert_slot).',
      schema: esquema({ id: ID, name: { description: 'Nombre: texto (igual en todos los idiomas) u objeto { idioma: texto }' },
        languages: { type: 'array', description: 'Idiomas, p. ej. ["es","en"]; por defecto ["es"]' },
        pages: { type: 'integer', description: 'Número de páginas (0 a 50; en v2 se pueden añadir luego con insert_page)' },
        format: { type: 'string', enum: ['v1', 'v2'] } }, ['id', 'name', 'pages']),
      run: async ({ id, name, languages = ['es'], pages, format = 'v2' }) => {
        if (pages < (format === 'v2' ? 0 : 1) || pages > MAX_PAGINAS) throw new ErrorHerramienta('invalid', `pages debe estar entre ${format === 'v2' ? 0 : 1} y ${MAX_PAGINAS}`);
        if (await almacen.latestRev(id)) throw new ErrorHerramienta('exists', `ya existe el juego «${id}»`);
        const nombre = typeof name === 'string' ? Object.fromEntries(languages.map((l) => [l, name])) : name;
        const g = format === 'v2' ? {
          schema: 'pme-game/2', id, version: '0.1.0', status: 'borrador', name: nombre, languages, pageSize: 'A4',
          pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i + 1}`, title: `Página ${i + 1}`, background: { kind: 'color', value: '#FFFFFF' }, elements: [] })),
          i18n: Object.fromEntries(languages.map((l) => [l, {}])), fields: {}, form: { sections: [] },
          mechanics: [], examples: [], solutions: [], puzzles: [], notes: [], changes: [],
        } : {
          schema: 'pme-game/1', id, version: '0.1.0', status: 'borrador', name: nombre, languages,
          background: { kind: 'layers' },
          template: { id, version: 1, name: nombre[languages[0]] ?? id, pageSize: 'A4', fields: [],
            pages: Array.from({ length: pages }, (_, i) => ({ id: `p${i + 1}`, title: `Página ${i + 1}`, slots: [], layers: [] })) },
          texts: [], i18n: Object.fromEntries(languages.map((l) => [l, {}])), fields: {}, form: { sections: [] },
          mechanics: [], examples: [], solutions: [],
        };
        const { errors } = await validar(g, { dir: almacen.carpeta(id) });
        if (errors.length) throw new ErrorHerramienta('invalido', 'no se puede crear el juego', errors);
        await almacen.save(id, g, null, `Crear ${id}`);
        return resumen(g);
      },
    },
    {
      name: 'list_assets', description: 'Piezas del kit de arte (manifiesto), opcionalmente filtradas por etiqueta.',
      schema: esquema({ tag: S }),
      run: async ({ tag }) => {
        const piezas = JSON.parse(fs.readFileSync(manifiestoDelKit(), 'utf8')).pieces || [];
        return piezas.filter((p) => !tag || (p.tags || []).includes(tag))
          .map(({ id, kind, widthMm, heightMm, tags, license, author, source }) => ({ id, kind, widthMm, heightMm, tags, license, author, source }));
      },
    },
    {
      name: 'list_mechanics', description: 'Mecánicas registradas: tipo, etiqueta y parámetros.',
      schema: esquema({}),
      run: async () => {
        cargarMotor();
        return Object.entries(globalThis.PMEMechanics || {}).map(([type, def]) => ({ type, label: def.label ?? null, params: def.params ?? null }));
      },
    },
    {
      name: 'set_page', description: 'Crea o cambia una página y sus capas de arte (layers: [{asset,x,y,w,h,angle?}]).',
      schema: esquema({ id: ID, page: PAGINA, layers: { type: 'array' } }, ['id', 'page', 'layers']),
      run: async ({ id, page, layers }) => mutar(id, `Página ${page} de ${id}`, (g) => {
        const p = g.template.pages.find((x) => x.id === page);
        if (p) p.layers = layers;
        else g.template.pages.push({ id: page, title: page, slots: [], layers });
        return pagina(g, page);
      }, { formato: 'v1' }),
    },
    {
      name: 'upsert_slot', description: 'Crea o cambia un hueco de texto de una página (slot.field, x, y, w, h en %).',
      schema: esquema({ id: ID, page: PAGINA, slot: { type: 'object' } }, ['id', 'page', 'slot']),
      run: async ({ id, page, slot }) => mutar(id, `Hueco ${slot.field} en ${page}`, (g) => {
        const p = pagina(g, page);
        const i = p.slots.findIndex((s) => s.field === slot.field);
        if (i >= 0) p.slots[i] = slot; else p.slots.push(slot);
        return slot;
      }, { formato: 'v1' }),
    },
    {
      name: 'remove_slot', description: 'Quita el hueco de un campo de una página.',
      schema: esquema({ id: ID, page: PAGINA, slot: { type: 'string', description: 'id del campo del hueco' } }, ['id', 'page', 'slot']),
      run: async ({ id, page, slot }) => mutar(id, `Quitar hueco ${slot} de ${page}`, (g) => {
        const p = pagina(g, page);
        const antes = p.slots.length;
        p.slots = p.slots.filter((s) => s.field !== slot);
        if (p.slots.length === antes) throw new ErrorHerramienta('not-found', `no hay hueco de «${slot}» en ${page}`);
        return { removed: slot };
      }, { formato: 'v1' }),
    },
    {
      name: 'upsert_field', description: 'Crea o cambia un campo (def: type, required, cap, q por idioma, ...).',
      schema: esquema({ id: ID, field: { type: 'string' }, def: { type: 'object' } }, ['id', 'field', 'def']),
      run: async ({ id, field, def }) => mutar(id, `Campo ${field}`, (g) => { g.fields[field] = def; return def; }),
    },
    {
      name: 'remove_field', description: 'Quita un campo. Se rechaza si aún lo usan huecos, secciones o ejemplos.',
      schema: esquema({ id: ID, field: { type: 'string' } }, ['id', 'field']),
      run: async ({ id, field }) => mutar(id, `Quitar campo ${field}`, (g) => {
        if (!g.fields[field]) throw new ErrorHerramienta('not-found', `no hay campo «${field}»`);
        delete g.fields[field];
        return { removed: field };
      }),
    },
    {
      name: 'set_sections', description: 'Sustituye las secciones del formulario.',
      schema: esquema({ id: ID, sections: { type: 'array' } }, ['id', 'sections']),
      run: async ({ id, sections }) => mutar(id, `Secciones de ${id}`, (g) => { g.form.sections = sections; return { sections: sections.length }; }),
    },
    {
      name: 'upsert_mechanic', description: 'Crea o cambia una mecánica (se identifica por type y page).',
      schema: esquema({ id: ID, mechanic: { type: 'object' } }, ['id', 'mechanic']),
      run: async ({ id, mechanic }) => mutar(id, `Mecánica ${mechanic.type}`, (g) => {
        const i = g.mechanics.findIndex((m) => m.type === mechanic.type && m.page === mechanic.page);
        if (i >= 0) g.mechanics[i] = mechanic; else g.mechanics.push(mechanic);
        return mechanic;
      }),
    },
    {
      name: 'remove_mechanic', description: 'Quita las mecánicas de un tipo (y de una página, si se indica).',
      schema: esquema({ id: ID, type: S, page: PAGINA }, ['id', 'type']),
      run: async ({ id, type, page }) => mutar(id, `Quitar mecánica ${type}`, (g) => {
        const antes = g.mechanics.length;
        g.mechanics = g.mechanics.filter((m) => !(m.type === type && (!page || m.page === page)));
        if (g.mechanics.length === antes) throw new ErrorHerramienta('not-found', `no hay mecánica «${type}»`);
        return { removed: antes - g.mechanics.length };
      }),
    },
    {
      name: 'set_texts', description: 'Textos fijos del idioma (entries: clave → texto).',
      schema: esquema({ id: ID, lang: S, entries: { type: 'object' } }, ['id', 'lang', 'entries']),
      run: async ({ id, lang, entries }) => mutar(id, `Textos ${lang} de ${id}`, (g) => {
        if (!g.languages.includes(lang)) throw new ErrorHerramienta('invalid', `«${lang}» no está en languages`);
        g.i18n[lang] = { ...(g.i18n[lang] || {}), ...entries };
        return { lang, claves: Object.keys(g.i18n[lang]).length };
      }),
    },
    {
      name: 'set_example', description: 'Guarda un ejemplo (id, values por idioma, photos).',
      schema: esquema({ id: ID, example: { type: 'object' } }, ['id', 'example']),
      run: async ({ id, example }) => mutar(id, `Ejemplo ${example.id}`, (g) => {
        const i = (g.examples || []).findIndex((e) => e.id === example.id);
        g.examples = g.examples || [];
        if (i >= 0) g.examples[i] = example; else g.examples.push(example);
        return example;
      }),
    },
    {
      name: 'set_solutions', description: 'Sustituye las soluciones (id, how, page?, dependsOn?).',
      schema: esquema({ id: ID, solutions: { type: 'array' } }, ['id', 'solutions']),
      run: async ({ id, solutions }) => mutar(id, `Soluciones de ${id}`, (g) => { g.solutions = solutions; return { soluciones: solutions.length }; }),
    },
    {
      name: 'validate_game', description: 'Valida el juego: mode draft (borrador) o submit (para enviar). Devuelve errores y avisos.',
      schema: esquema({ id: ID, mode: { type: 'string', enum: ['draft', 'submit'] } }, ['id', 'mode']),
      run: async ({ id, mode }) => {
        const g = await cargarCrudo(id);
        return validar(g, { submit: mode === 'submit', dir: almacen.carpeta(id) });
      },
    },
    {
      name: 'measure_limits', description: 'Capacidad y límite de cada campo de texto (con las fuentes del motor).',
      schema: esquema({ id: ID }, ['id']),
      run: async ({ id }) => medirLimites(await cargar(id)),
    },
    {
      name: 'render_preview', description: 'Genera la vista previa de un ejemplo con marca «BORRADOR»: un PDF y un PNG por página (con pdftoppm).',
      schema: esquema({ id: ID, lang: S, example: { type: 'string' }, pages: { type: 'array', description: 'Páginas a dibujar en PNG (números); por defecto, todas' } }, ['id', 'lang', 'example']),
      run: async ({ id, lang, example, pages }) => {
        const g = await cargar(id);
        const { bytes, warns } = await componerJuego(g, { dir: almacen.carpeta(id), lang, example, watermark: PREVIA_BORRADOR });
        const dirSalida = path.join(raiz, 'salidas', 'mcp');
        fs.mkdirSync(dirSalida, { recursive: true });
        const base = `${id}-${lang}-ej${example}`;
        const pdf = path.join(dirSalida, `${base}.pdf`);
        fs.writeFileSync(pdf, bytes);
        const paginas = (await globalThis.PDFLib.PDFDocument.load(bytes)).getPageCount();
        const numeros = pages && pages.length ? pages : Array.from({ length: paginas }, (_, i) => i + 1);
        const png = [];
        let aviso = null;
        const pp = correr('pdftoppm', ['-v'], raiz);
        if (!pp.ok) aviso = 'pdftoppm no está instalado (poppler): no se generan PNG; el PDF sí';
        else {
          for (const n of numeros) {
            if (!Number.isInteger(n) || n < 1 || n > paginas) throw new ErrorHerramienta('invalid', `página ${n} fuera de 1..${paginas}`);
            const salida = path.join(dirSalida, `${base}-p${n}`);
            const r = correr('pdftoppm', ['-png', '-r', '100', '-singlefile', '-f', String(n), '-l', String(n), pdf, salida], raiz);
            if (!r.ok) throw new ErrorHerramienta('git', `pdftoppm falló en la página ${n}: ${r.err}`);
            png.push(path.relative(raiz, `${salida}.png`));
          }
        }
        return { pdf: path.relative(raiz, pdf), png, paginas, avisos: warns, aviso };
      },
    },
    {
      name: 'sync', description: 'Sincroniza la rama juego/<id> con origin: pull (trae cambios) o push (confirma y sube games/<id>).',
      schema: esquema({ id: ID, direction: { type: 'string', enum: ['pull', 'push'] }, message: S }, ['id', 'direction']),
      run: async ({ id, direction, message }) => sincronizar(id, direction, message),
    },
    {
      name: 'submit_to_studio', description: 'Valida para enviar, marca el juego como enviado, sube la rama y abre el pull request hacia main.',
      schema: esquema({ id: ID, note: S }, ['id', 'note']),
      run: async ({ id, note }) => {
        if (!ghDisponible(raiz)) {
          throw new ErrorHerramienta('sin-gh', 'falta GitHub CLI (gh): instálalo y ejecuta «gh auth login». No se ha cambiado nada.');
        }
        repoGit(raiz);
        const { game, rev } = await almacen.load(id);
        if (game.status !== 'borrador' && game.status !== 'enviado') {
          throw new ErrorHerramienta('no-borrador', `«${id}» está en «${game.status}»: no se puede enviar`);
        }
        const { errors } = await validar(game, { submit: true, dir: almacen.carpeta(id) });
        if (errors.length) throw new ErrorHerramienta('invalido', 'no se puede enviar: hay errores', errors);
        if (game.status === 'borrador') {
          // Reintentable: si la subida falla después, el juego queda «enviado» y basta con repetir la llamada.
          await almacen.save(id, { ...game, status: 'enviado' }, rev, `Enviar ${id} al estudio`);
        }
        const sub = sincronizar(id, 'push', `Enviar ${id} al estudio`);
        const rama = `juego/${id}`;
        const abierto = correr('gh', ['pr', 'list', '--head', rama, '--state', 'open', '--json', 'url', '--jq', '.[0].url'], raiz);
        if (abierto.ok && abierto.out) return { url: abierto.out, status: 'enviado', rama, sincronizacion: sub.status };
        const pr = correr('gh', ['pr', 'create', '--base', 'main', '--head', rama, '--title', `Enviar ${id} al estudio`, '--body', note], raiz);
        if (!pr.ok) throw new ErrorHerramienta('git', `no se pudo abrir el pull request: ${pr.err}. El juego ya está enviado; repite la llamada.`);
        return { url: pr.out, status: 'enviado', rama, sincronizacion: sub.status };
      },
    },
    ...herramientasV2({ almacen, mutar, cargarCrudo, validar, ErrorHerramienta, esquema, ID, PAGINA, raiz }),
  ];

  return { herramientas, almacen, comprobarArgs };
}
