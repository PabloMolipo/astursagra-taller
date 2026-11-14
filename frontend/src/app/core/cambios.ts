import { pareceModificado, pareceOriginal, RegionCambiada } from './binario';
import { cambioMapa, grupo, leerValor, tamanoDato, zonasMapa } from './mapas';
import { GrupoMapa, MapaCentralita } from './models';

/** Identificación automática de qué hace una reprogramación, comparando la lectura original con la modificada. */

export type TipoCambio = 'anulada' | 'maximo' | 'subida' | 'bajada' | 'dtc' | 'interruptor' | 'control' | 'otro';
export type Confianza = 'alta' | 'media' | 'baja';

export interface CambioIdentificado {
  tipo: TipoCambio;
  titulo: string;
  desde: number;
  /** Excluido. */
  hasta: number;
  cambiados: number;
  /** Mapa en el que está el cambio; null si está fuera de los mapas detectados. */
  mapa: MapaCentralita | null;
  /** Cambio medio en % sobre el original (subidas y bajadas). */
  porcentaje: number | null;
}

export interface Conclusion {
  clave: string;
  titulo: string;
  detalle: string;
  confianza: Confianza;
}

export interface Identificacion {
  /** true si la original es la otra lectura (esta es la modificada). */
  invertida: boolean;
  conclusiones: Conclusion[];
  cambios: CambioIdentificado[];
}

export const ETIQUETAS_CAMBIO: Record<TipoCambio, string> = {
  anulada: 'Puesto a 0',
  maximo: 'Al máximo',
  subida: 'Sube',
  bajada: 'Baja',
  dtc: 'Código de avería',
  interruptor: 'Interruptor',
  control: 'Control / checksum',
  otro: 'Modificado'
};

/** Pistas del nombre del fichero modificado (los programas de repro suelen ponerlas). */
const PISTAS: { clave: string; patron: RegExp; titulo: string; grupo?: GrupoMapa }[] = [
  { clave: 'potencia', patron: /stage|(^|[^a-z])st ?[123]?([^a-z]|$)|tun(ed|ing)|power|chip/i, titulo: 'Aumento de potencia (stage)' },
  { clave: 'egr', patron: /egr/i, titulo: 'EGR anulada', grupo: 'Egr' },
  { clave: 'dpf', patron: /dpf|fap|[go]pf([^a-z]|$)/i, titulo: 'Filtro de partículas (DPF/FAP) anulado', grupo: 'Dpf' },
  { clave: 'adblue', patron: /ad ?blue|(^|[^a-z])(scr|def)([^a-z]|$)/i, titulo: 'AdBlue / SCR anulado' },
  { clave: 'flaps', patron: /flap|swirl|drall/i, titulo: 'Flaps de admisión (swirl) anulados' },
  { clave: 'tva', patron: /(^|[^a-z])tva([^a-z]|$)/i, titulo: 'Mariposa de admisión (TVA) anulada' },
  { clave: 'lambda', patron: /lambda|(^|[^a-z])o2([^a-z]|$)/i, titulo: 'Sonda lambda anulada', grupo: 'Lambda' },
  { clave: 'cat', patron: /cat ?off|kat/i, titulo: 'Catalizador anulado' },
  { clave: 'startstop', patron: /start.?stop/i, titulo: 'Start-Stop desactivado' },
  { clave: 'vmax', patron: /v ?max/i, titulo: 'Limitador de velocidad (Vmax) modificado', grupo: 'Limitadores' },
  { clave: 'immo', patron: /immo/i, titulo: 'Inmovilizador desactivado' },
  { clave: 'dtc', patron: /dtc|(^|[^a-z0-9])[pcbu][0-9][0-9a-f]{3}([^0-9a-z]|$)/i, titulo: 'Códigos de avería desactivados' }
];

/** Grupos de mapas cuya subida indica más potencia. */
const GRUPOS_POTENCIA: GrupoMapa[] = ['Par', 'Turbo', 'Inyeccion', 'Rail', 'Limitadores', 'Avance'];

/** Pistas que aparecen en el nombre de un fichero. */
export function pistasNombre(nombre: string): string[] {
  return PISTAS.filter(p => p.patron.test(nombre)).map(p => p.clave);
}

/** Códigos de avería (P0123…) citados en el nombre del fichero. */
export function codigosNombre(nombre: string): string[] {
  return [...new Set([...nombre.matchAll(/(?:^|[^a-z0-9])([pcbu][0-9][0-9a-f]{3})(?=[^0-9a-z]|$)/gi)].map(m => m[1].toUpperCase()))];
}

/** Cuánto «parece modificado» un nombre: pistas de repro menos marcas de original. */
function puntosModificado(nombre: string): number {
  return pistasNombre(nombre).length + (pareceModificado(nombre) ? 1 : 0) - (pareceOriginal(nombre) ? 2 : 0);
}

/**
 * ¿Es la otra lectura la original? Primero por el nombre; si no lo aclara, por los bytes:
 * las reprogramaciones ponen tablas a 0 o a FF, casi nunca al revés.
 */
export function otraEsOriginal(a: Uint8Array, b: Uint8Array, regiones: RegionCambiada[], nombreEsta: string, nombreOtra: string): boolean {
  const pa = puntosModificado(nombreEsta);
  const pb = puntosModificado(nombreOtra);
  if (pa !== pb) return pa > pb;
  let haciaB = 0;
  let haciaA = 0;
  for (const r of regiones) {
    for (let i = r.desde; i < r.hasta && i < a.length && i < b.length; i++) {
      if (a[i] === b[i]) continue;
      if (b[i] === 0 || b[i] === 0xff) haciaB++;
      if (a[i] === 0 || a[i] === 0xff) haciaA++;
    }
  }
  return haciaA > haciaB * 2 && haciaA > 16;
}

const MAXIMOS: Record<string, number[]> = { U8: [0xff], I8: [0x7f], U16: [0xffff], I16: [0x7fff, -1], U32: [0xffffffff], I32: [0x7fffffff, -1], F32: [] };

/** Cómo ha cambiado un mapa: anulado (todo a 0), al máximo, sube o baja. */
function clasificarMapa(a: DataView, b: DataView, m: MapaCentralita): CambioIdentificado | null {
  const k = cambioMapa(a, b, m);
  if (!k) return null;
  const t = tamanoDato(m.tipoDato);
  const n = m.columnas * m.filas;
  let ceros = 0;
  let maximos = 0;
  let cerosOri = 0;
  for (let i = 0; i < n; i++) {
    const d = m.direccion + i * t;
    const vb = leerValor(b, d, m.tipoDato, m.bigEndian);
    if (vb === 0) ceros++;
    if (vb !== null && MAXIMOS[m.tipoDato].includes(vb)) maximos++;
    if (leerValor(a, d, m.tipoDato, m.bigEndian) === 0) cerosOri++;
  }
  const [desde, hasta] = zonasMapa(m)[0];
  const base = { desde, hasta, cambiados: k.celdas, mapa: m, porcentaje: k.porcentaje };
  if (ceros === n && cerosOri < n) return { ...base, tipo: 'anulada', titulo: 'Mapa anulado: todos sus valores a 0', porcentaje: null };
  if (maximos === n) return { ...base, tipo: 'maximo', titulo: 'Mapa al máximo: deja de limitar', porcentaje: null };
  if (k.porcentaje > 0.5) return { ...base, tipo: 'subida', titulo: `Valores +${pct(k.porcentaje)}` };
  if (k.porcentaje < -0.5) return { ...base, tipo: 'bajada', titulo: `Valores −${pct(-k.porcentaje)}` };
  return { ...base, tipo: 'otro', titulo: `${k.celdas} de ${k.total} celdas retocadas` };
}

/** Cómo ha cambiado una zona fuera de los mapas, mirando solo los bytes. */
export function clasificarZona(a: Uint8Array, b: Uint8Array, r: RegionCambiada, bigEndian: boolean): CambioIdentificado {
  const posiciones: number[] = [];
  for (let i = r.desde; i < r.hasta; i++) if (a[i] !== b[i]) posiciones.push(i);
  const viejos = posiciones.map(i => a[i]);
  const nuevos = posiciones.map(i => b[i]);
  const ancho = r.hasta - r.desde;
  const base = { desde: r.desde, hasta: r.hasta, cambiados: r.cambiados, mapa: null, porcentaje: null };

  if (nuevos.every(v => v === 0)) {
    // Bytes pequeños (clases o niveles de error) puestos a 0: así se desactivan los códigos de avería en Bosch.
    if (viejos.every(v => v > 0 && v <= 0x20) && ancho <= 64) {
      return { ...base, tipo: 'dtc', titulo: 'Clases de error a 0: códigos de avería desactivados (probable)' };
    }
    return { ...base, tipo: 'anulada', titulo: ancho <= 2 ? 'Valor puesto a 0' : 'Tabla puesta a 0' };
  }
  if (nuevos.every(v => v === 0xff)) {
    return { ...base, tipo: 'maximo', titulo: 'Valores a FF: umbral al máximo o vigilancia anulada' };
  }
  if (ancho <= 4) {
    const pequenos = (v: number) => v <= 3 || v === 0xff;
    return viejos.every(pequenos) && nuevos.every(pequenos)
      ? { ...base, tipo: 'interruptor', titulo: 'Interruptor: activa o desactiva una función' }
      : { ...base, tipo: 'control', titulo: 'Byte de control o checksum (probable)' };
  }

  // Como valores de 16 bits: cambio medio de los que cambian.
  const inicio = r.desde - (r.desde % 2);
  let suma = 0;
  let n = 0;
  let suben = 0;
  let bajan = 0;
  for (let i = inicio; i + 1 < r.hasta + 1 && i + 1 < a.length; i += 2) {
    const va = bigEndian ? (a[i] << 8) | a[i + 1] : a[i] | (a[i + 1] << 8);
    const vb = bigEndian ? (b[i] << 8) | b[i + 1] : b[i] | (b[i + 1] << 8);
    if (va === vb) continue;
    if (vb > va) suben++;
    else bajan++;
    if (va !== 0) {
      suma += (vb - va) / va;
      n++;
    }
  }
  const p = n ? (suma / n) * 100 : 0;
  if (suben && !bajan && p > 0.5) return { ...base, tipo: 'subida', titulo: `Valores +${pct(p)}`, porcentaje: p };
  if (bajan && !suben && p < -0.5) return { ...base, tipo: 'bajada', titulo: `Valores −${pct(-p)}`, porcentaje: p };
  return { ...base, tipo: 'otro', titulo: 'Datos modificados' };
}

const pct = (p: number) => `${p.toLocaleString('es-ES', { maximumFractionDigits: p < 10 ? 1 : 0 })} %`;
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString('es-ES')} ${n === 1 ? uno : varios}`;

/**
 * Identifica los cambios entre la lectura original (a) y la modificada (b): qué hace cada zona cambiada
 * y, juntando todo (mapas con nombre, tipos de cambio y pistas del nombre del fichero), qué hace la reprogramación.
 */
export function identificar(
  a: Uint8Array,
  b: Uint8Array,
  regiones: RegionCambiada[],
  mapas: MapaCentralita[],
  nombreModificada: string,
  nombreOriginal = ''
): Omit<Identificacion, 'invertida'> {
  const va = new DataView(a.buffer, a.byteOffset, a.byteLength);
  const vb = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const cambios: CambioIdentificado[] = [];
  const ocupadas: [number, number][] = [];

  for (const m of mapas) {
    const c = clasificarMapa(va, vb, m);
    if (c) cambios.push(c);
    ocupadas.push(...zonasMapa(m));
  }
  const bigEndian = mapas.filter(m => m.bigEndian).length > mapas.length / 2;
  for (const r of regiones) {
    if (r.hasta > Math.min(a.length, b.length)) continue;
    if (ocupadas.some(([d, h]) => d < r.hasta && r.desde < h)) continue;
    cambios.push(clasificarZona(a, b, r, bigEndian));
  }
  cambios.sort((x, y) => x.desde - y.desde);
  return { cambios, conclusiones: concluir(cambios, nombreModificada, nombreOriginal) };
}

function concluir(cambios: CambioIdentificado[], nombre: string, nombreOriginal: string): Conclusion[] {
  const conclusiones: Conclusion[] = [];
  // Solo las pistas propias del modificado (si el original ya las tiene, son parte del nombre del vehículo o del programa).
  const deOriginal = new Set(pistasNombre(nombreOriginal));
  const pistas = new Set(pistasNombre(nombre).filter(p => !deOriginal.has(p)));
  const deGrupo = (g: GrupoMapa) => cambios.filter(c => c.mapa?.grupo === g);
  const cuenta = (t: TipoCambio) => cambios.filter(c => c.tipo === t).length;
  const usados = new Set<CambioIdentificado>();

  // Potencia: mapas de par, turbo, inyección… que suben.
  const potencia = cambios.filter(c => c.tipo === 'subida' && c.mapa?.grupo && GRUPOS_POTENCIA.includes(c.mapa.grupo));
  const subenSinNombre = cambios.filter(c => c.tipo === 'subida' && c.mapa && !c.mapa.grupo);
  if (potencia.length) {
    const porGrupo = GRUPOS_POTENCIA.map(g => ({ g, cs: potencia.filter(c => c.mapa!.grupo === g) }))
      .filter(x => x.cs.length)
      .map(x => `${grupo(x.g)!.etiqueta} +${pct(x.cs.reduce((s, c) => s + c.porcentaje!, 0) / x.cs.length)}`);
    potencia.forEach(c => usados.add(c));
    conclusiones.push({ clave: 'potencia', titulo: 'Aumento de potencia', detalle: `${porGrupo.join(' · ')} (${plural(potencia.length, 'mapa', 'mapas')} con nombre).`, confianza: 'alta' });
  } else if (subenSinNombre.length >= 3 || (subenSinNombre.length && pistas.has('potencia'))) {
    const media = subenSinNombre.reduce((s, c) => s + c.porcentaje!, 0) / subenSinNombre.length;
    subenSinNombre.forEach(c => usados.add(c));
    conclusiones.push({
      clave: 'potencia',
      titulo: pistas.has('potencia') ? 'Aumento de potencia' : 'Aumento de potencia (probable)',
      detalle: `${plural(subenSinNombre.length, 'mapa sin nombre sube', 'mapas sin nombre suben')} de media +${pct(media)}. Ponles nombre para saber cuáles son (par, turbo, inyección…).`,
      confianza: pistas.has('potencia') ? 'alta' : 'media'
    });
  } else if (pistas.has('potencia')) {
    conclusiones.push({ clave: 'potencia', titulo: 'Aumento de potencia (según el nombre del fichero)', detalle: 'No se ha visto ningún mapa detectado que suba.', confianza: 'baja' });
  }

  // Desactivaciones: tablas a 0 o a FF fuera de los mapas y mapas anulados; con los interruptores, son la prueba de una anulación.
  const desactivaciones = cambios.filter(c => c.tipo === 'anulada' || c.tipo === 'maximo');
  const pruebas = desactivaciones.length + cuenta('interruptor');
  const conGrupo = (g: GrupoMapa) => deGrupo(g).filter(c => c.tipo !== 'subida');

  for (const p of PISTAS) {
    if (p.clave === 'potencia' || p.clave === 'dtc') continue;
    const mapasGrupo = p.grupo ? conGrupo(p.grupo) : [];
    if (mapasGrupo.length) {
      mapasGrupo.forEach(c => usados.add(c));
      conclusiones.push({
        clave: p.clave,
        titulo: p.titulo,
        detalle: `${plural(mapasGrupo.length, 'mapa', 'mapas')} de ${grupo(p.grupo!)!.etiqueta} ${mapasGrupo.every(c => c.tipo === 'anulada') ? 'anulados' : 'modificados'}: ${mapasGrupo.map(c => c.mapa!.nombre).slice(0, 3).join(', ')}${mapasGrupo.length > 3 ? '…' : ''}.`,
        confianza: 'alta'
      });
    } else if (pistas.has(p.clave)) {
      conclusiones.push({
        clave: p.clave,
        titulo: p.titulo,
        detalle: pruebas
          ? 'Según el nombre del fichero; los cambios de abajo (tablas anuladas, interruptores) son los típicos de esta anulación.'
          : 'Solo según el nombre del fichero: no se ha visto ninguna tabla anulada ni interruptor cambiado.',
        confianza: pruebas ? 'media' : 'baja'
      });
    }
  }

  const sinExplicar = desactivaciones.filter(c => !usados.has(c));
  if (sinExplicar.length) {
    const ceros = sinExplicar.filter(c => c.tipo === 'anulada').length;
    const maximos = sinExplicar.length - ceros;
    const partes = [ceros ? plural(ceros, 'tabla o valor puesto a 0', 'tablas o valores puestos a 0') : '', maximos ? plural(maximos, 'llevado al máximo', 'llevados al máximo') : ''].filter(Boolean);
    const yaDicho = conclusiones.some(c => c.clave !== 'potencia');
    conclusiones.push({
      clave: 'desactivaciones',
      titulo: yaDicho ? 'Tablas anuladas' : 'Funciones desactivadas',
      detalle: `${partes.join(' y ')}${yaDicho ? '.' : ': lo típico al anular EGR, DPF, AdBlue, flaps o vigilancias. Ponles nombre para saber cuál es cuál.'}`,
      confianza: 'media'
    });
  }

  // Códigos de avería.
  const dtc = cuenta('dtc');
  const codigos = codigosNombre(nombre).filter(c => !codigosNombre(nombreOriginal).includes(c));
  if (dtc || pistas.has('dtc')) {
    const partes = [dtc ? `${plural(dtc, 'zona', 'zonas')} con clases de error puestas a 0` : '', codigos.length ? `el nombre del fichero cita ${codigos.join(', ')}` : ''].filter(Boolean);
    conclusiones.push({
      clave: 'dtc',
      titulo: 'Códigos de avería desactivados',
      detalle: `${partes.join('; ') || 'Según el nombre del fichero'}.`,
      confianza: dtc && pistas.has('dtc') ? 'alta' : dtc || cuenta('interruptor') + cuenta('control') ? 'media' : 'baja'
    });
  }

  const interruptores = cuenta('interruptor');
  if (interruptores) {
    conclusiones.push({ clave: 'interruptores', titulo: 'Interruptores cambiados', detalle: `${plural(interruptores, 'byte de activación cambiado', 'bytes de activación cambiados')} (activan o desactivan funciones).`, confianza: 'media' });
  }
  const control = cuenta('control');
  if (control) {
    conclusiones.push({ clave: 'control', titulo: 'Checksums o bytes de control', detalle: `${plural(control, 'cambio suelto', 'cambios sueltos')} de 1 a 4 bytes: suelen ser checksums corregidos por el programa de repro.`, confianza: 'baja' });
  }
  return conclusiones;
}
