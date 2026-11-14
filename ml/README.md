# Reconocimiento de mapas

Modelo que sugiere en la ficha de una centralita qué mapas detectados son **de potencia** (par, turbo, inyección,
limitadores…): «⚡ Posible potencia 74 %». Es un bosque de árboles de decisión (scikit-learn) que se exporta a
`frontend/public/modelos/mapas.json` y se ejecuta en el navegador (`frontend/src/app/core/reconocimiento.ts`).

## Reentrenar

```bash
bash ml/entrenar.sh            # lee Centralitas/ (o la carpeta que se pase)
```

Necesita Node, .NET 10 y Python 3. Las dependencias de Python se instalan solas en `ml/salida/venv`. Los ficheros
intermedios van a `ml/salida/`, que no se sube al repositorio. Al terminar hay que desplegar para que la web use el
modelo nuevo; el navegador lo guarda en caché como mucho 1 hora.

## Datos

`Centralitas/` tiene una carpeta por centralita (p. ej. `EDC16CP35 BMW X5 235`) con el original (el fichero con el nombre
del cliente o del coche, `_ExtFl`, `ori_`…) y uno o más modificados con lo que hacen en el nombre (`stage1.bin`,
`st_dpf.bin`, `egr dpf off.bin`…). Son lecturas de clientes: **no se suben a git ni a Cloud Build** (`.gitignore`,
`.dockerignore`).

## Cómo se entrena

1. `parejas.mjs`: empareja original y modificados y saca las funciones del nombre (`st`, `egr`, `dpf`, `src`…). Si en una
   carpeta todos los nombres llevan pistas, el original se indica en `ORIGINALES`.
2. `detectar.cs`: detecta los mapas de cada original con el mismo detector que la web (`AnalizadorBinario`).
3. `dataset.mjs`: calcula los rasgos de cada mapa con el mismo código que la web (`rasgosMapa`) y lo etiqueta:
   **potencia** si un stage lo sube; **otro** si un stage puro no lo toca.
4. `entrenar.py`: valida dejando fuera centralitas enteras (como si fueran lecturas nuevas) y exporta el modelo.
5. `paridad.mjs`: comprueba que el navegador da las mismas probabilidades que Python.

## Resultados y límites (octubre de 2026: 78 parejas, 24 centralitas con stage)

- Con lecturas que el modelo no ha visto y umbral del 70 % (el de la web), encuentra la mitad de los mapas que sube un
  stage y algo más de la mitad de sus sugerencias aciertan. Parte de los «fallos» son seguramente mapas de potencia que
  esa reprogramación no tocó.
- Las anulaciones de EGR, DPF y AdBlue casi nunca son mapas con ejes (son interruptores y tablas sueltas): no las aprende
  este modelo; las identifica la comparación ori/mod (`core/cambios.ts`).
- Mejora con más datos: más parejas en `Centralitas/` (sobre todo de familias poco representadas, como Delphi, Siemens y
  MD1/MG1) y, en el futuro, los mapas a los que se pone grupo en la web, que quedan en la biblioteca.
