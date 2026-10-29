import { EventoAsistente } from './models';

/**
 * Envía un mensaje al asistente y va entregando los eventos según llegan (Server-Sent Events sobre un POST,
 * por eso se usa fetch y no EventSource). La cookie de sesión viaja sola por ser el mismo origen.
 */
export async function enviarAlAsistente(
  sesionId: number,
  texto: string,
  documentoIds: number[],
  alRecibir: (e: EventoAsistente) => void,
  cancelar?: AbortSignal
): Promise<void> {
  const respuesta = await fetch(`/api/asistente/sesiones/${sesionId}/mensajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ texto, documentoIds }),
    credentials: 'same-origin',
    signal: cancelar
  });

  if (!respuesta.ok || !respuesta.body) {
    let detalle = 'No se ha podido enviar el mensaje.';
    try {
      const problema = await respuesta.json();
      detalle = problema?.detail ?? detalle;
    } catch {
      // Sin cuerpo JSON.
    }
    if (respuesta.status === 401) {
      detalle = 'Tu sesión ha caducado. Vuelve a entrar.';
    }
    throw new Error(detalle);
  }

  const lector = respuesta.body.getReader();
  const decodificador = new TextDecoder();
  let bufer = '';
  for (;;) {
    const { value, done } = await lector.read();
    if (done) {
      break;
    }
    bufer += decodificador.decode(value, { stream: true });
    let fin: number;
    while ((fin = bufer.indexOf('\n\n')) >= 0) {
      const bloque = bufer.slice(0, fin);
      bufer = bufer.slice(fin + 2);
      const datos = bloque.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
      if (datos) {
        alRecibir(JSON.parse(datos) as EventoAsistente);
      }
    }
  }
}
