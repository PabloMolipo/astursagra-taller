/** Marca (en sessionStorage) de la última recarga por versión nueva, para no entrar en bucle. */
const CLAVE = 'astursagra.recarga';

/** Error al cargar una parte de la aplicación que ya no existe en el servidor (se ha desplegado otra versión). */
export function esVersionAntigua(error: unknown): boolean {
  const texto = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(texto);
}

/**
 * Si la pestaña se abrió antes de un despliegue, las páginas que aún no había visitado ya no existen:
 * en vez de quedarse sin hacer nada, recarga la página de destino con la versión nueva (una vez por minuto como mucho).
 */
export function recargarSiVersionNueva(error: unknown, url: string, ahora = Date.now()): boolean {
  if (!esVersionAntigua(error)) return false;
  try {
    const anterior = Number(sessionStorage.getItem(CLAVE));
    if (anterior && ahora - anterior < 60_000) return false;
    sessionStorage.setItem(CLAVE, String(ahora));
  } catch {
    // Sin sessionStorage: se recarga igual.
  }
  location.assign(url);
  return true;
}
