import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { CATEGORIAS_GASTO, TIPOS_SERVICIO } from '../core/etiquetas';
import { AjustesContabilidad, ResumenContabilidad } from '../core/models';
import { NumOrdenPipe } from '../shared/pipes';

/** Contabilidad: resumen del periodo y gastos. */
@Component({
  selector: 'app-contabilidad',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page-header">
      <h1>Contabilidad</h1>
      <nav class="chips" aria-label="Secciones de contabilidad">
        <a routerLink="resumen" routerLinkActive="active">Resumen</a>
        <a routerLink="gastos" routerLinkActive="active">Gastos</a>
      </nav>
    </div>
    <router-outlet />
  `
})
export class Contabilidad {}

type Periodo = 'mes' | 'mes-anterior' | 'trimestre' | 'anio' | 'anio-anterior' | 'personalizado';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Fechas [desde, hasta] de un periodo predefinido, en la hora local. */
export function rangoPeriodo(p: Exclude<Periodo, 'personalizado'>, hoy = new Date()): [string, string] {
  const y = hoy.getFullYear(), m = hoy.getMonth();
  switch (p) {
    case 'mes': return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))];
    case 'mes-anterior': return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))];
    case 'trimestre': { const t = Math.floor(m / 3) * 3; return [iso(new Date(y, t, 1)), iso(new Date(y, t + 3, 0))]; }
    case 'anio': return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))];
    case 'anio-anterior': return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))];
  }
}

function leerConIva() {
  try {
    return localStorage.getItem('contabilidad.conIva') !== '0';
  } catch {
    return true;
  }
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Colores de las series del gráfico mensual (validados para el fondo oscuro del portal). */
const COLOR_FACTURADO = '#729f00';
const COLOR_GASTOS = '#3b82e6';

@Component({
  selector: 'app-contabilidad-resumen',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, NumOrdenPipe],
  template: `
    <div class="toolbar periodo">
      <div class="chips" role="group" aria-label="Periodo">
        @for (p of periodos; track p.valor) {
          <button type="button" [class.active]="periodo() === p.valor" (click)="elegir(p.valor)">{{ p.texto }}</button>
        }
      </div>
      <div class="chips iva" role="group" aria-label="Importes con o sin IVA">
        <button type="button" [class.active]="conIva()" (click)="cambiarIva(true)">Con IVA</button>
        <button type="button" [class.active]="!conIva()" (click)="cambiarIva(false)">Sin IVA</button>
      </div>
      @if (periodo() === 'personalizado') {
        <label class="fecha">Desde <input type="date" [ngModel]="desde()" (ngModelChange)="desde.set($event); cargar()" /></label>
        <label class="fecha">Hasta <input type="date" [ngModel]="hasta()" (ngModelChange)="hasta.set($event); cargar()" /></label>
      }
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (r(); as r) {
      <section class="beneficio" [class.negativo]="r.beneficio < 0">
        <div class="cifra">
          <span class="k">Beneficio <span class="modo">{{ etiquetaIva() }}</span></span>
          <span class="v" [class.lima]="r.beneficio >= 0" [class.rojo]="r.beneficio < 0">{{ r.beneficio | currency: 'EUR' }}</span>
        </div>
        <div class="cuenta" aria-label="Cálculo del beneficio">
          <span><span class="hint">Cobrado</span> {{ r.cobrado | currency: 'EUR' }}</span>
          <span class="op">−</span>
          <span><span class="hint">Coste real de las piezas</span> {{ r.costePiezasCobradas | currency: 'EUR' }}</span>
          <span class="op">−</span>
          <span><span class="hint">Gastos generales</span> {{ r.gastosGenerales | currency: 'EUR' }}</span>
        </div>
        <p class="hint nota">Las compras ligadas a una orden no se restan otra vez: su coste ya está en las líneas de esa orden.</p>
      </section>

      <div class="kpis">
        <div class="kpi">
          <span class="k">Facturado <span class="modo">{{ etiquetaIva() }}</span></span>
          <span class="v">{{ r.facturado | currency: 'EUR' }}</span>
          <span class="hint">{{ r.ordenesEntregadas }} {{ r.ordenesEntregadas === 1 ? 'orden entregada' : 'órdenes entregadas' }}</span>
        </div>
        <div class="kpi">
          <span class="k">Cobrado <span class="modo">{{ etiquetaIva() }}</span></span>
          <span class="v lima">{{ r.cobrado | currency: 'EUR' }}</span>
          <span class="hint">Órdenes marcadas como pagadas</span>
        </div>
        <div class="kpi">
          <span class="k">Gastos</span>
          <span class="v">{{ r.gastos | currency: 'EUR' }}</span>
          <a class="hint" routerLink="../gastos">Ver y añadir gastos →</a>
        </div>
        <div class="kpi" [class.negativo]="r.resultado < 0">
          <span class="k">Resultado</span>
          <span class="v" [class.lima]="r.resultado >= 0" [class.rojo]="r.resultado < 0">{{ r.resultado | currency: 'EUR' }}</span>
          <span class="hint">Cobrado {{ etiquetaIva() }} − gastos pagados</span>
        </div>
        <div class="kpi" [class.aviso]="r.pendienteCobro > 0">
          <span class="k">Pendiente de cobro <span class="modo">{{ etiquetaIva() }}</span></span>
          <span class="v" [class.ambar]="r.pendienteCobro > 0">{{ r.pendienteCobro | currency: 'EUR' }}</span>
          <span class="hint">{{ r.ordenesPendientesCobro }} {{ r.ordenesPendientesCobro === 1 ? 'orden terminada' : 'órdenes terminadas' }} sin pagar</span>
        </div>
        <div class="kpi">
          <span class="k">Margen de las órdenes</span>
          <span class="v">{{ r.margenOrdenes | currency: 'EUR' }}</span>
          <span class="hint">Mano de obra {{ r.manoObra | currency: 'EUR' : 'symbol' : '1.0-0' }} · piezas {{ r.piezas | currency: 'EUR' : 'symbol' : '1.0-0' }} − coste {{ r.costePiezas | currency: 'EUR' : 'symbol' : '1.0-0' }}</span>
        </div>
      </div>

      <section class="card">
        <div class="cabecera-grafico">
          <h2>Últimos 12 meses <span class="modo">{{ etiquetaIva() }}</span></h2>
          <div class="leyenda">
            <span><i [style.background]="colorFacturado"></i>Facturado</span>
            <span><i [style.background]="colorGastos"></i>Gastos</span>
            <button type="button" class="btn small" (click)="verTabla.set(!verTabla())">{{ verTabla() ? 'Ver gráfico' : 'Ver tabla' }}</button>
          </div>
        </div>
        @if (!verTabla()) {
          <p class="lectura" aria-live="polite">
            @if (mesActivo(); as m) {
              <strong>{{ m.etiqueta }}</strong> · Facturado {{ m.facturado | currency: 'EUR' }} · Cobrado {{ m.cobrado | currency: 'EUR' }} · Gastos {{ m.gastos | currency: 'EUR' }}
            } @else {
              <span class="hint">Pasa el ratón (o toca) sobre un mes para ver sus importes.</span>
            }
          </p>
          <svg class="barras" [attr.viewBox]="'0 0 ' + grafico().ancho + ' ' + grafico().alto" role="img" aria-label="Facturado y gastos por mes">
            @for (t of grafico().marcas; track t.y) {
              <line [attr.x1]="40" [attr.x2]="grafico().ancho" [attr.y1]="t.y" [attr.y2]="t.y" class="rejilla" />
              <text x="34" [attr.y]="t.y + 4" class="eje" text-anchor="end">{{ t.texto }}</text>
            }
            @for (b of grafico().barras; track b.i) {
              <g (mouseenter)="activo.set(b.i)" (mouseleave)="activo.set(null)" (click)="activo.set(b.i)" [class.atenuada]="activo() !== null && activo() !== b.i">
                <rect [attr.x]="b.x - 4" y="0" [attr.width]="b.anchoGrupo + 8" [attr.height]="grafico().alto - 22" class="zona" />
                <path [attr.d]="b.fact" [attr.fill]="colorFacturado" />
                <path [attr.d]="b.gast" [attr.fill]="colorGastos" />
                <text [attr.x]="b.x + b.anchoGrupo / 2" [attr.y]="grafico().alto - 6" class="eje" text-anchor="middle">{{ b.etiqueta }}</text>
              </g>
            }
          </svg>
        } @else {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Mes</th><th class="num">Facturado</th><th class="num">Cobrado</th><th class="num">Gastos</th></tr></thead>
              <tbody>
                @for (m of r.meses; track m.mes) {
                  <tr>
                    <td>{{ m.mes | date: 'MMMM yyyy' }}</td>
                    <td class="num">{{ m.facturado | currency: 'EUR' }}</td>
                    <td class="num">{{ m.cobrado | currency: 'EUR' }}</td>
                    <td class="num">{{ m.gastos | currency: 'EUR' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>

      <div class="dos">
        <section class="card">
          <h2>Gastos por categoría</h2>
          @for (g of r.gastosPorCategoria; track g.categoria) {
            <div class="fila-barra" [title]="g.numero + (g.numero === 1 ? ' gasto' : ' gastos')">
              <span class="nombre">{{ categorias[g.categoria] }}</span>
              <span class="pista"><span class="relleno" [style.width.%]="pct(g.importe, maxCategoria())" [style.background]="colorGastos"></span></span>
              <span class="importe">{{ g.importe | currency: 'EUR' }}</span>
            </div>
          } @empty {
            <p class="hint">Sin gastos en este periodo. <a routerLink="../gastos">Añadir un gasto</a></p>
          }
        </section>
        <section class="card">
          <h2>Facturado por servicio</h2>
          @for (s of r.ingresosPorServicio; track s.servicio) {
            <div class="fila-barra">
              <span class="nombre">{{ servicios[s.servicio] }}</span>
              <span class="pista"><span class="relleno" [style.width.%]="pct(s.importe, maxServicio())" [style.background]="colorFacturado"></span></span>
              <span class="importe">{{ s.importe | currency: 'EUR' }}</span>
            </div>
          } @empty {
            <p class="hint">Sin órdenes entregadas en este periodo.</p>
          }
          @if (r.mejoresClientes.length) {
            <h3>Mejores clientes</h3>
            @for (c of r.mejoresClientes; track c.clienteId) {
              <div class="fila">
                <a [routerLink]="['/gestion/clientes', c.clienteId]">{{ c.nombre }}</a>
                <span class="hint">{{ c.ordenes }} {{ c.ordenes === 1 ? 'orden' : 'órdenes' }}</span>
                <span class="importe">{{ c.importe | currency: 'EUR' }}</span>
              </div>
            }
          }
        </section>
      </div>

      @if (r.sinCobrar.length) {
        <section class="card">
          <h2>Pendiente de cobro <span class="hint">(de cualquier fecha)</span></h2>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Orden</th><th>Vehículo</th><th>Cliente</th><th>Estado</th><th class="num">Importe</th></tr></thead>
              <tbody>
                @for (o of r.sinCobrar; track o.id) {
                  <tr>
                    <td class="mono"><a [routerLink]="['/gestion/ordenes', o.id]">{{ o.id | numOrden }}</a></td>
                    <td><span class="mono">{{ o.matricula ?? '—' }}</span>&nbsp;<span class="hint">{{ o.vehiculo }}</span></td>
                    <td>{{ o.clienteNombre }}</td>
                    <td>{{ o.estado === 'Listo' ? 'Listo para recoger' : 'Entregado ' + (o.fechaSalida | date: 'dd/MM/yyyy') }}</td>
                    <td class="num ambar">{{ o.total | currency: 'EUR' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      }

      <section class="card">
        <h2>Órdenes entregadas en el periodo</h2>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Orden</th><th>Entrega</th><th>Vehículo</th><th>Cliente</th><th class="num">Total</th><th class="num">Coste piezas</th><th class="num">Margen</th><th>Pago</th></tr></thead>
            <tbody>
              @for (o of r.ordenes; track o.id) {
                <tr>
                  <td class="mono"><a [routerLink]="['/gestion/ordenes', o.id]">{{ o.id | numOrden }}</a></td>
                  <td>{{ o.fechaSalida | date: 'dd/MM/yyyy' }}</td>
                  <td><span class="mono">{{ o.matricula ?? '—' }}</span>&nbsp;<span class="hint">{{ o.vehiculo }}</span></td>
                  <td>{{ o.clienteNombre }}</td>
                  <td class="num">{{ o.total | currency: 'EUR' }}</td>
                  <td class="num hint">{{ o.coste | currency: 'EUR' }}</td>
                  <td class="num" [class.rojo]="o.margen < 0">{{ o.margen | currency: 'EUR' }}</td>
                  <td>{{ o.pagado ? '✓ ' + (o.fechaPago | date: 'dd/MM') : 'Sin cobrar' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty">No se entregó ninguna orden en este periodo.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card ajustes">
        <h2>Ajustes</h2>
        <label class="field" style="max-width: 280px">
          IVA por defecto en las líneas nuevas (%)
          <input type="number" min="0" max="100" step="1" [ngModel]="iva()" (ngModelChange)="iva.set($event)" />
          <span class="hint">Pon 0 si no aplicas IVA. No cambia las líneas que ya existen.</span>
        </label>
        <label class="field" style="flex: 1; min-width: 220px">
          Titular para las facturas
          <input [ngModel]="razonSocial()" (ngModelChange)="razonSocial.set($event)" maxlength="200" placeholder="Nombre y apellidos o razón social" />
        </label>
        <label class="field" style="max-width: 160px">
          NIF / CIF
          <input [ngModel]="nif()" (ngModelChange)="nif.set($event)" maxlength="20" class="mono" />
        </label>
        <label class="field" style="width: 100%">
          Texto al pie de las facturas
          <textarea rows="2" [ngModel]="pieFactura()" (ngModelChange)="pieFactura.set($event)" maxlength="1000"
            placeholder="Opcional: forma de pago, IBAN o, si no aplicas IVA, el motivo de la exención"></textarea>
          <span class="hint">El titular y el NIF son obligatorios para emitir facturas. La dirección se toma de Web → Datos del taller.</span>
        </label>
        <button type="button" class="btn" (click)="guardarIva()">Guardar</button>
        @if (ivaGuardado()) {
          <span class="hint">Guardado</span>
        }
      </section>
    } @else if (!error()) {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    .periodo { align-items: flex-end; }
    .fecha { display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
    .beneficio { background: var(--surface); border: 1px solid var(--border); border-left: 4px solid var(--primary); padding: 0.9rem 1.1rem; margin-bottom: 0.75rem; display: flex; flex-wrap: wrap; gap: 0.6rem 2rem; align-items: center; }
    .beneficio.negativo { border-left-color: #ff5c5c; }
    .beneficio .cifra { display: flex; flex-direction: column; }
    .beneficio .k { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .beneficio .v { font-family: var(--font-display); font-size: 2.1rem; font-weight: 700; line-height: 1.1; }
    .beneficio .cuenta { display: flex; flex-wrap: wrap; gap: 0.4rem 0.8rem; align-items: baseline; font-variant-numeric: tabular-nums; }
    .beneficio .cuenta > span:not(.op) { display: inline-flex; flex-direction: column; }
    .beneficio .cuenta .hint { font-size: 0.72rem; }
    .beneficio .op { color: var(--muted); font-size: 1.2rem; }
    .beneficio .nota { width: 100%; margin: 0; font-size: 0.75rem; }
    .kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border-strong); padding: 0.75rem 0.9rem; display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .modo { font-size: 0.68rem; color: var(--muted); text-transform: none; letter-spacing: 0; font-family: var(--font-body); font-weight: 400; }
    .iva { margin-left: auto; }
    .kpi .k { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .kpi .v { font-family: var(--font-display); font-size: 1.55rem; font-weight: 700; }
    .kpi .hint { font-size: 0.78rem; }
    .kpi.aviso { border-left-color: #ffb020; }
    .kpi.negativo { border-left-color: #ff5c5c; }
    .lima { color: var(--primary); } .rojo { color: #ff6b6b; } .ambar { color: #ffc24d; }
    .cabecera-grafico { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .cabecera-grafico h2 { margin: 0; }
    .leyenda { display: flex; flex-wrap: wrap; gap: 0.9rem; align-items: center; font-size: 0.85rem; }
    .leyenda i { display: inline-block; width: 12px; height: 12px; border-radius: 2px; margin-right: 0.35rem; vertical-align: -1px; }
    .lectura { min-height: 1.5rem; margin: 0.6rem 0 0.3rem; font-size: 0.88rem; }
    .barras { width: 100%; height: auto; display: block; }
    .barras .rejilla { stroke: var(--border); stroke-width: 1; }
    .barras .eje { fill: var(--muted); font-size: 11px; }
    .barras .zona { fill: transparent; cursor: pointer; }
    .barras .atenuada path { opacity: 0.35; }
    .dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
    .dos .card { margin: 0; }
    .fila-barra { display: grid; grid-template-columns: minmax(0, 11rem) 1fr auto; gap: 0.6rem; align-items: center; padding: 0.3rem 0; font-size: 0.88rem; }
    .fila-barra .nombre { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pista { height: 10px; background: var(--surface-2); }
    .relleno { display: block; height: 100%; border-radius: 0 3px 3px 0; min-width: 2px; }
    .importe { font-variant-numeric: tabular-nums; text-align: right; }
    h3 { margin: 1.2rem 0 0.4rem; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .fila { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.25rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem; }
    .fila .importe { margin-left: auto; }
    @media (max-width: 900px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 480px) { .kpis { grid-template-columns: minmax(0, 1fr); } }
    .ajustes { display: flex; flex-wrap: wrap; gap: 0.8rem; align-items: flex-end; }
    .ajustes h2 { width: 100%; margin: 0; }
  `
})
export class ContabilidadResumen {
  private readonly api = inject(Api);

  protected readonly periodos: { valor: Periodo; texto: string }[] = [
    { valor: 'mes', texto: 'Este mes' },
    { valor: 'mes-anterior', texto: 'Mes anterior' },
    { valor: 'trimestre', texto: 'Trimestre' },
    { valor: 'anio', texto: 'Este año' },
    { valor: 'anio-anterior', texto: 'Año anterior' },
    { valor: 'personalizado', texto: 'Fechas…' }
  ];
  protected readonly categorias = CATEGORIAS_GASTO;
  protected readonly servicios = TIPOS_SERVICIO;
  protected readonly colorFacturado = COLOR_FACTURADO;
  protected readonly colorGastos = COLOR_GASTOS;

  protected readonly periodo = signal<Periodo>('mes');
  /** Importes de las órdenes con o sin IVA; se recuerda en este navegador. */
  protected readonly conIva = signal(leerConIva());
  protected readonly etiquetaIva = computed(() => (this.conIva() ? '(con IVA)' : '(sin IVA)'));
  protected readonly desde = signal(rangoPeriodo('mes')[0]);
  protected readonly hasta = signal(rangoPeriodo('mes')[1]);
  protected readonly r = signal<ResumenContabilidad | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly verTabla = signal(false);
  protected readonly activo = signal<number | null>(null);
  protected readonly iva = signal(21);
  protected readonly ivaGuardado = signal(false);
  protected readonly razonSocial = signal('');
  protected readonly nif = signal('');
  protected readonly pieFactura = signal('');

  protected readonly maxCategoria = computed(() => Math.max(1, ...(this.r()?.gastosPorCategoria ?? []).map(g => g.importe)));
  protected readonly maxServicio = computed(() => Math.max(1, ...(this.r()?.ingresosPorServicio ?? []).map(s => s.importe)));

  /** Barras agrupadas por mes (facturado y gastos), con las puntas redondeadas y un hueco de 2 px entre ellas. */
  protected readonly grafico = computed(() => {
    const meses = this.r()?.meses ?? [];
    const ancho = 760, alto = 230, izq = 44, abajo = 22, arriba = 8;
    const maximo = Math.max(1, ...meses.flatMap(m => [m.facturado, m.gastos]));
    const paso = this.redondear(maximo / 4);
    const tope = paso * 4;
    const h = alto - abajo - arriba;
    const y = (v: number) => arriba + h - (v / tope) * h;
    const grupo = (ancho - izq) / Math.max(1, meses.length);
    const barra = Math.min(18, (grupo - 14) / 2);
    const pathBarra = (x: number, v: number) => {
      if (v <= 0) return '';
      const top = y(v), base = y(0), r = Math.min(4, (base - top) / 2, barra / 2);
      return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barra - r} Q${x + barra},${top} ${x + barra},${top + r} V${base} Z`;
    };
    const barras = meses.map((m, i) => {
      const x = izq + i * grupo + (grupo - (barra * 2 + 2)) / 2;
      const f = new Date(m.mes + 'T00:00:00');
      return {
        i, x, anchoGrupo: barra * 2 + 2,
        fact: pathBarra(x, m.facturado),
        gast: pathBarra(x + barra + 2, m.gastos),
        etiqueta: MESES[f.getMonth()] + (f.getMonth() === 0 ? ` ${String(f.getFullYear()).slice(2)}` : '')
      };
    });
    const marcas = [0, 1, 2, 3, 4].map(k => ({ y: y(paso * k), texto: this.corto(paso * k) }));
    return { ancho, alto, barras, marcas };
  });

  protected readonly mesActivo = computed(() => {
    const i = this.activo();
    const m = i === null ? null : this.r()?.meses[i];
    if (!m) return null;
    const f = new Date(m.mes + 'T00:00:00');
    return { ...m, etiqueta: f.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }) };
  });

  constructor() {
    this.cargar();
    this.api.ajustesContabilidad().subscribe({ next: a => this.mostrarAjustes(a), error: () => {} });
  }

  protected elegir(p: Periodo) {
    this.periodo.set(p);
    if (p !== 'personalizado') {
      const [d, h] = rangoPeriodo(p);
      this.desde.set(d);
      this.hasta.set(h);
      this.cargar();
    }
  }

  protected cargar() {
    if (!this.desde() || !this.hasta()) return;
    this.api.resumenContabilidad(this.desde(), this.hasta(), this.conIva()).subscribe({
      next: r => {
        this.r.set(r);
        this.error.set(null);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected cambiarIva(conIva: boolean) {
    this.conIva.set(conIva);
    try {
      localStorage.setItem('contabilidad.conIva', conIva ? '1' : '0');
    } catch {
      // Sin almacenamiento (modo privado): se recuerda solo mientras dure la página.
    }
    this.cargar();
  }

  protected guardarIva() {
    const v = Number(this.iva());
    if (!(v >= 0 && v <= 100)) {
      this.error.set('El IVA debe estar entre 0 y 100.');
      return;
    }
    const t = (x: string) => x?.trim() || null;
    this.api.guardarAjustesContabilidad({ ivaPorDefecto: v, razonSocial: t(this.razonSocial()), nif: t(this.nif()), pieFactura: t(this.pieFactura()) }).subscribe({
      next: a => {
        this.mostrarAjustes(a);
        this.ivaGuardado.set(true);
        setTimeout(() => this.ivaGuardado.set(false), 2500);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  private mostrarAjustes(a: AjustesContabilidad) {
    this.iva.set(a.ivaPorDefecto);
    this.razonSocial.set(a.razonSocial ?? '');
    this.nif.set(a.nif ?? '');
    this.pieFactura.set(a.pieFactura ?? '');
  }

  protected pct(v: number, max: number) {
    return Math.max(0, Math.min(100, (v / max) * 100));
  }

  /** Paso «redondo» para el eje (1, 2, 2,5 o 5 × potencia de 10). */
  private redondear(v: number) {
    const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
    return ([1, 2, 2.5, 5, 10].find(m => m * p >= v) ?? 10) * p;
  }

  private corto(v: number) {
    return v >= 1000 ? `${(v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })}k` : `${Math.round(v)}`;
  }
}
