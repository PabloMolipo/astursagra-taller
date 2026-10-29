import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { Combustible, ValorReferencia, ValorReferenciaRequest } from '../core/models';
import { comparar, Comparacion, leerNumero, rango, TEXTO_COMPARACION } from '../core/referencias';

const COMBUSTIBLES: { valor: Combustible; etiqueta: string }[] = [
  { valor: 'Todos', etiqueta: 'Gasolina y diésel' },
  { valor: 'Gasolina', etiqueta: 'Gasolina' },
  { valor: 'Diesel', etiqueta: 'Diésel' }
];

/** Diagnóstico → Valores de referencia: buscar, comparar una lectura al momento y mantener los del taller. */
@Component({
  selector: 'app-valores-referencia',
  imports: [FormsModule],
  template: `
    <div class="aviso" style="background: var(--primary-tint); border-color: rgba(198, 255, 0, 0.3); color: var(--text)">
      Los valores <strong>genéricos</strong> son orientativos: cada fabricante y motor tiene los suyos. Corrígelos o añade los de
      tus motores habituales (marca, código de motor) y quedarán como <strong>del taller</strong>. Escribe una lectura en
      «Comparar» para ver al momento si está dentro de rango.
    </div>

    <div class="toolbar">
      <input type="search" placeholder="Buscar: turbo, caudalímetro, rail, batería, TDI…" [ngModel]="q()" (ngModelChange)="q.set($event)" style="min-width: 280px" />
      <select [ngModel]="categoria()" (ngModelChange)="categoria.set($event)">
        <option value="">Todas las categorías</option>
        @for (c of categorias(); track c) {
          <option [value]="c">{{ c }}</option>
        }
      </select>
      <select [ngModel]="combustible()" (ngModelChange)="combustible.set($event)">
        <option value="">Gasolina y diésel</option>
        <option value="Gasolina">Gasolina</option>
        <option value="Diesel">Diésel</option>
      </select>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th>Parámetro</th><th>Condición</th><th class="num">Referencia</th><th>Aplica a</th><th style="width: 190px">Comparar</th><th></th></tr>
        </thead>
        <tbody>
          @for (v of filtrados(); track v.id) {
            <tr [class.editando]="editando() === v.id">
              <td>
                <strong>{{ v.parametro }}</strong>
                <div class="hint">{{ v.categoria }}{{ v.combustible !== 'Todos' ? ' · ' + (v.combustible === 'Diesel' ? 'Diésel' : 'Gasolina') : '' }}{{ v.esPropio ? ' · del taller' : '' }}</div>
              </td>
              <td>
                {{ v.condicion }}
                @if (v.notas) { <div class="hint">{{ v.notas }}</div> }
              </td>
              <td class="num"><strong>{{ rango(v) }}</strong></td>
              <td>{{ v.aplicacion }}</td>
              <td>
                <div class="comparar">
                  <input [ngModel]="lecturas()[v.id] ?? ''" (ngModelChange)="leer(v.id, $event)" [placeholder]="v.unidad" inputmode="decimal" aria-label="Lectura a comparar" />
                  @if (resultado(v); as r) {
                    <span class="badge" [class]="'badge cmp-' + r">{{ texto[r] }}</span>
                  }
                </div>
              </td>
              <td class="num"><button type="button" class="btn small" (click)="editar(v)">Editar</button></td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">{{ cargando() ? 'Cargando…' : 'Sin resultados.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <form class="card" (ngSubmit)="guardar()">
      <h2>{{ editando() ? 'Editar valor de referencia' : 'Nuevo valor de referencia' }}</h2>
      <div class="form-grid">
        <label class="field" style="grid-column: span 2">Parámetro *<input name="parametro" [(ngModel)]="modelo.parametro" placeholder="Presión de turbo a plena carga" /></label>
        <label class="field">
          Categoría *
          <input name="categoria" [(ngModel)]="modelo.categoria" list="lista-categorias" placeholder="Sobrealimentación" />
          <datalist id="lista-categorias">@for (c of categorias(); track c) {<option [value]="c"></option>}</datalist>
        </label>
        <label class="field full">Condición de medida<input name="condicion" [(ngModel)]="modelo.condicion" placeholder="Plena carga en 3.ª, 2500-3000 rpm, motor caliente" /></label>
        <label class="field">Mínimo<input name="minimo" [(ngModel)]="minimo" inputmode="decimal" /></label>
        <label class="field">Máximo<input name="maximo" [(ngModel)]="maximo" inputmode="decimal" /></label>
        <label class="field">Unidad *<input name="unidad" [(ngModel)]="modelo.unidad" placeholder="bar abs." /></label>
        <label class="field">
          Combustible
          <select name="combustible" [(ngModel)]="modelo.combustible">@for (c of combustibles; track c.valor) {<option [value]="c.valor">{{ c.etiqueta }}</option>}</select>
        </label>
        <label class="field" style="grid-column: span 2">Aplica a<input name="aplicacion" [(ngModel)]="modelo.aplicacion" placeholder="VAG 2.0 TDI CR (CFFB) / Turismos en general" /></label>
        <label class="field">
          PID OBD (datos en vivo)
          <input name="pid" [(ngModel)]="modelo.pidObd" class="mono" maxlength="4" placeholder="Opcional, p. ej. 42" />
        </label>
        <label class="field full">Notas<input name="notas" [(ngModel)]="modelo.notas" placeholder="Qué indica estar fuera de rango, fuente del dato…" /></label>
      </div>
      <div class="form-actions">
        @if (editando()) {
          @if (esPropio()) {
            <button type="button" class="btn danger" style="margin-right: auto" (click)="eliminar()">Eliminar</button>
          }
          <button type="button" class="btn" (click)="nuevo()">Cancelar</button>
        }
        <button type="submit" class="btn primary">{{ editando() ? 'Guardar cambios' : '+ Añadir valor' }}</button>
      </div>
    </form>
  `,
  styles: `
    .comparar { display: flex; gap: 0.4rem; align-items: center; }
    .comparar input { width: 90px; padding: 0.3rem 0.45rem; }
    tr.editando td { background: var(--primary-tint); }
    .cmp-correcto { background: var(--success-tint); color: var(--success); }
    .cmp-bajo, .cmp-alto { background: var(--danger-tint); color: var(--danger); }
  `
})
export class ValoresReferencia {
  private readonly api = inject(Api);

  protected readonly combustibles = COMBUSTIBLES;
  protected readonly texto = TEXTO_COMPARACION;
  protected readonly rango = rango;

  protected readonly valores = signal<ValorReferencia[]>([]);
  protected readonly categorias = signal<string[]>([]);
  protected readonly q = signal('');
  protected readonly categoria = signal('');
  protected readonly combustible = signal<Combustible | ''>('');
  protected readonly lecturas = signal<Partial<Record<number, string>>>({});
  protected readonly editando = signal<number | null>(null);
  protected readonly esPropio = signal(false);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  protected modelo: ValorReferenciaRequest = this.vacio();
  protected minimo = '';
  protected maximo = '';

  /** El filtrado es local: la lista es corta y así la comparación no se pierde al buscar. */
  protected readonly filtrados = computed(() => {
    const palabras = this.q().trim().toLowerCase().split(/\s+/).filter(Boolean);
    const cat = this.categoria();
    const comb = this.combustible();
    return this.valores().filter(v => {
      const texto = `${v.parametro} ${v.condicion ?? ''} ${v.aplicacion ?? ''} ${v.categoria} ${v.notas ?? ''}`.toLowerCase();
      return (!cat || v.categoria === cat)
        && (!comb || v.combustible === comb || v.combustible === 'Todos')
        && palabras.every(p => texto.includes(p));
    });
  });

  constructor() {
    this.cargar();
  }

  protected leer(id: number, texto: string) {
    this.lecturas.update(l => ({ ...l, [id]: texto }));
  }

  protected resultado(v: ValorReferencia): Comparacion | null {
    return comparar(leerNumero(this.lecturas()[v.id]), v);
  }

  protected editar(v: ValorReferencia) {
    this.editando.set(v.id);
    this.esPropio.set(v.esPropio);
    this.modelo = { ...v };
    this.minimo = v.minimo?.toString().replace('.', ',') ?? '';
    this.maximo = v.maximo?.toString().replace('.', ',') ?? '';
    setTimeout(() => document.querySelector('app-valores-referencia form')?.scrollIntoView({ behavior: 'smooth' }));
  }

  protected nuevo() {
    this.editando.set(null);
    this.modelo = this.vacio();
    this.minimo = '';
    this.maximo = '';
  }

  protected guardar() {
    const req: ValorReferenciaRequest = {
      ...this.modelo,
      parametro: this.modelo.parametro.trim(),
      categoria: this.modelo.categoria.trim(),
      unidad: this.modelo.unidad.trim(),
      minimo: leerNumero(this.minimo),
      maximo: leerNumero(this.maximo),
      condicion: this.modelo.condicion?.trim() || null,
      aplicacion: this.modelo.aplicacion?.trim() || null,
      pidObd: this.modelo.pidObd?.trim() || null,
      notas: this.modelo.notas?.trim() || null
    };
    if (!req.parametro || !req.categoria || !req.unidad) {
      this.error.set('Parámetro, categoría y unidad son obligatorios.');
      return;
    }
    const id = this.editando();
    (id ? this.api.actualizarValorReferencia(id, req) : this.api.crearValorReferencia(req)).subscribe({
      next: () => {
        this.error.set(null);
        this.nuevo();
        this.cargar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminar() {
    const id = this.editando();
    if (id && confirm('¿Eliminar este valor de referencia?')) {
      this.api.eliminarValorReferencia(id).subscribe({
        next: () => {
          this.nuevo();
          this.cargar();
        },
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  private vacio(): ValorReferenciaRequest {
    return { parametro: '', categoria: '', condicion: null, minimo: null, maximo: null, unidad: '', combustible: 'Todos', aplicacion: null, pidObd: null, notas: null };
  }

  private cargar() {
    this.api.valoresReferencia().subscribe({
      next: v => {
        this.valores.set(v);
        this.categorias.set([...new Set(v.map(x => x.categoria))].sort((a, b) => a.localeCompare(b, 'es')));
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
