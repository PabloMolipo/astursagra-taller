import { HttpEventType } from '@angular/common/http';
import { Component, computed, inject, input, numberAttribute, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, fechaLocal, limpiar, mensajeError } from '../core/api';
import { usaHoras } from '../core/etiquetas';
import { OrdenCrearRequest, TipoServicio, VehiculoListItem } from '../core/models';
import { EtiquetaPipe, IdentificacionPipe } from '../shared/pipes';
import { CapturaMultimedia } from '../shared/captura-multimedia';
import { ServiciosInput } from './servicios-input';

interface Pendiente {
  id: number;
  archivo: File;
  url: string;
  estado: 'pendiente' | 'subiendo' | 'subido' | 'error';
  progreso: number;
  error: string | null;
}

@Component({
  selector: 'app-orden-nueva',
  imports: [ReactiveFormsModule, RouterLink, EtiquetaPipe, IdentificacionPipe, ServiciosInput, CapturaMultimedia],
  template: `
    <div class="page-header">
      <h1>Nueva orden de trabajo</h1>
      <a class="btn" routerLink="/gestion/ordenes">← Volver</a>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <section class="card">
      <h2>1. Vehículo</h2>
      @if (vehiculo(); as v) {
        <div class="toolbar" style="margin: 0">
          <div>
            <strong class="mono">{{ v | identificacion }}</strong> · {{ v.marca }} {{ v.modelo }}
            ({{ v.tipo | etiqueta: 'vehiculo' }})
            <div class="hint">Cliente: {{ v.clienteNombre }}</div>
          </div>
          <button type="button" class="btn small" (click)="vehiculo.set(null)">Cambiar</button>
        </div>
      } @else {
        <div class="toolbar">
          <input type="search" placeholder="Buscar por matrícula, bastidor, marca o cliente…" (input)="buscar($any($event.target).value)" />
          <a class="btn small" routerLink="/gestion/vehiculos/nuevo">+ Vehículo nuevo</a>
        </div>
        <div class="table-wrap">
          <table>
            <tbody>
              @for (v of resultados(); track v.id) {
                <tr class="clickable" (click)="vehiculo.set(v)">
                  <td class="mono">{{ v | identificacion }}</td>
                  <td>{{ v.marca }} {{ v.modelo }}</td>
                  <td>{{ v.tipo | etiqueta: 'vehiculo' }}</td>
                  <td>{{ v.clienteNombre }}</td>
                </tr>
              } @empty {
                <tr><td class="empty">Escribe para buscar un vehículo.</td></tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>

    <form class="card" [formGroup]="form" (ngSubmit)="crear()">
      <h2>2. Trabajo</h2>
      <div class="form-grid">
        <div class="field full">
          <label class="field">Servicios *</label>
          <app-servicios-input formControlName="servicios" />
        </div>
        <label class="field full">
          Motivo de entrada (lo que cuenta el cliente) *
          <textarea formControlName="motivoEntrada"></textarea>
        </label>
        @if (horas()) {
          <label class="field">
            Horas a la entrada
            <input type="number" min="0" formControlName="horasEntrada" />
          </label>
        } @else {
          <label class="field">
            Kilómetros a la entrada
            <input type="number" min="0" formControlName="kilometrosEntrada" />
          </label>
        }
        <label class="field">
          Fecha de entrada
          <input type="date" formControlName="fechaEntrada" [max]="hoy" />
        </label>
        <label class="field">
          Fecha prevista de entrega
          <input type="date" formControlName="fechaPrevista" />
        </label>
        <label class="field full">
          Observaciones
          <textarea formControlName="observaciones"></textarea>
        </label>
      </div>

      <h2 style="margin-top: 1.2rem">3. Fotos y vídeos de la recepción <span class="hint">(opcional)</span></h2>
      <p class="hint" style="margin-top: 0">Conviene fotografiar el vehículo al recibirlo (golpes y arañazos previos). Se suben al abrir la orden.</p>
      <app-captura-multimedia (archivos)="anadir($event)" />
      @if (pendientes().length) {
        <div class="pendientes">
          @for (p of pendientes(); track p.id) {
            <div class="pendiente">
              @if (p.archivo.type.startsWith('video/')) {
                <video [src]="p.url" muted playsinline preload="metadata"></video>
              } @else {
                <img [src]="p.url" alt="" />
              }
              <span class="nombre">{{ p.archivo.name }}</span>
              <span class="hint">{{ tamano(p.archivo.size) }}</span>
              @if (p.estado === 'subiendo') {
                <progress [value]="p.progreso" max="100"></progress>
              } @else if (p.estado === 'error') {
                <span class="texto-error">{{ p.error }}</span>
              } @else if (p.estado === 'subido') {
                <span class="hint">✔ Subido</span>
              }
              @if (!guardando()) {
                <button type="button" class="quitar" (click)="quitar(p.id)" aria-label="Quitar">×</button>
              }
            </div>
          }
        </div>
        <label class="checks" style="margin-top: 0.5rem"><label><input type="checkbox" [checked]="visibles()" (change)="visibles.set($any($event.target).checked)" /> Visibles para el cliente</label></label>
      }

      <div class="form-actions">
        @if (ordenCreada(); as id) {
          <a class="btn primary" [routerLink]="['/gestion/ordenes', id]">Ir a la orden</a>
        } @else {
          <button type="submit" class="btn primary" [disabled]="!vehiculo() || guardando()">
            {{ guardando() ? (subiendo() ? 'Subiendo fotos y vídeos…' : 'Abriendo…') : 'Abrir orden' }}
          </button>
        }
      </div>
    </form>
  `,
  styles: `
    .pendientes { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.6rem; margin-top: 0.8rem; }
    .pendiente { position: relative; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.8rem; }
    .pendiente img, .pendiente video { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius); border: 1px solid var(--border); background: #050505; }
    .pendiente .nombre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pendiente progress { width: 100%; }
    .quitar { position: absolute; top: 4px; right: 4px; width: 26px; height: 26px; border-radius: 50%; border: 0; background: rgba(0, 0, 0, 0.6); color: #fff; cursor: pointer; font-size: 1rem; line-height: 1; }
    .texto-error { color: var(--danger); }
  `
})
export class OrdenNueva implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** ?vehiculoId= para venir directamente desde la ficha del vehículo. */
  readonly vehiculoId = input(undefined, { transform: numberAttribute });

  protected readonly vehiculo = signal<VehiculoListItem | null>(null);
  protected readonly resultados = signal<VehiculoListItem[]>([]);
  protected readonly horas = computed(() => {
    const v = this.vehiculo();
    return v ? usaHoras(v.tipo) : false;
  });
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly hoy = fechaLocal();
  protected readonly pendientes = signal<Pendiente[]>([]);
  protected readonly visibles = signal(true);
  protected readonly subiendo = signal(false);
  /** Si alguna foto o vídeo no se pudo subir, la orden ya existe: se queda aquí para ver el motivo. */
  protected readonly ordenCreada = signal<number | null>(null);
  private siguiente = 0;
  private temporizador?: ReturnType<typeof setTimeout>;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    servicios: [[] as TipoServicio[], Validators.required],
    motivoEntrada: ['', [Validators.required, Validators.maxLength(2000)]],
    kilometrosEntrada: [null as number | null, Validators.min(0)],
    horasEntrada: [null as number | null, Validators.min(0)],
    fechaEntrada: [fechaLocal(), Validators.required],
    fechaPrevista: [''],
    observaciones: ['']
  });

  ngOnInit() {
    const id = this.vehiculoId();
    if (id) {
      this.api.vehiculo(id).subscribe({
        next: v => this.vehiculo.set(v),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  protected buscar(q: string) {
    clearTimeout(this.temporizador);
    if (!q.trim()) {
      this.resultados.set([]);
      return;
    }
    this.temporizador = setTimeout(() => {
      this.api.vehiculos({ q }).subscribe({
        next: lista => this.resultados.set(lista),
        error: e => this.error.set(mensajeError(e))
      });
    }, 250);
  }

  protected crear() {
    const vehiculo = this.vehiculo();
    if (!vehiculo) {
      this.error.set('Selecciona un vehículo.');
      return;
    }
    if (this.form.value.servicios?.length === 0) {
      this.error.set('Marca al menos un tipo de servicio.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }

    const req: OrdenCrearRequest = { ...limpiar(this.form.getRawValue()), vehiculoId: vehiculo.id };
    this.guardando.set(true);
    this.api.crearOrden(req).subscribe({
      next: async o => {
        if (await this.subirPendientes(o.id)) {
          this.router.navigate(['/gestion/ordenes', o.id]);
        } else {
          this.guardando.set(false);
          this.ordenCreada.set(o.id);
          this.error.set('La orden se ha abierto, pero algunos archivos no se han podido subir (motivo junto a cada uno). Puedes añadirlos desde la orden.');
        }
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected anadir(archivos: File[]) {
    this.pendientes.update(l => [
      ...l,
      ...archivos.map(archivo => ({ id: ++this.siguiente, archivo, url: URL.createObjectURL(archivo), estado: 'pendiente' as const, progreso: 0, error: null }))
    ]);
  }

  protected quitar(id: number) {
    const p = this.pendientes().find(x => x.id === id);
    if (p) URL.revokeObjectURL(p.url);
    this.pendientes.update(l => l.filter(x => x.id !== id));
  }

  protected tamano(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  }

  ngOnDestroy() {
    this.pendientes().forEach(p => URL.revokeObjectURL(p.url));
  }

  /** Sube las fotos y vídeos a la orden recién creada, de uno en uno. Devuelve si han ido todos bien. */
  private async subirPendientes(ordenId: number): Promise<boolean> {
    const lista = this.pendientes().filter(p => p.estado !== 'subido');
    if (!lista.length) return true;
    this.subiendo.set(true);
    const actualizar = (id: number, cambio: Partial<Pendiente>) => this.pendientes.update(l => l.map(x => (x.id === id ? { ...x, ...cambio } : x)));
    let todoBien = true;
    for (const p of lista) {
      actualizar(p.id, { estado: 'subiendo', progreso: 0, error: null });
      await new Promise<void>(fin =>
        this.api.subirMultimedia(ordenId, p.archivo, 'Recepcion', this.visibles()).subscribe({
          next: ev => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) actualizar(p.id, { progreso: Math.round((100 * ev.loaded) / ev.total) });
            else if (ev.type === HttpEventType.Response) actualizar(p.id, { estado: 'subido', progreso: 100 });
          },
          error: e => {
            todoBien = false;
            actualizar(p.id, { estado: 'error', error: mensajeError(e) });
            fin();
          },
          complete: () => fin()
        })
      );
    }
    this.subiendo.set(false);
    return todoBien;
  }
}
