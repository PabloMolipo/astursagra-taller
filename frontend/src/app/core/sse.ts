/**
 * POST que devuelve Server-Sent Events: va entregando cada evento según llega (por eso fetch y no EventSource).
 * La cookie de sesión viaja sola por ser el mismo origen.
 */
export async function postEventos<T>(url: string, cuerpo: unknown, alRecibir: (e: T) => void, cancelar?: AbortSignal): Promise<void> {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(cuerpo),
    credentials: 'same-origin',
    signal: cancelar
  });

  if (!respuesta.ok || !respuesta.body) {
    let detalle = 'No se ha podido enviar el mensaje.';
    try {
      detalle = (await respuesta.json())?.detail ?? detalle;
    } catch {
      // Sin cuerpo JSON.
    }
    throw new Error(respuesta.status === 401 ? 'Tu sesión ha caducado. Vuelve a entrar.' : detalle);
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let bufer = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) break;
    bufer += decodificador.decode(value, { stream: true });
    let fin: number;
    while ((fin = bufer.indexOf('\n\n')) >= 0) {
      const bloque = bufer.slice(0, fin);
      bufer = bufer.slice(fin + 2);
      const datos = bloque.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
      if (datos) alRecibir(JSON.parse(datos) as T);
    }
  }
}
