import { Component, input } from '@angular/core';

/** Iconos de trazo del catálogo de servicios. La clave se elige al editar el servicio. */
export const ICONOS_SERVICIO: { valor: string; etiqueta: string }[] = [
  { valor: 'motor', etiqueta: 'Motor / mecánica' },
  { valor: 'electrica', etiqueta: 'Electricidad' },
  { valor: 'programacion', etiqueta: 'Electrónica / programación' },
  { valor: 'chapa', etiqueta: 'Chapa y pintura' },
  { valor: 'mantenimiento', etiqueta: 'Mantenimiento / aceite' },
  { valor: 'agricola', etiqueta: 'Agrícola / tractor' },
  { valor: 'neumaticos', etiqueta: 'Ruedas / frenos' },
  { valor: 'llave', etiqueta: 'Llave inglesa (genérico)' }
];

@Component({
  selector: 'app-icono-servicio',
  template: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      @switch (icono()) {
        @case ('motor') {
          <path d="M5 9h3V7h6v2h2l2 2h2v6h-2l-2 2H9l-2-2H5z" /><path d="M2 12h3M10 12h4M12 10v4" />
        }
        @case ('electrica') {
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        }
        @case ('programacion') {
          <rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" />
          <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
        }
        @case ('chapa') {
          <path d="M3 15v-3l2-5h9l4 5h2a1 1 0 0 1 1 1v2z" /><circle cx="7" cy="16" r="2" /><circle cx="17" cy="16" r="2" />
          <path d="M19 3.5c0 1-.8 1.8-1.8 1.8S15.5 4.5 15.5 3.5" />
        }
        @case ('mantenimiento') {
          <path d="M12 3s-6 7-6 11a6 6 0 0 0 12 0c0-4-6-11-6-11z" /><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5" />
        }
        @case ('agricola') {
          <circle cx="7.5" cy="15.5" r="4.5" /><circle cx="7.5" cy="15.5" r="1.5" /><circle cx="18.5" cy="17.5" r="2.5" />
          <path d="M5 11V5h6l2 6h6l1.5 4M12 15.5h4" />
        }
        @case ('neumaticos') {
          <circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v5M12 16v5M3 12h5M16 12h5" />
        }
        @default {
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
        }
      }
    </svg>
  `,
  styles: `
    :host { display: inline-flex; }
    svg { width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
  `
})
export class IconoServicio {
  readonly icono = input<string>('llave');
}
