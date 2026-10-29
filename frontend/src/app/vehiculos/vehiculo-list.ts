import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { VehiculoListItem } from '../core/models';
import { EtiquetaPipe, IdentificacionPipe } from '../shared/pipes';

@Component({
  selector: 'app-vehiculo-list',
  imports: [RouterLink, EtiquetaPipe, IdentificacionPipe],
  template: `
    <div class="page-header">
      <h1>Vehículos</h1>
      <a class="btn primary" routerLink="/gestion/vehiculos/nuevo">+ Nuevo vehículo</a>
    </div>

    <div class="toolbar">
      <input type="search" placeholder="Matrícula, bastidor, marca o cliente…" (input)="buscar($any($event.target).value)" />
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr>
            <th>Matrícula / bastidor</th>
            <th>Tipo</th>
            <th>Vehículo</th>
            <th>Año</th>
            <th>Cliente</th>
          </tr>
        </thead>
        <tbody>
          @for (v of vehiculos(); track v.id) {
            <tr class="clickable" (click)="router.navigate(['/gestion/vehiculos', v.id])">
              <td class="mono">{{ v | identificacion }}</td>
              <td>{{ v.tipo | etiqueta: 'vehiculo' }}</td>
              <td>{{ v.marca }} {{ v.modelo }}</td>
              <td>{{ v.anio }}</td>
              <td><a [routerLink]="['/gestion/clientes', v.clienteId]" (click)="$event.stopPropagation()">{{ v.clienteNombre }}</a></td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">{{ cargando() ? 'Cargando…' : 'No hay vehículos.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class VehiculoList {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);

  protected readonly vehiculos = signal<VehiculoListItem[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
  }

  protected buscar(q: string) {
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(q), 250);
  }

  private cargar(q?: string) {
    this.api.vehiculos({ q }).subscribe({
      next: lista => {
        this.vehiculos.set(lista);
        this.cargando.set(false);
        this.error.set(null);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
