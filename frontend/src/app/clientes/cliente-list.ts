import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { ClienteListItem } from '../core/models';
import { EtiquetaPipe } from '../shared/pipes';

@Component({
  selector: 'app-cliente-list',
  imports: [RouterLink, EtiquetaPipe],
  template: `
    <div class="page-header">
      <h1>Clientes</h1>
      <a class="btn primary" routerLink="/gestion/clientes/nuevo">+ Nuevo cliente</a>
    </div>

    <div class="toolbar">
      <input type="search" placeholder="Buscar por nombre, NIF o teléfono…" (input)="buscar($any($event.target).value)" />
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>NIF/CIF</th>
            <th>Teléfono</th>
            <th>Población</th>
            <th class="num">Vehículos</th>
          </tr>
        </thead>
        <tbody>
          @for (c of clientes(); track c.id) {
            <tr class="clickable" (click)="router.navigate(['/gestion/clientes', c.id])">
              <td><a [routerLink]="['/gestion/clientes', c.id]" (click)="$event.stopPropagation()">{{ c.nombre }}</a></td>
              <td>{{ c.tipo | etiqueta: 'cliente' }}</td>
              <td class="mono">{{ c.nifCif }}</td>
              <td>{{ c.telefono }}</td>
              <td>{{ c.poblacion }}</td>
              <td class="num">{{ c.numVehiculos }}</td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">{{ cargando() ? 'Cargando…' : 'No hay clientes.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class ClienteList {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);

  protected readonly clientes = signal<ClienteListItem[]>([]);
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
    this.api.clientes(q).subscribe({
      next: lista => {
        this.clientes.set(lista);
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
