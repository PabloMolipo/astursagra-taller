/**
 * Lectura de las respuestas de la API de Vinalfa V2. Su especificación solo dice que `data` es un objeto; los nombres
 * de campo están sacados de respuestas reales (octubre de 2026) y se aceptan algunas variantes por si cambian.
 * Lo que no se reconozca queda a la vista como «datos sin formato».
 *
 * Formato real:
 * - resolve: { catalog, vin, data: { modifications: [{ model, date, engine, transmission, equipments: [{ key, value }], hash }] } }
 * - groups: { data: { sections: [{ id, name, hasChild, children: [{ id, name, hasChild, hash }] }] } }  (grupos sin hash)
 * - children: { data: { units: [{ name, image, hash, kind: "diagram", can_fetch_children, can_fetch_parts }] } }
 * - parts: { sectionName, data: { image, parts: [{ reference: "(2)", points: [{ x, y, width, height }],
 *            numbers: [{ number, replace, label, description: [{ name, desc }], count }] }] } }
 * - search: { items: [{ name, image, hash, foundParts: [{ part_no, label }] }] }
 */

type Json = unknown;
type Obj = Record<string, unknown>;

export interface NodoCatalogo {
  /** null en los grupos principales, que traen sus subgrupos dentro (hijos). */
  hash: string | null;
  nombre: string;
  /** Si se sabe que es un esquema con piezas. */
  esEsquema: boolean;
  imagen: string | null;
  hijos: NodoCatalogo[];
  /** Referencias encontradas (en los resultados de búsqueda). */
  encontradas: string[];
}

export interface VarianteVehiculo {
  hash: string;
  nombre: string;
  datos: { clave: string; valor: string }[];
}

export interface PuntoEsquema {
  etiqueta: string;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

export interface PiezaEsquema {
  posicion: string | null;
  referencia: string | null;
  nombre: string | null;
  cantidad: string | null;
  nota: string | null;
}

export interface EsquemaPiezas {
  nombre: string | null;
  imagen: string | null;
  puntos: PuntoEsquema[];
  piezas: PiezaEsquema[];
}

const HASH = /^[a-f0-9]{32}$/i;

const esObj = (v: Json): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function texto(o: Obj, ...claves: string[]): string | null {
  for (const c of claves) {
    const v = o[c];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return null;
}

function numero(o: Obj, ...claves: string[]): number | null {
  for (const c of claves) {
    const v = o[c];
    const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Primera lista de objetos bajo alguna de las claves, también dentro de envoltorios ({ data: { items: [...] } });
 * si no, la propia respuesta si es una lista, o la primera lista de objetos que haya.
 */
export function lista(datos: Json, ...claves: string[]): Obj[] {
  return buscarLista(datos, claves, 0) ?? primeraLista(datos);
}

function buscarLista(datos: Json, claves: string[], profundidad: number): Obj[] | null {
  if (!esObj(datos) || profundidad > 3) return null;
  for (const c of claves) {
    const v = datos[c];
    if (Array.isArray(v)) return v.filter(esObj);
  }
  for (const v of Object.values(datos)) {
    const dentro = buscarLista(v, claves, profundidad + 1);
    if (dentro?.length) return dentro;
  }
  return null;
}

function primeraLista(datos: Json): Obj[] {
  if (Array.isArray(datos)) return datos.filter(esObj);
  if (!esObj(datos)) return [];
  const primera = Object.values(datos).find(v => Array.isArray(v) && v.some(esObj));
  return Array.isArray(primera) ? primera.filter(esObj) : [];
}

/** Primer texto con esa clave en el objeto o en sus envoltorios. */
function textoProfundo(datos: Json, clave: string, profundidad = 0): string | null {
  if (!esObj(datos) || profundidad > 3) return null;
  const v = texto(datos, clave);
  if (v) return v;
  for (const x of Object.values(datos)) {
    const dentro = textoProfundo(x, clave, profundidad + 1);
    if (dentro) return dentro;
  }
  return null;
}

function hash(o: Obj, ...preferidos: string[]): string | null {
  for (const c of [...preferidos, 'hash', 'section_hash', 'vehicle_hash']) {
    const v = o[c];
    if (typeof v === 'string' && HASH.test(v)) return v.toLowerCase();
  }
  return null;
}

function imagen(o: Obj): string | null {
  const directa = texto(o, 'image', 'image_url', 'img', 'picture', 'scheme_url', 'preview');
  return directa && /^(https?:)?\/\/|^\//.test(directa) ? directa : null;
}

/** Variantes (modificaciones) del vehículo al identificar un bastidor: a veces una, a veces varias para elegir. */
export function variantes(datos: Json): VarianteVehiculo[] {
  const marca = esObj(datos) ? texto(datos, 'catalog', 'catalog_name', 'make_name') : null;
  return lista(datos, 'modifications', 'vehicles', 'variants', 'items')
    .map(o => ({ o, h: hash(o, 'vehicle_hash') }))
    .filter((x): x is { o: Obj; h: string } => x.h !== null)
    .map(({ o, h }) => {
      const equipamiento = Array.isArray(o['equipments'])
        ? (o['equipments'] as Json[]).filter(esObj).map(e => ({ clave: texto(e, 'key', 'name') ?? '', valor: texto(e, 'value', 'desc') ?? '' }))
        : [];
      const basicos = [
        ['Fecha', texto(o, 'date', 'year')],
        ['Motor', texto(o, 'engine')],
        ['Cambio', texto(o, 'transmission')],
        ['Mercado', texto(o, 'catalog', 'region', 'market')]
      ].filter((x): x is [string, string] => !!x[1]).map(([clave, valor]) => ({ clave, valor }));
      return {
        hash: h,
        nombre: [marca, texto(o, 'model', 'name', 'title')].filter(Boolean).join(' ') || 'Vehículo',
        datos: [...basicos, ...equipamiento.filter(e => e.clave && e.valor).map(e => ({ ...e, clave: e.clave.replace(/_/g, ' ') }))].slice(0, 16)
      };
    });
}

function nodo(o: Obj): NodoCatalogo | null {
  const h = hash(o, 'section_hash');
  const hijos = Array.isArray(o['children']) ? (o['children'] as Json[]).filter(esObj).map(nodo).filter((n): n is NodoCatalogo => n !== null) : [];
  if (!h && !hijos.length) return null;
  const encontradas = Array.isArray(o['foundParts'])
    ? (o['foundParts'] as Json[]).filter(esObj).map(p => texto(p, 'part_no', 'part_number', 'number')).filter((x): x is string => !!x)
    : [];
  const tipo = (texto(o, 'kind', 'type') ?? '').toLowerCase();
  const esEsquema =
    (o['can_fetch_parts'] === true && o['can_fetch_children'] !== true) || /diagram|unit|scheme/.test(tipo) || encontradas.length > 0;
  return { hash: h, nombre: texto(o, 'name', 'title', 'label') ?? 'Sin nombre', esEsquema, imagen: imagen(o), hijos, encontradas };
}

/** Grupos, subsecciones o resultados de búsqueda que se pueden abrir. */
export function nodos(datos: Json): NodoCatalogo[] {
  return lista(datos, 'sections', 'units', 'items', 'groups', 'children', 'results').map(nodo).filter((n): n is NodoCatalogo => n !== null);
}

const sinParentesis = (s: string | null) => (s ? s.replace(/^\((.*)\)$/, '$1').trim() : null);

/** Esquema con su imagen, posiciones (con sus coordenadas) y referencias. */
export function esquema(datos: Json): EsquemaPiezas {
  const posiciones = lista(datos, 'parts', 'details', 'articles');
  const puntos: PuntoEsquema[] = [];
  const piezas: PiezaEsquema[] = [];

  for (const p of posiciones) {
    const posicion = sinParentesis(texto(p, 'reference', 'position', 'pos', 'code', 'label'));
    for (const pt of Array.isArray(p['points']) ? (p['points'] as Json[]).filter(esObj) : []) {
      const x = numero(pt, 'x', 'left');
      const y = numero(pt, 'y', 'top');
      if (posicion && x !== null && y !== null) {
        puntos.push({ etiqueta: posicion, x, y, ancho: numero(pt, 'width', 'w') ?? 0, alto: numero(pt, 'height', 'h') ?? 0 });
      }
    }
    // Cada posición puede tener varias referencias (variantes y sustituciones).
    const numeros = Array.isArray(p['numbers']) ? (p['numbers'] as Json[]).filter(esObj) : [p];
    for (const n of numeros) {
      const descripcion = Array.isArray(n['description'])
        ? (n['description'] as Json[]).filter(esObj).map(d => texto(d, 'desc', 'value')).filter(Boolean).join(' · ')
        : texto(n, 'description', 'note', 'notes', 'comment');
      const sustituta = texto(n, 'replace', 'replaced_by', 'superseded_by');
      const nota = [descripcion, sustituta ? `Sustituida por ${sustituta}` : null].filter(Boolean).join(' · ') || null;
      const referencia = texto(n, 'number', 'article', 'part_number', 'part_no', 'oem');
      if (referencia || texto(n, 'label', 'name')) {
        piezas.push({ posicion, referencia, nombre: texto(n, 'label', 'name', 'title'), cantidad: texto(n, 'count', 'quantity', 'qty'), nota });
      }
    }
  }

  return {
    nombre: textoProfundo(datos, 'sectionName') ?? textoProfundo(datos, 'name'),
    imagen: buscarImagen(datos),
    puntos,
    piezas
  };
}

function buscarImagen(datos: Json, profundidad = 0): string | null {
  if (!esObj(datos) || profundidad > 3) return null;
  const directa = imagen(datos);
  if (directa) return directa;
  for (const v of Object.values(datos)) {
    if (esObj(v)) {
      const dentro = buscarImagen(v, profundidad + 1);
      if (dentro) return dentro;
    }
  }
  return null;
}

/** Solo direcciones web (las imágenes de Vinalfa son públicas y se cargan directamente). */
export function urlImagen(url: string | null): string | null {
  if (!url) return null;
  const absoluta = url.startsWith('//') ? 'https:' + url : url.startsWith('/') ? 'https://vinalfa.com' + url : url;
  try {
    const u = new URL(absoluta);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
