import { comparar, filasHex, leerOffset, pareceModificado, pareceOriginal } from './binario';

describe('binario', () => {
  it('filas de 16 bytes con su offset', () => {
    const f = filasHex(new Uint8Array(40).map((_, i) => i), 0x100);
    expect(f.map(x => x.offset)).toEqual([0x100, 0x110, 0x120]);
    expect(f[2].bytes).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
  });

  it('offset en hexadecimal o decimal', () => {
    expect(leerOffset('1F400')).toBe(0x1f400);
    expect(leerOffset('0x10')).toBe(16);
    expect(leerOffset('128000d')).toBe(128000);
    expect(leerOffset('zz')).toBeNull();
  });

  it('agrupa los cambios cercanos en regiones', () => {
    const a = new Uint8Array(200);
    const b = a.slice();
    b[10] = 1; b[12] = 1; b[20] = 1; // una región (huecos < 16)
    b[100] = 9; // otra región
    const c = comparar(a, b);
    expect(c.cambiados).toBe(4);
    expect(c.regiones).toEqual([{ desde: 10, hasta: 21, cambiados: 3 }, { desde: 100, hasta: 101, cambiados: 1 }]);
  });

  it('archivos de distinto tamaño: lo que sobra cuenta como cambio', () => {
    const c = comparar(new Uint8Array(10), new Uint8Array(14));
    expect(c.cambiados).toBe(4);
    expect(c.regiones.at(-1)).toEqual({ desde: 10, hasta: 14, cambiados: 4 });
  });

  it('archivos iguales: sin regiones', () => {
    expect(comparar(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])).regiones).toEqual([]);
  });

  it('reconoce original y modificado por el nombre', () => {
    expect(pareceOriginal('EDC17C46 ori.bin')).toBe(true);
    expect(pareceOriginal('lectura_serie.bin')).toBe(true);
    expect(pareceOriginal('1234ABC.ori')).toBe(true);
    expect(pareceModificado('EDC17C46 stage1.bin')).toBe(true);
    expect(pareceModificado('golf_mod.bin')).toBe(true);
    expect(pareceOriginal('golf_mod.bin')).toBe(false);
    expect(pareceModificado('azul_ext_flash_off')).toBe(true);
    expect(pareceModificado('azul_ext_flash')).toBe(false);
  });
});
