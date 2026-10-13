// Fuentes del motor en el navegador (F1.4 / F4): el mismo registro que tools/game/fuentes.cjs
// (assets/fonts/registro.json), con rutas relativas al creador.
//   cargarRegistro()  → { FUENTES: { clave: { file, subset } }, resolver: { key, manuscrita }, registrado(nombre),
//                         nombresDelCreador: [{ nombre, etiqueta }] }

const REGISTRO_URL = '../assets/fonts/registro.json';
const DIR_FUENTES = '../assets/fonts/';

/** Nombres que ofrece el creador (los demás del registro son de juegos migrados). */
export const NOMBRES_DEL_CREADOR = [
  { nombre: 'Open Sans', etiqueta: 'Open Sans (texto)' },
  { nombre: 'Open Sans Bold', etiqueta: 'Open Sans negrita' },
  { nombre: 'Caveat', etiqueta: 'Caveat (manuscrita)' },
  { nombre: 'Caveat Bold', etiqueta: 'Caveat negrita' },
  { nombre: 'Anton', etiqueta: 'Anton (titular)' },
  { nombre: 'Courier Prime', etiqueta: 'Courier Prime (máquina)' },
  { nombre: 'Courier Prime Bold', etiqueta: 'Courier Prime negrita' },
  { nombre: 'Pigpen', etiqueta: 'Pigpen (runas)' },
];

let registro = null;

export async function cargarRegistro() {
  if (registro) return registro;
  const res = await fetch(new URL(REGISTRO_URL, import.meta.url));
  if (!res.ok) throw new Error(`no se pudo leer el registro de fuentes (${res.status})`);
  const r = await res.json();
  const entrada = (familia) => {
    const nombre = familia == null ? '' : String(familia);
    if (!Object.prototype.hasOwnProperty.call(r.nombres, nombre)) throw new Error(`fuente no registrada: «${nombre}»`);
    return r.nombres[nombre];
  };
  registro = {
    FUENTES: Object.fromEntries(r.fuentes.map((f) => [f.key, { file: new URL(DIR_FUENTES + f.fichero, import.meta.url).href, subset: !f.embeberCompleta }])),
    resolver: { key: (f) => entrada(f).key, manuscrita: (f) => !!entrada(f).manuscrita },
    registrado: (f) => Object.prototype.hasOwnProperty.call(r.nombres, f == null ? '' : String(f)),
    nombresDelCreador: NOMBRES_DEL_CREADOR,
  };
  return registro;
}

const bytesFuente = new Map();
/** Bytes de todas las fuentes, como las espera composeGame: { clave: { bytes, subset } }. */
export async function fuentesDelMotor() {
  const { FUENTES } = await cargarRegistro();
  const out = {};
  for (const [k, f] of Object.entries(FUENTES)) {
    if (!bytesFuente.has(k)) {
      const res = await fetch(f.file);
      if (!res.ok) throw new Error(`no se pudo leer la fuente ${k} (${res.status})`);
      bytesFuente.set(k, new Uint8Array(await res.arrayBuffer()));
    }
    out[k] = { bytes: bytesFuente.get(k), subset: f.subset };
  }
  return out;
}
