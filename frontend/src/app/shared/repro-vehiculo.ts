import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { ReproListItem } from '../core/models';

/** Reprogramaciones (biblioteca REPRO de SharePoint) vinculadas a un vehículo. No se muestra si no hay ninguna. */
@Component({
  selector: 'app-repro-vehiculo',
  imports: [RouterLink, DatePipe],
  template: `
    @if (lista().length) {
      <section class="card">
        <h2>Reprogramaciones</h2>
        @for (r of lista(); track r.id) {
          <div class="fila">
            <a [routerLink]="['/gestion/diagnostico/repro', r.id]">💾 {{ r.nombre }}</a>
            <span class="hint">{{ r.fecha | date: 'dd/MM/yyyy' }} · {{ r.archivos }} archivos</span>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .fila { display: flex; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; padding: 0.3rem 0; border-top: 1px solid var(--border); }
    .fila:first-of-type { border-top: 0; }
  `
})
export class ReproVehiculo implements OnInit {
  private readonly api = inject(Api);
  readonly vehiculoId = input.required<number>();
  protected readonly lista = signal<ReproListItem[]>([]);

  ngOnInit() {
    this.api.reprogramacionesDeVehiculo(this.vehiculoId()).subscribe({ next: l => this.lista.set(l), error: () => {} });
  }
}
