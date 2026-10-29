import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { ESTADOS_ORDEN, TIPOS_SERVICIO, TIPOS_VEHICULO } from '../core/etiquetas';
import { EstadoOrden, OrdenListItem, TipoServicio } from '../core/models';
import { NumOrdenPipe } from '../shared/pipes';

/** Columnas del tablero, en el orden en que avanza un coche por el taller. */
const COLUMNAS: { estado: EstadoOrden; titulo: string; ayuda: string }[] = [
  { estado: 'Recibido', titulo: 'Recibido', ayuda: 'Pendiente de revisar' },
  { estado: 'EnDiagnostico', titulo: 'En diagnóstico', ayuda: 'Buscando la avería' },
  { estado: 'Presupuestado', titulo: 'Presupuestado', ayuda: 'Esperando al cliente' },
  { estado: 'EnReparacion', titulo: 'En reparación', ayuda: 'Manos a la obra' },
  { estado: 'Listo', titulo: 'Listo para recoger', ayuda: 'Avisar al cliente' },
  { estado: 'Entregado', titulo: 'Entregados', ayuda: 'Últimos 7 días' }
];

/** Plazo de la fecha prevista: vencida, hoy, mañana o más adelante. */
type Plazo = 'vencida' | 'hoy' | 'manana' | 'ok' | null;

const DIA = 86_400_000;
const REFRESCO = 60_000;

/** Fecha local en formato yyyy-MM-dd (como llegan las fechas previstas). */
const diaLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Página de inicio de la gestión: tablero kanban con los coches del taller por estado. Se arrastran las tarjetas entre
 * columnas (o con las flechas, en el móvil) para cambiar el estado. Se refresca solo cada minuto.
 */
@Component({
  selector: 'app-tablero',
  imports: [RouterLink, DatePipe, NumOrdenPipe],
  template: `
    <div class="page-header">
      <h1>Tablero del taller</h1>
      <a class="btn primary" routerLink="/gestion/ordenes/nueva">+ Nueva orden</a>
    </div>

    <div class="kpis">
      <div class="kpi"><span class="valor">{{ kpis().enTaller }}</span><span class="nombre">En el taller</span></div>
      <div class="kpi" [class.alerta]="kpis().retrasados">
        <span class="valor">{{ kpis().retrasados }}</span><span class="nombre">Retrasados</span>
      </div>
      <div class="kpi" [class.aviso]="kpis().hoy"><span class="valor">{{ kpis().hoy }}</span><span class="nombre">Para hoy</span></div>
      <div class="kpi" [class.lima]="kpis().listos"><span class="valor">{{ kpis().listos }}</span><span class="nombre">Listos para recoger</span></div>
      <div class="kpi"><span class="valor">{{ kpis().entregados }}</span><span class="nombre">Entregados (7 días)</span></div>
    </div>

    <div class="toolbar">
      <input type="search" placeholder="Matrícula, cliente, vehículo o motivo…" (input)="q.set($any($event.target).value)" />
      <label class="check">
        <input type="checkbox" [checked]="verEntregados()" (change)="verEntregados.set($any($event.target).checked)" />
        Ver entregados
      </label>
      <span class="hint actualizado">
        @if (actualizado(); as a) {
          Actualizado {{ a | date: 'HH:mm' }}
        }
        <button type="button" class="btn sm" (click)="cargar()" [disabled]="cargando()">↻</button>
      </span>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="tablero" [class.con-entregados]="verEntregados()">
      @for (c of columnas(); track c.estado) {
        <section
          class="columna"
          [attr.data-estado]="c.estado"
          [class.destino]="destino() === c.estado"
          (dragover)="sobre($event, c.estado)"
          (dragleave)="destino.set(null)"
          (drop)="soltar($event, c.estado)"
        >
          <header>
            <div>
              <h2>{{ c.titulo }}</h2>
              <span class="hint">{{ c.ayuda }}</span>
            </div>
            <span class="cuenta">{{ c.ordenes.length }}</span>
          </header>

          <div class="tarjetas">
            @for (o of c.ordenes; track o.id) {
              <article
                class="tarjeta"
                [class]="'plazo-' + (plazo(o) ?? 'ninguno')"
                [class.moviendo]="moviendo() === o.id"
                draggable="true"
                (dragstart)="arrastrar($event, o)"
                (dragend)="destino.set(null)"
                (click)="abrir(o)"
                tabindex="0"
                (keydown.enter)="abrir(o)"
              >
                <div class="fila">
                  <span class="mono num">{{ o.id | numOrden }}</span>
                  @if (o.estado !== 'Entregado') {
                    <span class="dias" [title]="'Entró el ' + (o.fechaEntrada | date: 'dd/MM/yyyy HH:mm')">
                      {{ dias(o) === 0 ? 'Hoy' : dias(o) + (dias(o) === 1 ? ' día' : ' días') }}
                    </span>
                  }
                </div>
                <div class="matricula mono">{{ o.matricula ?? 'Sin matrícula' }}</div>
                <div class="vehiculo">
                  {{ o.vehiculo || 'Vehículo' }}
                  @if (o.tipoVehiculo && o.tipoVehiculo !== 'Turismo') {
                    <span class="tipo">{{ tiposVehiculo[o.tipoVehiculo] }}</span>
                  }
                </div>
                <div class="cliente">{{ o.clienteNombre }}</div>
                @if (o.motivoEntrada) {
                  <p class="motivo">{{ o.motivoEntrada }}</p>
                }
                @if (o.servicios.length) {
                  <div class="servicios">
                    @for (s of o.servicios; track s) {
                      <span class="chip">{{ servicio(s) }}</span>
                    }
                  </div>
                }
                @if (o.estado === 'Listo' || o.estado === 'Entregado') {
                  <div class="cobro" [class.cobrado]="o.pagado">{{ o.pagado ? '✓ Pagado' : '€ Sin cobrar' }}</div>
                }
                <div class="fechas">
                  <span>Entrada {{ o.fechaEntrada | date: 'dd/MM' }}</span>
                  @if (o.estado === 'Entregado' && o.fechaSalida) {
                    <span>Salida {{ o.fechaSalida | date: 'dd/MM' }}</span>
                  } @else if (o.fechaPrevista) {
                    <span class="prevista">{{ textoPlazo(o) }}</span>
                  } @else {
                    <span class="hint">Sin fecha prevista</span>
                  }
                </div>
                <div class="mover">
                  <button type="button" class="flecha" [disabled]="!anterior(o.estado)" (click)="paso($event, o, -1)"
                    [attr.aria-label]="'Pasar a ' + etiqueta(anterior(o.estado))" [title]="'← ' + etiqueta(anterior(o.estado))">◀</button>
                  <button type="button" class="flecha" [disabled]="!siguiente(o.estado)" (click)="paso($event, o, 1)"
                    [attr.aria-label]="'Pasar a ' + etiqueta(siguiente(o.estado))" [title]="etiqueta(siguiente(o.estado)) + ' →'">▶</button>
                </div>
              </article>
            } @empty {
              <p class="vacia">{{ cargando() ? 'Cargando…' : 'Sin coches' }}</p>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: `
    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .kpi {
      background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border-strong);
      padding: 0.7rem 0.9rem; display: flex; flex-direction: column; gap: 0.15rem;
    }
    .kpi .valor { font-family: var(--font-display); font-size: 1.9rem; font-weight: 700; line-height: 1; }
    .kpi .nombre { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #9a9a9a); }
    .kpi.alerta { border-left-color: #ff4d4d; } .kpi.alerta .valor { color: #ff6b6b; }
    .kpi.aviso { border-left-color: #ffb020; } .kpi.aviso .valor { color: #ffc24d; }
    .kpi.lima { border-left-color: var(--primary); } .kpi.lima .valor { color: var(--primary); }

    .toolbar { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 1rem; }
    .toolbar input[type='search'] { flex: 1; min-width: 220px; max-width: 420px; }
    .check { display: inline-flex; gap: 0.4rem; align-items: center; cursor: pointer; white-space: nowrap; }
    .actualizado { margin-left: auto; display: inline-flex; gap: 0.5rem; align-items: center; }

    .tablero {
      display: grid; grid-template-columns: repeat(5, minmax(200px, 1fr)); gap: 0.75rem;
      overflow-x: auto; padding-bottom: 0.5rem; align-items: start;
    }
    .tablero.con-entregados { grid-template-columns: repeat(6, minmax(200px, 1fr)); }

    .columna {
      background: var(--surface); border: 1px solid var(--border); border-top: 3px solid var(--acento, var(--border-strong));
      display: flex; flex-direction: column; min-height: 240px; max-height: calc(100vh - 200px); transition: background 0.15s, border-color 0.15s;
    }
    .columna[data-estado='Recibido'] { --acento: #8a8a8a; }
    .columna[data-estado='EnDiagnostico'] { --acento: #4da3ff; }
    .columna[data-estado='Presupuestado'] { --acento: #b07cff; }
    .columna[data-estado='EnReparacion'] { --acento: #ff8a1f; }
    .columna[data-estado='Listo'] { --acento: var(--primary); }
    .columna[data-estado='Entregado'] { --acento: #3a3a3a; opacity: 0.85; }
    .columna.destino { background: var(--surface-2); border-color: var(--acento); outline: 1px dashed var(--acento); }

    .columna header { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; padding: 0.7rem 0.8rem 0.5rem; border-bottom: 1px solid var(--border); }
    .columna h2 { margin: 0; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.05em; font-family: var(--font-display); }
    .columna header .hint { font-size: 0.75rem; }
    .cuenta { background: var(--acento); color: #0a0a0a; font-weight: 700; min-width: 1.8rem; text-align: center; padding: 0.1rem 0.45rem; font-family: var(--font-display); }
    .columna[data-estado='Entregado'] .cuenta { color: #ddd; }

    .tarjetas { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.55rem; overflow-y: auto; flex: 1; }
    .vacia { text-align: center; color: var(--text-muted, #777); font-size: 0.85rem; margin: 1.5rem 0; }

    .tarjeta {
      background: var(--surface-2); border: 1px solid var(--border); border-left: 3px solid transparent;
      padding: 0.55rem 0.65rem; cursor: grab; display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.88rem;
      transition: border-color 0.12s, transform 0.12s;
    }
    .tarjeta:hover, .tarjeta:focus-visible { border-color: var(--border-strong); outline: none; transform: translateY(-1px); }
    .tarjeta:active { cursor: grabbing; }
    .tarjeta.moviendo { opacity: 0.5; pointer-events: none; }
    .tarjeta.plazo-vencida { border-left-color: #ff4d4d; }
    .tarjeta.plazo-hoy, .tarjeta.plazo-manana { border-left-color: #ffb020; }

    .fila { display: flex; justify-content: space-between; align-items: center; }
    .num { font-size: 0.75rem; color: var(--text-muted, #9a9a9a); }
    .dias { font-size: 0.72rem; font-weight: 600; background: var(--hover); padding: 0.05rem 0.4rem; }
    .matricula { font-size: 1.05rem; font-weight: 700; letter-spacing: 0.04em; color: var(--primary); }
    .vehiculo { font-weight: 600; }
    .tipo { font-size: 0.7rem; font-weight: 500; border: 1px solid var(--border-strong); padding: 0 0.3rem; margin-left: 0.25rem; }
    .cliente { color: var(--text-muted, #b0b0b0); }
    .motivo { margin: 0.15rem 0 0; font-size: 0.82rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .servicios { display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.15rem; }
    .chip { font-size: 0.68rem; background: var(--hover); border: 1px solid var(--border); padding: 0 0.35rem; }
    .fechas { display: flex; justify-content: space-between; gap: 0.5rem; margin-top: 0.25rem; font-size: 0.75rem; color: var(--text-muted, #9a9a9a); }
    .plazo-vencida .prevista { color: #ff6b6b; font-weight: 700; }
    .plazo-hoy .prevista, .plazo-manana .prevista { color: #ffc24d; font-weight: 700; }

    .cobro { align-self: flex-start; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #ffc24d; border: 1px solid #ffb020; padding: 0 6px; margin-top: 0.2rem; }
    .cobro.cobrado { color: var(--primary); border-color: var(--primary); }
    .mover { display: flex; justify-content: flex-end; gap: 0.25rem; margin-top: 0.2rem; }
    .flecha { background: transparent; border: 1px solid var(--border); color: inherit; font-size: 0.7rem; padding: 0.1rem 0.45rem; cursor: pointer; }
    .flecha:hover:not(:disabled) { border-color: var(--primary); color: var(--primary); }
    .flecha:disabled { opacity: 0.25; cursor: default; }

    @media (max-width: 700px) {
      .tablero, .tablero.con-entregados { grid-template-columns: repeat(var(--n, 5), 82vw); scroll-snap-type: x mandatory; }
      .tablero.con-entregados { --n: 6; }
      .columna { scroll-snap-align: start; max-height: none; }
      .actualizado { margin-left: 0; }
      .kpis { grid-template-columns: repeat(3, 1fr); gap: 0.4rem; }
      .kpi { padding: 0.45rem 0.55rem; }
      .kpi .valor { font-size: 1.4rem; }
      .kpi .nombre { font-size: 0.62rem; letter-spacing: 0.03em; }
    }
  `
})
export class Tablero {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  protected readonly tiposVehiculo = TIPOS_VEHICULO;
  protected readonly ordenes = signal<OrdenListItem[]>([]);
  protected readonly q = signal('');
  protected readonly verEntregados = signal(leerPreferencia());
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly actualizado = signal<Date | null>(null);
  protected readonly destino = signal<EstadoOrden | null>(null);
  protected readonly moviendo = signal<number | null>(null);
  private readonly hoy = signal(diaLocal(new Date()));
  private arrastrada: OrdenListItem | null = null;

  /** Órdenes que encajan con la búsqueda. */
  private readonly filtradas = computed(() => {
    const q = this.q().trim().toLowerCase();
    if (!q) return this.ordenes();
    return this.ordenes().filter(o =>
      [o.matricula, o.vehiculo, o.clienteNombre, o.motivoEntrada, String(o.id)].some(t => t?.toLowerCase().includes(q))
    );
  });

  protected readonly columnas = computed(() => {
    const lista = this.filtradas();
    return COLUMNAS.filter(c => c.estado !== 'Entregado' || this.verEntregados()).map(c => ({
      ...c,
      ordenes: lista.filter(o => o.estado === c.estado).sort((a, b) => this.comparar(a, b))
    }));
  });

  protected readonly kpis = computed(() => {
    const abiertas = this.ordenes().filter(o => o.estado !== 'Entregado' && o.estado !== 'Cancelado');
    const pendientes = abiertas.filter(o => o.estado !== 'Listo');
    return {
      enTaller: abiertas.length,
      retrasados: pendientes.filter(o => this.plazo(o) === 'vencida').length,
      hoy: pendientes.filter(o => this.plazo(o) === 'hoy').length,
      listos: abiertas.filter(o => o.estado === 'Listo').length,
      entregados: this.ordenes().filter(o => o.estado === 'Entregado').length
    };
  });

  constructor() {
    this.cargar();
    const reloj = setInterval(() => {
      // No refrescar a mitad de un arrastre o de un cambio: movería las tarjetas bajo el ratón.
      if (!this.arrastrada && this.moviendo() === null && document.visibilityState === 'visible') this.cargar();
    }, REFRESCO);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    effect(() => {
      const ver = this.verEntregados();
      try {
        localStorage.setItem('tablero.entregados', ver ? '1' : '0');
      } catch {
        // Sin almacenamiento (modo privado): se recuerda solo mientras dure la página.
      }
    });
  }

  cargar() {
    this.api.tablero().subscribe({
      next: lista => {
        this.ordenes.set(lista);
        this.hoy.set(diaLocal(new Date()));
        this.actualizado.set(new Date());
        this.cargando.set(false);
        this.error.set(null);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected plazo(o: OrdenListItem): Plazo {
    if (!o.fechaPrevista || o.estado === 'Entregado' || o.estado === 'Cancelado') return null;
    const hoy = this.hoy();
    if (o.fechaPrevista < hoy) return 'vencida';
    if (o.fechaPrevista === hoy) return 'hoy';
    const manana = diaLocal(new Date(Date.now() + DIA));
    return o.fechaPrevista === manana ? 'manana' : 'ok';
  }

  protected textoPlazo(o: OrdenListItem) {
    const p = this.plazo(o);
    const fecha = o.fechaPrevista!.split('-').reverse().slice(0, 2).join('/');
    if (p === 'vencida') {
      const dias = Math.round((Date.parse(this.hoy()) - Date.parse(o.fechaPrevista!)) / DIA);
      return `Retraso ${dias} ${dias === 1 ? 'día' : 'días'} (${fecha})`;
    }
    if (p === 'hoy') return 'Para hoy';
    if (p === 'manana') return 'Para mañana';
    return `Prevista ${fecha}`;
  }

  protected dias(o: OrdenListItem) {
    return Math.max(0, Math.floor((Date.now() - Date.parse(o.fechaEntrada)) / DIA));
  }

  protected servicio(s: TipoServicio) {
    return TIPOS_SERVICIO[s] ?? s;
  }

  protected etiqueta(e: EstadoOrden | null) {
    return e ? ESTADOS_ORDEN[e] : '';
  }

  protected anterior(e: EstadoOrden) {
    const i = COLUMNAS.findIndex(c => c.estado === e);
    return i > 0 ? COLUMNAS[i - 1].estado : null;
  }

  protected siguiente(e: EstadoOrden) {
    const i = COLUMNAS.findIndex(c => c.estado === e);
    return i >= 0 && i < COLUMNAS.length - 1 ? COLUMNAS[i + 1].estado : null;
  }

  protected abrir(o: OrdenListItem) {
    this.router.navigate(['/gestion/ordenes', o.id]);
  }

  protected paso(e: Event, o: OrdenListItem, sentido: 1 | -1) {
    e.stopPropagation();
    const estado = sentido === 1 ? this.siguiente(o.estado) : this.anterior(o.estado);
    if (estado) this.mover(o, estado);
  }

  protected arrastrar(e: DragEvent, o: OrdenListItem) {
    this.arrastrada = o;
    e.dataTransfer?.setData('text/plain', String(o.id));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  protected sobre(e: DragEvent, estado: EstadoOrden) {
    if (!this.arrastrada) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    this.destino.set(estado);
  }

  protected soltar(e: DragEvent, estado: EstadoOrden) {
    e.preventDefault();
    this.destino.set(null);
    const o = this.arrastrada;
    this.arrastrada = null;
    if (o && o.estado !== estado) this.mover(o, estado);
  }

  /** Cambia el estado al momento en pantalla y lo deshace si la API falla. */
  private mover(o: OrdenListItem, estado: EstadoOrden) {
    if (estado === 'Entregado' && !confirm(`¿Marcar ${o.matricula ?? o.vehiculo} como entregado al cliente?`)) return;
    const antes = o.estado;
    const fechaSalida = estado === 'Entregado' ? new Date().toISOString() : null;
    this.reemplazar(o.id, { estado, fechaSalida });
    this.moviendo.set(o.id);
    this.api.cambiarEstado(o.id, estado).subscribe({
      next: d => {
        this.reemplazar(o.id, { estado: d.estado, fechaSalida: d.fechaSalida });
        this.moviendo.set(null);
      },
      error: err => {
        this.reemplazar(o.id, { estado: antes, fechaSalida: o.fechaSalida });
        this.moviendo.set(null);
        this.error.set(`No se ha podido mover ${o.matricula ?? 'la orden'}: ${mensajeError(err)}`);
      }
    });
  }

  private reemplazar(id: number, cambios: Partial<OrdenListItem>) {
    this.ordenes.update(l => l.map(x => (x.id === id ? { ...x, ...cambios } : x)));
  }

  /** Lo más urgente arriba: retrasadas, después por fecha prevista y por antigüedad. Entregados: el último primero. */
  private comparar(a: OrdenListItem, b: OrdenListItem) {
    if (a.estado === 'Entregado') return (b.fechaSalida ?? '').localeCompare(a.fechaSalida ?? '');
    const pa = a.fechaPrevista ?? '9999-12-31';
    const pb = b.fechaPrevista ?? '9999-12-31';
    return pa.localeCompare(pb) || a.fechaEntrada.localeCompare(b.fechaEntrada);
  }
}

function leerPreferencia() {
  try {
    return localStorage.getItem('tablero.entregados') !== '0';
  } catch {
    return true;
  }
}
