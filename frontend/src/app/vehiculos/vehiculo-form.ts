import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, limpiar, mensajeError } from '../core/api';
import { COLORES_VEHICULO, opciones, TIPOS_VEHICULO, usaHoras } from '../core/etiquetas';
import { ClienteListItem, ConsultaMatricula, TipoVehiculo, VehiculoDetalle, VehiculoRequest, VehiculoResumen } from '../core/models';
import { DocumentacionVehiculoComponent } from '../shared/documentacion-vehiculo';
import { ReproVehiculo } from '../shared/repro-vehiculo';
import { EstadoBadge } from '../shared/estado-badge';
import { EtiquetaPipe, IdentificacionPipe, NumOrdenPipe } from '../shared/pipes';
import { Vehiculo360 } from './vehiculo-360';

@Component({
  selector: 'app-vehiculo-form',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, CurrencyPipe, EtiquetaPipe, IdentificacionPipe, NumOrdenPipe, EstadoBadge, DocumentacionVehiculoComponent, ReproVehiculo, Vehiculo360],
  template: `
    <div class="page-header">
      <div>
        @if (vehiculo(); as v) {
          <h1>{{ v.marca }} {{ v.modelo }} <span class="mono">· {{ v | identificacion }}</span></h1>
          <div class="subtitle">
            {{ v.tipo | etiqueta: 'vehiculo' }} de
            <a [routerLink]="['/gestion/clientes', v.clienteId]">{{ v.clienteNombre }}</a>
          </div>
        } @else {
          <h1>Nuevo vehículo</h1>
        }
      </div>
      <div class="toolbar" style="margin: 0">
        @if (vehiculo(); as v) {
          <a class="btn primary" routerLink="/gestion/ordenes/nueva" [queryParams]="{ vehiculoId: v.id }">+ Nueva orden</a>
        }
        <a class="btn" routerLink="/gestion/vehiculos">← Volver</a>
      </div>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (vehiculo(); as v) {
      @if (!v.matricula && !v.bastidor) {
        <div class="aviso">Este vehículo no tiene matrícula ni bastidor. Complétalos cuando vuelva al taller.</div>
      }
      <section class="card vision">
        @if (resumen(); as r) {
          <app-vehiculo-360 [vehiculo]="v" [resumen]="r" [documentos]="numDocumentos()" (editar)="abrirFicha()" (imagenCambiada)="cargarResumen()" (colorCambiado)="colorGuardado($event)" />
        } @else {
          <p class="hint" style="margin: 0">Cargando la visión 360…</p>
        }
      </section>

      @if (!fichaAbierta()) {
        <section class="card ficha-cerrada">
          <div>
            <h2 style="margin: 0">Datos de la ficha</h2>
            <span class="hint">Cliente, matrícula, bastidor, motor, uso y notas{{ v.notas ? ' · Nota: ' + v.notas : '' }}</span>
          </div>
          <button type="button" class="btn" (click)="abrirFicha()">✎ Editar ficha</button>
        </section>
      }
    }

    @if (!vehiculo() || fichaAbierta()) {
    <form class="card" id="ficha" [formGroup]="form" (ngSubmit)="guardar()">
      <div class="form-grid">
        <label class="field" style="grid-column: span 2">
          Cliente *
          <select formControlName="clienteId">
            <option [ngValue]="0" disabled>Selecciona un cliente…</option>
            @for (c of clientes(); track c.id) {
              <option [ngValue]="c.id">{{ c.nombre }}{{ c.nifCif ? ' · ' + c.nifCif : '' }}</option>
            }
          </select>
        </label>
        <label class="field">
          Tipo
          <select formControlName="tipo">
            @for (o of tipos; track o.valor) {
              <option [value]="o.valor">{{ o.etiqueta }}</option>
            }
          </select>
        </label>
        <label class="field">
          Matrícula
          <input formControlName="matricula" class="mono" />
          @if (matriculaConfigurada()) {
            <button type="button" class="btn small buscar-matricula" (click)="buscarMatricula()" [disabled]="consultando() || !form.controls.matricula.value.trim()">
              {{ consultando() ? 'Buscando…' : '🔎 Buscar bastidor y datos' }}
            </button>
          }
        </label>
        <label class="field">
          Nº de bastidor
          <input formControlName="bastidor" class="mono" />
          <span class="hint">Obligatorio si no tiene matrícula</span>
        </label>
        <label class="field">
          Marca *
          <input formControlName="marca" />
        </label>
        <label class="field">
          Modelo
          <input formControlName="modelo" />
        </label>
        <label class="field">
          Código de motor
          <input formControlName="motor" class="mono" placeholder="BKC" />
          <span class="hint">Ayuda a encontrar documentación</span>
        </label>
        <label class="field">
          Color
          <input formControlName="color" list="colores-vehiculo" placeholder="Gris plata" maxlength="40" />
          <datalist id="colores-vehiculo">
            @for (c of colores; track c.nombre) {
              <option [value]="c.nombre"></option>
            }
          </datalist>
        </label>
        <label class="field">
          Año
          <input formControlName="anio" type="number" min="1900" max="2100" />
        </label>
        @if (horas()) {
          <label class="field">
            Horas de uso
            <input formControlName="horas" type="number" min="0" />
          </label>
        } @else {
          <label class="field">
            Kilómetros
            <input formControlName="kilometros" type="number" min="0" />
          </label>
        }
        <label class="field full">
          Notas
          <textarea formControlName="notas"></textarea>
        </label>
      </div>

      @if (consulta(); as c) {
        <div class="consulta">
          <div class="cabecera">
            <strong>Datos de la matrícula {{ c.matricula }}</strong>
            <span class="hint">
              MatriculaAPI · {{ c.fecha | date: 'dd/MM/yyyy HH:mm' }}{{ c.desdeGuardada ? ' · consulta guardada, no ha costado nada' : '' }}
            </span>
          </div>
          <dl>
            <dt>Bastidor</dt><dd class="mono">{{ c.bastidor ?? 'No lo ha devuelto el servicio' }}</dd>
            <dt>Marca y modelo</dt><dd>{{ c.marca ?? '—' }} {{ c.modelo ?? '' }}</dd>
            @if (c.variante || c.descripcion) {
              <dt>Versión</dt><dd>{{ c.variante ?? c.descripcion }}</dd>
            }
            @if (c.fechaMatriculacion || c.anio) {
              <dt>Matriculación</dt><dd>{{ c.fechaMatriculacion ? (c.fechaMatriculacion | date: 'dd/MM/yyyy') : c.anio }}</dd>
            }
            @if (c.cilindrada || c.combustible || c.potenciaCv) {
              <dt>Motor</dt>
              <dd>{{ c.combustible ?? '' }}{{ c.cilindrada ? ' · ' + c.cilindrada + ' cc' : '' }}{{ c.potenciaCv ? ' · ' + c.potenciaCv + ' CV' : '' }}</dd>
            }
          </dl>
          <div class="toolbar" style="margin: 0.5rem 0 0">
            <button type="button" class="btn small primary" (click)="aplicarConsulta(c)">Aplicar a la ficha</button>
            @if (c.desdeGuardada) {
              <button type="button" class="btn small" (click)="buscarMatricula(true)" [disabled]="consultando()">Repetir la consulta</button>
            }
            <button type="button" class="btn small" (click)="consulta.set(null)">Cerrar</button>
          </div>
          <p class="hint" style="margin: 0.4rem 0 0">
            Rellena bastidor, marca, modelo y año con lo que haya devuelto el servicio; revisa y guarda. Comprueba el bastidor con el del permiso de circulación o el del coche.
          </p>
        </div>
      }

      <div class="form-actions">
        @if (id()) {
          <button type="button" class="btn danger" (click)="eliminar()" style="margin-right: auto">Eliminar</button>
          <button type="button" class="btn" (click)="cerrarFicha()">Cancelar</button>
        }
        <button type="submit" class="btn primary" [disabled]="guardando()">
          {{ id() ? 'Guardar cambios' : 'Crear vehículo' }}
        </button>
      </div>
    </form>
    }

    @if (vehiculo(); as v) {
      <div id="documentacion" class="ancla"><app-documentacion-vehiculo [vehiculoId]="v.id" [vehiculo]="v" /></div>
      <div id="repro" class="ancla"><app-repro-vehiculo [vehiculoId]="v.id" /></div>

      <section class="card ancla" id="historial">
        <h2>Historial de órdenes</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Nº</th><th>Entrada</th><th>Servicios</th><th>Motivo</th><th>Estado</th><th class="num">Total</th></tr>
            </thead>
            <tbody>
              @for (o of v.ordenes; track o.id) {
                <tr class="clickable" (click)="router.navigate(['/gestion/ordenes', o.id])">
                  <td class="mono">{{ o.id | numOrden }}</td>
                  <td>{{ o.fechaEntrada | date: 'dd/MM/yyyy' }}</td>
                  <td>{{ o.servicios | etiqueta: 'servicio' }}</td>
                  <td>{{ o.motivoEntrada }}</td>
                  <td><app-estado-badge [estado]="o.estado" /></td>
                  <td class="num">{{ o.total | currency: 'EUR' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="empty">Sin órdenes de trabajo.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: `
    .vision { padding: 1.25rem; border-top: 3px solid var(--primary); }
    .ficha-cerrada { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between; align-items: center; }
    .ancla { scroll-margin-top: 1rem; }
    .buscar-matricula { margin-top: 0.35rem; align-self: flex-start; }
    .consulta { margin-top: 1rem; padding: 0.8rem 1rem; border: 1px solid var(--border); border-left: 4px solid var(--primary); border-radius: var(--radius); background: var(--bg); }
    .consulta .cabecera { display: flex; flex-wrap: wrap; gap: 0.3rem 0.8rem; align-items: baseline; }
    .consulta dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 1rem; margin: 0.6rem 0 0; }
    .consulta dt { color: var(--muted); }
    .consulta dd { margin: 0; }
  `
})
export class VehiculoForm implements OnInit {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);

  /** Parámetro de ruta :id (ausente al crear). */
  readonly id = input(undefined, { transform: numberAttribute });
  /** ?clienteId= para preseleccionar el cliente al crear. */
  readonly clienteId = input(undefined, { transform: numberAttribute });

  protected readonly tipos = opciones(TIPOS_VEHICULO);
  protected readonly colores = COLORES_VEHICULO;
  protected readonly clientes = signal<ClienteListItem[]>([]);
  protected readonly vehiculo = signal<VehiculoDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly matriculaConfigurada = signal(false);
  protected readonly consulta = signal<ConsultaMatricula | null>(null);
  protected readonly consultando = signal(false);
  protected readonly resumen = signal<VehiculoResumen | null>(null);
  protected readonly numDocumentos = signal<number | null>(null);
  /** El formulario de la ficha se abre al crear o al pulsar «Editar ficha»; si no, manda la visión 360. */
  protected readonly fichaAbierta = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    clienteId: [0, Validators.min(1)],
    tipo: ['Turismo' as TipoVehiculo],
    matricula: [''],
    bastidor: [''],
    marca: ['', [Validators.required, Validators.maxLength(100)]],
    modelo: [''],
    motor: [''],
    color: ['', Validators.maxLength(40)],
    anio: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
    kilometros: [null as number | null, Validators.min(0)],
    horas: [null as number | null, Validators.min(0)],
    notas: ['']
  });

  private readonly tipo = toSignal(this.form.controls.tipo.valueChanges, { initialValue: this.form.controls.tipo.value });
  protected readonly horas = computed(() => usaHoras(this.tipo()));

  ngOnInit() {
    this.api.estadoMatricula().subscribe({ next: e => this.matriculaConfigurada.set(e.configurado), error: () => {} });

    this.api.clientes().subscribe({
      next: lista => this.clientes.set(lista),
      error: e => this.error.set(mensajeError(e))
    });

    const id = this.id();
    if (id) {
      this.api.vehiculo(id).subscribe({
        next: v => this.mostrar(v),
        error: e => this.error.set(mensajeError(e))
      });
      this.cargarResumen();
      this.api.documentacionVehiculo(id).subscribe({ next: d => this.numDocumentos.set(d.documentos.length), error: () => {} });
    } else if (this.clienteId()) {
      this.form.controls.clienteId.setValue(this.clienteId()!);
    }
  }

  /** Cada consulta nueva cuesta dinero; las ya hechas se reutilizan (salvo que se pida repetir). */
  protected buscarMatricula(repetir = false) {
    const matricula = this.form.controls.matricula.value.trim();
    const aviso = repetir
      ? 'Repetir la consulta gasta una consulta de la cuenta de MatriculaAPI (unos 0,20 €). ¿Continuar?'
      : 'Si esta matrícula no se ha consultado antes, se gasta una consulta de la cuenta de MatriculaAPI (unos 0,20 €). ¿Continuar?';
    if (!matricula || !confirm(aviso)) {
      return;
    }
    this.consultando.set(true);
    this.error.set(null);
    this.api.consultarMatricula(matricula, this.form.controls.tipo.value === 'Moto', repetir).subscribe({
      next: c => {
        this.consultando.set(false);
        this.consulta.set(c);
      },
      error: e => {
        this.consultando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected aplicarConsulta(c: ConsultaMatricula) {
    const f = this.form.controls;
    if (c.bastidor) f.bastidor.setValue(c.bastidor);
    if (c.marca) f.marca.setValue(c.marca);
    if (c.modelo) f.modelo.setValue(c.modelo);
    if (c.anio) f.anio.setValue(c.anio);
    this.form.markAsDirty();
    this.consulta.set(null);
  }

  protected guardar() {
    const valor = this.form.getRawValue();
    // Solo se exige al crear: los vehículos importados del histórico no tienen matrícula.
    if (!this.id() && !valor.matricula.trim() && !valor.bastidor.trim()) {
      this.error.set('Indica la matrícula o el número de bastidor.');
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }

    const req = limpiar(valor) as VehiculoRequest;
    const id = this.id();
    this.guardando.set(true);

    (id ? this.api.actualizarVehiculo(id, req) : this.api.crearVehiculo(req)).subscribe({
      next: v => {
        this.guardando.set(false);
        if (id) {
          this.mostrar(v);
          this.fichaAbierta.set(false);
          this.cargarResumen();
        } else {
          this.router.navigate(['/gestion/vehiculos', v.id]);
        }
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminar() {
    const v = this.vehiculo();
    if (!v || !confirm(`¿Eliminar el vehículo ${v.matricula ?? v.bastidor ?? v.marca}?`)) {
      return;
    }
    this.api.eliminarVehiculo(v.id).subscribe({
      next: () => this.router.navigate(['/gestion/vehiculos']),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected cargarResumen() {
    const id = this.id();
    if (!id) return;
    this.api.resumenVehiculo(id).subscribe({
      next: r => this.resumen.set(r),
      error: e => this.error.set(mensajeError(e))
    });
  }

  /** El color elegido al generar la imagen ya está guardado: se refleja en la ficha sin recargar. */
  protected colorGuardado(color: string) {
    const v = this.vehiculo();
    if (v) this.vehiculo.set({ ...v, color });
    if (!this.fichaAbierta()) this.form.controls.color.setValue(color);
  }

  protected abrirFicha() {
    this.fichaAbierta.set(true);
    setTimeout(() => document.getElementById('ficha')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  protected cerrarFicha() {
    const v = this.vehiculo();
    if (v) this.mostrar(v);
    this.consulta.set(null);
    this.fichaAbierta.set(false);
  }

  private mostrar(v: VehiculoDetalle) {
    this.form.reset({
      clienteId: v.clienteId,
      tipo: v.tipo,
      matricula: v.matricula ?? '',
      bastidor: v.bastidor ?? '',
      marca: v.marca,
      modelo: v.modelo ?? '',
      motor: v.motor ?? '',
      color: v.color ?? '',
      anio: v.anio,
      kilometros: v.kilometros,
      horas: v.horas,
      notas: v.notas ?? ''
    });
    this.vehiculo.set(v);
    this.error.set(null);
  }
}
