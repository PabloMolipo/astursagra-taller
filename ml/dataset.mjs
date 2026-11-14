// Paso 3: rasgos de cada mapa detectado (con el mismo código que la web, frontend/src/app/core/reconocimiento.ts) y su
// etiqueta según lo que le hacen los modificados: «potencia» si un stage lo sube, «otro» si un stage puro no lo toca.
// Uso: node dataset.mjs <carpeta de datos> <carpeta de salida> → <salida>/dataset.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , DATOS, SALIDA] = process.argv;
const { rasgosMapa, cambioMapa, NOMBRES_RASGOS } = await import(pathToFileURL(path.join(SALIDA, 'reconocimiento.bundle.mjs')).href);
const parejas = JSON.parse(fs.readFileSync(path.join(SALIDA, 'parejas.json'), 'utf8'));
const detectados = JSON.parse(fs.readFileSync(path.join(SALIDA, 'mapas-detectados.json'), 'utf8'));
const vista = f => { const b = fs.readFileSync(path.join(DATOS, f)); return new DataView(b.buffer, b.byteOffset, b.byteLength); };
const definicion = m => ({
  direccion: m.Direccion, columnas: m.Columnas, filas: m.Filas, tipoDato: m.TipoDato, bigEndian: m.BigEndian, porColumnas: m.PorColumnas,
  ejeXDireccion: m.EjeXDireccion, ejeXTipo: 'U16', ejeYDireccion: m.EjeYDireccion, ejeYTipo: 'U16', factor: 1, desplazamiento: 0,
  ejeXFactor: 1, ejeYFactor: 1, ejeXDesplazamiento: 0, ejeYDesplazamiento: 0, ejeXValores: null, ejeYValores: null
});

const filas = [];
for (const [clave, mapas] of Object.entries(detectados)) {
  const [carpeta, ori] = clave.split('/');
  const a = vista(clave);
  const mods = parejas.filter(p => p.carpeta === carpeta && p.ori === ori).map(p => ({ tags: p.tags, b: vista(`${carpeta}/${p.mod}`) }));
  for (const m of mapas) {
    const d = definicion(m);
    let etiqueta = null;
    for (const { tags, b } of mods) {
      const c = cambioMapa(a, b, d);
      if (c && c.porcentaje > 0.5 && tags.includes('potencia')) etiqueta = 'potencia';
      else if (!c && tags.length === 1 && tags[0] === 'potencia' && !etiqueta) etiqueta = 'otro';
    }
    filas.push({ carpeta, direccion: m.Direccion, rasgos: rasgosMapa(a, d), etiqueta });
  }
}
fs.writeFileSync(path.join(SALIDA, 'dataset.json'), JSON.stringify({ rasgos: NOMBRES_RASGOS, filas }));
const cuenta = {};
for (const f of filas) if (f.etiqueta) cuenta[f.etiqueta] = (cuenta[f.etiqueta] ?? 0) + 1;
console.log(`${filas.length} mapas detectados; etiquetados:`, JSON.stringify(cuenta));
