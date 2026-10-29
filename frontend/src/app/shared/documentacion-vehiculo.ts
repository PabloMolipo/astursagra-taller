import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { DocumentacionVehiculo, DocumentoTecnicoRequest, EnlaceReferencia } from '../core/models';
import { FormDocumento } from './form-documento';
import { EtiquetaPipe } from './pipes';

/** Documentación técnica compatible con un vehículo, sus accesos a portales y los catálogos de despieces. Se usa en la ficha del vehículo y en cada orden. */
@Component({
  selector: 'app-documentacion-vehiculo',
  imports: [RouterLink, FormsModule, EtiquetaPipe, FormDocumento],
  template: `
    <section class="card">
      <div class="page-header" style="margin-bottom: 0.6rem">
        <h2 style="margin: 0">Documentación técnica</h2>
        <div class="toolbar" style="margin: 0">
          <a class="btn small" routerLink="/gestion/diagnostico/documentacion">Biblioteca</a>
          <button type="button" class="btn small" (click)="subiendo.set(!subiendo())">+ Subir para este vehículo</button>
        </div>
      </div>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }

      @if (datos(); as d) {
        @if (d.portales.length) {
          <div class="toolbar" style="margin: 0 0 0.75rem">
            @for (p of d.portales; track p.nombre) {
              <a class="btn small" [href]="p.url" target="_blank" rel="noopener">↗ {{ p.nombre }}</a>
            }
          </div>
        }
        @if (d.catalogos.length || vinalfa()) {
          <div class="despieces">
            <div class="cabecera">
              <h3>Despieces y esquemas <span class="hint">(catálogos gratuitos)</span></h3>
              @if (d.bastidor) {
                <button type="button" class="btn small" (click)="copiar(d.bastidor)" [title]="'Copiar ' + d.bastidor">📋 {{ copiado() ? 'Bastidor copiado' : 'Copiar bastidor' }}</button>
              }
            </div>
            <div class="toolbar" style="margin: 0">
              @if (vinalfa()) {
                <a class="btn small primary" [routerLink]="['/gestion/vehiculos', vehiculoId(), 'despiece']" title="Catálogo original por bastidor, dentro de la aplicación">🔧 Despiece original</a>
              }
              @for (c of d.catalogos; track c.id) {
                @if (c.url) {
                  <a class="btn small" [href]="c.url" target="_blank" rel="noopener noreferrer" [title]="c.descripcion ?? ''" (click)="d.bastidor && copiar(d.bastidor)">↗ {{ c.nombre }}</a>
                } @else {
                  <button type="button" class="btn small" disabled [title]="c.falta ?? ''">{{ c.nombre }}</button>
                }
              }
            </div>
            @if (faltaBastidor()) {
              <p class="hint" style="margin: 0.35rem 0 0">Rellena el bastidor del vehículo para abrir los catálogos directamente en su modelo.</p>
            }
            @if (buscaReferencias()) {
              <form class="referencia" (ngSubmit)="buscarReferencia()">
                <input name="referencia" [(ngModel)]="referencia" placeholder="Referencia de pieza, p. ej. 11 42 7 953 129" aria-label="Referencia de pieza" />
                <button type="submit" class="btn small" [disabled]="!referencia.trim()">Buscar referencia</button>
                @for (e of enlacesReferencia(); track e.nombre) {
                  <a class="btn small" [href]="e.url" target="_blank" rel="noopener noreferrer">↗ {{ e.nombre }}</a>
                }
              </form>
            }
            <p class="hint" style="margin: 0.35rem 0 0">Se abren en otra pestaña. Si encuentras lo que buscabas, guarda una captura o el PDF con «+ Subir para este vehículo».</p>
          </div>
        }
        @for (doc of d.documentos; track doc.id) {
          <div class="doc">
            <a [href]="'/api/documentacion/' + doc.id + '/archivo'" target="_blank" rel="noopener">{{ doc.tipoContenido === 'application/pdf' ? '📄' : '🖼️' }} {{ doc.titulo }}</a>
            <span class="hint">{{ doc.tipo | etiqueta: 'documento' }}{{ doc.sistema ? ' · ' + doc.sistema : '' }}{{ doc.motor ? ' · ' + doc.motor : '' }}</span>
          </div>
        } @empty {
          <p class="hint" style="margin: 0">No hay documentos para este vehículo{{ sinMotor() ? ' (indicar el código de motor ayuda a encontrarlos)' : '' }}.</p>
        }
      }

      @if (subiendo()) {
        <div style="margin-top: 1rem">
          <app-form-documento [inicial]="inicial()" (guardado)="subiendo.set(false); cargar()" (cancelar)="subiendo.set(false)" />
        </div>
      }
    </section>
  `,
  styles: `
    .doc { display: flex; gap: 0.75rem; align-items: baseline; flex-wrap: wrap; padding: 0.3rem 0; border-top: 1px solid var(--border); }
    .doc:first-of-type { border-top: 0; }
    .despieces { margin: 0 0 0.9rem; padding: 0.7rem 0.8rem; border: 1px dashed var(--border); border-radius: var(--radius); }
    .despieces .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: wrap; }
    .despieces h3 { margin: 0; font-size: 0.95rem; }
    .referencia { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-top: 0.6rem; }
    .referencia input { flex: 1; min-width: 200px; max-width: 320px; padding: 0.3rem 0.5rem; }
  `
})
export class DocumentacionVehiculoComponent implements OnInit {
  private readonly api = inject(Api);
  readonly vehiculoId = input.required<number>();
  /** Datos del vehículo para rellenar el formulario de subida. */
  readonly vehiculo = input<{ marca: string; modelo: string | null; motor?: string | null; anio: number | null } | null>(null);

  protected readonly datos = signal<DocumentacionVehiculo | null>(null);
  protected readonly subiendo = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly sinMotor = computed(() => !this.vehiculo()?.motor);
  protected readonly faltaBastidor = computed(() => this.datos()?.catalogos.some(c => !c.url) ?? false);
  protected readonly buscaReferencias = computed(() => this.datos()?.catalogos.some(c => c.buscaReferencias) ?? false);
  protected readonly enlacesReferencia = signal<EnlaceReferencia[]>([]);
  protected readonly copiado = signal(false);
  protected readonly vinalfa = signal(false);
  protected referencia = '';
  protected readonly inicial = computed<Partial<DocumentoTecnicoRequest>>(() => {
    const v = this.vehiculo();
    return v ? { marca: v.marca, modelo: v.modelo, motor: v.motor ?? null } : {};
  });

  ngOnInit() {
    this.cargar();
    this.api.estadoVinalfa().subscribe({ next: e => this.vinalfa.set(e.configurado), error: () => {} });
  }

  /** Los catálogos que abren por marca piden pegar el bastidor dentro: se deja copiado al abrirlos. */
  protected copiar(bastidor: string) {
    navigator.clipboard?.writeText(bastidor).then(
      () => {
        this.copiado.set(true);
        setTimeout(() => this.copiado.set(false), 2500);
      },
      () => {}
    );
  }

  protected buscarReferencia() {
    const q = this.referencia.trim();
    if (!q) return;
    this.api.buscarReferencia(q, this.vehiculoId()).subscribe({
      next: e => {
        this.enlacesReferencia.set(e);
        if (!e.length) this.error.set('Ningún catálogo de esta marca admite búsqueda por referencia.');
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected cargar() {
    this.api.documentacionVehiculo(this.vehiculoId()).subscribe({
      next: d => this.datos.set(d),
      error: e => this.error.set(mensajeError(e))
    });
  }
}
