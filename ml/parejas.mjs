// Paso 1: empareja en cada carpeta de lecturas el original con sus modificados y saca las funciones del nombre de cada
// modificado (egr, dpf, st…). Uso: node parejas.mjs <carpeta de datos> <carpeta de salida> → <salida>/parejas.json
import fs from 'node:fs';
import path from 'node:path';

const [, , DATOS, SALIDA] = process.argv;
const PISTAS = {
  potencia: /(^|[^a-z])(st(age)?[ _-]?[123]?|stage\d?|tq|torque|full)([^a-z]|$)/i,
  egr: /egr/i, dpf: /dpf|fap/i, adblue: /adblue|urea|scr|src/i, flaps: /flap|flas/i, tva: /tva/i,
  dtc: /dtc|[pcbu]?[0-9][0-9a-f]{3}\b|p1270/i, immo: /immo/i, aditivo: /aditiv|eolis/i, limp: /limp/i
};
// Los números largos (de software, de fecha) no son pistas.
const limpio = n => n.replace(/\d{6,}/g, '');
const esOriginal = n => !Object.values(PISTAS).some(r => r.test(limpio(n)))
  || (/_(ext|int)fl|_all|^ori_|flash|bench/i.test(n) && !/(st|stage|egr|dpf|tva|src|flaps)/i.test(n.replace(/^ori_\d+_/, '')));
// Carpetas donde todos los nombres llevan pistas: el original es el que lleva el nombre del cliente o del coche.
const ORIGINALES = { 'EDC15C2 Cherokee 2.7 CRD': 'jeepP1270.bin', 'EDC17C10 C3': 'c3eolis.bin', 'EDC17C8 Hyundai': 'i20egr.bin' };

const parejas = [];
for (const carpeta of fs.readdirSync(DATOS).sort()) {
  const dir = path.join(DATOS, carpeta);
  if (!fs.statSync(dir).isDirectory()) continue;
  const ficheros = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).size > 0);
  const ori = ORIGINALES[carpeta] ?? ficheros.find(esOriginal);
  if (!ori) { console.log(`${carpeta}: sin original reconocible, se omite`); continue; }
  const a = fs.readFileSync(path.join(dir, ori));
  for (const mod of ficheros.filter(f => f !== ori)) {
    const b = fs.readFileSync(path.join(dir, mod));
    let bytes = 0;
    if (a.length === b.length) for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) bytes++;
    // Distinto tamaño, sin cambios o más de 200 KB cambiados (otra versión de software): no es una reprogramación de ese original.
    if (a.length !== b.length || !bytes || bytes >= 200_000) { console.log(`${carpeta}/${mod}: no comparable con ${ori}, se omite`); continue; }
    parejas.push({ carpeta, ori, mod, tags: Object.keys(PISTAS).filter(k => PISTAS[k].test(limpio(mod))), bytes });
  }
}
fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(path.join(SALIDA, 'parejas.json'), JSON.stringify(parejas, null, 1));
console.log(`${parejas.length} parejas de ${new Set(parejas.map(p => p.carpeta)).size} centralitas`);
