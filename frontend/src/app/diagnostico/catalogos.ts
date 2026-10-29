import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { CatalogoDespiece, CatalogoDespieceRequest, EnlaceReferencia } from '../core/models';

const VACIO: CatalogoDespieceRequest = { nombre: '', descripcion: null, urlVehiculo: '', urlReferencia: null, marcas: null, aliasMarcas: null, activo: true, orden: 0 };

/** Catálogos gratuitos de despieces y esquemas (RealOEM, PartSouq, 7zap…) y búsqueda de referencias en todos ellos. */
@Component({
  selector: 'app-catalogos-despiece',
  imports: [FormsModule],
  template: `
    <section class="card">
      <h2>Catálogos de despieces y esquemas</h2>
      <p class="hint" style="margin-top: 0">
        Webs gratuitas que aparecen en cada vehículo según su marca y se abren ya en su modelo. No se copia su contenido: se abren en otra pestaña.
        En las direcciones puedes usar <span class="mono">{{ '{vin}' }}</span>, <span class="mono">{{ '{vin7}' }}</span> (7 últimos caracteres),
        <span class="mono">{{ '{marca}' }}</span>, <span class="mono">{{ '{marca-slug}' }}</span> (en minúsculas y con guiones),
        <span class="mono">{{ '{modelo}' }}</span>, <span class="mono">{{ '{matricula}' }}</span> y, en la búsqueda, <span class="mono">{{ '{referencia}' }}</span>.
      </p>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }

      <form class="referencia" (ngSubmit)="buscar()">
        <input name="q" [(ngModel)]="q" placeholder="Buscar una referencia de pieza en todos los catálogos" aria-label="Referencia de pieza" />
        <button type="submit" class="btn small" [disabled]="!q.trim()">Buscar</button>
        @for (e of enlaces(); track e.nombre) {
          <a class="btn small" [href]="e.url" target="_blank" rel="noopener noreferrer">↗ {{ e.nombre }}</a>
        }
      </form>

      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Marcas</th><th>Dirección del vehículo</th><th>Búsqueda por referencia</th><th></th></tr></thead>
          <tbody>
            @for (c of catalogos(); track c.id) {
              <tr [class.inactivo]="!c.activo">
                <td>
                  <strong>{{ c.nombre }}</strong>{{ c.activo ? '' : ' (desactivado)' }}
                  @if (c.descripcion) {
                    <div class="hint">{{ c.descripcion }}</div>
                  }
                </td>
                <td>{{ c.marcas ?? 'Todas' }}</td>
                <td class="mono url">{{ c.urlVehiculo }}</td>
                <td class="mono url">{{ c.urlReferencia ?? '—' }}</td>
                <td class="num">
                  <button type="button" class="btn small" (click)="editar(c)">Editar</button>
                  <button type="button" class="btn small danger" (click)="eliminar(c)" aria-label="Eliminar catálogo">×</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="5" class="empty">Sin catálogos configurados.</td></tr>
            }
          </tbody>
        </table>
      </div>

      <form class="form-grid" style="margin-top: 1rem" (ngSubmit)="guardar()">
        <label class="field">Nombre *<input name="cnombre" [(ngModel)]="form.nombre" placeholder="RealOEM" /></label>
        <label class="field">Marcas<input name="cmarcas" [(ngModel)]="form.marcas" placeholder="BMW, MINI (vacío = todas)" /></label>
        <label class="field">Orden<input name="corden" type="number" [(ngModel)]="form.orden" /></label>
        <label class="field full">Qué ofrece<input name="cdesc" [(ngModel)]="form.descripcion" placeholder="Despieces originales de BMW y MINI" /></label>
        <label class="field full">Dirección del vehículo *<input name="curl" [(ngModel)]="form.urlVehiculo" placeholder="https://www.ejemplo.com/buscar?vin={vin}" /></label>
        <label class="field full">Búsqueda por referencia<input name="cref" [(ngModel)]="form.urlReferencia" placeholder="https://www.ejemplo.com/buscar?q={referencia}" /></label>
        <label class="field" style="grid-column: span 2">Alias de marcas para {{ '{marca-slug}' }}<input name="calias" [(ngModel)]="form.aliasMarcas" placeholder="Mercedes-Benz=mercedes, VW=volkswagen" /></label>
        <label class="checks"><label><input type="checkbox" name="cactivo" [(ngModel)]="form.activo" /> Activo</label></label>
        <div class="form-actions full" style="margin-top: 0">
          @if (editando()) {
            <button type="button" class="btn" (click)="nuevo()">Cancelar</button>
          }
          <button type="submit" class="btn primary">{{ editando() ? 'Guardar catálogo' : '+ Añadir catálogo' }}</button>
        </div>
      </form>
    </section>
  `,
  styles: `
    .referencia { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
    .referencia input { flex: 1; min-width: 220px; max-width: 380px; padding: 0.35rem 0.5rem; }
    .url { word-break: break-all; font-size: 0.8rem; }
    tr.inactivo { opacity: 0.55; }
  `
})
export class CatalogosDespiece implements OnInit {
  private readonly api = inject(Api);
  protected readonly catalogos = signal<CatalogoDespiece[]>([]);
  protected readonly enlaces = signal<EnlaceReferencia[]>([]);
  protected readonly editando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected form: CatalogoDespieceRequest = { ...VACIO };
  protected q = '';

  ngOnInit() {
    this.cargar();
  }

  protected buscar() {
    this.api.buscarReferencia(this.q.trim()).subscribe({
      next: e => {
        this.enlaces.set(e);
        this.error.set(e.length ? null : 'Ningún catálogo activo admite búsqueda por referencia.');
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected editar(c: CatalogoDespiece) {
    const { id, ...datos } = c;
    this.editando.set(id);
    this.form = { ...datos };
  }

  protected nuevo() {
    this.editando.set(null);
    this.form = { ...VACIO };
  }

  protected guardar() {
    const t = (s: string | null) => s?.trim() || null;
    const req: CatalogoDespieceRequest = {
      ...this.form,
      nombre: this.form.nombre.trim(),
      urlVehiculo: this.form.urlVehiculo.trim(),
      descripcion: t(this.form.descripcion),
      urlReferencia: t(this.form.urlReferencia),
      marcas: t(this.form.marcas),
      aliasMarcas: t(this.form.aliasMarcas),
      orden: Number(this.form.orden) || 0
    };
    if (!req.nombre || !req.urlVehiculo) {
      this.error.set('El nombre y la dirección del vehículo son obligatorios.');
      return;
    }
    const id = this.editando();
    (id ? this.api.actualizarCatalogo(id, req) : this.api.crearCatalogo(req)).subscribe({
      next: () => {
        this.error.set(null);
        this.nuevo();
        this.cargar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminar(c: CatalogoDespiece) {
    if (confirm(`¿Eliminar el catálogo «${c.nombre}»? Si solo quieres ocultarlo, desactívalo.`)) {
      this.api.eliminarCatalogo(c.id).subscribe({ next: () => this.cargar(), error: e => this.error.set(mensajeError(e)) });
    }
  }

  private cargar() {
    this.api.catalogos().subscribe({ next: c => this.catalogos.set(c), error: e => this.error.set(mensajeError(e)) });
  }
}
