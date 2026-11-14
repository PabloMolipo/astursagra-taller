import { leerMapa } from './mapas';
import { MapaCentralita } from './models';

/**
 * Reconocimiento automático de mapas: un modelo (bosque de árboles de decisión) entrenado con las parejas
 * original/modificado del taller sugiere para qué sirve cada mapa a partir de su forma (tamaño, ejes, valores).
 * Los rasgos se calculan aquí también al entrenar, para que entrenamiento y uso coincidan exactamente.
 */

type DefinicionMapa = Pick<MapaCentralita, 'direccion' | 'columnas' | 'filas' | 'tipoDato' | 'bigEndian' | 'porColumnas' | 'ejeXDireccion' | 'ejeXTipo' | 'ejeYDireccion' | 'ejeYTipo'>;

/**
 * Clases que distingue el modelo: «potencia», los mapas que suben las reprogramaciones de stage (par, turbo, inyección,
 * limitadores…), y «otro», los que no suelen tocar. EGR, DPF y AdBlue casi nunca son mapas con ejes (son interruptores y
 * tablas sueltas): esas anulaciones las identifica la comparación (cambios.ts).
 */
export type FuncionMapa = 'potencia' | 'otro';

export const NOMBRES_RASGOS = [
  'columnas', 'filas', 'log2Celdas', 'esCurva',
  'xMin', 'xMax', 'xCreciente', 'xPasoRel', 'yMin', 'yMax', 'yCreciente', 'yPasoRel',
  'vMin', 'vMax', 'vMedia', 'vDesv', 'vAspereza', 'vDistintos', 'vCeros', 'vConstante', 'vTendX', 'vTendY',
  'posicion', 'log2Archivo', 'bigEndian', 'conSigno'
] as const;

const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / (v.length || 1);

function desviacion(v: number[]): number {
  const m = media(v);
  return Math.sqrt(media(v.map(x => (x - m) ** 2)));
}

/** Rasgos de un eje: mínimo y máximo (escalados a 16 bits), fracción de pasos crecientes y paso medio relativo. */
function rasgosEje(eje: number[]): number[] {
  if (eje.length < 2) return [0, 0, 0, 0];
  const min = Math.min(...eje);
  const max = Math.max(...eje);
  let crecientes = 0;
  for (let i = 1; i < eje.length; i++) if (eje[i] > eje[i - 1]) crecientes++;
  return [min / 65535, max / 65535, crecientes / (eje.length - 1), max > min ? (max - min) / (eje.length - 1) / (Math.abs(max) + 1) : 0];
}

/** Correlación entre los valores y la posición (columna o fila): +1 si crecen a lo largo del eje, −1 si bajan. */
function tendencia(valores: number[][], porFila: boolean): number {
  const xs: number[] = [];
  const ys: number[] = [];
  valores.forEach((fila, f) => fila.forEach((v, c) => { xs.push(porFila ? f : c); ys.push(v); }));
  const mx = media(xs);
  const my = media(ys);
  let sxy = 0, sxx = 0, syy = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** Rasgos de un mapa a partir de sus valores en bruto (sin factor), para que no dependan de cómo se haya convertido. */
export function rasgosMapa(datos: DataView, m: DefinicionMapa): number[] {
  const bruto = leerMapa(datos, {
    ...m, factor: 1, desplazamiento: 0, unidad: null, ejeXFactor: 1, ejeXUnidad: null, ejeYFactor: 1, ejeYUnidad: null,
    ejeXDesplazamiento: 0, ejeXValores: null, ejeYDesplazamiento: 0, ejeYValores: null
  });
  const v = bruto.valores.flat().filter(x => !Number.isNaN(x));
  const rango = bruto.maximo - bruto.minimo;
  let saltos = 0, vecinos = 0;
  bruto.valores.forEach((fila, f) => fila.forEach((x, c) => {
    if (c > 0) { saltos += Math.abs(x - fila[c - 1]); vecinos++; }
    if (f > 0) { saltos += Math.abs(x - bruto.valores[f - 1][c]); vecinos++; }
  }));
  const celdas = m.columnas * m.filas;
  return [
    m.columnas, m.filas, Math.log2(celdas), m.filas === 1 ? 1 : 0,
    ...rasgosEje(m.ejeXDireccion !== null ? bruto.ejeX : []),
    ...rasgosEje(m.filas > 1 && m.ejeYDireccion !== null ? bruto.ejeY : []),
    bruto.minimo / 65535, bruto.maximo / 65535, media(v) / 65535, desviacion(v) / 65535,
    rango > 0 && vecinos ? saltos / vecinos / rango : 0,
    new Set(v).size / (v.length || 1), v.filter(x => x === 0).length / (v.length || 1), rango === 0 ? 1 : 0,
    tendencia(bruto.valores, false), m.filas > 1 ? tendencia(bruto.valores, true) : 0,
    m.direccion / datos.byteLength, Math.log2(datos.byteLength), m.bigEndian ? 1 : 0, m.tipoDato.startsWith('I') ? 1 : 0
  ];
}

/** Bosque exportado desde scikit-learn: por árbol, nodos con [rasgo, umbral, hijo izquierdo, hijo derecho] y hojas con probabilidades. */
export interface ModeloMapas {
  version: string;
  clases: FuncionMapa[];
  rasgos: string[];
  /** Por árbol: rasgo (−1 en las hojas), umbral, izquierdo, derecho, y probabilidad de cada clase en las hojas. */
  arboles: { f: number[]; t: number[]; i: number[]; d: number[]; p: number[][] }[];
}

export interface Sugerencia {
  funcion: FuncionMapa;
  /** Probabilidad de la función sugerida (0–1). */
  probabilidad: number;
}

/** Media de las probabilidades de todos los árboles (como predict_proba de scikit-learn). */
export function predecir(modelo: ModeloMapas, rasgos: number[]): Record<FuncionMapa, number> {
  const suma = modelo.clases.map(() => 0);
  for (const a of modelo.arboles) {
    let n = 0;
    // scikit-learn compara los rasgos en 32 bits: fround para decidir igual en los valores que caen justo en el umbral.
    while (a.f[n] >= 0) n = Math.fround(rasgos[a.f[n]]) <= a.t[n] ? a.i[n] : a.d[n];
    a.p[n].forEach((p, k) => (suma[k] += p));
  }
  return Object.fromEntries(modelo.clases.map((c, k) => [c, suma[k] / modelo.arboles.length])) as Record<FuncionMapa, number>;
}

/** Función más probable de un mapa, o null si es «otro» o el modelo no está seguro (por debajo de minimo). */
export function sugerir(modelo: ModeloMapas, datos: DataView, m: DefinicionMapa, minimo = 0.6): Sugerencia | null {
  const p = predecir(modelo, rasgosMapa(datos, m));
  const [funcion, probabilidad] = (Object.entries(p) as [FuncionMapa, number][]).sort((x, y) => y[1] - x[1])[0];
  return funcion === 'otro' || probabilidad < minimo ? null : { funcion, probabilidad };
}
