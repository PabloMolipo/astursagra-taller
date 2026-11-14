import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { tamanoLegible } from '../core/binario';
import { CentralitaListItem, TipoCentralita, VehiculoListItem } from '../core/models';

/** Pestañas del área: la ruta usa el nombre en minúsculas y la API el tipo. */
export const SECCIONES: { ruta: string; tipo: TipoCentralita; titulo: string; disponible: boolean }[] = [
  { ruta: 'motor', tipo: 'Motor', titulo: 'Motor', disponible: true },
  { ruta: 'cambio', tipo: 'Cambio', titulo: 'Cambio', disponible: false },
  { ruta: 'abs', tipo: 'Abs', titulo: 'ABS / ESP', disponible: false },
  { ruta: 'luces', tipo: 'Luces', titulo: 'Luces', disponible: false },
  { ruta: 'airbag', tipo: 'Airbag', titulo: 'Airbag', disponible: false },
  { ruta: 'confort', tipo: 'Confort', titulo: 'Confort / BSI', disponible: false },
  { ruta: 'otras', tipo: 'Otra', titulo: 'Otras', disponible: false }
];

export const seccion = (ruta: string) => SECCIONES.find(s => s.ruta === ruta) ?? SECCIONES[0];

/** Gestión → Centralitas: lecturas de motor, cambio, ABS, luces… */
@Component({
  selector: 'app-centralitas',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page-header">
      <div>
        <h1>Centralitas</h1>
        <div class="subtitle">Lecturas de centralitas: identificación, mapas y sus datos.</div>
      </div>
    </div>
    <nav class="pestanas" aria-label="Tipos de centralita">
      @for (s of SECCIONES; track s.ruta) {
        <a [routerLink]="['/gestion/centralitas', s.ruta]" routerLinkActive="active">{{ s.titulo }}</a>
      }
      <a routerLink="/gestion/centralitas/biblioteca" routerLinkActive="active" class="biblioteca">📚 Biblioteca</a>
    </nav>
    <router-outlet />
  `,
  styles: `
    .pestanas { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
    .pestanas a { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); padding: 0.4rem 1rem; color: var(--text); text-decoration: none; }
    .pestanas a.biblioteca { margin-left: auto; }
    .pestanas a.active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  `
})
export class Centralitas {
  protected readonly SECCIONES = SECCIONES;
}

/** Lecturas de un tipo de centralita, con la subida de una nueva. */
@Component({
  selector: 'app-centralitas-lista',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    @if (!seccion().disponible) {
      <section class="card">
        <h2 style="margin-top: 0">{{ seccion().titulo }}</h2>
        <p class="hint" style="margin: 0">Esta sección está en construcción. De momento solo está disponible <a routerLink="/gestion/centralitas/motor">Motor</a>.</p>
      </section>
    } @else {
      <section class="card">
        <h2 style="margin-top: 0">Subir lectura</h2>
        <p class="hint" style="margin-top: 0">
          Binario de la lectura (.bin, .ori…), de hasta 32 MB. Se identifica la centralita (familia y números de hardware y software)
          y se buscan los mapas; sin archivo de definición salen con un nombre provisional y valores en bruto.
        </p>
        <div class="subida">
          <input type="file" (change)="elegir($any($event.target).files?.[0] ?? null)" [disabled]="subiendo()" aria-label="Archivo de la lectura" />
          <div class="vehiculo">
            @if (vehiculo(); as v) {
              <span>Vehículo: <strong>{{ v.marca }} {{ v.modelo }}</strong> <span class="mono hint">{{ v.matricula ?? v.bastidor }}</span></span>
              <button type="button" class="btn small" (click)="vehiculo.set(null)">Quitar</button>
            } @else {
              <input type="search" placeholder="Vehículo (opcional): matrícula, bastidor o cliente" [ngModel]="qVehiculo" (ngModelChange)="buscarVehiculo($event)" aria-label="Buscar vehículo" />
              @if (vehiculos().length) {
                <div class="resultados">
                  @for (v of vehiculos(); track v.id) {
                    <button type="button" (click)="elegirVehiculo(v)">{{ v.marca }} {{ v.modelo }} · <span class="mono">{{ v.matricula ?? v.bastidor }}</span> · {{ v.clienteNombre }}</button>
                  }
                </div>
              }
            }
          </div>
          <button type="button" class="btn primary" (click)="subir()" [disabled]="!archivo() || subiendo()">
            {{ subiendo() ? (progreso() < 100 ? 'Subiendo ' + progreso() + ' %' : 'Analizando…') : 'Subir y analizar' }}
          </button>
        </div>
      </section>

      <div class="toolbar">
        <input type="search" placeholder="Buscar: EDC17, 0281…, 1037…, matrícula, modelo…" [ngModel]="q()" (ngModelChange)="buscar($event)" style="min-width: 300px" />
      </div>
      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
      <div class="card table-wrap">
        <table>
          <thead><tr><th>Lectura</th><th>Familia</th><th>Hardware</th><th>Software</th><th>Vehículo</th><th class="num">Mapas</th><th class="num">Tamaño</th><th>Subida</th></tr></thead>
          <tbody>
            @for (c of lista(); track c.id) {
              <tr>
                <td><a [routerLink]="['/gestion/centralitas', seccion().ruta, c.id]">{{ c.nombre }}</a><div class="hint">{{ c.nombreArchivo }}</div></td>
                <td>{{ c.familia ?? '—' }}</td>
                <td class="mono">{{ c.hardware ?? '—' }}</td>
                <td class="mono">{{ c.software ?? '—' }}</td>
                <td>
                  @if (c.vehiculoId) {
                    <a [routerLink]="['/gestion/vehiculos', c.vehiculoId]">{{ c.vehiculo }}</a> <span class="mono hint">{{ c.matricula }}</span>
                  } @else {
                    <span class="hint">—</span>
                  }
                </td>
                <td class="num">{{ c.mapas }}</td>
                <td class="num">{{ tamanoLegible(c.tamano) }}</td>
                <td>{{ c.fechaAlta | date: 'dd/MM/yyyy' }}</td>
              </tr>
            } @empty {
              <tr><td colspan="8" class="empty">{{ cargando() ? 'Cargando…' : 'Aún no hay lecturas. Sube la primera arriba.' }}</td></tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    .subida { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-start; }
    .vehiculo { flex: 1; min-width: 260px; display: flex; flex-direction: column; gap: 0.3rem; }
    .vehiculo > span { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
    .resultados { display: flex; flex-direction: column; gap: 0.25rem; }
    .resultados button { text-align: left; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 0.35rem 0.6rem; cursor: pointer; font: inherit; color: var(--text); }
    .resultados button:hover { border-color: var(--primary); }
  `
})
export class CentralitasLista {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly tipo = input.required<string>();

  protected readonly tamanoLegible = tamanoLegible;
  protected readonly seccion = computed(() => seccion(this.tipo()));
  protected readonly lista = signal<CentralitaListItem[]>([]);
  protected readonly q = signal('');
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly archivo = signal<File | null>(null);
  protected readonly subiendo = signal(false);
  protected readonly progreso = signal(0);
  protected readonly vehiculo = signal<VehiculoListItem | null>(null);
  protected readonly vehiculos = signal<VehiculoListItem[]>([]);
  protected qVehiculo = '';
  private temporizador?: ReturnType<typeof setTimeout>;
  private temporizadorVehiculo?: ReturnType<typeof setTimeout>;

  constructor() {
    // Al cambiar de pestaña se reutiliza el componente: se recarga la lista del tipo nuevo.
    effect(() => {
      this.tipo();
      untracked(() => this.cargar());
    });
  }

  protected buscar(q: string) {
    this.q.set(q);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  protected elegir(archivo: File | null) {
    this.archivo.set(archivo);
  }

  protected buscarVehiculo(q: string) {
    this.qVehiculo = q;
    clearTimeout(this.temporizadorVehiculo);
    if (!q.trim()) {
      this.vehiculos.set([]);
      return;
    }
    this.temporizadorVehiculo = setTimeout(() => this.api.vehiculos({ q }).subscribe({ next: l => this.vehiculos.set(l.slice(0, 8)), error: () => {} }), 250);
  }

  protected elegirVehiculo(v: VehiculoListItem) {
    this.vehiculo.set(v);
    this.vehiculos.set([]);
    this.qVehiculo = '';
  }

  protected subir() {
    const archivo = this.archivo();
    if (!archivo) return;
    this.error.set(null);
    this.subiendo.set(true);
    this.progreso.set(0);
    this.api.subirCentralita(archivo, this.seccion().tipo, this.vehiculo()?.id ?? null).subscribe({
      next: e => {
        if (e.type === HttpEventType.UploadProgress && e.total) {
          this.progreso.set(Math.round((e.loaded / e.total) * 100));
        } else if (e.type === HttpEventType.Response && e.body) {
          this.subiendo.set(false);
          this.router.navigate(['/gestion/centralitas', this.seccion().ruta, e.body.id]);
        }
      },
      error: e => {
        this.subiendo.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  private cargar() {
    const s = this.seccion();
    if (!s.disponible) return;
    this.cargando.set(true);
    this.api.centralitas({ tipo: s.tipo, q: this.q().trim() || undefined }).subscribe({
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
}
