import { esVersionAntigua } from './version';

describe('versión nueva desplegada', () => {
  it('reconoce el fallo al cargar una parte que ya no existe', () => {
    expect(esVersionAntigua(new TypeError('Failed to fetch dynamically imported module: https://www.astursagra.es/chunk-U5PCAZJV.js'))).toBe(true);
    expect(esVersionAntigua(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(esVersionAntigua(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('no confunde otros errores de navegación', () => {
    expect(esVersionAntigua(new Error('NG0203: inject() must be called from an injection context'))).toBe(false);
    expect(esVersionAntigua(null)).toBe(false);
  });
});
