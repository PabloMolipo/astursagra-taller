import { Pipe, PipeTransform } from '@angular/core';

function escapar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Dominio de una dirección (ya escapada), para mostrar siempre a dónde lleva un enlace. */
function dominio(url: string): string {
  try {
    return new URL(url.replace(/&amp;/g, '&')).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function enlace(url: string, texto: string): string {
  const host = dominio(url);
  return `<a href="${url}" target="_blank" rel="noopener noreferrer">${texto}</a>${host && texto !== url ? ` <span class="dominio">(${host})</span>` : ''}`;
}

/**
 * Negrita, cursiva, código, enlaces web (solo http/https, en otra pestaña y con su dominio a la vista) y referencias
 * a órdenes ("OT-00012" → enlace). Recibe texto ya escapado.
 */
function enLinea(texto: string): string {
  return texto
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g, (_m, texto, url, antes, suelta) =>
      url ? enlace(url, texto) : `${antes}${enlace(suelta, suelta)}`
    )
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/\bOT-0*(\d+)\b/g, (m, id) => `<a href="/gestion/ordenes/${id}">${m}</a>`);
}

/**
 * Markdown básico de las respuestas del asistente: encabezados, listas, párrafos y formato en línea.
 * Todo el texto se escapa antes de dar formato, así que no se puede inyectar HTML.
 */
export function markdownAHtml(md: string): string {
  const lineas = escapar(md.replace(/\r/g, '')).split('\n');
  const html: string[] = [];
  let lista: 'ul' | 'ol' | null = null;
  let parrafo: string[] = [];

  const cerrarParrafo = () => {
    if (parrafo.length) {
      html.push(`<p>${enLinea(parrafo.join('<br>'))}</p>`);
      parrafo = [];
    }
  };
  const cerrarLista = () => {
    if (lista) {
      html.push(`</${lista}>`);
      lista = null;
    }
  };

  for (const linea of lineas) {
    const encabezado = /^(#{1,4})\s+(.*)$/.exec(linea);
    const vineta = /^\s*[-*•]\s+(.*)$/.exec(linea);
    const numerada = /^\s*\d+[.)]\s+(.*)$/.exec(linea);

    if (encabezado) {
      cerrarParrafo();
      cerrarLista();
      const nivel = Math.min(encabezado[1].length + 2, 6);
      html.push(`<h${nivel}>${enLinea(encabezado[2])}</h${nivel}>`);
    } else if (vineta || numerada) {
      cerrarParrafo();
      const tipo = vineta ? 'ul' : 'ol';
      if (lista !== tipo) {
        cerrarLista();
        html.push(`<${tipo}>`);
        lista = tipo;
      }
      html.push(`<li>${enLinea((vineta ?? numerada)![1])}</li>`);
    } else if (linea.trim() === '') {
      cerrarParrafo();
      cerrarLista();
    } else {
      cerrarLista();
      parrafo.push(linea);
    }
  }
  cerrarParrafo();
  cerrarLista();
  return html.join('');
}

@Pipe({ name: 'markdown' })
export class MarkdownPipe implements PipeTransform {
  transform(texto: string | null | undefined): string {
    return texto ? markdownAHtml(texto) : '';
  }
}
