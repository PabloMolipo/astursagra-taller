import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { tamanoLegible } from '../core/binario';
import { CentralitaListItem, TipoCentralita } from '../core/models';
import { SECCIONES } from './centralitas';

/** Lecturas de centralita de un vehículo: se suben desde su ficha y cada una abre el visor de mapas. */
@Component({
  selector: 'app-lecturas-vehiculo',
  imports: [RouterLink, DatePipe],
  template: `
    <section class="card">
      <div class="cabecera">
        <h2>Centralitas</h2>
        <label class="btn small primary" [class.disabled]="subiendo()">
          <input type="file" (change)="subir($event)" [disabled]="subiendo()" aria-label="Archivo de la lectura" />
          {{ subiendo() ? (progreso() < 100 ? 'Subiendo ' + progreso() + ' %' : 'Analizando…') : '⬆ Subir lectura' }}
        </label>
      </div>
      <p class="hint">Binario de la lectura de motor (.bin, .ori…), de hasta 32 MB. Al subirla se identifica la centralita, se buscan los mapas y se abre el visor.</p>
      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
      @if (lista().length) {
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lectura</th><th>Familia</th><th>Software</th><th class="num">Mapas</th><th class="num">Tamaño</th><th>Subida</th></tr></thead>
            <tbody>
              @for (c of lista(); track c.id) {
                <tr>
                  <td><a [routerLink]="enlace(c)">{{ c.nombre }}</a><div class="hint">{{ c.nombreArchivo }}</div></td>
                  <td>{{ c.familia ?? '—' }}</td>
                  <td class="mono">{{ c.software ?? '—' }}</td>
                  <td class="num"><a [routerLink]="enlace(c)">{{ c.mapas }}</a></td>
                  <td class="num">{{ tamanoLegible(c.tamano) }}</td>
                  <td>{{ c.fechaAlta | date: 'dd/MM/yyyy' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      } @else if (!cargando()) {
        <p class="hint" style="margin-bottom: 0">Este vehículo aún no tiene lecturas.</p>
      }
    </section>
  `,
  styles: `
    .cabecera { display: flex; gap: 0.75rem; align-items: center; justify-content: space-between; flex-wrap: wrap; }
    .cabecera h2 { margin: 0; }
    .cabecera label { position: relative; cursor: pointer; }
    .cabecera label.disabled { opacity: 0.6; pointer-events: none; }
    .cabecera input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  `
})
export class LecturasVehiculo implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly vehiculoId = input.required<number>();

  protected readonly tamanoLegible = tamanoLegible;
  protected readonly lista = signal<CentralitaListItem[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly subiendo = signal(false);
  protected readonly progreso = signal(0);

  ngOnInit() {
    this.api.centralitas({ vehiculoId: this.vehiculoId() }).subscribe({
      next: l => {
        this.lista.set(l);
        this.cargando.set(false);
      },
      error: e => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      }
    });
  }

  protected enlace(c: { id: number; tipo: TipoCentralita }) {
    return ['/gestion/centralitas', SECCIONES.find(s => s.tipo === c.tipo)?.ruta ?? 'motor', c.id];
  }

  protected subir(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.error.set(null);
    this.subiendo.set(true);
    this.progreso.set(0);
    this.api.subirCentralita(archivo, 'Motor', this.vehiculoId()).subscribe({
      next: ev => {
        if (ev.type === HttpEventType.UploadProgress && ev.total) {
          this.progreso.set(Math.round((ev.loaded / ev.total) * 100));
        } else if (ev.type === HttpEventType.Response && ev.body) {
          this.subiendo.set(false);
          this.router.navigate(this.enlace(ev.body));
        }
      },
      error: err => {
        this.subiendo.set(false);
        this.error.set(mensajeError(err));
      }
    });
  }
}
