import { ModeloMapas, NOMBRES_RASGOS, predecir, rasgosMapa, sugerir } from './reconocimiento';

/** Archivo con un mapa 4×2 de 16 bits (little endian) en 0x40: eje X en 0x20 (rpm), eje Y en 0x30, valores crecientes. */
function archivo(): DataView {
  const b = new DataView(new ArrayBuffer(256));
  [1000, 2000, 3000, 4000].forEach((x, i) => b.setUint16(0x20 + i * 2, x, true));
  [100, 200].forEach((y, i) => b.setUint16(0x30 + i * 2, y, true));
  [10, 20, 30, 40, 15, 25, 35, 45].forEach((v, i) => b.setUint16(0x40 + i * 2, v, true));
  return b;
}

const mapa = {
  direccion: 0x40, columnas: 4, filas: 2, tipoDato: 'U16' as const, bigEndian: false, porColumnas: false,
  ejeXDireccion: 0x20, ejeXTipo: 'U16' as const, ejeYDireccion: 0x30, ejeYTipo: 'U16' as const
};

// Un árbol: si xMax (rasgo 5) ≤ 0.05 (≈3277 en bruto) → «otro»; si no → «potencia» al 90 %.
const modelo: ModeloMapas = {
  version: 'prueba', clases: ['otro', 'potencia'], rasgos: [...NOMBRES_RASGOS],
  arboles: [{ f: [5, -1, -1], t: [0.05, -2, -2], i: [1, -1, -1], d: [2, -1, -1], p: [[], [1, 0], [0.1, 0.9]] }]
};

describe('reconocimiento de mapas', () => {
  it('calcula los rasgos de la forma del mapa', () => {
    const r = rasgosMapa(archivo(), mapa);
    expect(r.length).toBe(NOMBRES_RASGOS.length);
    const v = (n: (typeof NOMBRES_RASGOS)[number]) => r[NOMBRES_RASGOS.indexOf(n)];
    expect(v('columnas')).toBe(4);
    expect(v('filas')).toBe(2);
    expect(v('xMax')).toBeCloseTo(4000 / 65535, 6);
    expect(v('xCreciente')).toBe(1);
    expect(v('vTendX')).toBeGreaterThan(0.8);
    expect(v('vConstante')).toBe(0);
  });

  it('recorre los árboles como scikit-learn y solo sugiere potencia por encima del umbral', () => {
    expect(predecir(modelo, rasgosMapa(archivo(), mapa)).potencia).toBeCloseTo(0.9, 6);
    expect(sugerir(modelo, archivo(), mapa)).toEqual({ funcion: 'potencia', probabilidad: 0.9 });
    expect(sugerir(modelo, archivo(), mapa, 0.95)).toBeNull();
    // Eje X hasta 3000 rpm → «otro»: no se sugiere nada.
    const b = archivo();
    b.setUint16(0x26, 3000, true);
    expect(sugerir(modelo, b, mapa)).toBeNull();
  });
});
