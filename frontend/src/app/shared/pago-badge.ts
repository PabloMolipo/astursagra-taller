import { Component, input } from '@angular/core';

/** Indicador de pago de una orden: «Pagado» en lima o «Sin pagar» en ámbar. */
@Component({
  selector: 'app-pago-badge',
  template: `<span class="pago" [class.si]="pagado()">{{ pagado() ? '✓ Pagado' : texto() }}</span>`,
  styles: `
    .pago { display: inline-block; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; padding: 1px 7px; border: 1px solid #ffb020; color: #ffc24d; white-space: nowrap; vertical-align: middle; }
    .pago.si { border-color: var(--primary); color: var(--primary); }
  `
})
export class PagoBadge {
  readonly pagado = input.required<boolean>();
  /** Texto cuando no está pagada (en el área del cliente, «Pendiente de pago»). */
  readonly texto = input('Sin pagar');
}
