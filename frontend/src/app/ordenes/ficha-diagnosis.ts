import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { CodigoLeido, EstadoCodigo, FichaDiagnosis, FichaDiagnosisRequest, Medicion, Prueba, ResultadoMedicion, ValorReferencia } from '../core/models';
import { comparar, leerNumero, rango } from '../core/referencias';

const ESTADOS: { valor: EstadoCodigo; etiqueta: string }[] = [
  { valor: 'Activo', etiqueta: 'Almacenado' },
  { valor: 'Pendiente', etiqueta: 'Pendiente' },
  { valor: 'Permanente', etiqueta: 'Permanente' },
  { valor: 'Historico', etiqueta: 'Histórico / borrado' }
];

const RESULTADOS: { valor: ResultadoMedicion; etiqueta: string }[] = [
  { valor: 'SinValorar', etiqueta: '—' },
  { valor: 'Correcto', etiqueta: 'Correcto' },
  { valor: 'FueraDeRango', etiqueta: 'Fuera de rango' }
];

/** Ficha de diagnosis de la orden: síntomas, códigos, mediciones, pruebas, conclusión y adjuntos. */
@Component({
  selector: 'app-ficha-diagnosis',
  imports: [FormsModule, RouterLink, DatePipe, DecimalPipe],
  template: `
    <section class="card">
      <div class="page-header" style="margin-bottom: 0.75rem">
        <h2 style="margin: 0">Diagnosis</h2>
        <div class="toolbar" style="margin: 0">
          <a class="btn small" routerLink="/gestion/diagnostico/obd" [queryParams]="{ ordenId: ordenId() }">Leer con OBD</a>
          <button type="button" class="btn small primary" (click)="asistente()">Asistente IA</button>
        </div>
      </div>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }

      @if (cargada()) {
        <form (ngSubmit)="guardar()">
          <label class="field">
            Síntomas
            <textarea name="sintomas" [(ngModel)]="modelo.sintomas" rows="2" placeholder="Cuándo ocurre, en frío o en caliente, a qué régimen, desde cuándo…"></textarea>
          </label>

          <h3>Códigos leídos</h3>
          <div class="table-wrap">
            <table class="editable">
              <thead><tr><th style="width: 110px">Código</th><th style="width: 170px">Estado</th><th>Descripción</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                @for (c of modelo.codigos; track $index; let i = $index) {
                  <tr>
                    <td>
                      <input [name]="'cod' + i" [(ngModel)]="c.codigo" class="mono" (change)="c.descripcion = null" />
                      <a class="hint" [routerLink]="['/gestion/diagnostico/codigos', c.codigo]">casos</a>
                    </td>
                    <td><select [name]="'est' + i" [(ngModel)]="c.estado">@for (e of estados; track e.valor) {<option [value]="e.valor">{{ e.etiqueta }}</option>}</select></td>
                    <td class="hint">{{ c.descripcion ?? 'Se completa al guardar' }}</td>
                    <td><input [name]="'notc' + i" [(ngModel)]="c.nota" /></td>
                    <td><button type="button" class="btn small danger" (click)="modelo.codigos.splice(i, 1)" aria-label="Quitar código">×</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <button type="button" class="btn small" (click)="modelo.codigos.push({ codigo: '', descripcion: null, estado: 'Activo', nota: null })">+ Código</button>

          <h3>Mediciones</h3>
          <div class="table-wrap">
            <table class="editable">
              <thead><tr><th>Qué se mide</th><th style="width: 190px">Referencia</th><th style="width: 100px">Valor</th><th style="width: 80px">Unidad</th><th style="width: 120px">Esperado</th><th style="width: 140px">Resultado</th><th>Nota</th><th></th></tr></thead>
              <tbody>
                @for (m of modelo.mediciones; track $index; let i = $index) {
                  <tr [class.fuera]="m.resultado === 'FueraDeRango'">
                    <td><input [name]="'par' + i" [(ngModel)]="m.parametro" placeholder="Presión de turbo a 3000 rpm" /></td>
                    <td>
                      <select [name]="'ref' + i" [ngModel]="m.valorReferenciaId ?? null" (ngModelChange)="enlazar(m, $event)" aria-label="Valor de referencia">
                        <option [ngValue]="null">— Sin referencia —</option>
                        @for (g of grupos(); track g.categoria) {
                          <optgroup [label]="g.categoria">
                            @for (r of g.valores; track r.id) {
                              <option [ngValue]="r.id">{{ r.parametro }}{{ r.aplicacion && r.aplicacion !== 'Turismos en general' ? ' · ' + r.aplicacion : '' }}</option>
                            }
                          </optgroup>
                        }
                      </select>
                    </td>
                    <td><input [name]="'val' + i" [(ngModel)]="m.valor" (ngModelChange)="evaluar(m)" /></td>
                    <td><input [name]="'uni' + i" [(ngModel)]="m.unidad" placeholder="bar" /></td>
                    <td><input [name]="'esp' + i" [(ngModel)]="m.valorEsperado" /></td>
                    <td><select [name]="'res' + i" [(ngModel)]="m.resultado">@for (r of resultados; track r.valor) {<option [value]="r.valor">{{ r.etiqueta }}</option>}</select></td>
                    <td><input [name]="'notm' + i" [(ngModel)]="m.nota" /></td>
                    <td><button type="button" class="btn small danger" (click)="modelo.mediciones.splice(i, 1)" aria-label="Quitar medición">×</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <button type="button" class="btn small" (click)="modelo.mediciones.push(medicionVacia())">+ Medición</button>

          <h3>Pruebas realizadas</h3>
          <div class="table-wrap">
            <table class="editable">
              <thead><tr><th>Prueba</th><th>Resultado</th><th></th></tr></thead>
              <tbody>
                @for (p of modelo.pruebas; track $index; let i = $index) {
                  <tr>
                    <td><input [name]="'pru' + i" [(ngModel)]="p.descripcion" placeholder="Prueba de estanqueidad del circuito de admisión" /></td>
                    <td><input [name]="'pres' + i" [(ngModel)]="p.resultado" /></td>
                    <td><button type="button" class="btn small danger" (click)="modelo.pruebas.splice(i, 1)" aria-label="Quitar prueba">×</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <button type="button" class="btn small" (click)="modelo.pruebas.push({ descripcion: '', resultado: null })">+ Prueba</button>

          <label class="field" style="margin-top: 1rem">
            Conclusión
            <textarea name="conclusion" [(ngModel)]="modelo.conclusion" rows="2" placeholder="Causa encontrada y reparación propuesta"></textarea>
          </label>

          <div class="form-actions">
            @if (ficha()?.fechaActualizacion; as f) {
              <span class="hint" style="margin-right: auto">Guardada {{ f | date: 'dd/MM/yyyy HH:mm' }}</span>
            }
            <button type="submit" class="btn primary" [disabled]="guardando()">Guardar diagnosis</button>
          </div>
        </form>

        <h3>Adjuntos</h3>
        <p class="hint" style="margin-top: 0">Informes de la máquina de diagnosis, fotos de la avería… Los marcados como «Visible cliente» los ve también el cliente en su área.</p>
        <div class="adjuntos">
          @for (a of ficha()?.adjuntos ?? []; track a.id) {
            <div class="adjunto">
              <a [href]="'/api/diagnosis/adjuntos/' + a.id" target="_blank" rel="noopener">
                {{ a.tipoContenido === 'application/pdf' ? '📄' : '🖼️' }} {{ a.nombreOriginal }}
              </a>
              <span class="hint">{{ a.tamano / 1024 | number: '1.0-0' }} KB</span>
              <label class="visible-cliente" title="El cliente lo ve en su área">
                <input type="checkbox" [checked]="a.visibleCliente" (change)="cambiarVisible(a.id, $any($event.target).checked)" /> Visible cliente
              </label>
              <button type="button" class="btn small danger" (click)="quitarAdjunto(a.id)" aria-label="Quitar adjunto">×</button>
            </div>
          }
          <label class="btn small subir">
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple (change)="subir($event)" />
            {{ subiendo() ? 'Subiendo…' : '+ Adjuntar' }}
          </label>
        </div>
      } @else {
        <p class="empty">Cargando…</p>
      }
    </section>
  `,
  styles: `
    h3 { font-size: 0.95rem; margin: 1.25rem 0 0.5rem; color: var(--primary); }
    table.editable td { padding: 0.3rem 0.4rem; vertical-align: middle; }
    table.editable input, table.editable select { width: 100%; padding: 0.3rem 0.45rem; }
    table.editable select { max-width: 190px; }
    tr.fuera td { background: var(--danger-tint); }
    .adjuntos { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .visible-cliente { display: inline-flex; gap: 0.3rem; align-items: center; font-size: 0.8rem; cursor: pointer; white-space: nowrap; }
    .adjunto { display: flex; gap: 0.5rem; align-items: center; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.3rem 0.5rem; }
    .subir { position: relative; cursor: pointer; }
    .subir input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  `
})
export class FichaDiagnosisComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly ordenId = input.required<number>();

  protected readonly estados = ESTADOS;
  protected readonly resultados = RESULTADOS;
  protected readonly ficha = signal<FichaDiagnosis | null>(null);
  protected readonly cargada = signal(false);
  protected readonly guardando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly error = signal<string | null>(null);
  protected modelo: FichaDiagnosisRequest = { sintomas: null, conclusion: null, codigos: [], mediciones: [], pruebas: [] };

  ngOnInit() {
    this.api.ficha(this.ordenId()).subscribe({ next: f => this.mostrar(f), error: e => this.error.set(mensajeError(e)) });
    this.api.valoresReferencia().subscribe(r => this.referencias.set(r));
  }

  private readonly referencias = signal<ValorReferencia[]>([]);

  /** Referencias agrupadas por categoría para el selector. */
  protected readonly grupos = computed(() => {
    const porCategoria = new Map<string, ValorReferencia[]>();
    for (const r of this.referencias()) {
      porCategoria.set(r.categoria, [...(porCategoria.get(r.categoria) ?? []), r]);
    }
    return [...porCategoria].map(([categoria, valores]) => ({ categoria, valores }));
  });

  /** Al elegir una referencia se completan la unidad, el valor esperado y (si falta) el parámetro. */
  protected enlazar(m: Medicion, id: number | null) {
    m.valorReferenciaId = id;
    const r = this.referencias().find(x => x.id === id);
    if (r) {
      m.parametro ||= r.condicion ? `${r.parametro} (${r.condicion.toLowerCase()})` : r.parametro;
      m.unidad = r.unidad;
      m.valorEsperado = rango(r);
    }
    this.evaluar(m);
  }

  /** Con una referencia enlazada y un valor numérico, el resultado se calcula solo (se puede cambiar a mano). */
  protected evaluar(m: Medicion) {
    const r = this.referencias().find(x => x.id === m.valorReferenciaId);
    const cmp = r ? comparar(leerNumero(m.valor), r) : null;
    if (cmp) {
      m.resultado = cmp === 'correcto' ? 'Correcto' : 'FueraDeRango';
    }
  }

  protected medicionVacia(): Medicion {
    return { parametro: '', valor: '', unidad: null, valorEsperado: null, resultado: 'SinValorar', nota: null };
  }

  protected guardar() {
    // Las filas a medio rellenar no se envían.
    const req: FichaDiagnosisRequest = {
      sintomas: this.modelo.sintomas?.trim() || null,
      conclusion: this.modelo.conclusion?.trim() || null,
      codigos: this.modelo.codigos.filter((c: CodigoLeido) => c.codigo.trim()),
      mediciones: this.modelo.mediciones.filter((m: Medicion) => m.parametro.trim() && m.valor.trim()),
      pruebas: this.modelo.pruebas.filter((p: Prueba) => p.descripcion.trim())
    };
    this.guardando.set(true);
    this.api.guardarFicha(this.ordenId(), req).subscribe({
      next: f => {
        this.guardando.set(false);
        this.mostrar(f);
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  /** Abre la última consulta del asistente para esta orden, o crea una. */
  protected asistente() {
    this.api.sesionesAsistente(this.ordenId()).subscribe({
      next: sesiones => {
        if (sesiones.length) {
          this.router.navigate(['/gestion/diagnostico/asistente', sesiones[0].id]);
        } else {
          this.api.crearSesionAsistente(this.ordenId()).subscribe({
            next: s => this.router.navigate(['/gestion/diagnostico/asistente', s.id]),
            error: e => this.error.set(mensajeError(e))
          });
        }
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected async subir(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivos = Array.from(entrada.files ?? []);
    entrada.value = '';
    this.subiendo.set(true);
    for (const archivo of archivos) {
      await new Promise<void>(fin =>
        this.api.subirAdjunto(this.ordenId(), archivo).subscribe({
          next: f => {
            this.ficha.set(f);
            fin();
          },
          error: err => {
            this.error.set(`${archivo.name}: ${mensajeError(err)}`);
            fin();
          }
        })
      );
    }
    this.subiendo.set(false);
  }

  protected cambiarVisible(id: number, visible: boolean) {
    const poner = (v: boolean) => this.ficha.update(f => f && { ...f, adjuntos: f.adjuntos.map(a => (a.id === id ? { ...a, visibleCliente: v } : a)) });
    poner(visible);
    this.api.visibleAdjunto(id, visible).subscribe({
      error: e => {
        poner(!visible);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected quitarAdjunto(id: number) {
    if (confirm('¿Quitar este adjunto?')) {
      this.api.eliminarAdjunto(id).subscribe({
        next: () => this.ficha.update(f => f && { ...f, adjuntos: f.adjuntos.filter(a => a.id !== id) }),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  private mostrar(f: FichaDiagnosis) {
    this.ficha.set(f);
    this.modelo = {
      sintomas: f.sintomas,
      conclusion: f.conclusion,
      codigos: f.codigos.map(c => ({ ...c })),
      mediciones: f.mediciones.map(m => ({ ...m })),
      pruebas: f.pruebas.map(p => ({ ...p }))
    };
    this.error.set(null);
    this.cargada.set(true);
  }
}
