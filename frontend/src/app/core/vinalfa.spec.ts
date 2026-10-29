import { esquema, lista, nodos, urlImagen, variantes } from './vinalfa';

// Respuestas con la forma real de la API (recortadas).
const V = '57ba1c0f0204834039a22d30ed5220d6';
const RESOLVE = {
  catalog: 'Volkswagen', vin: 'WVWZZZ1KZ8W508455', lookup_source: 'primary',
  data: { modifications: [{ model: 'Golf Plus 1.6', date: '20-06-2007', catalog: 'RDW', engine: 'BSE', transmission: 'JTY', equipments: [{ key: 'Color', value: 'LC9Z' }], hash: V }] }
};
const GROUPS = {
  catalog: 'Volkswagen',
  data: { sections: [{ id: 1, name: 'Engine', hasChild: true, parent_id: 0, children: [{ id: 2, name: 'Complete engine', hasChild: false, parent_id: 1, hash: 'e2c01dc639b13b7b55294d437e30beaf' }] }] }
};
const CHILDREN = {
  data: { units: [{ image: 'https://vinalfa.com/images/oem?f=abc', name: 'Base engine 1.4-2.0 ltr.', info: { model: 'Petr. engine' }, hash: '6652ed37a5fd200d04dc78a057f84b57', kind: 'diagram', hasChild: false, can_fetch_children: false, can_fetch_parts: true }] }
};
const PARTS = {
  catalog: 'Volkswagen', sectionName: 'Base engine 1.4-2.0 ltr.',
  data: {
    image: 'https://vinalfa.com/images/oem?f=abc',
    parts: [
      {
        reference: '(2)',
        numbers: [
          { number: '06A100043P', replace: '06A100098LX', label: 'Base engine', description: [{ name: 'info', desc: '75KW1.6ltr. | BSE' }], count: '1', photo: '' },
          { number: '06A100098LX', replace: '', label: 'Base engine', description: [{ name: 'info', desc: '75KW1.6ltr. | BSE' }], count: '1', photo: '' }
        ],
        points: [{ x: 281, y: 701, width: 35, height: 35 }]
      }
    ],
    links: []
  }
};
const SEARCH = {
  items: [{ image: 'https://vinalfa.com/images/oem?f=x', name: 'Type plates ', info: [], hash: '267afd02eb120607d5c76cab480a0278', foundParts: [{ ref: '-', part_no: '1K0010358A', label: 'Notice' }], parent_hash: 'd7a47bf8b1f246dfb5349fe4bb5d1248' }]
};

describe('vinalfa: lectura de respuestas reales', () => {
  it('variantes: marca del catálogo, modelo y datos', () => {
    const v = variantes(RESOLVE);
    expect(v.length).toBe(1);
    expect(v[0].hash).toBe(V);
    expect(v[0].nombre).toBe('Volkswagen Golf Plus 1.6');
    expect(v[0].datos).toEqual([
      { clave: 'Fecha', valor: '20-06-2007' },
      { clave: 'Motor', valor: 'BSE' },
      { clave: 'Cambio', valor: 'JTY' },
      { clave: 'Mercado', valor: 'RDW' },
      { clave: 'Color', valor: 'LC9Z' }
    ]);
  });

  it('grupos: los principales sin hash traen sus subgrupos dentro', () => {
    const g = nodos(GROUPS);
    expect(g.length).toBe(1);
    expect(g[0]).toEqual(parcial({ hash: null, nombre: 'Engine', esEsquema: false }));
    expect(g[0].hijos[0]).toEqual(parcial({ hash: 'e2c01dc639b13b7b55294d437e30beaf', nombre: 'Complete engine', esEsquema: false }));
  });

  it('subsecciones: los diagramas se marcan como esquema', () => {
    const u = nodos(CHILDREN)[0];
    expect(u.esEsquema).toBe(true);
    expect(u.imagen).toBe('https://vinalfa.com/images/oem?f=abc');
  });

  it('esquema: nombre, imagen, puntos por posición y referencias con sustitución', () => {
    const e = esquema(PARTS);
    expect(e.nombre).toBe('Base engine 1.4-2.0 ltr.');
    expect(e.imagen).toBe('https://vinalfa.com/images/oem?f=abc');
    expect(e.puntos).toEqual([{ etiqueta: '2', x: 281, y: 701, ancho: 35, alto: 35 }]);
    expect(e.piezas).toEqual([
      { posicion: '2', referencia: '06A100043P', nombre: 'Base engine', cantidad: '1', nota: '75KW1.6ltr. | BSE · Sustituida por 06A100098LX' },
      { posicion: '2', referencia: '06A100098LX', nombre: 'Base engine', cantidad: '1', nota: '75KW1.6ltr. | BSE' }
    ]);
  });

  it('búsqueda: resultados como esquemas con las referencias encontradas', () => {
    const r = nodos(SEARCH)[0];
    expect(r.esEsquema).toBe(true);
    expect(r.nombre).toBe('Type plates');
    expect(r.encontradas).toEqual(['1K0010358A']);
  });

  it('lista: dentro de envoltorios o la primera lista de objetos', () => {
    expect(lista({ result: { items: [{ a: 1 }] } }, 'items')).toEqual([{ a: 1 }]);
    expect(lista({ cosas: [{ b: 2 }] }, 'items')).toEqual([{ b: 2 }]);
    expect(lista('nada', 'items')).toEqual([]);
  });

  it('imágenes: solo direcciones web', () => {
    expect(urlImagen('https://vinalfa.com/images/oem?f=abc')).toBe('https://vinalfa.com/images/oem?f=abc');
    expect(urlImagen('/images/x.svg')).toBe('https://vinalfa.com/images/x.svg');
    expect(urlImagen('javascript:alert(1)')).toBeNull();
    expect(urlImagen('data:image/png;base64,AAA')).toBeNull();
    expect(urlImagen(null)).toBeNull();
  });
});

/** Compara solo las propiedades indicadas. */
function parcial(parcial: Record<string, unknown>) {
  return expect.objectContaining(parcial);
}
