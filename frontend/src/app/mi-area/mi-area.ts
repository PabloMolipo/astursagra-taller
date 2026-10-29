import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { Auth } from '../core/auth';
import { terminarVistaCliente, vistaClienteId } from '../core/vista-cliente';
import { usaHoras } from '../core/etiquetas';
import { EstadoOrden, PortalOrdenDetalle, PortalVehiculo, PortalVehiculoDetalle, PortalVehiculoResumen } from '../core/models';
import { EstadoBadge } from '../shared/estado-badge';
import { PagoBadge } from '../shared/pago-badge';
import { VisorMultimedia } from '../shared/visor-multimedia';
import { MenuUsuario } from '../shared/menu-usuario';
import { EtiquetaPipe, IdentificacionPipe, NumOrdenPipe } from '../shared/pipes';
import { Vehiculo360Cliente } from './vehiculo-360-cliente';

/** Marco del área de clientes. */
@Component({
  selector: 'app-mi-area-layout',
  imports: [RouterOutlet, RouterLink, MenuUsuario],
  host: { class: 'marco' },
  template: `
    <header class="marco-header">
      <a class="marca" routerLink="/mi-area" aria-label="AsturSagra, mi área">
        <img src="brand/astursagra-simbolo-lima.svg" alt="" width="36" height="36" />
        <span class="nombre"><span class="astur">Astur</span><span class="sagra">Sagra</span></span>
      </a>
      <nav class="marco-nav">
        <a routerLink="/mi-area" class="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16v-4l2-5h14l2 5v4z" /><path d="M3 12h18" /><circle cx="7.5" cy="16.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></svg>
          Mis vehículos
        </a>
      </nav>
      <div class="marco-derecha"><app-menu-usuario /></div>
    </header>

    @if (vistaPrevia()) {
      <div class="vista-previa" role="status">
        <span>👁 Vista previa del área de cliente de <strong>{{ cliente()?.nombre ?? '…' }}</strong> · así lo ve el cliente (solo lectura)</span>
        <button type="button" class="btn small" (click)="salirVista()">Salir de la vista previa</button>
      </div>
    }

    <section class="hero" aria-hidden="true">
      <div class="hero-texto">
        <p class="lema">Hola, {{ nombre() }}</p>
        <p class="servicios">Aquí tienes tus vehículos y el historial de lo que les hemos hecho.</p>
      </div>
    </section>

    <main class="marco-main">
      <router-outlet />
    </main>
  `,
  styles: `
    .vista-previa { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: center; padding: 0.55rem 1rem; background: #ffb020; color: #1a1300; font-size: 0.9rem; position: relative; z-index: 5; }
    .vista-previa .btn { background: #1a1300; color: #ffb020; border-color: #1a1300; }
  `
})
export class MiAreaLayout {
  private readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  /** El taller viendo el área de un cliente (desde su ficha). */
  protected readonly vistaPrevia = computed(() => this.auth.sesion()?.rol === 'Taller');
  protected readonly cliente = signal<{ id: number; nombre: string } | null>(null);
  /** Solo el nombre de pila en el saludo (el del cliente, también en la vista previa). */
  protected readonly nombre = computed(() =>
    ((this.vistaPrevia() ? this.cliente()?.nombre : this.auth.sesion()?.nombre) ?? '').split(' ')[0]);

  constructor() {
    if (this.vistaPrevia()) {
      this.api.miCliente().subscribe({ next: c => this.cliente.set(c), error: () => this.salirVista() });
    }
  }

  protected salirVista() {
    const id = vistaClienteId();
    terminarVistaCliente();
    this.router.navigate(id ? ['/gestion/clientes', id] : ['/gestion/clientes']);
  }
}

@Component({
  selector: 'app-mis-vehiculos',
  imports: [RouterLink, DatePipe, EtiquetaPipe, IdentificacionPipe, EstadoBadge],
  styleUrl: './mi-area.scss',
  template: `
    <div class="page-header"><h1>Mis vehículos</h1></div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="tarjetas">
      @for (v of vehiculos(); track v.id) {
        <a class="tarjeta-vehiculo" [routerLink]="['/mi-area/vehiculos', v.id]">
          <div class="cab">
            <div>
              <h2>{{ v.marca }} {{ v.modelo }}</h2>
              <span class="mono">{{ v | identificacion }}</span> · {{ v.tipo | etiqueta: 'vehiculo' }}{{ v.anio ? ' · ' + v.anio : '' }}
            </div>
          </div>
          @if (v.ultimaIntervencion; as u) {
            <div class="ultima">
              <span class="hint">Última visita · {{ u.fechaEntrada | date: 'dd/MM/yyyy' }}</span>
              <span class="motivo">{{ u.motivoEntrada }}</span>
              <app-estado-badge [estado]="u.estado" />
            </div>
          }
          <span class="pie">{{ v.numIntervenciones }} {{ v.numIntervenciones === 1 ? 'intervención' : 'intervenciones' }} · Ver historial →</span>
        </a>
      } @empty {
        <div class="card empty">{{ cargando() ? 'Cargando…' : 'Todavía no hay vehículos asociados a tu cuenta.' }}</div>
      }
    </div>
  `
})
export class MisVehiculos {
  protected readonly vehiculos = signal<PortalVehiculo[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(Api).misVehiculos().subscribe({
      next: v => {
        this.vehiculos.set(v);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}

@Component({
  selector: 'app-mi-vehiculo',
  imports: [RouterLink, DatePipe, CurrencyPipe, DecimalPipe, EtiquetaPipe, IdentificacionPipe, NumOrdenPipe, EstadoBadge, PagoBadge, Vehiculo360Cliente],
  styleUrl: './mi-area.scss',
  template: `
    @if (detalle(); as d) {
      <div class="page-header">
        <div>
          <h1>{{ d.vehiculo.marca }} {{ d.vehiculo.modelo }}</h1>
          <div class="subtitle">
            <span class="mono">{{ d.vehiculo | identificacion }}</span> · {{ d.vehiculo.tipo | etiqueta: 'vehiculo' }}
            @if (d.vehiculo.anio) { · {{ d.vehiculo.anio }} }
            @if (usaHoras(d.vehiculo.tipo) ? d.vehiculo.horas : d.vehiculo.kilometros; as uso) {
              · {{ uso | number: '1.0-0' }} {{ usaHoras(d.vehiculo.tipo) ? 'h' : 'km' }}
            }
          </div>
        </div>
        <a class="btn" routerLink="/mi-area">← Mis vehículos</a>
      </div>

      @if (resumen(); as r) {
        <section class="card vision-360">
          <app-vehiculo-360-cliente [vehiculo]="d.vehiculo" [resumen]="r" />
        </section>
      }

      <h2 class="titulo-intervenciones">Intervenciones</h2>
      <section class="card" style="padding: 0">
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Nº</th><th>Entrada</th><th>Trabajo</th><th>Estado</th><th class="num">Importe</th></tr>
            </thead>
            <tbody>
              @for (o of d.ordenes; track o.id) {
                <tr class="clickable" (click)="abrir(o.id)">
                  <td class="mono"><a [routerLink]="['/mi-area/ordenes', o.id]" (click)="$event.stopPropagation()">{{ o.id | numOrden }}</a></td>
                  <td>{{ o.fechaEntrada | date: 'dd/MM/yyyy' }}</td>
                  <td>
                    {{ o.motivoEntrada }}
                    <div class="hint">{{ o.servicios | etiqueta: 'servicio' }}</div>
                  </td>
                  <td><app-estado-badge [estado]="o.estado" /></td>
                  <td class="num">
                    {{ o.total ? (o.total | currency: 'EUR') : '—' }}
                    @if (o.total && o.estado !== 'Cancelado') {
                      <div><app-pago-badge [pagado]="o.pagado" texto="Pendiente de pago" /></div>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">Este vehículo todavía no tiene intervenciones.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else {
      <p class="empty">Cargando…</p>
    }
  `
})
export class MiVehiculo implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly detalle = signal<PortalVehiculoDetalle | null>(null);
  protected readonly resumen = signal<PortalVehiculoResumen | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly usaHoras = usaHoras;

  ngOnInit() {
    this.api.miVehiculo(this.id()).subscribe({
      next: d => this.detalle.set(d),
      error: e => this.error.set(mensajeError(e))
    });
    // La visión 360 es un extra: si falla, la página sigue mostrando las intervenciones.
    this.api.miResumenVehiculo(this.id()).subscribe({ next: r => this.resumen.set(r), error: () => {} });
  }

  protected abrir(id: number) {
    this.router.navigate(['/mi-area/ordenes', id]);
  }
}

/** Pasos que ve el cliente. "Cancelado" se muestra aparte. */
const PASOS: { estado: EstadoOrden; texto: string }[] = [
  { estado: 'Recibido', texto: 'Recibido' },
  { estado: 'EnDiagnostico', texto: 'Diagnóstico' },
  { estado: 'Presupuestado', texto: 'Presupuesto' },
  { estado: 'EnReparacion', texto: 'Reparación' },
  { estado: 'Listo', texto: 'Listo para recoger' },
  { estado: 'Entregado', texto: 'Entregado' }
];

@Component({
  selector: 'app-mi-orden',
  imports: [RouterLink, DatePipe, CurrencyPipe, DecimalPipe, EtiquetaPipe, IdentificacionPipe, NumOrdenPipe, EstadoBadge, PagoBadge, VisorMultimedia],
  styleUrl: './mi-area.scss',
  template: `
    @if (orden(); as o) {
      <div class="page-header">
        <div>
          <h1>
            <span class="mono">{{ o.id | numOrden }}</span> <app-estado-badge [estado]="o.estado" />
            @if (o.totales.total && o.estado !== 'Cancelado') {
              <app-pago-badge [pagado]="o.pagado" texto="Pendiente de pago" />
            }
          </h1>
          <div class="subtitle">
            {{ o.vehiculo.marca }} {{ o.vehiculo.modelo }} · <span class="mono">{{ o.vehiculo | identificacion }}</span>
          </div>
        </div>
        <a class="btn" [routerLink]="['/mi-area/vehiculos', o.vehiculo.id]">← Historial del vehículo</a>
      </div>

      @if (o.estado === 'Cancelado') {
        <div class="aviso">Esta intervención se canceló.</div>
      } @else {
        <ol class="progreso" aria-label="Estado de la reparación">
          @for (p of pasos; track p.estado; let i = $index) {
            <li [class.hecho]="i < pasoActual()" [class.actual]="i === pasoActual()" [attr.aria-current]="i === pasoActual() ? 'step' : null">
              <span class="punto">{{ i < pasoActual() ? '✓' : i + 1 }}</span>
              <span class="texto">{{ p.texto }}</span>
            </li>
          }
        </ol>
      }

      <section class="card">
        <dl class="datos">
          <div><dt>Entrada</dt><dd>{{ o.fechaEntrada | date: 'dd/MM/yyyy' }}</dd></div>
          @if (o.fechaPrevista && !o.fechaSalida) {
            <div><dt>Entrega prevista</dt><dd>{{ o.fechaPrevista | date: 'dd/MM/yyyy' }}</dd></div>
          }
          @if (o.fechaSalida) {
            <div><dt>Entregado</dt><dd>{{ o.fechaSalida | date: 'dd/MM/yyyy' }}</dd></div>
          }
          @if (o.kilometrosEntrada) {
            <div><dt>Kilómetros</dt><dd>{{ o.kilometrosEntrada | number: '1.0-0' }} km</dd></div>
          }
          @if (o.horasEntrada) {
            <div><dt>Horas de uso</dt><dd>{{ o.horasEntrada | number: '1.0-0' }} h</dd></div>
          }
          <div><dt>Servicios</dt><dd>{{ o.servicios | etiqueta: 'servicio' }}</dd></div>
        </dl>
        <h2 style="margin-top: 1.25rem">Motivo de la visita</h2>
        <p class="texto-largo">{{ o.motivoEntrada }}</p>
        @if (o.diagnostico) {
          <h2>Diagnóstico</h2>
          <p class="texto-largo">{{ o.diagnostico }}</p>
        }
      </section>

      @if (o.diagnosis; as d) {
        <section class="card diagnosis">
          <h2>Diagnosis del vehículo</h2>
          <p class="hint" style="margin-top: 0">Lo que hemos leído, medido y comprobado · actualizado el {{ d.fecha | date: 'dd/MM/yyyy' }}</p>
          @if (d.sintomas) {
            <h3>Síntomas</h3>
            <p class="texto-largo">{{ d.sintomas }}</p>
          }
          @if (d.codigos.length) {
            <h3>Códigos de avería</h3>
            <ul class="codigos">
              @for (c of d.codigos; track $index) {
                <li [class]="'codigo estado-' + c.estado">
                  <span class="mono cod">{{ c.codigo }}</span>
                  <span class="desc">{{ c.descripcion ?? 'Sin descripción' }}</span>
                  <span class="etiqueta">{{ estadosCodigo[c.estado] }}</span>
                </li>
              }
            </ul>
          }
          @if (d.mediciones.length) {
            <h3>Mediciones</h3>
            <ul class="mediciones">
              @for (x of d.mediciones; track $index) {
                <li>
                  <span class="param">{{ x.parametro }}</span>
                  <span class="valores">
                    <span class="mono">{{ x.valor }}{{ x.unidad ? ' ' + x.unidad : '' }}</span>
                    @if (x.valorEsperado) {
                      <span class="hint">esperado <span class="mono">{{ x.valorEsperado }}</span></span>
                    }
                    <span [class]="'resultado res-' + x.resultado">{{ resultados[x.resultado] }}</span>
                  </span>
                </li>
              }
            </ul>
          }
          @if (d.pruebas.length) {
            <h3>Pruebas realizadas</h3>
            <ul class="pruebas">
              @for (p of d.pruebas; track $index) {
                <li><strong>{{ p.descripcion }}</strong>@if (p.resultado) {<span> — {{ p.resultado }}</span>}</li>
              }
            </ul>
          }
          @if (d.conclusion) {
            <h3>Conclusión</h3>
            <p class="texto-largo conclusion">{{ d.conclusion }}</p>
          }
        </section>
      }

      @if (o.multimedia.length) {
        <section class="card">
          <h2>Fotos y vídeos</h2>
          <app-visor-multimedia [elementos]="o.multimedia" />
        </section>
      }

      @if (o.documentos?.length) {
        <section class="card">
          <h2>Documentos</h2>
          <ul class="documentos">
            @for (d of o.documentos; track d.id) {
              <li>
                <a [href]="d.url" target="_blank" rel="noopener">
                  <span class="icono-doc" aria-hidden="true">{{ d.tipoContenido === 'application/pdf' ? 'PDF' : 'IMG' }}</span>
                  <span class="nombre-doc">{{ d.nombre }}</span>
                </a>
                <span class="hint">{{ d.fecha | date: 'dd/MM/yyyy' }} · {{ d.tamano / 1024 | number: '1.0-0' }} KB</span>
              </li>
            }
          </ul>
        </section>
      }

      @if (o.lineas.length) {
        <section class="card">
          <h2>Trabajos y piezas</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th><th class="num">Dto.</th><th class="num">Importe</th></tr>
              </thead>
              <tbody>
                @for (l of o.lineas; track $index) {
                  <tr>
                    <td>
                      {{ l.descripcion }}
                      <div class="hint">{{ l.tipo | etiqueta: 'linea' }}{{ l.referencia ? ' · Ref. ' + l.referencia : '' }}</div>
                    </td>
                    <td class="num">{{ l.cantidad | number: '1.0-2' }}</td>
                    <td class="num">{{ l.precioUnitario | currency: 'EUR' }}</td>
                    <td class="num">{{ l.descuentoPorcentaje ? (l.descuentoPorcentaje | number: '1.0-2') + ' %' : '' }}</td>
                    <td class="num">{{ l.baseImponible | currency: 'EUR' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><td colspan="4" class="num">Base imponible</td><td class="num">{{ o.totales.baseImponible | currency: 'EUR' }}</td></tr>
                <tr><td colspan="4" class="num">IVA</td><td class="num">{{ o.totales.iva | currency: 'EUR' }}</td></tr>
                <tr><td colspan="4" class="num">Total</td><td class="num">{{ o.totales.total | currency: 'EUR' }}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>
      }
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else {
      <p class="empty">Cargando…</p>
    }
  `
})
export class MiOrden implements OnInit {
  /** Estados de los códigos y resultados de las mediciones, en palabras del cliente. */
  protected readonly estadosCodigo: Record<string, string> = {
    Activo: 'Activo', Pendiente: 'Intermitente', Permanente: 'Permanente', Historico: 'Resuelto'
  };
  protected readonly resultados: Record<string, string> = {
    SinValorar: '—', Correcto: 'Correcto', FueraDeRango: 'Fuera de rango'
  };

  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });
  protected readonly orden = signal<PortalOrdenDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly pasos = PASOS;
  protected readonly pasoActual = computed(() => PASOS.findIndex(p => p.estado === this.orden()?.estado));

  ngOnInit() {
    this.api.miOrden(this.id()).subscribe({
      next: o => this.orden.set(o),
      error: e => this.error.set(mensajeError(e))
    });
  }
}
