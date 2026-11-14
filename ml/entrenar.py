# Paso 4: entrena el reconocedor de mapas (potencia / otro) con dataset.json, lo valida dejando fuera centralitas enteras
# y exporta el bosque a JSON para el navegador. Uso: python entrenar.py <carpeta de salida> <modelo.json>
import json, os, sys
from datetime import date
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold
sys.stdout.reconfigure(encoding='utf-8')

DIR = sys.argv[1]
ds = json.load(open(os.path.join(DIR, 'dataset.json'), encoding='utf8'))
CLASES = ['potencia', 'otro']
filas = [f for f in ds['filas'] if f['etiqueta'] in CLASES]
X = np.array([f['rasgos'] for f in filas], dtype=float)
y = np.array([f['etiqueta'] for f in filas])
g = np.array([f['carpeta'] for f in filas])
PARAMS = dict(n_estimators=60, max_depth=10, min_samples_leaf=5, class_weight='balanced', random_state=0, n_jobs=-1)
print(f'{len(y)} mapas etiquetados de {len(set(g))} centralitas:', {c: int((y == c).sum()) for c in CLASES})

prob = np.zeros(len(y))
for tr, te in GroupKFold(n_splits=8).split(X, y, g):
    m = RandomForestClassifier(**PARAMS).fit(X[tr], y[tr])
    prob[te] = m.predict_proba(X[te])[:, list(m.classes_).index('potencia')]
es = y == 'potencia'
print('\nCentralitas no vistas al entrenar — mapas sugeridos como potencia:')
for umbral in (0.5, 0.6, 0.7, 0.8):
    s = prob >= umbral
    print(f'  umbral {umbral:.0%}: encuentra {(s & es).sum() / es.sum():.0%} de los de potencia · acierta en {(s & es).sum() / max(1, s.sum()):.0%} de los que sugiere ({s.sum()} sugerencias)')
# Por centralita: ¿cuántos de los mapas que sube la reprogramación saldrían sugeridos?
print('\nPor centralita (umbral 60 %): mapas de potencia encontrados / sugerencias que no lo eran')
for c in sorted(set(g[es])):
    i = g == c
    print(f'  {c:28} {((prob >= 0.6) & es & i).sum():3}/{(es & i).sum():<3}  falsas {((prob >= 0.6) & ~es & i).sum()}')

modelo = RandomForestClassifier(**PARAMS).fit(X, y)
imp = sorted(zip(modelo.feature_importances_, ds['rasgos']), reverse=True)[:8]
print('\nRasgos que más pesan:', ', '.join(f'{n} {v:.2f}' for v, n in imp))

def arbol(t):
    v = t.tree_.value[:, 0, :]
    v = v / v.sum(axis=1, keepdims=True)
    hoja = t.tree_.children_left == -1
    return dict(f=[int(x) if not h else -1 for x, h in zip(t.tree_.feature, hoja)], t=[round(float(x), 7) for x in t.tree_.threshold],
                i=[int(x) for x in t.tree_.children_left], d=[int(x) for x in t.tree_.children_right],
                p=[[round(float(x), 4) for x in fila] if h else [] for fila, h in zip(v, hoja)])
salida = dict(version=f'{date.today().isoformat()} · {len(set(g))} centralitas · {len(y)} mapas', clases=list(modelo.classes_), rasgos=ds['rasgos'],
              arboles=[arbol(t) for t in modelo.estimators_])
destino = sys.argv[2]
json.dump(salida, open(destino, 'w', encoding='utf8'), separators=(',', ':'))
print(f'\nModelo exportado: {destino} ({os.path.getsize(destino) / 1024:.0f} KB)')
# Comprobación cruzada con el navegador (paridad.mjs): probabilidades de los 20 primeros mapas.
json.dump(dict(rasgos=X[:20].tolist(), potencia=modelo.predict_proba(X[:20])[:, list(modelo.classes_).index('potencia')].tolist()),
          open(os.path.join(DIR, 'comprobacion.json'), 'w'))
