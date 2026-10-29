/**
 * Vista previa del área de un cliente para el personal del taller. El id del cliente va en una cookie que el
 * servidor solo tiene en cuenta para usuarios del taller; así también la llevan las imágenes y documentos que pide
 * el navegador directamente. Es de solo lectura, como el propio portal.
 */
const COOKIE = 'astursagra.vista';

export function vistaClienteId(): number | null {
  const m = /(?:^|;\s*)astursagra\.vista=(\d+)/.exec(document.cookie);
  return m ? Number(m[1]) : null;
}

export function iniciarVistaCliente(id: number) {
  const segura = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${id}; path=/; SameSite=Strict${segura}`;
}

export function terminarVistaCliente() {
  const segura = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=; path=/; max-age=0; SameSite=Strict${segura}`;
}
