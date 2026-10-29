import { codigoDeBytes, decodificarDtc, decodificarVin } from './obd';

describe('Decodificación OBD', () => {
  it('convierte dos bytes en código', () => {
    expect(codigoDeBytes(0x04, 0x01)).toBe('P0401');
    expect(codigoDeBytes(0x24, 0x63)).toBe('P2463');
    expect(codigoDeBytes(0x42, 0x2f)).toBe('C022F');
    expect(codigoDeBytes(0xc1, 0x00)).toBe('U0100');
    expect(codigoDeBytes(0x91, 0x23)).toBe('B1123');
  });

  it('modo 03 en CAN con una centralita', () => {
    expect(decodificarDtc(['430204010299'], 0x43, true)).toEqual(['P0401', 'P0299']);
  });

  it('modo 03 en CAN sin códigos', () => {
    expect(decodificarDtc(['4300'], 0x43, true)).toEqual([]);
    expect(decodificarDtc(['NO DATA'], 0x43, true)).toEqual([]);
  });

  it('modo 03 en CAN con varias centralitas y espacios', () => {
    expect(decodificarDtc(['43 01 01 71', '43 01 07 00'], 0x43, true)).toEqual(['P0171', 'P0700']);
  });

  it('modo 03 en CAN multitrama (más de 2 códigos)', () => {
    const lineas = ['00A', '0:43040401029901', '1:71C1000000'];
    expect(decodificarDtc(lineas, 0x43, true)).toEqual(['P0401', 'P0299', 'P0171', 'U0100']);
  });

  it('modo 03 en protocolos antiguos (3 códigos por línea, ceros de relleno)', () => {
    expect(decodificarDtc(['43 01 33 03 01 00 00'], 0x43, false)).toEqual(['P0133', 'P0301']);
  });

  it('ignora respuestas de otro servicio', () => {
    expect(decodificarDtc(['7F0312'], 0x43, true)).toEqual([]);
  });

  it('VIN en CAN multitrama', () => {
    const lineas = ['014', '0:490201575657', '1:5A5A5A314B5A41', '2:4D303132333435'];
    expect(decodificarVin(lineas, true)).toBe('WVWZZZ1KZAM012345');
  });

  it('VIN en protocolos antiguos', () => {
    const lineas = [
      '49 02 01 00 00 00 57', '49 02 02 56 57 5A 5A', '49 02 03 5A 31 4B 5A',
      '49 02 04 41 4D 30 31', '49 02 05 32 33 34 35'
    ];
    expect(decodificarVin(lineas, false)).toBe('WVWZZZ1KZAM012345');
  });
});
