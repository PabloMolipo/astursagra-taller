// Paso 5: comprueba que el navegador (reconocimiento.ts) da las mismas probabilidades que scikit-learn.
// Uso: node paridad.mjs <carpeta de salida> <modelo.json>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , SALIDA, MODELO] = process.argv;
const { predecir } = await import(pathToFileURL(path.join(SALIDA, 'reconocimiento.bundle.mjs')).href);
const modelo = JSON.parse(fs.readFileSync(MODELO, 'utf8'));
const c = JSON.parse(fs.readFileSync(path.join(SALIDA, 'comprobacion.json'), 'utf8'));
const diferencia = Math.max(...c.rasgos.map((r, i) => Math.abs(predecir(modelo, r).potencia - c.potencia[i])));
console.log(`Diferencia máxima navegador / scikit-learn: ${diferencia.toExponential(1)}`);
if (diferencia > 1e-3) {
  console.error('El navegador no da lo mismo que el modelo entrenado: revisa rasgosMapa/predecir.');
  process.exit(1);
}
