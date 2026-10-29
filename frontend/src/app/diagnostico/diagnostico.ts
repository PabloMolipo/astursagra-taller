import { DatePipe } from '@angular/common';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { CodigoAveriaDetalle, CodigoAveriaListItem, EstadoAsistente, SesionAsistenteItem } from '../core/models';
import { EstadoBadge } from '../shared/estado-badge';
import { EtiquetaPipe, NumOrdenPipe } from '../shared/pipes';

/** Gestión → Diagnóstico: asistente, códigos de avería y lector OBD. */
@Component({
  selector: 'app-diagnostico',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page-header">
      <div>
        <h1>Diagnóstico</h1>
        <div class="subtitle">Asistente con IA, códigos de avería con los casos del taller, valores de referencia y lector OBD.</div>
      </div>
    </div>
    <nav class="pestanas" aria-label="Secciones de diagnóstico">
      <a routerLink="/gestion/diagnostico/asistente" routerLinkActive="active">Asistente IA</a>
      <a routerLink="/gestion/diagnostico/codigos" routerLinkActive="active">Códigos de avería</a>
      <a routerLink="/gestion/diagnostico/referencias" routerLinkActive="active">Valores de referencia</a>
      <a routerLink="/gestion/diagnostico/documentacion" routerLinkActive="active">Documentación</a>
      <a routerLink="/gestion/diagnostico/repro" routerLinkActive="active">Reprogramaciones</a>
      <a routerLink="/gestion/diagnostico/obd" routerLinkActive="active">Lector OBD</a>
    </nav>
    <router-outlet />
  `,
  styles: `
    .pestanas { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
    .pestanas a { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); padding: 0.4rem 1rem; color: var(--text); text-decoration: none; }
    .pestanas a.active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  `
})
export class Diagnostico {}

@Component({
  selector: 'app-asistente-lista',
  imports: [RouterLink, DatePipe, NumOrdenPipe],
  template: `
    @if (estado(); as e) {
      @if (!e.configurado) {
        <div class="aviso">
          <strong>Falta configurar el asistente.</strong> Necesita una clave de la API de Anthropic. En el servidor, ejecuta:
          <pre class="mono">dotnet user-secrets set "Anthropic:ApiKey" "sk-ant-…" --project backend/Taller.Api</pre>
          y reinicia la API. En producción, usa la variable de entorno <span class="mono">Anthropic__ApiKey</span>.
        </div>
      }
    }

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="toolbar">
      <button type="button" class="btn primary" (click)="nueva()">+ Nueva consulta</button>
      <span class="hint">Para diagnosticar con la ficha de una orden, abre la orden y pulsa «Asistente IA».</span>
    </div>

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th>Consulta</th><th>Orden</th><th>Vehículo</th><th>Última actividad</th></tr>
        </thead>
        <tbody>
          @for (s of sesiones(); track s.id) {
            <tr class="clickable" (click)="router.navigate(['/gestion/diagnostico/asistente', s.id])">
              <td><strong>{{ s.titulo }}</strong></td>
              <td>
                @if (s.ordenId) {
                  <a class="mono" [routerLink]="['/gestion/ordenes', s.ordenId]" (click)="$event.stopPropagation()">{{ s.ordenId | numOrden }}</a>
                }
              </td>
              <td>{{ s.vehiculo }}</td>
              <td>{{ s.fechaActualizacion | date: 'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="empty">{{ cargando() ? 'Cargando…' : 'Aún no hay consultas.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class AsistenteLista {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);
  protected readonly estado = signal<EstadoAsistente | null>(null);
  protected readonly sesiones = signal<SesionAsistenteItem[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    this.api.estadoAsistente().subscribe(e => this.estado.set(e));
    this.api.sesionesAsistente().subscribe({
      next: s => {
        this.sesiones.set(s);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected nueva() {
    this.api.crearSesionAsistente(null).subscribe({
      next: s => this.router.navigate(['/gestion/diagnostico/asistente', s.id]),
      error: e => this.error.set(mensajeError(e))
    });
  }
}

@Component({
  selector: 'app-codigos-lista',
  imports: [FormsModule],
  template: `
    <div class="toolbar">
      <input type="search" placeholder="Código (P0401) o palabra (turbo, EGR, lambda…)" [ngModel]="q()" (ngModelChange)="buscar($event)" style="min-width: 320px" />
      <label class="checks"><label><input type="checkbox" [ngModel]="soloCasos()" (ngModelChange)="soloCasos.set($event); cargar()" /> Solo con casos del taller</label></label>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th>Código</th><th>Descripción</th><th>Sistema</th><th class="num">Casos del taller</th></tr>
        </thead>
        <tbody>
          @for (c of codigos(); track c.codigo) {
            <tr class="clickable" (click)="router.navigate(['/gestion/diagnostico/codigos', c.codigo])">
              <td class="mono"><strong>{{ c.codigo }}</strong></td>
              <td>
                {{ c.descripcion }}
                @if (c.esPropio) { <span class="badge estado-Presupuestado">Propio</span> }
                @if (c.tieneNotas) { <span class="badge estado-EnDiagnostico">Con notas</span> }
              </td>
              <td>{{ c.sistema }}</td>
              <td class="num">{{ c.numCasos || '' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="empty">{{ cargando() ? 'Cargando…' : 'Sin resultados.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <form class="card" (ngSubmit)="crear()">
      <h2>Añadir un código propio</h2>
      <p class="hint" style="margin-top: 0">Para códigos de fabricante o los que no estén en la lista genérica. Si el código ya existe, se actualiza.</p>
      <div class="form-grid">
        <label class="field">Código *<input name="codigo" [(ngModel)]="nuevo.codigo" class="mono" placeholder="P1234" /></label>
        <label class="field" style="grid-column: span 2">Descripción *<input name="descripcion" [(ngModel)]="nuevo.descripcion" /></label>
        <label class="field">Sistema<input name="sistema" [(ngModel)]="nuevo.sistema" placeholder="Sobrealimentación" /></label>
        <label class="field full">Notas del taller<textarea name="notas" [(ngModel)]="nuevo.notas" rows="2"></textarea></label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn primary" [disabled]="!nuevo.codigo.trim() || !nuevo.descripcion.trim()">Guardar código</button>
      </div>
    </form>
  `
})
export class CodigosLista {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);
  protected readonly codigos = signal<CodigoAveriaListItem[]>([]);
  protected readonly q = signal('');
  protected readonly soloCasos = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected nuevo = { codigo: '', descripcion: '', sistema: '', notas: '' };
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
  }

  protected buscar(q: string) {
    this.q.set(q);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  protected cargar() {
    this.api.codigos(this.q(), this.soloCasos()).subscribe({
      next: c => {
        this.codigos.set(c);
        this.cargando.set(false);
        this.error.set(null);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected crear() {
    const n = this.nuevo;
    this.api.guardarCodigo(n.codigo.trim(), { descripcion: n.descripcion.trim(), sistema: n.sistema.trim() || null, notas: n.notas.trim() || null }).subscribe({
      next: c => this.router.navigate(['/gestion/diagnostico/codigos', c.codigo]),
      error: e => this.error.set(mensajeError(e))
    });
  }
}

@Component({
  selector: 'app-codigo-detalle',
  imports: [FormsModule, RouterLink, DatePipe, EtiquetaPipe, NumOrdenPipe, EstadoBadge],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (detalle(); as d) {
      <div class="toolbar"><a class="btn" routerLink="/gestion/diagnostico/codigos">← Códigos</a></div>

      <section class="card">
        <h2 style="font-size: 1.5rem"><span class="mono">{{ d.codigo }}</span> · {{ d.descripcion }}</h2>
        <dl class="datos">
          <div><dt>Sistema</dt><dd>{{ d.sistema ?? '—' }}</dd></div>
          @if (d.estructura) {
            <div><dt>Interpretación del código</dt><dd>{{ d.estructura }}</dd></div>
          }
          <div><dt>Origen</dt><dd>{{ d.esPropio ? 'Añadido por el taller' : d.enBiblioteca ? 'Genérico (SAE)' : 'No está en la biblioteca' }}</dd></div>
        </dl>

        <form (ngSubmit)="guardar(d)" style="margin-top: 1rem">
          <div class="form-grid">
            @if (!d.enBiblioteca || d.esPropio) {
              <label class="field" style="grid-column: span 2">Descripción<input name="descripcion" [(ngModel)]="descripcion" /></label>
              <label class="field">Sistema<input name="sistema" [(ngModel)]="sistema" /></label>
            }
            <label class="field full">
              Notas del taller
              <textarea name="notas" [(ngModel)]="notas" rows="3" placeholder="Causas habituales que habéis encontrado, marcas en las que se repite, trucos de comprobación…"></textarea>
            </label>
          </div>
          <div class="form-actions">
            @if (d.esPropio) {
              <button type="button" class="btn danger" style="margin-right: auto" (click)="eliminar(d)">Eliminar código</button>
            }
            <button type="submit" class="btn primary">{{ d.enBiblioteca ? 'Guardar notas' : 'Añadir a la biblioteca' }}</button>
          </div>
        </form>
      </section>

      <section class="card">
        <h2>Casos del taller con este código ({{ d.casos.length }})</h2>
        @for (c of d.casos; track c.ordenId) {
          <article class="caso">
            <div class="cab">
              <a class="mono" [routerLink]="['/gestion/ordenes', c.ordenId]">{{ c.ordenId | numOrden }}</a>
              <span>{{ c.fecha | date: 'dd/MM/yyyy' }}</span>
              <span>{{ c.tipoVehiculo | etiqueta: 'vehiculo' }} · {{ c.vehiculo }}</span>
              <app-estado-badge [estado]="c.estado" />
            </div>
            <p><strong>Motivo:</strong> {{ c.motivoEntrada }}</p>
            @if (c.conclusion || c.diagnostico) {
              <p><strong>Resultado:</strong> {{ c.conclusion ?? c.diagnostico }}</p>
            }
            @if (c.trabajos.length) {
              <p class="hint">Trabajos: {{ c.trabajos.join(' · ') }}</p>
            }
            @if (c.codigos.length > 1) {
              <p class="hint">Otros códigos: <span class="mono">{{ otros(c.codigos, d.codigo) }}</span></p>
            }
          </article>
        } @empty {
          <p class="empty">Todavía no hay órdenes con este código en su ficha de diagnosis.</p>
        }
      </section>
    }
  `,
  styles: `
    .caso { border-top: 1px solid var(--border); padding: 0.75rem 0; }
    .caso:first-of-type { border-top: 0; padding-top: 0; }
    .caso .cab { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-bottom: 0.3rem; }
    .caso p { margin: 0.2rem 0; }
  `
})
export class CodigoDetalle implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly codigo = input.required<string>();
  protected readonly detalle = signal<CodigoAveriaDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected descripcion = '';
  protected sistema = '';
  protected notas = '';

  ngOnInit() {
    this.cargar(this.codigo());
  }

  protected otros(codigos: string[], actual: string) {
    return codigos.filter(c => c !== actual).join(', ');
  }

  protected guardar(d: CodigoAveriaDetalle) {
    this.api.guardarCodigo(d.codigo, {
      descripcion: (this.descripcion || d.descripcion).trim(),
      sistema: (this.sistema || d.sistema || '').trim() || null,
      notas: this.notas.trim() || null
    }).subscribe({ next: r => this.mostrar(r), error: e => this.error.set(mensajeError(e)) });
  }

  protected eliminar(d: CodigoAveriaDetalle) {
    if (confirm(`¿Eliminar el código ${d.codigo} de la biblioteca?`)) {
      this.api.eliminarCodigo(d.codigo).subscribe({
        next: () => this.router.navigate(['/gestion/diagnostico/codigos']),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  private cargar(codigo: string) {
    this.api.codigo(codigo).subscribe({ next: d => this.mostrar(d), error: e => this.error.set(mensajeError(e)) });
  }

  private mostrar(d: CodigoAveriaDetalle) {
    this.detalle.set(d);
    this.descripcion = d.descripcion;
    this.sistema = d.sistema ?? '';
    this.notas = d.notas ?? '';
    this.error.set(null);
  }
}
