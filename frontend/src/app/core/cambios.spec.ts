import { comparar } from './binario';
import { clasificarZona, codigosNombre, identificar, otraEsOriginal, pistasNombre } from './cambios';
import { MapaCentralita } from './models';

/** Copia de a con los bytes indicados cambiados. */
function con(a: Uint8Array, cambios: Record<number, number[]>): Uint8Array {
  const b = a.slice();
  for (const [d, bytes] of Object.entries(cambios)) b.set(bytes, Number(d));
  return b;
}

const mapa = (p: Partial<MapaCentralita>): MapaCentralita => ({
  id: 1, nombre: 'Mapa', origen: 'Manual', grupo: null, direccion: 0, columnas: 4, filas: 1, tipoDato: 'U16', bigEndian: false, porColumnas: false,
  factor: 1, desplazamiento: 0, unidad: null, ejeXDireccion: null, ejeXTipo: 'U16', ejeXFactor: 1, ejeXUnidad: null, ejeYDireccion: null, ejeYTipo: 'U16',
  ejeYFactor: 1, ejeYUnidad: null, notas: null, ejeXDesplazamiento: 0, ejeXValores: null, ejeYDesplazamiento: 0, ejeYValores: null,
  descripcion: null, ejeXNombre: null, ejeYNombre: null, ...p
});

describe('identificación de cambios', () => {
  // Fondo con valores (ni 0 ni FF) para que las zonas cambiadas se distingan.
  const ori = new Uint8Array(4096).map((_, i) => 0x10 + (i % 0x60));

  it('clasifica las zonas como en las repros reales', () => {
    const r = (a: Uint8Array, b: Uint8Array) => clasificarZona(a, b, comparar(a, b).regiones[0], false).tipo;
    // Tabla de 16 bits a cero (EGR del Alfa).
    expect(r(ori, con(ori, { 100: Array(40).fill(0) }))).toBe('anulada');
    // Umbrales a FF (EGR del Insignia).
    expect(r(ori, con(ori, { 100: Array(12).fill(0xff) }))).toBe('maximo');
    // Clases de error (06, 13) a cero (DTC del DaVinci).
    const dtc = con(ori, { 200: [6, 6, 6, 6, 6, 0x13] });
    expect(r(dtc, con(dtc, { 200: [0, 6, 6, 6, 0, 0] }))).toBe('dtc');
    // Interruptor (02 00 FF FF → FF FF 00 00, P1270 del Jeep).
    const jeep = con(ori, { 300: [2, 0, 0xff, 0xff] });
    expect(r(jeep, con(jeep, { 300: [0xff, 0xff, 0, 0] }))).toBe('interruptor');
    // Cambio suelto con valores cualesquiera: checksum.
    expect(r(ori, con(ori, { 400: [0x9a, 0x3c] }))).toBe('control');
    // Valores que suben un 10 % (16 bits, little endian).
    const base = con(ori, { 500: [100, 0, 200, 0, 50, 1] });
    const sube = clasificarZona(base, con(base, { 500: [110, 0, 220, 0, 0x50, 1] }), comparar(base, con(base, { 500: [110, 0, 220, 0, 0x50, 1] })).regiones[0], false);
    expect(sube.tipo).toBe('subida');
    expect(sube.porcentaje).toBeCloseTo(10, 0);
  });

  it('saca pistas y códigos de avería del nombre del fichero', () => {
    expect(pistasNombre('st_DPF__EGR__TVA_.bin')).toEqual(['potencia', 'egr', 'dpf', 'tva']);
    expect(pistasNombre('adbluee (1).bin')).toEqual(['adblue']);
    expect(pistasNombre('peugeot_original')).toEqual([]);
    expect(codigosNombre('DaVinci __noCHK.BIN - DTC P4020 P4370 P3F65 P3FA5')).toEqual(['P4020', 'P4370', 'P3F65', 'P3FA5']);
    expect(codigosNombre('p1270(1).bin')).toEqual(['P1270']);
  });

  it('sabe cuál es la original por el nombre y, si no, por los bytes', () => {
    const mod = con(ori, { 100: Array(40).fill(0) });
    const reg = comparar(ori, mod).regiones;
    expect(otraEsOriginal(ori, mod, reg, 'peugeot_original', 'peugeot_dpfoff.bin')).toBe(false);
    expect(otraEsOriginal(mod, ori, reg, 'peugeot_dpfoff.bin', 'peugeot_original')).toBe(true);
    // Sin pistas en el nombre: la que tiene las tablas a cero es la modificada.
    expect(otraEsOriginal(mod, ori, reg, 'a.bin', 'b.bin')).toBe(true);
    expect(otraEsOriginal(ori, mod, reg, 'a.bin', 'b.bin')).toBe(false);
  });

  it('concluye potencia por los mapas con nombre y EGR por un mapa de EGR anulado', () => {
    const a = con(ori, { 0: [100, 0, 100, 0, 100, 0, 100, 0], 64: [50, 0, 60, 0, 70, 0, 80, 0] });
    const b = con(a, { 0: [110, 0, 110, 0, 110, 0, 110, 0], 64: [0, 0, 0, 0, 0, 0, 0, 0] });
    const mapas = [mapa({ id: 1, nombre: 'Par máximo', grupo: 'Par' }), mapa({ id: 2, nombre: 'Caudal EGR', grupo: 'Egr', direccion: 64 })];
    const r = identificar(a, b, comparar(a, b).regiones, mapas, 'mod.bin', 'ori.bin');
    expect(r.cambios.map(c => [c.mapa?.nombre, c.tipo])).toEqual([['Par máximo', 'subida'], ['Caudal EGR', 'anulada']]);
    const potencia = r.conclusiones.find(c => c.clave === 'potencia')!;
    expect(potencia.confianza).toBe('alta');
    expect(potencia.detalle).toContain('Par +10');
    expect(r.conclusiones.find(c => c.clave === 'egr')?.confianza).toBe('alta');
  });

  it('las pistas del nombre que ya tiene el original no cuentan', () => {
    const a = con(ori, { 200: [6, 6, 6] });
    const b = con(a, { 200: [0, 0, 0] });
    const r = identificar(a, b, comparar(a, b).regiones, [], 'blanca_TVA - DTC P3F35', 'blanca_TVA');
    expect(r.conclusiones.map(c => c.clave)).toEqual(['dtc']);
    expect(r.conclusiones[0].confianza).toBe('alta');
  });
});
