import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { ESTADOS_ORDEN, opciones } from '../core/etiquetas';
import { EstadoOrden, OrdenListItem } from '../core/models';
import { EstadoBadge } from '../shared/estado-badge';
import { PagoBadge } from '../shared/pago-badge';
import { EtiquetaPipe, NumOrdenPipe } from '../shared/pipes';

/** 'abiertas' = todo lo que no está entregado ni cancelado; '' = todas. */
type Filtro = EstadoOrden | 'abiertas' | 'sin-cobrar' | '';

@Component({
  selector: 'app-orden-list',
  imports: [RouterLink, DatePipe, CurrencyPipe, EtiquetaPipe, NumOrdenPipe, EstadoBadge, PagoBadge],
  template: `
    <div class="page-header">
      <h1>Órdenes de trabajo</h1>
      <a class="btn primary" routerLink="/gestion/ordenes/nueva">+ Nueva orden</a>
    </div>

    <div class="toolbar">
      <input type="search" placeholder="Matrícula, cliente, marca o motivo…" (input)="buscar($any($event.target).value)" />
      <div class="chips">
        <button type="button" [class.active]="filtro() === 'abiertas'" (click)="filtrar('abiertas')">En taller</button>
        @for (e of estados; track e.valor) {
          <button type="button" [class.active]="filtro() === e.valor" (click)="filtrar(e.valor)">{{ e.etiqueta }}</button>
        }
        <button type="button" [class.active]="filtro() === 'sin-cobrar'" (click)="filtrar('sin-cobrar')">Sin cobrar</button>
        <button type="button" [class.active]="filtro() === ''" (click)="filtrar('')">Todas</button>
      </div>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr>
            <th>Nº</th>
            <th>Entrada</th>
            <th>Vehículo</th>
            <th>Cliente</th>
            <th>Servicios</th>
            <th>Estado</th>
            <th>Pago</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>
          @for (o of ordenes(); track o.id) {
            <tr class="clickable" (click)="router.navigate(['/gestion/ordenes', o.id])">
              <td class="mono">{{ o.id | numOrden }}</td>
              <td>
                {{ o.fechaEntrada | date: 'dd/MM/yyyy' }}
                @if (o.fechaPrevista) {
                  <div class="hint">Prevista {{ o.fechaPrevista | date: 'dd/MM' }}</div>
                }
              </td>
              <td>
                <span class="mono">{{ o.matricula ?? 'Sin matrícula' }}</span>
                <div class="hint">{{ o.vehiculo }}</div>
              </td>
              <td>{{ o.clienteNombre }}</td>
              <td>{{ o.servicios | etiqueta: 'servicio' }}</td>
              <td><app-estado-badge [estado]="o.estado" /></td>
              <td>@if (o.estado !== 'Cancelado') {<app-pago-badge [pagado]="o.pagado" />}</td>
              <td class="num">{{ o.total | currency: 'EUR' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">{{ cargando() ? 'Cargando…' : 'No hay órdenes.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class OrdenList {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);

  protected readonly estados = opciones(ESTADOS_ORDEN);
  protected readonly ordenes = signal<OrdenListItem[]>([]);
  protected readonly filtro = signal<Filtro>('abiertas');
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  private q = '';
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
  }

  protected filtrar(f: Filtro) {
    this.filtro.set(f);
    this.cargar();
  }

  protected buscar(q: string) {
    this.q = q;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  private cargar() {
    const f = this.filtro();
    this.api.ordenes({
      q: this.q,
      abiertas: f === 'abiertas' || undefined,
      pagado: f === 'sin-cobrar' ? false : undefined,
      estado: f === 'abiertas' || f === 'sin-cobrar' ? '' : f
    }).subscribe({
      next: lista => {
        this.ordenes.set(lista);
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
