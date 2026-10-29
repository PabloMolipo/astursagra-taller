import { ValorReferencia } from './models';

export type Comparacion = 'bajo' | 'correcto' | 'alto';

/** "0,9" / "0.9" / " 1.234,5 bar" → número; null si no es un número. */
export function leerNumero(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') {
    return Number.isFinite(texto) ? texto : null;
  }
  const limpio = (texto ?? '').trim().match(/^-?[\d.,]+/)?.[0];
  if (!limpio) {
    return null;
  }
  // Si lleva coma, la coma es el decimal y los puntos son miles (formato español).
  const normal = limpio.includes(',') ? limpio.replace(/\./g, '').replace(',', '.') : limpio;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Compara una lectura con el rango de referencia (cualquiera de los dos límites puede faltar). */
export function comparar(valor: number | null, ref: Pick<ValorReferencia, 'minimo' | 'maximo'>): Comparacion | null {
  if (valor === null) {
    return null;
  }
  if (ref.minimo !== null && valor < ref.minimo) {
    return 'bajo';
  }
  if (ref.maximo !== null && valor > ref.maximo) {
    return 'alto';
  }
  return 'correcto';
}

function numero(n: number): string {
  return n.toLocaleString('es-ES', { maximumFractionDigits: 3 });
}

/** "230 – 370 mg/carrera", "≥ 9,6 V", "≤ 50 mA" */
export function rango(ref: Pick<ValorReferencia, 'minimo' | 'maximo' | 'unidad'>): string {
  const { minimo: min, maximo: max, unidad } = ref;
  if (min !== null && max !== null) {
    return `${numero(min)} – ${numero(max)} ${unidad}`;
  }
  if (min !== null) {
    return `≥ ${numero(min)} ${unidad}`;
  }
  return max !== null ? `≤ ${numero(max)} ${unidad}` : unidad;
}

export const TEXTO_COMPARACION: Record<Comparacion, string> = {
  bajo: '↓ Bajo',
  correcto: '✓ Correcto',
  alto: '↑ Alto'
};
