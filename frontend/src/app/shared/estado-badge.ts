import { Component, input } from '@angular/core';
import { EstadoOrden } from '../core/models';
import { EtiquetaPipe } from './pipes';

@Component({
  selector: 'app-estado-badge',
  imports: [EtiquetaPipe],
  template: `<span class="badge" [class]="'badge estado-' + estado()">{{ estado() | etiqueta: 'estado' }}</span>`
})
export class EstadoBadge {
  readonly estado = input.required<EstadoOrden>();
}
