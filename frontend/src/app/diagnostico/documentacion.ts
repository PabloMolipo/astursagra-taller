import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { opciones, TIPOS_DOCUMENTO } from '../core/etiquetas';
import { DocumentoTecnico, EnlacePortal, EstadoSharePoint, TipoDocumento } from '../core/models';
import { FormDocumento } from '../shared/form-documento';
import { CatalogosDespiece } from './catalogos';
import { EtiquetaPipe } from '../shared/pipes';

/** Diagnóstico → Documentación: biblioteca técnica del taller, accesos a portales y catálogos de despieces. */
@Component({
  selector: 'app-documentacion',
  imports: [FormsModule, DatePipe, DecimalPipe, EtiquetaPipe, FormDocumento, CatalogosDespiece],
  template: `
    @if (sp(); as e) {
      <section class="card sharepoint">
        <div class="toolbar" style="margin: 0; justify-content: space-between">
          <div>
            <h2 style="margin: 0">SharePoint</h2>
            @if (e.configurado) {
              <div class="hint">{{ e.siteUrl }}{{ e.biblioteca ? ' · ' + e.biblioteca : '' }}{{ e.carpeta ? ' · /' + e.carpeta : '' }} · {{ e.documentos }} documentos · automática cada {{ e.intervaloMinutos }} min</div>
            } @else {
              <div class="hint">No configurado. Mira la sección «SharePoint» del README para conectar el site.</div>
            }
          </div>
          @if (e.configurado) {
            <button type="button" class="btn primary" (click)="sincronizar()" [disabled]="e.enCurso">{{ e.enCurso ? 'Sincronizando…' : 'Sincronizar ahora' }}</button>
          }
        </div>
        @if (e.enCurso && e.progreso) {
          <p class="hint" style="margin: 0.5rem 0 0">{{ e.progreso }}</p>
        } @else if (e.ultimaSincronizacion) {
          <p style="margin: 0.5rem 0 0" [class.texto-error]="e.ultimaConError">
            Documentación · {{ e.ultimaSincronizacion | date: 'dd/MM/yyyy HH:mm' }}: {{ e.ultimoResultado }}
          </p>
        }
        @if (e.repro; as r) {
          <p style="margin: 0.35rem 0 0" [class.texto-error]="r.ultimaConError">
            Biblioteca {{ r.biblioteca }} · {{ r.reprogramaciones }} reprogramaciones{{ r.sinVincular ? ' (' + r.sinVincular + ' sin vincular)' : '' }}
            @if (r.ultimaSincronizacion && !e.enCurso) {
              · {{ r.ultimaSincronizacion | date: 'dd/MM/yyyy HH:mm' }}: {{ r.ultimoResultado }}
            }
          </p>
        }
      </section>
    }

    <div class="toolbar">
      <input type="search" placeholder="Buscar: Golf, BKC, inyección, ABS…" [ngModel]="q()" (ngModelChange)="buscar($event)" style="min-width: 280px" />
      <select [ngModel]="tipo()" (ngModelChange)="tipo.set($event); cargar()">
        <option value="">Todos los tipos</option>
        @for (t of tipos; track t.valor) {<option [value]="t.valor">{{ t.etiqueta }}</option>}
      </select>
      <button type="button" class="btn primary" style="margin-left: auto" (click)="editando.set(null); subiendo.set(true)">+ Subir documento</button>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (subiendo() || editando()) {
      <section class="card">
        <h2>{{ editando() ? 'Editar documento' : 'Subir documento' }}</h2>
        <app-form-documento [documento]="editando()" (guardado)="tras()" (cancelar)="subiendo.set(false); editando.set(null)" />
      </section>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead><tr><th>Documento</th><th>Tipo</th><th>Vehículos</th><th>Sistema</th><th class="num">Tamaño</th><th></th></tr></thead>
        <tbody>
          @for (d of documentos(); track d.id) {
            <tr>
              <td>
                <a [href]="'/api/documentacion/' + d.id + '/archivo'" target="_blank" rel="noopener">{{ d.tipoContenido === 'application/pdf' ? '📄' : '🖼️' }} {{ d.titulo }}</a>
                <div class="hint">
                  @if (d.deSharePoint) {
                    <span class="badge estado-Recibido">{{ d.eliminadoEnSharePoint ? 'Borrado en SharePoint' : 'SharePoint' }}</span>
                    {{ d.sharePointRuta ? '/' + d.sharePointRuta + ' · ' : '' }}
                  }
                  {{ d.nombreOriginal }} · {{ d.fechaAlta | date: 'dd/MM/yyyy' }}{{ d.usosAsistente ? ' · usado en ' + d.usosAsistente + ' consulta(s) del asistente' : '' }}</div>
              </td>
              <td>{{ d.tipo | etiqueta: 'documento' }}</td>
              <td>{{ aplicacion(d) }}</td>
              <td>{{ d.sistema }}</td>
              <td class="num">{{ d.tamano / 1024 | number: '1.0-0' }} KB</td>
              <td class="num">
                <button type="button" class="btn small" (click)="subiendo.set(false); editando.set(d)">Editar</button>
                @if (!d.deSharePoint || d.eliminadoEnSharePoint) {
                  <button type="button" class="btn small danger" (click)="eliminar(d)" aria-label="Eliminar documento">×</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">{{ cargando() ? 'Cargando…' : 'Todavía no hay documentos. Sube los esquemas y manuales que más uses.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <section class="card">
      <h2>Portales de datos técnicos</h2>
      <p class="hint" style="margin-top: 0">
        Accesos directos que aparecen en cada vehículo: HaynesPro, el portal del fabricante, el de tu máquina de diagnosis…
        En la dirección puedes usar <span class="mono">{{ '{vin}' }}</span>, <span class="mono">{{ '{matricula}' }}</span>,
        <span class="mono">{{ '{marca}' }}</span> y <span class="mono">{{ '{modelo}' }}</span>, que se sustituyen por los datos del vehículo.
      </p>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Dirección</th><th>Solo para la marca</th><th></th></tr></thead>
          <tbody>
            @for (p of portales(); track p.id) {
              <tr>
                <td><strong>{{ p.nombre }}</strong></td>
                <td class="mono" style="word-break: break-all">{{ p.url }}</td>
                <td>{{ p.marca ?? 'Todas' }}</td>
                <td class="num">
                  <button type="button" class="btn small" (click)="editarPortal(p)">Editar</button>
                  <button type="button" class="btn small danger" (click)="eliminarPortal(p)" aria-label="Eliminar portal">×</button>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="4" class="empty">Sin portales configurados.</td></tr>
            }
          </tbody>
        </table>
      </div>
      <form class="form-grid" style="margin-top: 1rem" (ngSubmit)="guardarPortal()">
        <label class="field">Nombre *<input name="pnombre" [(ngModel)]="portal.nombre" placeholder="HaynesPro" /></label>
        <label class="field" style="grid-column: span 2">Dirección *<input name="purl" [(ngModel)]="portal.url" placeholder="https://www.ejemplo.com/buscar?vin={vin}" /></label>
        <label class="field">Solo para la marca<input name="pmarca" [(ngModel)]="portal.marca" placeholder="Vacío = todas" /></label>
        <div class="form-actions full" style="margin-top: 0">
          @if (portalId()) {
            <button type="button" class="btn" (click)="nuevoPortal()">Cancelar</button>
          }
          <button type="submit" class="btn primary">{{ portalId() ? 'Guardar portal' : '+ Añadir portal' }}</button>
        </div>
      </form>
    </section>

    <app-catalogos-despiece />
  `,
  styles: `
    .sharepoint { border-left: 4px solid var(--primary); }
    .texto-error { color: var(--danger); }
  `
})
export class Documentacion implements OnDestroy {
  protected readonly sp = signal<EstadoSharePoint | null>(null);
  private sondeo?: ReturnType<typeof setInterval>;

  private readonly api = inject(Api);
  protected readonly tipos = opciones(TIPOS_DOCUMENTO);
  protected readonly documentos = signal<DocumentoTecnico[]>([]);
  protected readonly portales = signal<EnlacePortal[]>([]);
  protected readonly q = signal('');
  protected readonly tipo = signal<TipoDocumento | ''>('');
  protected readonly subiendo = signal(false);
  protected readonly editando = signal<DocumentoTecnico | null>(null);
  protected readonly portalId = signal<number | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected portal = { nombre: '', url: '', marca: '' };
  private temporizador?: ReturnType<typeof setTimeout>;

  constructor() {
    this.cargar();
    this.cargarPortales();
    this.cargarEstado();
  }

  ngOnDestroy() {
    clearInterval(this.sondeo);
  }

  protected sincronizar() {
    this.api.sincronizarSharePoint().subscribe({
      next: () => this.cargarEstado(),
      error: e => this.error.set(mensajeError(e))
    });
  }

  /** Mientras sincroniza, consulta el estado cada 2 s y al terminar recarga la lista. */
  private cargarEstado() {
    this.api.estadoSharePoint().subscribe(e => {
      const estaba = this.sp()?.enCurso;
      this.sp.set(e);
      if (e.enCurso && !this.sondeo) {
        this.sondeo = setInterval(() => this.cargarEstado(), 2000);
      } else if (!e.enCurso && this.sondeo) {
        clearInterval(this.sondeo);
        this.sondeo = undefined;
      }
      if (estaba && !e.enCurso) {
        this.cargar();
      }
    });
  }

  protected aplicacion(d: DocumentoTecnico): string {
    if (!d.marca) {
      return 'General';
    }
    const anios = d.anioDesde || d.anioHasta ? ` (${d.anioDesde ?? '…'}-${d.anioHasta ?? '…'})` : '';
    return [d.marca, d.modelo, d.motor].filter(Boolean).join(' ') + anios;
  }

  protected buscar(q: string) {
    this.q.set(q);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  protected cargar() {
    this.api.documentos(this.q(), this.tipo()).subscribe({
      next: d => {
        this.documentos.set(d);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected tras() {
    this.subiendo.set(false);
    this.editando.set(null);
    this.cargar();
  }

  protected eliminar(d: DocumentoTecnico) {
    if (confirm(`¿Eliminar «${d.titulo}»?`)) {
      this.api.eliminarDocumento(d.id).subscribe({ next: () => this.cargar(), error: e => this.error.set(mensajeError(e)) });
    }
  }

  protected editarPortal(p: EnlacePortal) {
    this.portalId.set(p.id);
    this.portal = { nombre: p.nombre, url: p.url, marca: p.marca ?? '' };
  }

  protected nuevoPortal() {
    this.portalId.set(null);
    this.portal = { nombre: '', url: '', marca: '' };
  }

  protected guardarPortal() {
    const req = { nombre: this.portal.nombre.trim(), url: this.portal.url.trim(), marca: this.portal.marca.trim() || null, orden: 0 };
    if (!req.nombre || !req.url) {
      this.error.set('El nombre y la dirección del portal son obligatorios.');
      return;
    }
    const id = this.portalId();
    (id ? this.api.actualizarPortal(id, req) : this.api.crearPortal(req)).subscribe({
      next: () => {
        this.error.set(null);
        this.nuevoPortal();
        this.cargarPortales();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminarPortal(p: EnlacePortal) {
    if (confirm(`¿Eliminar el portal «${p.nombre}»?`)) {
      this.api.eliminarPortal(p.id).subscribe({ next: () => this.cargarPortales(), error: e => this.error.set(mensajeError(e)) });
    }
  }

  private cargarPortales() {
    this.api.portales().subscribe(p => this.portales.set(p));
  }
}
