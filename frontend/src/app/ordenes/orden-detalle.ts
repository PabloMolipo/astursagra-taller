import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Api, fechaLocal, limpiar, mensajeError } from '../core/api';
import { ESTADOS_ORDEN, opciones, TIPOS_LINEA, usaHoras } from '../core/etiquetas';
import { Gasto, EstadoOrden, Linea, LineaRequest, OrdenActualizarRequest, OrdenDetalle, TipoLinea, TipoServicio } from '../core/models';
import { EstadoBadge } from '../shared/estado-badge';
import { PagoBadge } from '../shared/pago-badge';
import { EtiquetaPipe, IdentificacionPipe, NumOrdenPipe } from '../shared/pipes';
import { DocumentacionVehiculoComponent } from '../shared/documentacion-vehiculo';
import { BurbujaMecanico } from '../mecanico/burbuja-mecanico';
import { FichaDiagnosisComponent } from './ficha-diagnosis';
import { MultimediaOrdenComponent } from './multimedia-orden';
import { ServiciosInput } from './servicios-input';

@Component({
  selector: 'app-orden-detalle',
  imports: [ReactiveFormsModule, RouterLink, DatePipe, CurrencyPipe, DecimalPipe, EtiquetaPipe, IdentificacionPipe, NumOrdenPipe, EstadoBadge, PagoBadge, ServiciosInput, FichaDiagnosisComponent, DocumentacionVehiculoComponent, MultimediaOrdenComponent, BurbujaMecanico],
  template: `
    @if (orden(); as o) {
      <div class="page-header">
        <div>
          <h1><span class="mono">{{ o.id | numOrden }}</span> <app-estado-badge [estado]="o.estado" /> <app-pago-badge [pagado]="o.pagado" /></h1>
          <div class="subtitle">
            <a [routerLink]="['/gestion/vehiculos', o.vehiculo.id]" class="mono">{{ o.vehiculo | identificacion }}</a>
            · {{ o.vehiculo.marca }} {{ o.vehiculo.modelo }} ({{ o.vehiculo.tipo | etiqueta: 'vehiculo' }})
            · <a [routerLink]="['/gestion/clientes', o.vehiculo.clienteId]">{{ o.vehiculo.clienteNombre }}</a>
          </div>
        </div>
        <div class="toolbar" style="margin: 0">
          <a class="btn" [routerLink]="['/imprimir/orden', o.id, 'presupuesto']" target="_blank" rel="noopener">📄 Presupuesto</a>
          <a class="btn" [routerLink]="['/imprimir/orden', o.id, 'proforma']" target="_blank" rel="noopener">📄 Proforma</a>
          @if (o.factura; as f) {
            <a class="btn primary" [routerLink]="['/imprimir/orden', o.id, 'factura']" target="_blank" rel="noopener" title="Emitida el {{ f.fecha | date: 'dd/MM/yyyy' }}">🧾 Factura {{ f.codigo }}</a>
            <button type="button" class="btn" (click)="reemitirFactura()" [disabled]="guardando()" title="Vuelve a generar la factura con los datos actuales del cliente, el vehículo y el taller">🔄 Reemitir</button>
          } @else {
            <input #fechaFactura type="date" class="fecha-compacta" aria-label="Fecha de la factura" title="Fecha de la factura (para órdenes antiguas)"
              [value]="o.fechaSalida ? local(o.fechaSalida) : hoy" [min]="local(o.fechaEntrada)" [max]="hoy" />
            <button type="button" class="btn" (click)="emitirFactura(fechaFactura.value)" [disabled]="guardando() || !o.lineas.length || o.estado === 'Cancelado'">🧾 Emitir factura</button>
          }
          <a class="btn" routerLink="/gestion/ordenes">← Volver</a>
        </div>
      </div>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
      @if (exito()) {
        <div class="exito">{{ exito() }} <a [routerLink]="['/imprimir/orden', o.id, 'factura']" target="_blank" rel="noopener">Ver la factura</a></div>
      }

      <section class="card">
        <div class="toolbar" style="margin: 0; justify-content: space-between">
          <dl class="datos" style="flex: 1; margin: 0">
            <div><dt>Entrada</dt><dd>{{ o.fechaEntrada | date: 'dd/MM/yyyy HH:mm' }}</dd></div>
            <div><dt>Prevista</dt><dd>{{ (o.fechaPrevista | date: 'dd/MM/yyyy') ?? '—' }}</dd></div>
            <div>
              <dt>Entrega</dt>
              <dd>
                @if (o.estado === 'Entregado' && o.fechaSalida) {
                  <input type="date" class="fecha-compacta" aria-label="Fecha de entrega" [value]="local(o.fechaSalida)" [min]="local(o.fechaEntrada)" [max]="hoy"
                    (change)="cambiarSalida($any($event.target).value)" />
                } @else {
                  —
                }
              </dd>
            </div>
          </dl>
          <div class="field pago-campo">
            Pagado
            <div class="segmentado" role="group" aria-label="Pagado">
              <button type="button" [class.activo]="o.pagado" [attr.aria-pressed]="o.pagado" (click)="marcarPagado(true)">Sí</button>
              <button type="button" [class.activo]="!o.pagado" [attr.aria-pressed]="!o.pagado" (click)="marcarPagado(false)">No</button>
            </div>
            @if (o.pagado && o.fechaPago) {
              <label class="hint fecha-pago">el
                <input type="date" class="fecha-compacta" aria-label="Fecha de pago" [value]="local(o.fechaPago)" [min]="local(o.fechaEntrada)" [max]="hoy"
                  (change)="cambiarFechaPago($any($event.target).value)" />
              </label>
            }
          </div>
          <label class="field">
            Cambiar estado
            <select (change)="cambiarEstado($any($event.target).value)">
              @for (e of estados; track e.valor) {
                <option [value]="e.valor" [selected]="e.valor === o.estado">{{ e.etiqueta }}</option>
              }
            </select>
          </label>
        </div>
      </section>

      <form class="card" [formGroup]="form" (ngSubmit)="guardar()">
        <h2>Trabajo</h2>
        <div class="form-grid">
          <div class="field full">
            <label class="field">Servicios</label>
            <app-servicios-input formControlName="servicios" />
          </div>
          <label class="field full">
            Motivo de entrada
            <textarea formControlName="motivoEntrada"></textarea>
          </label>
          <label class="field full">
            Diagnóstico
            <textarea formControlName="diagnostico" placeholder="Avería encontrada, códigos de error, pruebas realizadas…"></textarea>
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
        <div class="form-actions">
          <button type="button" class="btn danger" (click)="eliminar()" style="margin-right: auto">Eliminar orden</button>
          <button type="submit" class="btn primary" [disabled]="guardando() || form.pristine">Guardar cambios</button>
        </div>
      </form>

      <app-multimedia-orden [ordenId]="o.id" />
      <app-burbuja-mecanico [ordenId]="o.id" />
      <app-ficha-diagnosis [ordenId]="o.id" />
      <app-documentacion-vehiculo [vehiculoId]="o.vehiculo.id" [vehiculo]="o.vehiculo" />

      <section class="card">
        <h2>Mano de obra y piezas</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Ref.</th>
                <th class="num">Cant.</th>
                <th class="num">Precio</th>
                <th class="num">Dto.</th>
                <th class="num">IVA</th>
                <th class="num">Importe</th>
                <th class="num" title="Coste de compra (no se factura)">Coste</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (l of o.lineas; track l.id) {
                <tr [style.background]="editando() === l.id ? 'var(--hover)' : null">
                  <td>{{ l.tipo | etiqueta: 'linea' }}</td>
                  <td>{{ l.descripcion }}</td>
                  <td class="mono">{{ l.referencia }}</td>
                  <td class="num">{{ l.cantidad | number: '1.0-2' }}{{ l.tipo === 'ManoObra' ? ' h' : '' }}</td>
                  <td class="num">{{ l.precioUnitario | currency: 'EUR' }}</td>
                  <td class="num">{{ l.descuentoPorcentaje ? (l.descuentoPorcentaje | number: '1.0-2') + ' %' : '' }}</td>
                  <td class="num">{{ l.ivaPorcentaje | number: '1.0-2' }} %</td>
                  <td class="num">{{ l.baseImponible | currency: 'EUR' }}</td>
                  <td class="num hint">{{ l.coste ? (l.coste | currency: 'EUR') : '' }}</td>
                  <td class="num">
                    <button type="button" class="btn small" (click)="editarLinea(l)">Editar</button>
                    @if (!o.factura) {
                      <button type="button" class="btn small danger" (click)="eliminarLinea(l)">×</button>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty">Aún no hay líneas.</td></tr>
              }
            </tbody>
            <tfoot>
              <tr><td colspan="7" class="num">Base imponible</td><td class="num">{{ o.totales.baseImponible | currency: 'EUR' }}</td><td class="num hint">{{ o.totales.coste | currency: 'EUR' }}</td><td></td></tr>
              <tr><td colspan="7" class="num">IVA</td><td class="num">{{ o.totales.iva | currency: 'EUR' }}</td><td></td><td></td></tr>
              <tr><td colspan="7" class="num">Total</td><td class="num">{{ o.totales.total | currency: 'EUR' }}</td><td></td><td></td></tr>
              <tr class="margen" [class.negativo]="o.totales.margen < 0"><td colspan="7" class="num">Margen (base − coste)</td><td class="num">{{ o.totales.margen | currency: 'EUR' }}</td><td></td><td></td></tr>
            </tfoot>
          </table>
        </div>

        @if (o.factura) {
          <p class="hint" style="margin: 0.6rem 0 0">Orden facturada ({{ o.factura.codigo }}): los conceptos ya no se pueden cambiar; solo el coste unitario de compra, que no sale en la factura.</p>
        }
        @if (!o.factura || editando()) {
        <form [formGroup]="lineaForm" (ngSubmit)="guardarLinea()" style="margin-top: 1rem">
          <div class="form-grid">
            <label class="field">
              Tipo
              <select formControlName="tipo">
                @for (t of tiposLinea; track t.valor) {
                  <option [value]="t.valor">{{ t.etiqueta }}</option>
                }
              </select>
            </label>
            <label class="field" style="grid-column: span 2">
              Descripción *
              <input formControlName="descripcion" />
            </label>
            <label class="field">
              Referencia
              <input formControlName="referencia" class="mono" />
            </label>
            <label class="field">
              {{ lineaForm.value.tipo === 'ManoObra' ? 'Horas' : 'Cantidad' }} *
              <input type="number" step="0.01" min="0.01" formControlName="cantidad" />
            </label>
            <label class="field">
              Precio unitario (€) *
              <input type="number" step="0.01" min="0" formControlName="precioUnitario" />
            </label>
            <label class="field">
              Descuento (%)
              <input type="number" step="0.01" min="0" max="100" formControlName="descuentoPorcentaje" />
            </label>
            <label class="field">
              IVA (%)
              <input type="number" step="0.01" min="0" max="100" formControlName="ivaPorcentaje" />
            </label>
            <label class="field">
              Coste unitario (€)
              <input type="number" step="0.01" min="0" formControlName="costeUnitario" />
              <span class="hint">Lo que te cuesta la pieza; no sale en la factura</span>
            </label>
          </div>
          <div class="form-actions">
            @if (editando()) {
              <button type="button" class="btn" (click)="cancelarLinea()">Cancelar</button>
            }
            <button type="submit" class="btn primary" [disabled]="guardando()">
              {{ editando() ? 'Guardar línea' : '+ Añadir línea' }}
            </button>
          </div>
        </form>
        }
      </section>

      <section class="card">
        <div class="cabecera-compras">
          <h2 style="margin: 0">Compras para esta orden</h2>
          <a class="btn small" [routerLink]="['/gestion/contabilidad/gastos']" [queryParams]="{ orden: o.id }">+ Añadir compra</a>
        </div>
        <p class="hint" style="margin-top: 0.3rem">Facturas o tickets de las piezas compradas para esta reparación (cuentan como gastos en Contabilidad).</p>
        @for (g of compras(); track g.id) {
          <div class="compra">
            <span>{{ g.fecha | date: 'dd/MM/yyyy' }}</span>
            <span class="concepto">{{ g.concepto }}{{ g.proveedor ? ' · ' + g.proveedor : '' }}</span>
            @if (g.adjuntoUrl) {
              <a [href]="g.adjuntoUrl" target="_blank" rel="noopener" title="Ver ticket">📎</a>
            }
            <span class="importe">{{ g.importe | currency: 'EUR' }}</span>
          </div>
        } @empty {
          <p class="hint">Sin compras registradas.</p>
        }
        @if (compras().length) {
          <div class="compra total"><span>Total compras</span><span class="importe">{{ totalCompras() | currency: 'EUR' }}</span></div>
        }
      </section>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    .cabecera-compras { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
    .compra { display: flex; gap: 0.8rem; align-items: baseline; padding: 0.35rem 0; border-bottom: 1px solid var(--border); font-size: 0.9rem; }
    .compra .concepto { flex: 1; min-width: 0; }
    .compra .importe { margin-left: auto; font-variant-numeric: tabular-nums; }
    .compra.total { font-weight: 700; border-bottom: 0; }
    .pago-campo { gap: 4px; }
    .fecha-compacta { padding: 0.2rem 0.35rem; font-size: 0.85rem; width: auto; }
    .fecha-pago { display: inline-flex; gap: 0.35rem; align-items: center; }
    .segmentado { display: inline-flex; border: 1px solid var(--border-strong); }
    .segmentado button { background: transparent; border: 0; color: inherit; padding: 6px 16px; cursor: pointer; font: inherit; font-weight: 600; }
    .segmentado button + button { border-left: 1px solid var(--border-strong); }
    .segmentado button.activo { background: var(--primary); color: var(--on-primary); }
  `
})
export class OrdenDetalleComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  readonly id = input.required({ transform: numberAttribute });

  protected readonly estados = opciones(ESTADOS_ORDEN);
  protected readonly tiposLinea = opciones(TIPOS_LINEA);
  protected readonly orden = signal<OrdenDetalle | null>(null);
  protected readonly horas = computed(() => {
    const o = this.orden();
    return o ? usaHoras(o.vehiculo.tipo) : false;
  });
  protected readonly editando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly exito = signal<string | null>(null);

  protected readonly form = this.fb.group({
    servicios: [[] as TipoServicio[], Validators.required],
    motivoEntrada: ['', [Validators.required, Validators.maxLength(2000)]],
    diagnostico: ['', Validators.maxLength(4000)],
    kilometrosEntrada: [null as number | null, Validators.min(0)],
    horasEntrada: [null as number | null, Validators.min(0)],
    fechaEntrada: [''],
    fechaPrevista: [''],
    observaciones: ['']
  });
  protected readonly hoy = fechaLocal();

  protected readonly compras = signal<Gasto[]>([]);
  protected readonly totalCompras = computed(() => this.compras().reduce((s, g) => s + g.importe, 0));

  private readonly lineaVacia = {
    tipo: 'ManoObra' as TipoLinea,
    descripcion: '',
    referencia: '',
    cantidad: 1,
    precioUnitario: 0,
    descuentoPorcentaje: 0,
    ivaPorcentaje: 21,
    costeUnitario: null as number | null
  };

  protected readonly lineaForm = this.fb.group({
    tipo: [this.lineaVacia.tipo],
    descripcion: ['', [Validators.required, Validators.maxLength(500)]],
    referencia: [''],
    cantidad: [1, [Validators.required, Validators.min(0.01)]],
    precioUnitario: [0, [Validators.required, Validators.min(0)]],
    descuentoPorcentaje: [0, [Validators.min(0), Validators.max(100)]],
    ivaPorcentaje: [21, [Validators.min(0), Validators.max(100)]],
    costeUnitario: [null as number | null, Validators.min(0)]
  });

  ngOnInit() {
    // IVA de las líneas nuevas según los ajustes de Contabilidad.
    this.api.ajustesContabilidad().subscribe({
      next: a => {
        this.lineaVacia.ivaPorcentaje = a.ivaPorDefecto;
        if (!this.editando()) this.lineaForm.controls.ivaPorcentaje.setValue(a.ivaPorDefecto);
      },
      error: () => {}
    });
    this.api.gastos({ ordenId: this.id() }).subscribe({ next: g => this.compras.set(g), error: () => {} });
    this.api.orden(this.id()).subscribe({
      next: o => this.mostrar(o),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos del trabajo (al menos un servicio y el motivo).');
      return;
    }
    const req = limpiar(this.form.getRawValue()) as OrdenActualizarRequest;
    this.ejecutar(this.api.actualizarOrden(this.id(), req));
  }

  protected local(instante: string) {
    return fechaLocal(instante);
  }

  /** Histórico: día en que se entregó el vehículo. */
  protected cambiarSalida(fecha: string) {
    if (fecha) this.ejecutar(this.api.cambiarFechaSalida(this.id(), fecha), false);
  }

  /** Histórico: día en que se cobró. */
  protected cambiarFechaPago(fecha: string) {
    if (fecha) this.ejecutar(this.api.marcarPagado(this.id(), true, fecha), false);
  }

  protected marcarPagado(pagado: boolean) {
    if (this.orden()?.pagado === pagado) return;
    this.ejecutar(this.api.marcarPagado(this.id(), pagado), false);
  }

  protected cambiarEstado(estado: EstadoOrden) {
    this.ejecutar(this.api.cambiarEstado(this.id(), estado), false);
  }

  protected eliminar() {
    const o = this.orden();
    if (!o || !confirm('¿Eliminar esta orden de trabajo y todas sus líneas?')) {
      return;
    }
    this.api.eliminarOrden(o.id).subscribe({
      next: () => this.router.navigate(['/gestion/ordenes']),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected editarLinea(l: Linea) {
    this.editando.set(l.id);
    this.lineaForm.reset({ ...l, referencia: l.referencia ?? '' });
    // Facturada: solo el coste de compra (los demás campos se envían tal cual y el servidor comprueba que no cambian).
    if (this.orden()?.factura) {
      this.lineaForm.disable();
      this.lineaForm.controls.costeUnitario.enable();
    }
  }

  protected cancelarLinea() {
    this.editando.set(null);
    this.lineaForm.enable();
    this.lineaForm.reset(this.lineaVacia);
  }

  protected emitirFactura(fecha: string) {
    const o = this.orden();
    if (!o) return;
    fecha ||= this.hoy;
    const dia = fecha === this.hoy ? 'de hoy' : `del ${fecha.split('-').reverse().join('/')}`;
    if (!confirm(`¿Emitir la factura de esta orden con fecha ${dia} (${o.totales.total.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })})?

Se le asigna el siguiente número de factura del año de esa fecha y, una vez emitida, no se puede borrar ni cambiar sus conceptos.`)) {
      return;
    }
    this.guardando.set(true);
    this.api.emitirFactura(o.id, fecha).subscribe({
      next: () => this.ejecutar(this.api.orden(o.id), false),
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected reemitirFactura() {
    const o = this.orden();
    if (!o?.factura) return;
    if (!confirm(`¿Reemitir la factura ${o.factura.codigo} con los datos actuales del cliente, el vehículo y el taller?

Conserva el mismo número, fecha e importes; solo se actualizan esos datos. Corrígelos antes en sus fichas.`)) {
      return;
    }
    this.guardando.set(true);
    this.api.reemitirFactura(o.id).subscribe({
      next: f => this.ejecutar(this.api.orden(o.id), false, () => this.exito.set(`Factura ${f.codigo} reemitida con los datos actuales del cliente, el vehículo y el taller.`)),
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected guardarLinea() {
    if (this.lineaForm.invalid) {
      this.lineaForm.markAllAsTouched();
      this.error.set('Revisa los campos de la línea.');
      return;
    }
    const req = limpiar(this.lineaForm.getRawValue()) as LineaRequest;
    const lineaId = this.editando();
    const peticion = lineaId
      ? this.api.actualizarLinea(this.id(), lineaId, req)
      : this.api.agregarLinea(this.id(), req);

    this.ejecutar(peticion, false, () => this.cancelarLinea());
  }

  protected eliminarLinea(l: Linea) {
    if (confirm(`¿Eliminar "${l.descripcion}"?`)) {
      this.ejecutar(this.api.eliminarLinea(this.id(), l.id), false);
    }
  }

  /**
   * Lanza una petición que devuelve la orden actualizada.
   * Solo se rellena de nuevo el formulario del trabajo si es lo que se ha guardado, para no perder cambios a medias.
   */
  private ejecutar(peticion: Observable<OrdenDetalle>, refrescarFormulario = true, alTerminar?: () => void) {
    this.guardando.set(true);
    this.exito.set(null);
    peticion.subscribe({
      next: o => {
        this.guardando.set(false);
        this.error.set(null);
        if (refrescarFormulario) {
          this.mostrar(o);
        } else {
          this.orden.set(o);
        }
        alTerminar?.();
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  private mostrar(o: OrdenDetalle) {
    this.form.reset({
      servicios: o.servicios,
      motivoEntrada: o.motivoEntrada,
      diagnostico: o.diagnostico ?? '',
      kilometrosEntrada: o.kilometrosEntrada,
      horasEntrada: o.horasEntrada,
      fechaEntrada: fechaLocal(o.fechaEntrada),
      fechaPrevista: o.fechaPrevista ?? '',
      observaciones: o.observaciones ?? ''
    });
    this.orden.set(o);
  }
}
