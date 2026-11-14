import { cambioMapa, colorCelda, formatoValor, leerMapa, leerValor, zonasSinMapa } from './mapas';

/** Binario de prueba en 16 bits little endian. */
function binario(valores: number[]): DataView {
  const v = new DataView(new ArrayBuffer(valores.length * 2));
  valores.forEach((x, i) => v.setUint16(i * 2, x & 0xffff, true));
  return v;
}

const base = {
  tipoDato: 'U16' as const,
  bigEndian: false,
  porColumnas: false,
  factor: 1,
  desplazamiento: 0,
  unidad: null,
  ejeXTipo: 'U16' as const,
  ejeXFactor: 1,
  ejeXUnidad: null,
  ejeYTipo: 'U16' as const,
  ejeYFactor: 1,
  ejeYUnidad: null,
  ejeXDesplazamiento: 0,
  ejeXValores: null,
  ejeYDesplazamiento: 0,
  ejeYValores: null
};

describe('mapas de centralita', () => {
  it('lee valores con y sin signo, en los dos órdenes de bytes', () => {
    const v = new DataView(new Uint8Array([0x12, 0x34, 0xfe, 0xff]).buffer);
    expect(leerValor(v, 0, 'U16', false)).toBe(0x3412);
    expect(leerValor(v, 0, 'U16', true)).toBe(0x1234);
    expect(leerValor(v, 2, 'I16', false)).toBe(-2);
    expect(leerValor(v, 3, 'U16', false)).toBeNull();
  });

  it('lee un mapa por filas con sus ejes y aplica el factor', () => {
    // [eje X: 10 20 30][eje Y: 1 2][valores 2 filas × 3 columnas]
    const datos = binario([10, 20, 30, 1, 2, 100, 101, 102, 200, 201, 202]);
    const m = leerMapa(datos, { ...base, direccion: 10, columnas: 3, filas: 2, factor: 0.5, desplazamiento: 1, ejeXDireccion: 0, ejeYDireccion: 6 });
    expect(m.ejeX).toEqual([10, 20, 30]);
    expect(m.ejeY).toEqual([1, 2]);
    expect(m.valores).toEqual([[51, 51.5, 52], [101, 101.5, 102]]);
    expect([m.minimo, m.maximo]).toEqual([51, 102]);
  });

  it('lee un mapa guardado por columnas (cada X con todas sus Y)', () => {
    const datos = binario([100, 200, 101, 201, 102, 202]);
    const m = leerMapa(datos, { ...base, direccion: 0, columnas: 3, filas: 2, porColumnas: true, ejeXDireccion: null, ejeYDireccion: null });
    expect(m.valores).toEqual([[100, 101, 102], [200, 201, 202]]);
    expect(m.ejeX).toEqual([0, 1, 2]);
  });

  it('ejes con desplazamiento o con valores fijos (de un XDF)', () => {
    const datos = binario([40, 50, 60, 1, 2, 3, 4, 5, 6]);
    const m = leerMapa(datos, { ...base, direccion: 3, columnas: 3, filas: 2, ejeXDireccion: 0, ejeXFactor: 1.35, ejeXDesplazamiento: -40, ejeYDireccion: null, ejeYValores: '400;600' });
    expect(m.ejeX.map(x => Math.round(x * 100) / 100)).toEqual([14, 27.5, 41]);
    expect(m.ejeY).toEqual([400, 600]);
  });

  it('una curva tiene una sola fila; lo que se sale del archivo queda vacío', () => {
    const m = leerMapa(binario([5, 6]), { ...base, direccion: 0, columnas: 3, filas: 1, ejeXDireccion: null, ejeYDireccion: null });
    expect(m.ejeY).toEqual([0]);
    expect(m.valores[0][2]).toBeNaN();
    expect(formatoValor(m.valores[0][2])).toBe('—');
  });

  it('compara un mapa entre la original y la modificada', () => {
    const ori = binario([100, 200, 300, 400]);
    const mod = binario([100, 220, 330, 400]);
    const m = { ...base, direccion: 0, columnas: 2, filas: 2, ejeXDireccion: null, ejeYDireccion: null };
    const c = cambioMapa(ori, mod, m)!;
    expect([c.celdas, c.total, Math.round(c.porcentaje)]).toEqual([2, 4, 10]);
    expect(cambioMapa(ori, ori, m)).toBeNull();
  });

  it('encuentra las zonas cambiadas fuera de los mapas', () => {
    const mapa = { ...base, direccion: 10, columnas: 2, filas: 1, ejeXDireccion: 6, ejeYDireccion: null };
    const regiones = [{ desde: 4, hasta: 5 }, { desde: 7, hasta: 8 }, { desde: 11, hasta: 12 }, { desde: 20, hasta: 30 }];
    expect(zonasSinMapa(regiones, [mapa])).toEqual([{ desde: 4, hasta: 5 }, { desde: 20, hasta: 30 }]);
  });

  it('formatea y colorea los valores', () => {
    expect(formatoValor(12)).toBe('12');
    expect(formatoValor(0.0234375)).toBe('0,023');
    expect(colorCelda(5, 5, 5)).toBe('transparent');
    expect(colorCelda(0, 0, 10)).toContain('hsla(240');
    expect(colorCelda(10, 0, 10)).toContain('hsla(0');
  });
});
