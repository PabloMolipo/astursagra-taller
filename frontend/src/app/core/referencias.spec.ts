import { comparar, leerNumero, rango } from './referencias';

describe('Valores de referencia', () => {
  it('lee números con coma o punto decimal', () => {
    expect(leerNumero('0,9')).toBe(0.9);
    expect(leerNumero('2.45')).toBe(2.45);
    expect(leerNumero('1.234,5 bar')).toBe(1234.5);
    expect(leerNumero('-3')).toBe(-3);
    expect(leerNumero('abc')).toBeNull();
    expect(leerNumero('')).toBeNull();
  });

  it('compara con rango cerrado', () => {
    const ref = { minimo: 230, maximo: 370 };
    expect(comparar(200, ref)).toBe('bajo');
    expect(comparar(230, ref)).toBe('correcto');
    expect(comparar(370, ref)).toBe('correcto');
    expect(comparar(400, ref)).toBe('alto');
    expect(comparar(null, ref)).toBeNull();
  });

  it('compara con un solo límite', () => {
    expect(comparar(9.2, { minimo: 9.6, maximo: null })).toBe('bajo');
    expect(comparar(80, { minimo: null, maximo: 50 })).toBe('alto');
    // Anticongelante: debe proteger al menos hasta -25 °C.
    expect(comparar(-30, { minimo: null, maximo: -25 })).toBe('correcto');
    expect(comparar(-15, { minimo: null, maximo: -25 })).toBe('alto');
  });

  it('formatea el rango', () => {
    expect(rango({ minimo: 2, maximo: 2.6, unidad: 'bar abs.' })).toBe('2 – 2,6 bar abs.');
    expect(rango({ minimo: 9.6, maximo: null, unidad: 'V' })).toBe('≥ 9,6 V');
    expect(rango({ minimo: null, maximo: 50, unidad: 'mA' })).toBe('≤ 50 mA');
  });
});
