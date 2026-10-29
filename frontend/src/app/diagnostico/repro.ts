import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { pareceModificado, pareceOriginal, tamanoLegible } from '../core/binario';
import { ArchivoRepro, ReproDetalle, ReproListItem, VehiculoListItem } from '../core/models';
import { ArchivoComparado, ComparadorBin } from '../shared/comparador-bin';
import { VisorHex } from '../shared/visor-hex';

const contenido = (a: ArchivoRepro, descargar = false) => `/api/repro/archivos/${a.id}/contenido${descargar ? '?descargar=true' : ''}`;
const ICONOS: Record<string, string> = { pdf: '📄', imagen: '🖼️', video: '🎬', texto: '📝', office: '📊', binario: '💾' };

/** Diagnóstico → Reprogramaciones: carpetas de la biblioteca REPRO de SharePoint. */
@Component({
  selector: 'app-repro-lista',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <div class="toolbar">
      <input type="search" placeholder="Buscar: matrícula, cliente, Golf, EDC17…" [ngModel]="q()" (ngModelChange)="buscar($event)" style="min-width: 280px" />
      <label class="checks"><label><input type="checkbox" [ngModel]="sinVincular()" (ngModelChange)="sinVincular.set($event); cargar()" /> Solo sin vincular</label></label>
    </div>
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Reprogramación</th><th>Vehículo</th><th>Cliente</th><th class="num">Archivos</th><th>Fecha</th></tr></thead>
        <tbody>
          @for (r of lista(); track r.id) {
            <tr>
              <td><a [routerLink]="['/gestion/diagnostico/repro', r.id]">{{ r.nombre }}</a></td>
              <td>
                @if (r.vehiculo; as v) {
                  <a [routerLink]="['/gestion/vehiculos', v.id]">{{ v.marca }} {{ v.modelo }}</a> <span class="mono hint">{{ v.matricula ?? v.bastidor }}</span>
                } @else {
                  <span class="hint">Sin vincular</span>
                }
              </td>
              <td>{{ r.vehiculo?.clienteNombre ?? '' }}</td>
              <td class="num">{{ r.archivos }}</td>
              <td>{{ r.fecha | date: 'dd/MM/yyyy' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">{{ cargando() ? 'Cargando…' : 'No hay reprogramaciones. Se cargan de la biblioteca REPRO de SharePoint al sincronizar (Diagnóstico → Documentación).' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class ReproLista implements OnInit {
  private readonly api = inject(Api);
  protected readonly lista = signal<ReproListItem[]>([]);
  protected readonly q = signal('');
  protected readonly sinVincular = signal(false);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  private temporizador?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    this.cargar();
  }

  protected buscar(q: string) {
    this.q.set(q);
    clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.cargar(), 250);
  }

  protected cargar() {
    this.cargando.set(true);
    this.api.reprogramaciones(this.q(), this.sinVincular()).subscribe({
      next: l => {
        this.lista.set(l);
        this.cargando.set(false);
      },
      error: e => {
        this.error.set(mensajeError(e));
        this.cargando.set(false);
      }
    });
  }
}

/** Una reprogramación: vehículo, notas, archivos y visores (PDF, imagen, vídeo, texto, hexadecimal y comparación). */
@Component({
  selector: 'app-repro-detalle',
  imports: [FormsModule, RouterLink, DatePipe, VisorHex, ComparadorBin],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (r(); as r) {
      <div class="page-header">
        <div>
          <h1 style="font-size: 1.3rem">{{ r.nombre }}</h1>
          <div class="subtitle">Reprogramación · {{ r.fecha | date: 'dd/MM/yyyy' }} · {{ r.archivos.length }} archivos</div>
        </div>
        <div class="toolbar" style="margin: 0">
          @if (r.webUrl) {
            <a class="btn" [href]="r.webUrl" target="_blank" rel="noopener noreferrer">↗ Abrir en SharePoint</a>
          }
          <a class="btn" routerLink="/gestion/diagnostico/repro">← Reprogramaciones</a>
        </div>
      </div>

      <section class="card">
        <div class="vinculo">
          <div>
            <h2 style="margin: 0 0 0.3rem">Vehículo</h2>
            @if (r.vehiculo; as v) {
              <a [routerLink]="['/gestion/vehiculos', v.id]">{{ v.marca }} {{ v.modelo }}</a>
              <span class="mono hint">{{ v.matricula ?? v.bastidor }}</span> ·
              <a [routerLink]="['/gestion/clientes', v.clienteId]">{{ v.clienteNombre }}</a>
              <span class="hint">{{ r.vinculoManual ? '(vinculada a mano)' : '(vinculada por el nombre de la carpeta)' }}</span>
            } @else {
              <span class="hint">Sin vincular. Se vincula sola si la matrícula o el bastidor aparecen en el nombre de la carpeta; si no, búscalo aquí.</span>
            }
          </div>
          <div class="toolbar" style="margin: 0">
            <button type="button" class="btn small" (click)="buscando.set(!buscando())">{{ r.vehiculo ? 'Cambiar' : 'Vincular' }}</button>
            @if (r.vehiculo) {
              <button type="button" class="btn small" (click)="vincular(null)">Quitar</button>
            }
          </div>
        </div>
        @if (buscando()) {
          <div class="busqueda">
            <input type="search" placeholder="Matrícula, bastidor, cliente o modelo" [ngModel]="qVehiculo" (ngModelChange)="buscarVehiculo($event)" aria-label="Buscar vehículo" />
            @for (v of vehiculos(); track v.id) {
              <button type="button" (click)="vincular(v.id)">{{ v.marca }} {{ v.modelo }} · <span class="mono">{{ v.matricula ?? v.bastidor }}</span> · {{ v.clienteNombre }}</button>
            }
          </div>
        }
        <label class="field full" style="margin-top: 0.8rem">
          Notas
          <textarea [(ngModel)]="notas" rows="2" placeholder="Qué se hizo, mapas, potencia, observaciones…"></textarea>
        </label>
        @if (notas !== (r.notas ?? '')) {
          <div class="form-actions" style="margin-top: 0.4rem"><button type="button" class="btn small primary" (click)="guardarNotas()">Guardar notas</button></div>
        }
      </section>

      <section class="card">
        <div class="page-header" style="margin-bottom: 0.5rem">
          <h2 style="margin: 0">Archivos</h2>
          <button type="button" class="btn small primary" [disabled]="seleccion().length !== 2" (click)="compararSeleccion()" title="Marca dos archivos binarios">Comparar seleccionados</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th style="width: 2rem"></th><th>Archivo</th><th class="num">Tamaño</th><th>Modificado</th><th></th></tr></thead>
            <tbody>
              @for (a of r.archivos; track a.id) {
                <tr [class.activa]="a.id === abierto()?.id">
                  <td>
                    @if (a.visor === 'binario') {
                      <input type="checkbox" [checked]="seleccion().includes(a.id)" (change)="alternar(a.id)" [attr.aria-label]="'Seleccionar ' + a.nombre" />
                    }
                  </td>
                  <td>
                    <button type="button" class="enlace" (click)="ver(a)">{{ ICONOS[a.visor] }} {{ a.nombre }}</button>
                    @if (a.ruta) {
                      <span class="hint"> · {{ a.ruta }}</span>
                    }
                    @if (a.visor === 'binario' && esOriginal(a.nombre)) {
                      <span class="etiqueta">original</span>
                    } @else if (a.visor === 'binario' && esModificado(a.nombre)) {
                      <span class="etiqueta mod">modificado</span>
                    }
                  </td>
                  <td class="num">{{ tamanoLegible(a.tamano) }}</td>
                  <td>{{ a.modificado | date: 'dd/MM/yy HH:mm' }}</td>
                  <td class="num acciones">
                    <a [href]="url(a, true)" title="Descargar">⬇</a>
                    @if (a.webUrl) {
                      <a [href]="a.webUrl" target="_blank" rel="noopener noreferrer" title="Abrir en SharePoint">↗</a>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">La carpeta no tiene archivos.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      @if (comparando(); as par) {
        <section class="card">
          <div class="page-header" style="margin-bottom: 0.5rem">
            <h2 style="margin: 0">Comparación</h2>
            <div class="toolbar" style="margin: 0">
              <button type="button" class="btn small" (click)="intercambiar()">⇄ Intercambiar</button>
              <button type="button" class="btn small" (click)="comparando.set(null)">Cerrar</button>
            </div>
          </div>
          <app-comparador-bin [a]="par[0]" [b]="par[1]" />
        </section>
      } @else if (abierto(); as a) {
        <section class="card">
          <div class="page-header" style="margin-bottom: 0.5rem">
            <h2 style="margin: 0; font-size: 1.05rem">{{ ICONOS[a.visor] }} {{ a.nombre }}</h2>
            <button type="button" class="btn small" (click)="abierto.set(null)">Cerrar</button>
          </div>
          @switch (a.visor) {
            @case ('pdf') {
              <iframe [src]="pdf()" title="PDF" class="pdf"></iframe>
            }
            @case ('imagen') {
              <img [src]="url(a)" [alt]="a.nombre" class="imagen" />
            }
            @case ('video') {
              <video [src]="url(a)" controls playsinline class="imagen"></video>
            }
            @case ('texto') {
              @if (texto() === null) {
                <p class="hint">Cargando…</p>
              } @else {
                <pre class="texto">{{ texto() }}</pre>
                @if (a.tamano > MAX_TEXTO) {
                  <p class="hint">Se muestra el primer megabyte. Descárgalo para verlo entero.</p>
                }
              }
            }
            @case ('office') {
              <p>Los documentos de Word, Excel y PowerPoint se abren en Office Online, dentro de SharePoint.</p>
              @if (a.webUrl) {
                <a class="btn primary" [href]="a.webUrl" target="_blank" rel="noopener noreferrer">↗ Abrir en Office Online</a>
              }
            }
            @default {
              <app-visor-hex [url]="url(a)" [tamano]="a.tamano" />
            }
          }
        </section>
      }
    }
  `,
  styles: `
    .vinculo { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: flex-start; }
    .busqueda { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.6rem; max-width: 560px; }
    .busqueda button { text-align: left; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 0.4rem 0.6rem; cursor: pointer; font: inherit; }
    .busqueda button:hover { border-color: var(--primary); }
    .enlace { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; font: inherit; text-align: left; }
    .etiqueta { font-size: 0.7rem; border-radius: var(--radius); padding: 0 0.45rem; margin-left: 0.4rem; background: var(--success-tint); color: var(--success); }
    .etiqueta.mod { background: var(--warning-tint); color: var(--warning); }
    .acciones a { margin-left: 0.6rem; text-decoration: none; }
    tr.activa td { background: var(--bg); }
    .pdf { width: 100%; height: 75vh; border: 1px solid var(--border); border-radius: var(--radius); }
    .imagen { max-width: 100%; max-height: 75vh; display: block; border-radius: var(--radius); }
    .texto { max-height: 65vh; overflow: auto; background: var(--bg); padding: 0.75rem; border-radius: var(--radius); font-size: 0.82rem; white-space: pre-wrap; word-break: break-word; }
  `
})
export class ReproDetalleComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly sanitizer = inject(DomSanitizer);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly ICONOS = ICONOS;
  protected readonly MAX_TEXTO = 1024 * 1024;
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly esOriginal = pareceOriginal;
  protected readonly esModificado = pareceModificado;
  protected readonly r = signal<ReproDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly abierto = signal<ArchivoRepro | null>(null);
  protected readonly texto = signal<string | null>(null);
  protected readonly seleccion = signal<number[]>([]);
  protected readonly comparando = signal<[ArchivoComparado, ArchivoComparado] | null>(null);
  protected readonly buscando = signal(false);
  protected readonly vehiculos = signal<VehiculoListItem[]>([]);
  protected qVehiculo = '';
  protected notas = '';
  private temporizador?: ReturnType<typeof setTimeout>;

  /** URL del PDF para el iframe: es la propia API del taller (mismo origen), por eso se marca como segura. */
  protected readonly pdf = computed<SafeResourceUrl | null>(() => {
    const a = this.abierto();
    return a ? this.sanitizer.bypassSecurityTrustResourceUrl(contenido(a)) : null;
  });

  ngOnInit() {
    this.cargar();
  }

  protected url(a: ArchivoRepro, descargar = false) {
    return contenido(a, descargar);
  }

  protected async ver(a: ArchivoRepro) {
    this.comparando.set(null);
    this.abierto.set(a);
    this.texto.set(null);
    if (a.visor === 'texto') {
      try {
        const r = await fetch(contenido(a), { headers: { Range: `bytes=0-${this.MAX_TEXTO - 1}` }, credentials: 'same-origin' });
        if (!r.ok) throw new Error();
        this.texto.set(new TextDecoder('utf-8').decode(await r.arrayBuffer()));
      } catch {
        this.texto.set('No se ha podido leer el archivo de SharePoint.');
      }
    }
  }

  protected alternar(id: number) {
    this.seleccion.update(s => (s.includes(id) ? s.filter(x => x !== id) : [...s.slice(-1), id]));
  }

  /** El que parezca original (por el nombre) va primero. */
  protected compararSeleccion() {
    const archivos = (this.r()?.archivos ?? []).filter(a => this.seleccion().includes(a.id));
    if (archivos.length !== 2) return;
    let [a, b] = archivos;
    if (pareceOriginal(b.nombre) || pareceModificado(a.nombre)) [a, b] = [b, a];
    this.abierto.set(null);
    this.comparando.set([this.comparado(a), this.comparado(b)]);
  }

  protected intercambiar() {
    this.comparando.update(p => (p ? [p[1], p[0]] : p));
  }

  protected buscarVehiculo(q: string) {
    this.qVehiculo = q;
    clearTimeout(this.temporizador);
    if (!q.trim()) {
      this.vehiculos.set([]);
      return;
    }
    this.temporizador = setTimeout(() => this.api.vehiculos({ q }).subscribe({ next: l => this.vehiculos.set(l.slice(0, 10)), error: () => {} }), 250);
  }

  protected vincular(vehiculoId: number | null) {
    this.api.vincularReprogramacion(this.id(), vehiculoId).subscribe({
      next: () => {
        this.buscando.set(false);
        this.vehiculos.set([]);
        this.qVehiculo = '';
        this.cargar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected guardarNotas() {
    const notas = this.notas.trim() || null;
    this.api.notasReprogramacion(this.id(), notas).subscribe({
      next: () => this.r.update(r => (r ? { ...r, notas } : r)),
      error: e => this.error.set(mensajeError(e))
    });
  }

  private comparado(a: ArchivoRepro): ArchivoComparado {
    return { nombre: a.nombre, url: contenido(a), tamano: a.tamano };
  }

  private cargar() {
    this.api.reprogramacion(this.id()).subscribe({
      next: r => {
        this.r.set(r);
        this.notas = r.notas ?? '';
      },
      error: e => this.error.set(mensajeError(e))
    });
  }
}
