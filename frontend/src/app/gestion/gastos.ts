import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { CATEGORIAS_GASTO, METODOS_PAGO, opciones } from '../core/etiquetas';
import { CategoriaGasto, Gasto, GastoRequest, MetodoPago, OrdenListItem } from '../core/models';
import { NumOrdenPipe } from '../shared/pipes';
import { rangoPeriodo } from './contabilidad';

type Filtro = 'mes' | 'mes-anterior' | 'anio' | 'todo';

const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const vacio = (): GastoRequest => ({
  fecha: hoy(), categoria: 'Recambios', concepto: '', proveedor: null, importe: 0, metodoPago: 'Efectivo', notas: null, ordenTrabajoId: null
});

/** Gastos del taller: lista con filtros, alta y edición, y ticket adjunto. ?orden=N abre el alta ligada a esa orden. */
@Component({
  selector: 'app-gastos',
  imports: [FormsModule, RouterLink, CurrencyPipe, DatePipe, NumOrdenPipe],
  template: `
    <div class="toolbar">
      <div class="chips" role="group" aria-label="Periodo">
        @for (f of filtros; track f.valor) {
          <button type="button" [class.active]="filtro() === f.valor" (click)="filtro.set(f.valor); cargar()">{{ f.texto }}</button>
        }
      </div>
      <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event); cargar()" aria-label="Categoría">
        <option value="">Todas las categorías</option>
        @for (c of categorias; track c.valor) {
          <option [value]="c.valor">{{ c.etiqueta }}</option>
        }
      </select>
      <input type="search" placeholder="Concepto, proveedor…" (input)="buscar($any($event.target).value)" />
      <button type="button" class="btn primary" (click)="nuevo()">+ Nuevo gasto</button>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (editando(); as e) {
      <form class="card formulario" (ngSubmit)="guardar()">
        <h2>{{ e.id ? 'Editar gasto' : 'Nuevo gasto' }}</h2>
        <div class="form-grid">
          <label class="field">Fecha *<input type="date" name="fecha" [(ngModel)]="modelo.fecha" required /></label>
          <label class="field">
            Categoría *
            <select name="categoria" [(ngModel)]="modelo.categoria">
              @for (c of categorias; track c.valor) {
                <option [value]="c.valor">{{ c.etiqueta }}</option>
              }
            </select>
          </label>
          <label class="field">Importe pagado (€) *<input type="number" name="importe" min="0.01" step="0.01" [(ngModel)]="modelo.importe" required /></label>
          <label class="field" style="grid-column: span 2">Concepto *<input name="concepto" [(ngModel)]="modelo.concepto" maxlength="300" placeholder="Pastillas de freno delanteras" required /></label>
          <label class="field">
            Proveedor
            <input name="proveedor" [(ngModel)]="modelo.proveedor" list="proveedores-gasto" maxlength="150" />
            <datalist id="proveedores-gasto">
              @for (p of proveedores(); track p) {
                <option [value]="p"></option>
              }
            </datalist>
          </label>
          <label class="field">
            Forma de pago
            <select name="metodo" [(ngModel)]="modelo.metodoPago">
              @for (m of metodos; track m.valor) {
                <option [value]="m.valor">{{ m.etiqueta }}</option>
              }
            </select>
          </label>
          <label class="field" style="grid-column: span 2">
            Para la orden (opcional)
            <select name="orden" [(ngModel)]="modelo.ordenTrabajoId">
              <option [ngValue]="null">— Gasto general —</option>
              @for (o of ordenes(); track o.id) {
                <option [ngValue]="o.id">{{ o.id | numOrden }} · {{ o.matricula ?? 'sin matrícula' }} · {{ o.vehiculo }} · {{ o.clienteNombre }}</option>
              }
            </select>
            <span class="hint">Úsalo para las piezas compradas para una reparación.</span>
          </label>
          <label class="field full">Notas<textarea name="notas" [(ngModel)]="modelo.notas" maxlength="2000"></textarea></label>
          <div class="field full">
            Ticket o factura del proveedor
            @if (e.adjuntoUrl) {
              <div class="adjunto">
                <a [href]="e.adjuntoUrl" target="_blank" rel="noopener">{{ e.adjuntoTipo === 'application/pdf' ? 'PDF' : 'Foto' }} · {{ e.adjuntoNombre }}</a>
                <button type="button" class="btn small" (click)="quitarAdjunto(e)">Quitar</button>
              </div>
            }
            <div class="adjunto">
              <label class="btn small">
                <input type="file" accept="application/pdf,image/*" capture="environment" (change)="elegirArchivo($event)" />
                📷 {{ archivo() ? 'Cambiar' : e.adjuntoUrl ? 'Sustituir' : 'Foto o PDF' }}
              </label>
              @if (archivo(); as a) {
                <span class="hint">{{ a.name }} (se sube al guardar)</span>
              }
            </div>
          </div>
        </div>
        <div class="form-actions">
          @if (e.id) {
            <button type="button" class="btn danger" (click)="eliminar(e)" style="margin-right: auto">Eliminar</button>
          }
          <button type="button" class="btn" (click)="cerrar()">Cancelar</button>
          <button type="submit" class="btn primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : 'Guardar' }}</button>
        </div>
      </form>
    }

    <div class="resumen-gastos">
      <span>{{ lista().length }} {{ lista().length === 1 ? 'gasto' : 'gastos' }}</span>
      <strong>{{ total() | currency: 'EUR' }}</strong>
    </div>

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead><tr><th>Fecha</th><th>Concepto</th><th>Categoría</th><th>Proveedor</th><th>Orden</th><th>Pago</th><th class="num">Importe</th><th></th></tr></thead>
        <tbody>
          @for (g of lista(); track g.id) {
            <tr class="clickable" (click)="editar(g)">
              <td>{{ g.fecha | date: 'dd/MM/yyyy' }}</td>
              <td>{{ g.concepto }}@if (g.notas) {<div class="hint corta">{{ g.notas }}</div>}</td>
              <td>{{ etiquetaCategoria[g.categoria] }}</td>
              <td>{{ g.proveedor ?? '—' }}</td>
              <td>
                @if (g.ordenTrabajoId) {
                  <a class="mono" [routerLink]="['/gestion/ordenes', g.ordenTrabajoId]" (click)="$event.stopPropagation()">{{ g.ordenTrabajoId | numOrden }}</a>
                  <div class="hint mono">{{ g.ordenMatricula }}</div>
                }
              </td>
              <td>{{ etiquetaMetodo[g.metodoPago] }}</td>
              <td class="num">{{ g.importe | currency: 'EUR' }}</td>
              <td>
                @if (g.adjuntoUrl) {
                  <a [href]="g.adjuntoUrl" target="_blank" rel="noopener" (click)="$event.stopPropagation()" title="Ver ticket">📎</a>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="empty">{{ cargando() ? 'Cargando…' : 'No hay gastos con estos filtros.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    .formulario h2 { margin-top: 0; }
    .adjunto { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-top: 0.4rem; }
    .adjunto label { position: relative; cursor: pointer; }
    .adjunto input[type='file'] { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .resumen-gastos { display: flex; justify-content: space-between; align-items: baseline; margin: 0 0 0.5rem; padding: 0 0.2rem; }
    .resumen-gastos strong { font-family: var(--font-display); font-size: 1.3rem; }
    .corta { max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  `
})
export class Gastos implements OnInit {
  private readonly api = inject(Api);
  /** ?orden=N: abre el alta de un gasto ligado a esa orden. */
  readonly orden = input<string | undefined>();

  protected readonly filtros: { valor: Filtro; texto: string }[] = [
    { valor: 'mes', texto: 'Este mes' },
    { valor: 'mes-anterior', texto: 'Mes anterior' },
    { valor: 'anio', texto: 'Este año' },
    { valor: 'todo', texto: 'Todos' }
  ];
  protected readonly categorias = opciones(CATEGORIAS_GASTO);
  protected readonly metodos = opciones(METODOS_PAGO);
  protected readonly etiquetaCategoria = CATEGORIAS_GASTO;
  protected readonly etiquetaMetodo = METODOS_PAGO;

  protected readonly filtro = signal<Filtro>('mes');
  protected readonly categoria = signal<CategoriaGasto | ''>('');
  protected readonly lista = signal<Gasto[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly proveedores = signal<string[]>([]);
  protected readonly ordenes = signal<OrdenListItem[]>([]);
  protected readonly editando = signal<Partial<Gasto> | null>(null);
  protected readonly archivo = signal<File | null>(null);
  protected readonly guardando = signal(false);
  protected readonly total = computed(() => this.lista().reduce((s, g) => s + g.importe, 0));
  protected modelo: GastoRequest = vacio();
  private q = '';
  private temporizador?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.cargar();
    this.api.proveedoresGastos().subscribe({ next: p => this.proveedores.set(p), error: () => {} });
    this.api.ordenes({}).subscribe({ next: o => this.ordenes.set(o.filter(x => x.estado !== 'Cancelado')), error: () => {} });
    const orden = Number(this.orden());
    if (orden > 0) {
      this.nuevo();
      this.modelo.ordenTrabajoId = orden;
    }
  }

  protected cargar() {
    const f = this.filtro();
    const [desde, hasta] = f === 'todo' ? ['', ''] : rangoPeriodo(f);
    this.api.gastos({ desde, hasta, categoria: this.categoria(), q: this.q }).subscribe({
      next: l => {
        this.lista.set(l);
        this.cargando.set(false);
        this.error.set(null);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected buscar(q: string) {
    this.q = q;
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  protected nuevo() {
    this.modelo = vacio();
    this.archivo.set(null);
    this.editando.set({});
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  protected editar(g: Gasto) {
    this.modelo = {
      fecha: g.fecha, categoria: g.categoria, concepto: g.concepto, proveedor: g.proveedor, importe: g.importe,
      metodoPago: g.metodoPago, notas: g.notas, ordenTrabajoId: g.ordenTrabajoId
    };
    this.archivo.set(null);
    this.editando.set(g);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  protected cerrar() {
    this.editando.set(null);
    this.archivo.set(null);
  }

  protected elegirArchivo(e: Event) {
    const entrada = e.target as HTMLInputElement;
    this.archivo.set(entrada.files?.[0] ?? null);
    entrada.value = '';
  }

  protected guardar() {
    const m = this.modelo;
    if (!m.fecha || !m.concepto.trim() || !(Number(m.importe) > 0)) {
      this.error.set('Indica la fecha, el concepto y un importe mayor que 0.');
      return;
    }
    const req: GastoRequest = { ...m, importe: Number(m.importe), concepto: m.concepto.trim(), proveedor: m.proveedor?.trim() || null, notas: m.notas?.trim() || null };
    const id = this.editando()?.id;
    this.guardando.set(true);
    (id ? this.api.actualizarGasto(id, req) : this.api.crearGasto(req)).subscribe({
      next: g => {
        const archivo = this.archivo();
        if (!archivo) {
          this.terminar();
          return;
        }
        this.api.subirAdjuntoGasto(g.id, archivo).subscribe({
          next: () => this.terminar(),
          error: e => {
            this.guardando.set(false);
            this.editando.set(g);
            this.error.set(`El gasto se ha guardado, pero no el ticket: ${mensajeError(e)}`);
            this.cargar();
          }
        });
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected quitarAdjunto(g: Partial<Gasto>) {
    if (!g.id || !confirm('¿Quitar el ticket adjunto?')) return;
    this.api.quitarAdjuntoGasto(g.id).subscribe({
      next: r => {
        this.editando.set(r);
        this.cargar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminar(g: Partial<Gasto>) {
    if (!g.id || !confirm(`¿Eliminar el gasto «${g.concepto}»?`)) return;
    this.api.eliminarGasto(g.id).subscribe({
      next: () => {
        this.cerrar();
        this.cargar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  private terminar() {
    this.guardando.set(false);
    this.cerrar();
    this.error.set(null);
    this.cargar();
    this.api.proveedoresGastos().subscribe({ next: p => this.proveedores.set(p), error: () => {} });
  }
}
