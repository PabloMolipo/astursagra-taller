import { GrupoMapa, MapaCentralita, TipoDatoMapa } from './models';

/** Utilidades para leer los mapas de un binario de centralita (valores físicos = bruto × factor + desplazamiento). */

export const TIPOS_DATO: { valor: TipoDatoMapa; etiqueta: string }[] = [
  { valor: 'U8', etiqueta: '8 bits sin signo' },
  { valor: 'I8', etiqueta: '8 bits con signo' },
  { valor: 'U16', etiqueta: '16 bits sin signo' },
  { valor: 'I16', etiqueta: '16 bits con signo' },
  { valor: 'U32', etiqueta: '32 bits sin signo' },
  { valor: 'I32', etiqueta: '32 bits con signo' },
  { valor: 'F32', etiqueta: '32 bits coma flotante' }
];

export function tamanoDato(tipo: TipoDatoMapa): number {
  return tipo === 'U8' || tipo === 'I8' ? 1 : tipo === 'U16' || tipo === 'I16' ? 2 : 4;
}

/** Valor en bruto en una dirección; null si se sale del archivo. */
export function leerValor(datos: DataView, direccion: number, tipo: TipoDatoMapa, bigEndian: boolean): number | null {
  if (direccion < 0 || direccion + tamanoDato(tipo) > datos.byteLength) return null;
  const le = !bigEndian;
  switch (tipo) {
    case 'U8': return datos.getUint8(direccion);
    case 'I8': return datos.getInt8(direccion);
    case 'U16': return datos.getUint16(direccion, le);
    case 'I16': return datos.getInt16(direccion, le);
    case 'U32': return datos.getUint32(direccion, le);
    case 'I32': return datos.getInt32(direccion, le);
    case 'F32': return datos.getFloat32(direccion, le);
  }
}

export interface MapaLeido {
  /** Valores del eje X (columnas). */
  ejeX: number[];
  /** Valores del eje Y (filas); [0] en las curvas. */
  ejeY: number[];
  /** valores[fila][columna], ya convertidos. */
  valores: number[][];
  minimo: number;
  maximo: number;
}

/** Lee un eje: con dirección, sus valores × factor + desplazamiento; sin ella, sus valores fijos o 0, 1, 2… */
function leerEje(datos: DataView, direccion: number | null, n: number, tipo: TipoDatoMapa, bigEndian: boolean, factor: number, desplazamiento: number, valores: string | null): number[] {
  const fijos = valores?.split(';').map(v => Number(v.trim().replace(',', '.')));
  return Array.from({ length: n }, (_, i) =>
    direccion !== null
      ? (leerValor(datos, direccion + i * tamanoDato(tipo), tipo, bigEndian) ?? NaN) * factor + desplazamiento
      : fijos && fijos.length === n ? fijos[i] : i
  );
}

export function leerMapa(datos: DataView, m: Omit<MapaCentralita, 'id' | 'nombre' | 'origen' | 'grupo' | 'notas'>): MapaLeido {
  const t = tamanoDato(m.tipoDato);
  const valores: number[][] = [];
  let minimo = Infinity;
  let maximo = -Infinity;
  for (let f = 0; f < m.filas; f++) {
    const fila: number[] = [];
    for (let c = 0; c < m.columnas; c++) {
      const celda = m.porColumnas && m.filas > 1 ? c * m.filas + f : f * m.columnas + c;
      const bruto = leerValor(datos, m.direccion + celda * t, m.tipoDato, m.bigEndian);
      const v = bruto === null ? NaN : bruto * m.factor + m.desplazamiento;
      fila.push(v);
      if (!Number.isNaN(v)) {
        minimo = Math.min(minimo, v);
        maximo = Math.max(maximo, v);
      }
    }
    valores.push(fila);
  }
  return {
    ejeX: leerEje(datos, m.ejeXDireccion, m.columnas, m.ejeXTipo, m.bigEndian, m.ejeXFactor, m.ejeXDesplazamiento ?? 0, m.ejeXValores),
    ejeY: m.filas > 1 ? leerEje(datos, m.ejeYDireccion, m.filas, m.ejeYTipo, m.bigEndian, m.ejeYFactor, m.ejeYDesplazamiento ?? 0, m.ejeYValores) : [0],
    valores,
    minimo: minimo === Infinity ? 0 : minimo,
    maximo: maximo === -Infinity ? 0 : maximo
  };
}

/** Número con los decimales justos (los factores suelen dar 0,0234375…): hasta 3 decimales, sin ceros sobrantes. */
export function formatoValor(v: number): string {
  if (Number.isNaN(v)) return '—';
  return Number.isInteger(v) ? String(v) : v.toLocaleString('es-ES', { maximumFractionDigits: Math.abs(v) >= 100 ? 1 : 3 });
}

/**
 * Color de fondo de una celda según su posición en el rango (azul → verde → amarillo → rojo, como los editores de
 * mapas), semitransparente para que el texto se lea en tema claro y oscuro.
 */
export function colorCelda(v: number, minimo: number, maximo: number): string {
  if (Number.isNaN(v) || maximo === minimo) return 'transparent';
  const t = (v - minimo) / (maximo - minimo);
  const tono = 240 - 240 * t;
  return `hsla(${Math.round(tono)}, 85%, 50%, 0.45)`;
}

export interface NombreHabitual {
  nombre: string;
  /** Unidad física habitual (el factor depende de la centralita y no se propone). */
  unidad?: string;
  ejeX?: string;
  ejeY?: string;
}

/**
 * Grupos de mapas de una reprogramación con sus nombres habituales (diésel common rail y gasolina), para clasificarlos
 * y nombrarlos rápido. Son sugerencias: el nombre es libre.
 */
export const GRUPOS: { valor: GrupoMapa; etiqueta: string; color: string; nombres: NombreHabitual[] }[] = [
  {
    valor: 'Inyeccion', etiqueta: 'Inyección', color: '#3b82f6', nombres: [
      { nombre: 'Cantidad de inyección por par (conversor par → IQ)', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'Nm' },
      { nombre: 'Limitador de humo (aire)', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'mg/carrera aire' },
      { nombre: 'Limitador de humo (presión turbo)', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'hPa' },
      { nombre: 'Limitador de inyección', unidad: 'mg/carrera', ejeX: 'rpm' },
      { nombre: 'Duración de inyección', unidad: '°', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Avance de inyección principal (SOI)', unidad: '°', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Inyección piloto', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Inyección de arranque', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: '°C' }
    ]
  },
  {
    valor: 'Turbo', etiqueta: 'Turbo', color: '#f59e0b', nombres: [
      { nombre: 'Presión de turbo objetivo', unidad: 'hPa', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Limitador de presión de turbo', unidad: 'hPa', ejeX: 'rpm', ejeY: 'hPa atm.' },
      { nombre: 'Límite máximo de turbo (SVBL)', unidad: 'hPa' },
      { nombre: 'Control del actuador / geometría variable (N75)', unidad: '%', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Corrección de turbo por altitud', unidad: 'hPa', ejeX: 'rpm', ejeY: 'hPa atm.' },
      { nombre: 'Corrección de turbo por temperatura', unidad: 'hPa', ejeX: 'rpm', ejeY: '°C' }
    ]
  },
  {
    valor: 'Rail', etiqueta: 'Rail', color: '#06b6d4', nombres: [
      { nombre: 'Presión de rail objetivo', unidad: 'bar', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Limitador de presión de rail', unidad: 'bar', ejeX: 'rpm' },
      { nombre: 'Control de la válvula reguladora (MPROP)', unidad: '%' }
    ]
  },
  {
    valor: 'Par', etiqueta: 'Par', color: '#8b5cf6', nombres: [
      { nombre: 'Limitador de par', unidad: 'Nm', ejeX: 'rpm', ejeY: 'hPa atm.' },
      { nombre: 'Petición de par del conductor (pedal)', unidad: 'Nm', ejeX: 'rpm', ejeY: '%' },
      { nombre: 'Limitador de par por marcha', unidad: 'Nm', ejeX: 'rpm', ejeY: 'marcha' },
      { nombre: 'Par máximo del cambio', unidad: 'Nm', ejeX: 'rpm' },
      { nombre: 'Conversor IQ → par', unidad: 'Nm', ejeX: 'rpm', ejeY: 'mg/carrera' }
    ]
  },
  {
    valor: 'Limitadores', etiqueta: 'Limitadores', color: '#ef4444', nombres: [
      { nombre: 'Limitador de revoluciones', unidad: 'rpm' },
      { nombre: 'Limitador de velocidad', unidad: 'km/h' },
      { nombre: 'Limitador de potencia', unidad: 'kW' },
      { nombre: 'Protección por temperatura (derating)', unidad: '%', ejeX: 'rpm', ejeY: '°C' }
    ]
  },
  {
    valor: 'Avance', etiqueta: 'Avance (gasolina)', color: '#ec4899', nombres: [
      { nombre: 'Avance de encendido', unidad: '°', ejeX: 'rpm', ejeY: 'carga %' },
      { nombre: 'Avance óptimo', unidad: '°', ejeX: 'rpm', ejeY: 'carga %' },
      { nombre: 'Corrección de avance por picado', unidad: '°', ejeX: 'rpm', ejeY: 'carga %' },
      { nombre: 'Carga objetivo', unidad: '%', ejeX: 'rpm', ejeY: '% pedal' },
      { nombre: 'Apertura de mariposa', unidad: '%', ejeX: 'rpm', ejeY: '% pedal' }
    ]
  },
  {
    valor: 'Egr', etiqueta: 'EGR', color: '#64748b', nombres: [
      { nombre: 'Caudal de aire objetivo (EGR)', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Activación de la EGR', ejeX: 'rpm', ejeY: 'mg/carrera' },
      { nombre: 'Corrección EGR por temperatura', ejeX: 'rpm', ejeY: '°C' }
    ]
  },
  {
    valor: 'Dpf', etiqueta: 'DPF', color: '#78716c', nombres: [
      { nombre: 'Umbral de carga de hollín para regenerar', unidad: 'g' },
      { nombre: 'Contrapresión del DPF', unidad: 'hPa', ejeX: 'caudal' },
      { nombre: 'Postinyección de regeneración', unidad: 'mg/carrera', ejeX: 'rpm', ejeY: 'mg/carrera' }
    ]
  },
  {
    valor: 'Lambda', etiqueta: 'Lambda / mezcla', color: '#22c55e', nombres: [
      { nombre: 'Lambda objetivo', unidad: 'λ', ejeX: 'rpm', ejeY: 'carga %' },
      { nombre: 'Enriquecimiento a plena carga', unidad: 'λ', ejeX: 'rpm' },
      { nombre: 'Protección de componentes (enriquecimiento)', unidad: 'λ', ejeX: 'rpm', ejeY: '°C' }
    ]
  },
  { valor: 'Otros', etiqueta: 'Otros', color: '#a3a3a3', nombres: [] }
];

export const grupo = (g: GrupoMapa | null) => GRUPOS.find(x => x.valor === g) ?? null;

export interface CambioMapa {
  /** Celdas con valor distinto entre las dos lecturas. */
  celdas: number;
  total: number;
  /** Cambio medio de las celdas cambiadas, en % sobre el original (con signo: + sube, − baja). */
  porcentaje: number;
}

/** Qué ha cambiado en un mapa entre dos lecturas del mismo software (original y modificada); null si nada. */
export function cambioMapa(a: DataView, b: DataView, m: Omit<MapaCentralita, 'id' | 'nombre' | 'origen' | 'grupo' | 'notas'>): CambioMapa | null {
  const va = leerMapa(a, m).valores.flat();
  const vb = leerMapa(b, m).valores.flat();
  let celdas = 0;
  let suma = 0;
  let conBase = 0;
  va.forEach((x, i) => {
    const y = vb[i];
    if (Number.isNaN(x) || Number.isNaN(y) || x === y) return;
    celdas++;
    if (x !== 0) {
      suma += (y - x) / Math.abs(x);
      conBase++;
    }
  });
  return celdas ? { celdas, total: va.length, porcentaje: conBase ? (suma / conBase) * 100 : 0 } : null;
}

/** Bytes que ocupa un mapa en el binario: valores y ejes, como [desde, hasta) (el hasta, excluido). */
export function zonasMapa(m: Omit<MapaCentralita, 'id' | 'nombre' | 'origen' | 'grupo' | 'notas'>): [number, number][] {
  const zonas: [number, number][] = [[m.direccion, m.direccion + m.columnas * m.filas * tamanoDato(m.tipoDato)]];
  if (m.ejeXDireccion !== null) zonas.push([m.ejeXDireccion, m.ejeXDireccion + m.columnas * tamanoDato(m.ejeXTipo)]);
  if (m.filas > 1 && m.ejeYDireccion !== null) zonas.push([m.ejeYDireccion, m.ejeYDireccion + m.filas * tamanoDato(m.ejeYTipo)]);
  return zonas;
}

/** Zonas cambiadas que no tocan ningún mapa conocido (p. ej. anulaciones de EGR/DPF o códigos de avería). */
export function zonasSinMapa<T extends { desde: number; hasta: number }>(regiones: T[], mapas: Omit<MapaCentralita, 'id' | 'nombre' | 'origen' | 'grupo' | 'notas'>[]): T[] {
  const ocupadas = mapas.flatMap(zonasMapa).sort((x, y) => x[0] - y[0]);
  return regiones.filter(r => !ocupadas.some(([d, h]) => d < r.hasta && r.desde < h));
}
