#!/usr/bin/env bash
# Reentrena el reconocimiento de mapas y deja el modelo en frontend/public/modelos/mapas.json.
# Uso: bash ml/entrenar.sh [carpeta de lecturas, por defecto Centralitas/]
# Requisitos: Node, .NET 10 y Python 3 (las dependencias de Python se instalan en ml/salida/venv).
set -euo pipefail
cd "$(dirname "$0")"
DATOS="$(cd "${1:-../Centralitas}" && pwd)"
SALIDA="$(pwd)/salida"
MODELO="../frontend/public/modelos/mapas.json"
mkdir -p "$SALIDA"
# En Windows (Git Bash), Node y .NET necesitan rutas de Windows.
ruta() { if command -v cygpath > /dev/null; then cygpath -w "$1"; else echo "$1"; fi; }

echo "== 1. Parejas original / modificado"
node parejas.mjs "$(ruta "$DATOS")" "$(ruta "$SALIDA")"

echo "== 2. Mapas detectados (el mismo detector que la web)"
dotnet run detectar.cs -- "$(ruta "$DATOS")" "$(ruta "$SALIDA")"

echo "== 3. Rasgos y etiquetas (el mismo código que la web)"
printf "export { rasgosMapa, predecir, NOMBRES_RASGOS } from './app/core/reconocimiento';\nexport { cambioMapa } from './app/core/mapas';\n" > ../frontend/src/entrada-ml.ts
(cd ../frontend && npx esbuild src/entrada-ml.ts --bundle --format=esm --platform=node --log-level=warning --outfile="$(ruta "$SALIDA/reconocimiento.bundle.mjs")") || { rm -f ../frontend/src/entrada-ml.ts; exit 1; }
rm -f ../frontend/src/entrada-ml.ts
node dataset.mjs "$(ruta "$DATOS")" "$(ruta "$SALIDA")"

echo "== 4. Entrenamiento y validación"
if [ ! -d "$SALIDA/venv" ]; then
  (command -v py > /dev/null && py -3 -m venv "$SALIDA/venv") || python3 -m venv "$SALIDA/venv"
fi
PY="$SALIDA/venv/Scripts/python"; [ -x "$PY" ] || PY="$SALIDA/venv/bin/python"
"$PY" -m pip install -q -r requirements.txt
"$PY" -I entrenar.py "$(ruta "$SALIDA")" "$(ruta "$MODELO")"

echo "== 5. Paridad navegador / Python"
node paridad.mjs "$(ruta "$SALIDA")" "$(ruta "$MODELO")"
