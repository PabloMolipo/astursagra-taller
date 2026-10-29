import { computed, inject, Injectable, signal } from '@angular/core';
import { Api } from '../core/api';
import { DatosTaller } from '../core/models';

/** Datos de contacto del taller, cargados una vez para cabecera, pie y páginas de la web. */
@Injectable({ providedIn: 'root' })
export class DatosPublicos {
  private readonly api = inject(Api);
  private cargado = false;

  readonly datos = signal<DatosTaller | null>(null);

  /** "600 11 22 33" → "tel:+34600112233" */
  readonly telefonoUrl = computed(() => {
    const t = soloDigitos(this.datos()?.telefono);
    return t ? `tel:+${conPrefijo(t)}` : null;
  });

  readonly whatsAppUrl = computed(() => {
    const w = soloDigitos(this.datos()?.whatsApp ?? this.datos()?.telefono);
    return w ? `https://wa.me/${conPrefijo(w)}?text=${encodeURIComponent('Hola, quería pedir cita en el taller.')}` : null;
  });

  readonly direccionCompleta = computed(() => {
    const d = this.datos();
    if (!d) {
      return null;
    }
    const lugar = [d.codigoPostal, d.poblacion].filter(Boolean).join(' ');
    return [d.direccion, lugar, d.provincia].filter(Boolean).join(', ') || null;
  });

  cargar() {
    if (this.cargado) {
      return;
    }
    this.cargado = true;
    this.api.datosPublicos().subscribe({ next: d => this.datos.set(d), error: () => (this.cargado = false) });
  }

  establecer(d: DatosTaller) {
    this.datos.set(d);
    this.cargado = true;
  }
}

function soloDigitos(t: string | null | undefined): string | null {
  const d = (t ?? '').replace(/\D/g, '');
  return d.length >= 9 ? d : null;
}

/** Los números españoles de 9 cifras se completan con el prefijo 34. */
function conPrefijo(d: string): string {
  return d.length === 9 ? `34${d}` : d.replace(/^00/, '');
}
