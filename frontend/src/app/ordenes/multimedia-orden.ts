import { HttpEventType } from '@angular/common/http';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { ETAPAS_MULTIMEDIA, opciones } from '../core/etiquetas';
import { EtapaMultimedia, MultimediaOrden } from '../core/models';
import { CapturaMultimedia } from '../shared/captura-multimedia';
import { VisorMultimedia } from '../shared/visor-multimedia';

interface Subida {
  id: number;
  nombre: string;
  progreso: number;
  error: string | null;
}

/** Fotos y vídeos de una orden: subida (también desde la cámara del móvil), galería por etapa y gestión. */
@Component({
  selector: 'app-multimedia-orden',
  imports: [FormsModule, VisorMultimedia, CapturaMultimedia],
  template: `
    <section class="card">
      <div class="page-header" style="margin-bottom: 0.75rem">
        <h2 style="margin: 0">Fotos y vídeos <span class="hint">({{ elementos().length }})</span></h2>
        @if (elementos().length) {
          <button type="button" class="btn small" (click)="gestionando.set(!gestionando())">{{ gestionando() ? 'Ver galería' : 'Gestionar' }}</button>
        }
      </div>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }

      <div class="subir">
        <label class="field">
          Etapa
          <select [(ngModel)]="etapa">@for (e of etapas; track e.valor) {<option [value]="e.valor">{{ e.etiqueta }}</option>}</select>
        </label>
        <label class="checks"><label><input type="checkbox" [(ngModel)]="visible" /> Visible para el cliente</label></label>
      </div>
      <div style="margin-top: 0.6rem">
        <app-captura-multimedia (archivos)="subir($event)" />
      </div>
      <p class="hint" style="margin-top: 0.3rem">«Foto» y «Vídeo» abren la cámara del móvil o la tableta; en el ordenador, usa «Cámara del equipo». Vídeos de hasta 300 MB.</p>

      @for (s of subidas(); track s.id) {
        <div class="subida">
          <span class="nombre">{{ s.nombre }}</span>
          @if (s.error) {
            <span class="texto-error">{{ s.error }}</span>
          } @else {
            <progress [value]="s.progreso" max="100"></progress>
            <span class="hint">{{ s.progreso }} %</span>
          }
        </div>
      }

      @if (ocultas() > 0) {
        <div class="aviso-ocultas">
          <span>{{ ocultas() }} {{ ocultas() === 1 ? 'foto o vídeo no lo ve' : 'fotos o vídeos no los ve' }} el cliente.</span>
          <button type="button" class="btn small" (click)="mostrarTodas()">Hacer visibles al cliente</button>
        </div>
      }

      @if (!gestionando()) {
        @for (g of grupos(); track g.etapa) {
          <h3>{{ g.etiqueta }}</h3>
          <app-visor-multimedia [elementos]="g.elementos" />
        } @empty {
          <p class="hint">Todavía no hay fotos ni vídeos. Conviene fotografiar el vehículo a la entrada (golpes y arañazos previos).</p>
        }
      } @else {
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width: 70px"></th><th>Descripción</th><th style="width: 150px">Etapa</th><th>Cliente</th><th class="num">Tamaño</th><th></th></tr></thead>
            <tbody>
              @for (m of elementos(); track m.id) {
                <tr>
                  <td>
                    @if (m.tipoContenido.startsWith('video/')) {
                      <span class="icono-video">🎬</span>
                    } @else {
                      <img [src]="m.url" alt="" class="mini" loading="lazy" />
                    }
                  </td>
                  <td>
                    <input [ngModel]="m.descripcion ?? ''" (change)="guardar(m, { descripcion: $any($event.target).value })" placeholder="Descripción (opcional)" />
                    <div class="hint">{{ m.nombreOriginal }}{{ m.subidoPor ? ' · ' + m.subidoPor : '' }}</div>
                  </td>
                  <td>
                    <select [ngModel]="m.etapa" (ngModelChange)="guardar(m, { etapa: $event })">@for (e of etapas; track e.valor) {<option [value]="e.valor">{{ e.etiqueta }}</option>}</select>
                  </td>
                  <td><label class="checks"><label><input type="checkbox" [ngModel]="m.visibleCliente" (ngModelChange)="guardar(m, { visibleCliente: $event })" /> Visible</label></label></td>
                  <td class="num">{{ tamano(m.tamano) }}</td>
                  <td class="num"><button type="button" class="btn small danger" (click)="eliminar(m)" aria-label="Eliminar">×</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    .aviso-ocultas { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; align-items: center; justify-content: space-between; margin: 0.8rem 0 0; padding: 0.5rem 0.7rem; border: 1px solid #ffb020; color: #ffc24d; font-size: 0.88rem; }
    .subir { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; align-items: flex-end; }
    .subida { display: flex; gap: 0.6rem; align-items: center; margin: 0.3rem 0; font-size: 0.9rem; }
    .subida .nombre { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subida progress { flex: 1; max-width: 260px; }
    .texto-error { color: var(--danger); }
    h3 { font-size: 0.95rem; margin: 1rem 0 0.5rem; color: var(--primary); }
    .mini { width: 60px; height: 45px; object-fit: cover; border-radius: 4px; display: block; }
    .icono-video { font-size: 1.6rem; }
    td input { width: 100%; padding: 0.3rem 0.45rem; }
  `
})
export class MultimediaOrdenComponent implements OnInit {
  private readonly api = inject(Api);
  readonly ordenId = input.required<number>();

  protected readonly etapas = opciones(ETAPAS_MULTIMEDIA);
  protected readonly elementos = signal<MultimediaOrden[]>([]);
  protected readonly ocultas = computed(() => this.elementos().filter(m => !m.visibleCliente).length);
  protected readonly subidas = signal<Subida[]>([]);
  private siguienteSubida = 0;
  protected readonly gestionando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected etapa: EtapaMultimedia = 'Recepcion';
  /** Por defecto lo que se sube lo ve el cliente; se puede ocultar elemento a elemento. */
  protected visible = true;

  protected readonly grupos = computed(() =>
    this.etapas
      .map(e => ({ etapa: e.valor, etiqueta: e.etiqueta, elementos: this.elementos().filter(m => m.etapa === e.valor) }))
      .filter(g => g.elementos.length)
  );

  ngOnInit() {
    this.cargar();
  }

  /** Sube los archivos de uno en uno, mostrando el progreso de cada uno. */
  protected async subir(archivos: File[]) {
    // Cada subida lleva su id: con la cámara se pueden lanzar varias tandas a la vez.
    const nuevas = archivos.map(a => ({ id: ++this.siguienteSubida, nombre: a.name, progreso: 0, error: null }));
    this.subidas.update(s => [...s, ...nuevas]);

    for (const [i, archivo] of archivos.entries()) {
      const id = nuevas[i].id;
      const actualizar = (cambio: Partial<Subida>) => this.subidas.update(s => s.map(x => (x.id === id ? { ...x, ...cambio } : x)));
      await new Promise<void>(fin =>
        this.api.subirMultimedia(this.ordenId(), archivo, this.etapa, this.visible).subscribe({
          next: ev => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              actualizar({ progreso: Math.round((100 * ev.loaded) / ev.total) });
            } else if (ev.type === HttpEventType.Response && ev.body) {
              this.elementos.update(l => [...l, ev.body!]);
            }
          },
          error: err => {
            actualizar({ error: mensajeError(err) });
            fin();
          },
          complete: () => fin()
        })
      );
    }
    // Las subidas correctas de esta tanda desaparecen de la lista; las fallidas se quedan para que se vea el motivo.
    const propias = new Set(nuevas.map(n => n.id));
    this.subidas.update(s => s.filter(x => x.error || !propias.has(x.id)));
  }

  protected tamano(bytes: number) {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;
  }

  /** Marca como visibles para el cliente todas las fotos y vídeos ocultos de la orden. */
  protected mostrarTodas() {
    for (const m of this.elementos().filter(x => !x.visibleCliente)) {
      this.guardar(m, { visibleCliente: true });
    }
  }

  protected guardar(m: MultimediaOrden, cambio: Partial<Pick<MultimediaOrden, 'etapa' | 'descripcion' | 'visibleCliente'>>) {
    const req = { etapa: m.etapa, descripcion: m.descripcion, visibleCliente: m.visibleCliente, ...cambio };
    this.api.actualizarMultimedia(m.id, { ...req, descripcion: req.descripcion?.trim() || null }).subscribe({
      next: r => this.elementos.update(l => l.map(x => (x.id === r.id ? r : x))),
      error: err => this.error.set(mensajeError(err))
    });
  }

  protected eliminar(m: MultimediaOrden) {
    if (confirm(`¿Eliminar «${m.descripcion ?? m.nombreOriginal}»?`)) {
      this.api.eliminarMultimedia(m.id).subscribe({
        next: () => this.elementos.update(l => l.filter(x => x.id !== m.id)),
        error: err => this.error.set(mensajeError(err))
      });
    }
  }

  private cargar() {
    this.api.multimedia(this.ordenId()).subscribe({
      next: l => this.elementos.set(l),
      error: err => this.error.set(mensajeError(err))
    });
  }
}
