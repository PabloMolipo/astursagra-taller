import { Pipe, PipeTransform } from '@angular/core';
import { ESTADOS_ORDEN, TIPOS_CLIENTE, TIPOS_DOCUMENTO, TIPOS_LINEA, TIPOS_SERVICIO, TIPOS_VEHICULO } from '../core/etiquetas';

const CATALOGOS = {
  cliente: TIPOS_CLIENTE,
  vehiculo: TIPOS_VEHICULO,
  estado: ESTADOS_ORDEN,
  servicio: TIPOS_SERVICIO,
  linea: TIPOS_LINEA,
  documento: TIPOS_DOCUMENTO
} as const;

/** Traduce un valor de enum de la API a su texto en pantalla: {{ v.tipo | etiqueta: 'vehiculo' }}. */
@Pipe({ name: 'etiqueta' })
export class EtiquetaPipe implements PipeTransform {
  transform(valor: string | string[] | null | undefined, catalogo: keyof typeof CATALOGOS): string {
    const etiquetas = CATALOGOS[catalogo] as Record<string, string>;
    if (Array.isArray(valor)) {
      return valor.map(v => etiquetas[v] ?? v).join(', ');
    }
    return valor ? etiquetas[valor] ?? valor : '';
  }
}

/** Matrícula, si no bastidor, si no "Sin matrícula". */
@Pipe({ name: 'identificacion' })
export class IdentificacionPipe implements PipeTransform {
  transform(v: { matricula: string | null; bastidor: string | null }): string {
    return v.matricula ?? v.bastidor ?? 'Sin matrícula';
  }
}

/** 12 → "OT-00012" */
@Pipe({ name: 'numOrden' })
export class NumOrdenPipe implements PipeTransform {
  transform(id: number): string {
    return `OT-${String(id).padStart(5, '0')}`;
  }
}
