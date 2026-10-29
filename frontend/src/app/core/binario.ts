/** Utilidades para ver y comparar archivos binarios de centralita (.bin, .ori, .mod…). */

export interface FilaHex {
  offset: number;
  bytes: number[];
}

export interface RegionCambiada {
  desde: number;
  /** Excluido. */
  hasta: number;
  /** Bytes realmente distintos dentro de la región. */
  cambiados: number;
}

export interface Comparacion {
  tamanoA: number;
  tamanoB: number;
  cambiados: number;
  regiones: RegionCambiada[];
}

export const BYTES_POR_FILA = 16;

export function filasHex(bytes: Uint8Array, offsetInicial: number): FilaHex[] {
  const filas: FilaHex[] = [];
  for (let i = 0; i < bytes.length; i += BYTES_POR_FILA) {
    filas.push({ offset: offsetInicial + i, bytes: Array.from(bytes.subarray(i, i + BYTES_POR_FILA)) });
  }
  return filas;
}

export const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');
export const hexOffset = (n: number) => n.toString(16).toUpperCase().padStart(8, '0');
export const ascii = (n: number) => (n >= 0x20 && n < 0x7f ? String.fromCharCode(n) : '·');

/** Offset escrito en hexadecimal ("1F400", "0x1F400") o decimal con "d" al final ("128000d"). */
export function leerOffset(texto: string): number | null {
  const t = texto.trim().toLowerCase();
  if (!t) return null;
  if (/^\d+d$/.test(t)) return parseInt(t.slice(0, -1), 10);
  const h = t.startsWith('0x') ? t.slice(2) : t;
  return /^[0-9a-f]+$/.test(h) ? parseInt(h, 16) : null;
}

/**
 * Compara dos archivos byte a byte. Los bytes distintos cercanos (separados por menos de <hueco> bytes iguales) se
 * agrupan en una región, como hacen los editores de mapas: así un mapa modificado sale como una sola zona.
 * Si los tamaños difieren, lo que sobra en el más largo cuenta como una región cambiada.
 */
export function comparar(a: Uint8Array, b: Uint8Array, hueco = 16): Comparacion {
  const comun = Math.min(a.length, b.length);
  const regiones: RegionCambiada[] = [];
  let cambiados = 0;
  let actual: RegionCambiada | null = null;
  for (let i = 0; i < comun; i++) {
    if (a[i] !== b[i]) {
      cambiados++;
      if (actual && i - actual.hasta < hueco) {
        actual.hasta = i + 1;
        actual.cambiados++;
      } else {
        actual = { desde: i, hasta: i + 1, cambiados: 1 };
        regiones.push(actual);
      }
    }
  }
  if (a.length !== b.length) {
    const extra = Math.abs(a.length - b.length);
    cambiados += extra;
    regiones.push({ desde: comun, hasta: comun + extra, cambiados: extra });
  }
  return { tamanoA: a.length, tamanoB: b.length, cambiados, regiones };
}

/** Por el nombre, ¿parece el archivo original (lectura de serie)? */
export function pareceOriginal(nombre: string): boolean {
  return /(^|[^a-z])(ori|orig|original|stock|serie|lectura|read|backup)([^a-z]|$)/i.test(nombre) || /\.ori$/i.test(nombre);
}

/** Por el nombre, ¿parece el archivo modificado? */
export function pareceModificado(nombre: string): boolean {
  return /(^|[^a-z])(mod|modif|modificado|stage ?\d|st\d|tuned|tuning|dpf ?off|egr ?off|off|adblue|repro|nochk|tva)([^a-z]|$)/i.test(nombre) || /\.mod$/i.test(nombre);
}

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
}
