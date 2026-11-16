import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { hexOffset, tamanoLegible } from '../core/binario';
import { grupo, GRUPOS } from '../core/mapas';
import { BibliotecaDetalle, BibliotecaListItem, GrupoMapa, MapaCentralita } from '../core/models';
import { SECCIONES } from './centralitas';

const hex = (n: number) => hexOffset(n).replace(/^0{1,2}/, '');

/** Centralitas → Biblioteca: los softwares con mapas con nombre (nombrados en las lecturas o importados de XDF). */
@Component({
  selector: 'app-biblioteca-lista',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    <p class="hint" style="margin-top: 0">
      Los mapas que nombras en una lectura o importas de un XDF se guardan para su software, y se aplican solos a las
      lecturas nuevas del mismo software.
    </p>
    <div class="toolbar">
      <input type="search" placeholder="Buscar: software, familia o nombre de mapa" [ngModel]="q()" (ngModelChange)="buscar($event)" style="min-width: 300px" />
    </div>
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    <div class="card table-wrap">
      <table>
        <thead><tr><th>Software</th><th>Familia</th><th class="num">Tamaño</th><th class="num">Mapas con nombre</th><th class="num">XDF importados</th><th class="num">Lecturas</th><th>Modificada</th></tr></thead>
        <tbody>
          @for (b of lista(); track b.id) {
            <tr>
              <td><a class="mono" [routerLink]="['/gestion/centralitas/biblioteca', b.id]">{{ b.software ?? b.referencia }}</a>
                @if (b.software && b.referencia) { <span class="hint mono"> · {{ b.referencia }}</span> }
              </td>
              <td>{{ b.familia ?? '—' }}</td>
              <td class="num">{{ tamanoLegible(b.tamano) }}</td>
              <td class="num">{{ b.mapas }}</td>
              <td class="num">{{ b.importaciones }}</td>
              <td class="num">{{ b.lecturas }}</td>
              <td>{{ b.modificada | date: 'dd/MM/yyyy HH:mm' }}</td>
            </tr>
          } @empty {
            <tr><td colspan="7" class="empty">{{ cargando() ? 'Cargando…' : 'La biblioteca está vacía. Nombra los mapas de una lectura o importa un XDF desde su ficha.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class BibliotecaLista implements OnInit {
  private readonly api = inject(Api);
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly lista = signal<BibliotecaListItem[]>([]);
  protected readonly q = signal('');
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

  private cargar() {
    this.cargando.set(true);
    this.api.bibliotecas(this.q().trim() || undefined).subscribe({
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

/** Biblioteca de un software: sus mapas por grupo (para corregirlos), los XDF importados y sus lecturas. */
@Component({
  selector: 'app-biblioteca-detalle',
  imports: [FormsModule, RouterLink, DatePipe],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (exito()) {
      <div class="exito">{{ exito() }}</div>
    }
    @if (b(); as b) {
      <div class="page-header">
        <div>
          <h2 style="margin: 0; font-size: 1.25rem">📚 <span class="mono">{{ b.software ?? b.referencia }}</span>{{ b.familia ? ' · ' + b.familia : '' }}</h2>
          <div class="subtitle">
            {{ tamanoLegible(b.tamano) }}{{ b.software && b.referencia ? ' · referencia ' + b.referencia : '' }} · {{ b.mapas.length }} mapas con nombre ·
            creada el {{ b.fechaAlta | date: 'dd/MM/yyyy' }}, modificada el {{ b.modificada | date: 'dd/MM/yyyy HH:mm' }}
          </div>
        </div>
        <div class="toolbar" style="margin: 0">
          <button type="button" class="btn primary" (click)="aplicar()" [disabled]="trabajando() || !b.lecturas.length"
            title="Pasa los nombres y ajustes de la biblioteca a todas las lecturas de este software">⟳ Aplicar a las lecturas ({{ b.lecturas.length }})</button>
          <a class="btn" routerLink="/gestion/centralitas/biblioteca">← Biblioteca</a>
        </div>
      </div>

      <section class="card">
        <div class="page-header" style="margin-bottom: 0.5rem">
          <h3 style="margin: 0">Mapas</h3>
          <input type="search" placeholder="Buscar mapa" [ngModel]="qMapa()" (ngModelChange)="qMapa.set($event)" aria-label="Buscar mapa" style="max-width: 260px" />
        </div>
        <p class="hint" style="margin-top: 0">Los cambios aquí valen para las lecturas nuevas; para pasarlos a las que ya están subidas, «Aplicar a las lecturas».</p>
        @for (g of porGrupo(); track g.clave) {
          <h4 class="grupo"><span class="punto" [style.background]="g.color"></span>{{ g.etiqueta }} ({{ g.mapas.length }})</h4>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Nombre</th><th>Grupo</th><th>Dirección</th><th>Tamaño</th><th class="num">Factor</th><th>Unidad</th><th></th></tr></thead>
              <tbody>
                @for (m of g.mapas; track m.id) {
                  @if (editando()?.id === m.id) {
                    <tr class="edicion">
                      <td><input [(ngModel)]="edicion.nombre" maxlength="200" aria-label="Nombre" /></td>
                      <td>
                        <select [(ngModel)]="edicion.grupo" aria-label="Grupo">
                          <option [ngValue]="null">Sin grupo</option>
                          @for (x of GRUPOS; track x.valor) { <option [ngValue]="x.valor">{{ x.etiqueta }}</option> }
                        </select>
                      </td>
                      <td class="mono">0x{{ hex(m.direccion) }}</td>
                      <td>{{ tamano(m) }}</td>
                      <td class="num"><input type="number" step="any" [(ngModel)]="edicion.factor" aria-label="Factor" style="width: 7rem" /></td>
                      <td><input [(ngModel)]="edicion.unidad" maxlength="30" aria-label="Unidad" style="width: 7rem" /></td>
                      <td class="acciones">
                        <button type="button" class="btn small primary" (click)="guardar(m)" [disabled]="trabajando() || !edicion.nombre.trim()">Guardar</button>
                        <button type="button" class="btn small" (click)="editando.set(null)">Cancelar</button>
                      </td>
                    </tr>
                  } @else {
                    <tr>
                      <td>{{ m.nombre }}@if (m.descripcion) { <div class="hint">{{ m.descripcion }}</div> }@if (m.notas) { <div class="hint notas">{{ m.notas }}</div> }</td>
                      <td>{{ etiquetaGrupo(m.grupo) }}</td>
                      <td class="mono">0x{{ hex(m.direccion) }}</td>
                      <td>{{ tamano(m) }}</td>
                      <td class="num">{{ m.factor }}{{ m.desplazamiento ? (m.desplazamiento > 0 ? ' + ' : ' − ') + abs(m.desplazamiento) : '' }}</td>
                      <td>{{ m.unidad ?? '' }}</td>
                      <td class="acciones">
                        <button type="button" class="btn small" (click)="editar(m)">Editar</button>
                        <button type="button" class="btn small danger" (click)="eliminarMapa(m)" title="Quitar de la biblioteca">×</button>
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        } @empty {
          <p class="hint">{{ b.mapas.length ? 'Ningún mapa coincide.' : 'Esta biblioteca no tiene mapas.' }}</p>
        }
      </section>

      <section class="card">
        <h3 style="margin-top: 0">XDF importados</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Definición</th><th>Archivo</th><th class="num">Importados</th><th class="num">Omitidos</th><th>Avisos</th><th>Lectura</th></tr></thead>
            <tbody>
              @for (i of b.importaciones; track i.id) {
                <tr>
                  <td>{{ i.fecha | date: 'dd/MM/yyyy HH:mm' }}</td>
                  <td>{{ i.titulo ?? '—' }}</td>
                  <td><a [href]="'/api/centralitas/biblioteca/importaciones/' + i.id + '/archivo'">⬇ {{ i.nombreArchivo }}</a> <span class="hint">{{ tamanoLegible(i.tamano) }}</span></td>
                  <td class="num">{{ i.importados }}</td>
                  <td class="num">{{ i.omitidos }}</td>
                  <td>
                    @if (i.avisos.length) {
                      <details><summary>{{ i.avisos.length }}</summary><ul class="avisos">@for (a of i.avisos; track $index) { <li>{{ a }}</li> }</ul></details>
                    } @else { — }
                  </td>
                  <td>
                    @if (i.centralitaId) {
                      <a [routerLink]="['/gestion/centralitas', ruta(i.centralitaId), i.centralitaId]">Abrir</a>
                    } @else { <span class="hint">borrada</span> }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" class="empty">No se ha importado ningún XDF para este software; sus mapas se han nombrado en las lecturas.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h3 style="margin-top: 0">Lecturas de este software</h3>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Lectura</th><th>Tipo</th><th>Vehículo</th><th>Subida</th></tr></thead>
            <tbody>
              @for (l of b.lecturas; track l.id) {
                <tr>
                  <td><a [routerLink]="['/gestion/centralitas', ruta(l.id), l.id]">{{ l.nombre }}</a><div class="hint">{{ l.nombreArchivo }}</div></td>
                  <td>{{ l.tipo }}</td>
                  <td>{{ l.vehiculo ?? '—' }} <span class="mono hint">{{ l.matricula ?? '' }}</span></td>
                  <td>{{ l.fechaAlta | date: 'dd/MM/yyyy' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">Ya no queda ninguna lectura de este software; la biblioteca se aplicará a la próxima que subas.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <div class="form-actions">
        <button type="button" class="btn danger" (click)="eliminar()">Eliminar esta biblioteca</button>
      </div>
    }
  `,
  styles: `
    .grupo { margin: 1rem 0 0.4rem; font-size: 0.95rem; }
    .punto { display: inline-block; width: 0.65rem; height: 0.65rem; border-radius: 50%; margin-right: 0.4rem; }
    .acciones { white-space: nowrap; text-align: right; }
    .acciones .btn { margin-left: 0.3rem; }
    tr.edicion input, tr.edicion select { width: 100%; }
    .notas { max-width: 420px; white-space: pre-line; font-size: 0.75rem; }
    .avisos { margin: 0.3rem 0 0; padding-left: 1.1rem; font-size: 0.78rem; max-width: 520px; }
  `
})
export class BibliotecaDetalleComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly GRUPOS = GRUPOS;
  protected readonly hex = hex;
  protected readonly abs = Math.abs;
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly b = signal<BibliotecaDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly exito = signal<string | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly qMapa = signal('');
  protected readonly editando = signal<MapaCentralita | null>(null);
  protected edicion: { nombre: string; grupo: GrupoMapa | null; factor: number; unidad: string | null } = { nombre: '', grupo: null, factor: 1, unidad: null };

  /** Mapas agrupados (los grupos en el orden de la lista de grupos; sin grupo, al final). */
  protected readonly porGrupo = computed(() => {
    const q = this.qMapa().trim().toLowerCase();
    const mapas = (this.b()?.mapas ?? []).filter(m => !q || m.nombre.toLowerCase().includes(q) || !!m.descripcion?.toLowerCase().includes(q) || hex(m.direccion).toLowerCase().includes(q.replace(/^0x/, '')));
    const grupos = GRUPOS.map(g => ({ clave: g.valor as string, etiqueta: g.etiqueta, color: g.color, mapas: mapas.filter(m => m.grupo === g.valor) }));
    grupos.push({ clave: 'sin', etiqueta: 'Sin grupo', color: 'var(--border)', mapas: mapas.filter(m => !m.grupo) });
    return grupos.filter(g => g.mapas.length > 0);
  });

  ngOnInit() {
    this.cargar();
  }

  protected tamano(m: MapaCentralita) {
    return m.filas > 1 ? `${m.columnas} × ${m.filas}` : m.columnas > 1 ? `${m.columnas} puntos` : 'valor';
  }

  protected etiquetaGrupo(g: GrupoMapa | null) {
    return grupo(g)?.etiqueta ?? '—';
  }

  /** Ruta de la pestaña de la lectura (por su tipo); si no se sabe, motor. */
  protected ruta(lecturaId: number) {
    const tipo = this.b()?.lecturas.find(l => l.id === lecturaId)?.tipo;
    return SECCIONES.find(s => s.tipo === tipo)?.ruta ?? 'motor';
  }

  protected editar(m: MapaCentralita) {
    this.edicion = { nombre: m.nombre, grupo: m.grupo, factor: m.factor, unidad: m.unidad };
    this.editando.set(m);
  }

  protected guardar(m: MapaCentralita) {
    const { id: _id, origen: _origen, ...definicion } = m;
    const req = { ...definicion, nombre: this.edicion.nombre.trim(), grupo: this.edicion.grupo, factor: Number(this.edicion.factor) || 1, unidad: this.edicion.unidad?.trim() || null };
    this.trabajando.set(true);
    this.api.actualizarMapaBiblioteca(this.id(), m.id, req).subscribe({
      next: n => {
        this.trabajando.set(false);
        this.editando.set(null);
        this.b.update(b => (b ? { ...b, mapas: b.mapas.map(x => (x.id === n.id ? n : x)) } : b));
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminarMapa(m: MapaCentralita) {
    if (!confirm(`¿Quitar «${m.nombre}» de la biblioteca? Las lecturas ya subidas lo conservan.`)) return;
    this.api.eliminarMapaBiblioteca(this.id(), m.id).subscribe({
      next: () => this.b.update(b => (b ? { ...b, mapas: b.mapas.filter(x => x.id !== m.id) } : b)),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected aplicar() {
    const b = this.b();
    if (!b || !confirm(`¿Aplicar los ${b.mapas.length} mapas de la biblioteca a las ${b.lecturas.length} lecturas de este software? Se sobrescriben los mapas en la misma dirección, también los que ya tenían nombre.`)) return;
    this.trabajando.set(true);
    this.api.aplicarBiblioteca(b.id).subscribe({
      next: r => {
        this.trabajando.set(false);
        this.exito.set(`Aplicada a ${r.lecturas} ${r.lecturas === 1 ? 'lectura' : 'lecturas'} (${r.mapas} mapas).`);
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminar() {
    const b = this.b();
    if (!b || !confirm(`¿Eliminar la biblioteca de ${b.software ?? b.referencia} con sus ${b.mapas.length} mapas y sus XDF importados? Las lecturas conservan sus mapas.`)) return;
    this.api.eliminarBiblioteca(b.id).subscribe({
      next: () => this.router.navigate(['/gestion/centralitas/biblioteca']),
      error: e => this.error.set(mensajeError(e))
    });
  }

  private cargar() {
    this.api.biblioteca(this.id()).subscribe({
      next: b => this.b.set(b),
      error: e => this.error.set(mensajeError(e))
    });
  }
}
