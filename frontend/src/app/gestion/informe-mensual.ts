import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, from, mergeMap, of, switchMap } from 'rxjs';
import { Api, mensajeError } from '../core/api';
import { CATEGORIAS_GASTO, TIPOS_SERVICIO } from '../core/etiquetas';
import { AjustesContabilidad, DatosTaller, FichaDiagnosis, MultimediaOrden, OrdenDetalle, ResumenContabilidad, VehiculoDetalle, VehiculoResumen } from '../core/models';
import { HojaInforme } from '../ordenes/hoja-informe';
import { NumOrdenPipe } from '../shared/pipes';

interface Reparacion {
  orden: OrdenDetalle;
  ficha: FichaDiagnosis | null;
  multimedia: MultimediaOrden[];
  vehiculo: VehiculoDetalle | null;
  resumenVehiculo: VehiculoResumen | null;
}

/**
 * Informe contable de un mes para imprimir o guardar como PDF: resumen (beneficio, facturado, cobrado, gastos, márgenes,
 * desgloses y órdenes) y, como anexo, el informe de reparación de cada orden entregada en el mes, una por página.
 * Ruta: /imprimir/contabilidad/AAAA-MM (con ?iva=0, importes sin IVA).
 */
@Component({
  selector: 'app-informe-mensual',
  imports: [CurrencyPipe, DatePipe, FormsModule, HojaInforme, NumOrdenPipe],
  template: `
    <div class="barra no-imprimir">
      <button type="button" class="btn primary" (click)="imprimir()" [disabled]="!listo()">🖨️ Imprimir o guardar en PDF</button>
      <button type="button" class="btn" (click)="cerrar()">Cerrar</button>
      <label><input type="checkbox" [(ngModel)]="anexo" /> Anexo de reparaciones</label>
      @if (anexo) {
        <label><input type="checkbox" [(ngModel)]="importes" /> Importes en el anexo</label>
        <label title="Las fotos de cada orden, por etapas; con muchas, el PDF puede pesar bastante"><input type="checkbox" [(ngModel)]="fotos" /> Fotos de las órdenes</label>
        @if (fotos) {
          <label title="Si se desmarca, también salen las fotos internas del taller"><input type="checkbox" [(ngModel)]="soloCliente" /> Solo las visibles para el cliente</label>
        }
      }
      @if (r() && !listo()) {
        <span class="progreso">Cargando reparaciones: {{ cargadas() }} de {{ r()!.ordenes.length }}…</span>
      }
      <span class="hint">En el diálogo de impresión elige «Guardar como PDF».</span>
    </div>

    @if (error()) {
      <div class="error no-imprimir">{{ error() }}</div>
    }

    @if (r(); as r) {
      <article class="hoja">
        <header class="cabecera">
          <div class="taller">
            <img src="brand/astursagra-simbolo-lima.svg" alt="" class="logo" />
            <div class="datos-taller">
              <div class="marca"><span>ASTUR</span><span class="s2">SAGRA</span></div>
              @if (ajustes()?.razonSocial; as titular) { <strong>{{ titular }}</strong> }
              @if (ajustes()?.nif; as nif) { <div>NIF {{ nif }}</div> }
              @if (datos(); as t) {
                @if (t.direccion) { <div>{{ t.direccion }}</div> }
                @if (t.codigoPostal || t.poblacion) { <div>{{ t.codigoPostal }} {{ t.poblacion }}{{ t.provincia ? ' (' + t.provincia + ')' : '' }}</div> }
              }
            </div>
          </div>
          <div class="titulo">
            <h1>Informe contable</h1>
            <div class="mes">{{ nombreMes() }}</div>
            <div class="sub">Del {{ r.desde | date: 'dd/MM/yyyy' }} al {{ r.hasta | date: 'dd/MM/yyyy' }} · importes de las órdenes {{ r.conIva ? 'con IVA' : 'sin IVA' }}</div>
          </div>
        </header>

        <section class="beneficio" [class.negativo]="r.beneficio < 0">
          <div>
            <div class="k">Beneficio del mes</div>
            <div class="v">{{ r.beneficio | currency: 'EUR' }}</div>
          </div>
          <div class="cuenta">
            Cobrado {{ r.cobrado | currency: 'EUR' }} − coste real de las piezas {{ r.costePiezasCobradas | currency: 'EUR' }}
            − gastos generales {{ r.gastosGenerales | currency: 'EUR' }}
          </div>
        </section>

        <section class="apartado">
          <h2>Resumen</h2>
          <table class="tabla resumen">
            <tbody>
              <tr><td>Facturado <span class="sub">({{ r.ordenesEntregadas }} {{ r.ordenesEntregadas === 1 ? 'orden entregada' : 'órdenes entregadas' }})</span></td><td class="num">{{ r.facturado | currency: 'EUR' }}</td></tr>
              <tr><td class="sangria">Mano de obra <span class="sub">(base imponible)</span></td><td class="num">{{ r.manoObra | currency: 'EUR' }}</td></tr>
              <tr><td class="sangria">Piezas <span class="sub">(base imponible)</span></td><td class="num">{{ r.piezas | currency: 'EUR' }}</td></tr>
              <tr><td class="sangria">Coste de las piezas</td><td class="num">{{ r.costePiezas | currency: 'EUR' }}</td></tr>
              <tr><td class="sangria">Margen de las órdenes</td><td class="num">{{ r.margenOrdenes | currency: 'EUR' }}</td></tr>
              <tr><td>Cobrado <span class="sub">(órdenes pagadas en el mes)</span></td><td class="num">{{ r.cobrado | currency: 'EUR' }}</td></tr>
              <tr><td>Gastos pagados</td><td class="num">{{ r.gastos | currency: 'EUR' }}</td></tr>
              <tr class="fuerte"><td>Resultado <span class="sub">(cobrado − gastos)</span></td><td class="num" [class.mal]="r.resultado < 0">{{ r.resultado | currency: 'EUR' }}</td></tr>
              <tr><td>Pendiente de cobro <span class="sub">({{ r.ordenesPendientesCobro }} {{ r.ordenesPendientesCobro === 1 ? 'orden terminada' : 'órdenes terminadas' }} sin pagar, de cualquier fecha)</span></td><td class="num">{{ r.pendienteCobro | currency: 'EUR' }}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="dos">
          <div class="apartado">
            <h2>Gastos por categoría</h2>
            <table class="tabla">
              <thead><tr><th>Categoría</th><th class="num">Nº</th><th class="num">Importe</th></tr></thead>
              <tbody>
                @for (g of r.gastosPorCategoria; track g.categoria) {
                  <tr><td>{{ categorias[g.categoria] }}</td><td class="num">{{ g.numero }}</td><td class="num">{{ g.importe | currency: 'EUR' }}</td></tr>
                } @empty {
                  <tr><td colspan="3" class="vacio">Sin gastos en el mes.</td></tr>
                }
              </tbody>
            </table>
          </div>
          <div class="apartado">
            <h2>Facturado por servicio</h2>
            <table class="tabla">
              <thead><tr><th>Servicio</th><th class="num">Importe</th></tr></thead>
              <tbody>
                @for (s of r.ingresosPorServicio; track s.servicio) {
                  <tr><td>{{ servicios[s.servicio] }}</td><td class="num">{{ s.importe | currency: 'EUR' }}</td></tr>
                } @empty {
                  <tr><td colspan="2" class="vacio">Sin órdenes entregadas.</td></tr>
                }
              </tbody>
            </table>
            @if (r.mejoresClientes.length) {
              <h3>Mejores clientes</h3>
              <table class="tabla">
                <tbody>
                  @for (c of r.mejoresClientes; track c.clienteId) {
                    <tr><td>{{ c.nombre }} <span class="sub">({{ c.ordenes }} {{ c.ordenes === 1 ? 'orden' : 'órdenes' }})</span></td><td class="num">{{ c.importe | currency: 'EUR' }}</td></tr>
                  }
                </tbody>
              </table>
            }
          </div>
        </section>

        <section class="apartado">
          <h2>Órdenes entregadas en el mes</h2>
          <table class="tabla">
            <thead><tr><th>Orden</th><th>Entrega</th><th>Vehículo</th><th>Cliente</th><th class="num">Total</th><th class="num">Coste piezas</th><th class="num">Margen</th><th>Pago</th></tr></thead>
            <tbody>
              @for (o of r.ordenes; track o.id) {
                <tr>
                  <td class="mono">{{ o.id | numOrden }}</td>
                  <td>{{ o.fechaSalida | date: 'dd/MM' }}</td>
                  <td><span class="mono">{{ o.matricula ?? '—' }}</span>&nbsp;<span class="sub">{{ o.vehiculo }}</span></td>
                  <td>{{ o.clienteNombre }}</td>
                  <td class="num">{{ o.total | currency: 'EUR' }}</td>
                  <td class="num">{{ o.coste | currency: 'EUR' }}</td>
                  <td class="num" [class.mal]="o.margen < 0">{{ o.margen | currency: 'EUR' }}</td>
                  <td>{{ o.pagado ? 'Cobrada ' + (o.fechaPago | date: 'dd/MM') : 'Sin cobrar' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="vacio">No se entregó ninguna orden en el mes.</td></tr>
              }
            </tbody>
            @if (r.ordenes.length) {
              <tfoot>
                <tr><td colspan="4">Total</td><td class="num">{{ totales().total | currency: 'EUR' }}</td><td class="num">{{ totales().coste | currency: 'EUR' }}</td><td class="num">{{ totales().margen | currency: 'EUR' }}</td><td></td></tr>
              </tfoot>
            }
          </table>
        </section>

        @if (r.sinCobrar.length) {
          <section class="apartado">
            <h2>Pendiente de cobro <span class="sub">(de cualquier fecha, a la fecha del informe)</span></h2>
            <table class="tabla">
              <thead><tr><th>Orden</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th class="num">Importe</th></tr></thead>
              <tbody>
                @for (o of r.sinCobrar; track o.id) {
                  <tr>
                    <td class="mono">{{ o.id | numOrden }}</td>
                    <td><span class="mono">{{ o.matricula ?? '—' }}</span>&nbsp;<span class="sub">{{ o.vehiculo }}</span></td>
                    <td>{{ o.clienteNombre }}</td>
                    <td>{{ o.estado === 'Listo' ? 'Listo para recoger' : 'Entregado ' + (o.fechaSalida | date: 'dd/MM/yyyy') }}</td>
                    <td class="num">{{ o.total | currency: 'EUR' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </section>
        }

        <footer class="pie">
          Informe generado el {{ hoy | date: 'dd/MM/yyyy HH:mm' }}.
          @if (anexo && r.ordenes.length) {
            {{ r.ordenes.length === 1 ? 'Anexo: informe de reparación de la orden entregada en el mes.' : 'Anexo: informe de reparación de las ' + r.ordenes.length + ' órdenes entregadas en el mes, una por página.' }}
          }
        </footer>
      </article>

      @if (anexo) {
        @for (x of reparaciones(); track x.orden.id) {
          <app-hoja-informe class="anexo" [orden]="x.orden" [datos]="datos()" [ficha]="x.ficha" [multimedia]="x.multimedia"
            [vehiculo]="x.vehiculo" [resumenVehiculo]="x.resumenVehiculo"
            [importes]="importes" [fotos]="fotos" [soloCliente]="soloCliente" [firmas]="false" />
        }
        @if (fallidas().length) {
          <p class="error no-imprimir">No se han podido cargar las órdenes {{ fallidas().join(', ') }}: no salen en el anexo.</p>
        }
      }
    } @else if (!error()) {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: #e9e9e9; padding: 1rem; color: #111; font-family: var(--font-body); }
    .barra { max-width: 210mm; margin: 0 auto 0.8rem; display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; }
    .barra label { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.9rem; color: #222; cursor: pointer; }
    .barra .hint { color: #555; font-size: 0.8rem; flex-basis: 100%; }
    .progreso { font-size: 0.85rem; color: #5f6b00; }
    .hoja { background: #fff; color: #111; max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 15mm; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); font-size: 10pt; line-height: 1.4; }
    .anexo { margin-top: 1rem; }
    .cabecera { display: flex; justify-content: space-between; gap: 1.5rem; border-bottom: 3px solid #9bcf00; padding-bottom: 10px; }
    .taller { display: flex; gap: 12px; align-items: flex-start; }
    .logo { width: 58px; height: 58px; flex: none; }
    .marca { font-family: var(--font-display); font-weight: 700; font-size: 17pt; letter-spacing: 0.03em; line-height: 1.1; margin-bottom: 2px; color: #111; }
    .marca .s2 { color: #5f8500; }
    .datos-taller { font-size: 9pt; color: #333; }
    .titulo { text-align: right; }
    .titulo h1 { font-family: var(--font-display); text-transform: uppercase; font-size: 18pt; margin: 0; letter-spacing: 0.04em; }
    .titulo .mes { font-family: var(--font-display); font-size: 14pt; color: #5f8500; }
    /* La hoja es siempre clara: anula los estilos de tabla del tema oscuro del portal. */
    .hoja table, .hoja thead, .hoja tbody, .hoja tfoot, .hoja tr, .hoja th, .hoja td { background: transparent !important; color: #111 !important; }
    .hoja .sub { color: #666 !important; }
    .hoja .mal { color: #b42318 !important; }
    .beneficio { margin: 14px 0 4px; border: 1px solid #ddd; border-left: 4px solid #9bcf00; padding: 8px 12px; display: flex; flex-wrap: wrap; gap: 4px 24px; align-items: center; }
    .beneficio.negativo { border-left-color: #b42318; }
    .beneficio .k { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; color: #555; }
    .beneficio .v { font-family: var(--font-display); font-size: 20pt; font-weight: 700; line-height: 1.1; }
    .beneficio.negativo .v { color: #b42318; }
    .beneficio .cuenta { font-size: 9pt; color: #444; }
    h2 { font-family: var(--font-display); text-transform: uppercase; font-size: 9pt; letter-spacing: 0.08em; color: #555; margin: 0 0 4px; }
    h3 { font-size: 9pt; margin: 10px 0 3px; color: #222; }
    .apartado { margin-top: 14px; break-inside: avoid; }
    .apartado > h2 { border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 6px; }
    .dos { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .mono { font-family: var(--font-mono, monospace); }
    .sub { color: #666; font-size: 8.5pt; }
    .tabla { width: 100%; border-collapse: collapse; font-size: 9pt; }
    .tabla th { text-align: left; border-bottom: 2px solid #111; padding: 3px 5px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.04em; }
    .tabla td { border-bottom: 1px solid #e3e3e3; padding: 3px 5px; vertical-align: top; }
    .tabla tr { break-inside: avoid; }
    .tabla tfoot td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; }
    .resumen td:first-child { width: 75%; }
    .resumen .sangria { padding-left: 18px; color: #333; }
    .resumen .fuerte td { font-weight: 700; border-top: 1px solid #111; }
    .num, .tabla th.num { text-align: right; white-space: nowrap; }
    .vacio { text-align: center; color: #777; }
    .pie { margin-top: 20px; font-size: 8.5pt; color: #555; }
    @media print {
      :host { background: #fff; padding: 0; }
      .no-imprimir { display: none !important; }
      .hoja { box-shadow: none; margin: 0; max-width: none; min-height: auto; padding: 0; }
      .anexo { margin: 0; break-before: page; }
      @page { size: A4; margin: 14mm 13mm; }
    }
  `
})
export class InformeMensual implements OnInit {
  private readonly api = inject(Api);
  /** Mes del informe, AAAA-MM. */
  readonly mes = input.required<string>();
  /** «0»: importes de las órdenes sin IVA. */
  readonly iva = input<string | undefined>();

  protected readonly categorias = CATEGORIAS_GASTO;
  protected readonly servicios = TIPOS_SERVICIO;
  protected readonly hoy = new Date();
  protected readonly r = signal<ResumenContabilidad | null>(null);
  protected readonly datos = signal<DatosTaller | null>(null);
  protected readonly ajustes = signal<AjustesContabilidad | null>(null);
  private readonly cargadasPorId = signal(new Map<number, Reparacion>());
  protected readonly fallidas = signal<string[]>([]);
  protected readonly error = signal<string | null>(null);

  protected anexo = true;
  protected importes = true;
  protected fotos = true;
  /** El informe mensual es interno: por defecto salen todas las fotos, también las internas del taller. */
  protected soloCliente = false;

  protected readonly cargadas = computed(() => this.cargadasPorId().size + this.fallidas().length);
  protected readonly listo = computed(() => !!this.r() && this.cargadas() >= this.r()!.ordenes.length);
  /** Las reparaciones del anexo, en el mismo orden que la tabla de órdenes entregadas. */
  protected readonly reparaciones = computed(() =>
    (this.r()?.ordenes ?? []).map(o => this.cargadasPorId().get(o.id)).filter((x): x is Reparacion => !!x));
  protected readonly totales = computed(() => {
    const ordenes = this.r()?.ordenes ?? [];
    return {
      total: ordenes.reduce((s, o) => s + o.total, 0),
      coste: ordenes.reduce((s, o) => s + o.coste, 0),
      margen: ordenes.reduce((s, o) => s + o.margen, 0)
    };
  });
  protected readonly nombreMes = computed(() => {
    const [y, m] = this.mes().split('-').map(Number);
    const texto = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return texto.charAt(0).toUpperCase() + texto.slice(1);
  });

  ngOnInit() {
    const partes = /^(\d{4})-(\d{2})$/.exec(this.mes());
    const m = partes ? Number(partes[2]) : 0;
    if (!partes || m < 1 || m > 12) {
      this.error.set('Mes no válido: la dirección debe acabar en AAAA-MM (por ejemplo 2026-11).');
      return;
    }
    const y = Number(partes[1]);
    const ultimo = new Date(y, m, 0).getDate();
    const desde = `${this.mes()}-01`;
    const hasta = `${this.mes()}-${String(ultimo).padStart(2, '0')}`;
    document.title = `Informe contable ${this.mes()} · AsturSagra`;

    forkJoin({
      r: this.api.resumenContabilidad(desde, hasta, this.iva() !== '0'),
      datos: this.api.datosPublicos().pipe(catchError(() => of(null))),
      ajustes: this.api.ajustesContabilidad().pipe(catchError(() => of(null)))
    }).subscribe({
      next: ({ r, datos, ajustes }) => {
        this.r.set(r);
        this.datos.set(datos);
        this.ajustes.set(ajustes);
        this.cargarReparaciones(r.ordenes.map(o => o.id));
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  /** Cada orden con su diagnosis, sus fotos y la ficha e imagen del vehículo, de cuatro en cuatro para no saturar la API. */
  private cargarReparaciones(ids: number[]) {
    from(ids).pipe(
      mergeMap(id => this.api.orden(id).pipe(
        // Todo lo demás es opcional: si falla, la orden sale sin ello.
        switchMap(orden => forkJoin({
          orden: of(orden),
          ficha: this.api.ficha(id).pipe(catchError(() => of(null))),
          multimedia: this.api.multimedia(id).pipe(catchError(() => of([] as MultimediaOrden[]))),
          vehiculo: this.api.vehiculo(orden.vehiculo.id).pipe(catchError(() => of(null))),
          resumenVehiculo: this.api.resumenVehiculo(orden.vehiculo.id).pipe(catchError(() => of(null)))
        })),
        catchError(() => {
          this.fallidas.update(f => [...f, `OT-${String(id).padStart(5, '0')}`]);
          return of(null);
        })
      ), 4)
    ).subscribe(x => {
      if (x) {
        this.cargadasPorId.update(m => new Map(m).set(x.orden.id, x));
      }
    });
  }

  protected imprimir() {
    window.print();
  }

  protected cerrar() {
    if (history.length > 1) history.back();
    else window.close();
  }
}
