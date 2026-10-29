import { JsonPipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { Api, mensajeError } from '../core/api';
import { VehiculoDetalle } from '../core/models';
import { esquema, EsquemaPiezas, NodoCatalogo, nodos, urlImagen, variantes, VarianteVehiculo } from '../core/vinalfa';
import { IdentificacionPipe } from '../shared/pipes';

interface Miga {
  nombre: string;
  hijos: NodoCatalogo[];
}

/** Despiece original de un vehículo por su bastidor (Vinalfa): grupos, esquemas con posiciones y referencias. */
@Component({
  selector: 'app-despiece-oem',
  imports: [FormsModule, RouterLink, JsonPipe, IdentificacionPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>Despiece original</h1>
        @if (vehiculo(); as v) {
          <div class="subtitle">{{ v.marca }} {{ v.modelo }} · <span class="mono">{{ v | identificacion }}</span>{{ v.bastidor ? '' : ' · sin bastidor' }}</div>
        }
      </div>
      <a class="btn" [routerLink]="['/gestion/vehiculos', id()]">← Volver al vehículo</a>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (!configurado()) {
      <div class="card"><p class="hint" style="margin: 0">Vinalfa no está configurado. Guarda el token de API de tu suscripción en <span class="mono">Vinalfa:Token</span> y reinicia la API.</p></div>
    } @else {
      <section class="card">
        <form class="fila" (ngSubmit)="identificar()">
          <label class="field" style="margin: 0">
            Bastidor, 7 últimos (BMW/MINI) o FRAME (japoneses)
            <input name="identificador" class="mono" [(ngModel)]="identificador" />
          </label>
          <button type="submit" class="btn primary" [disabled]="cargando()">{{ cargando() ? 'Buscando…' : 'Abrir catálogo' }}</button>
        </form>
        <p class="hint" style="margin: 0.4rem 0 0">Cada bastidor cuenta una vez al día en el límite de la suscripción; navegar por su catálogo no vuelve a contar.</p>

        @if (lista().length > 1) {
          <div class="variantes">
            <strong>Elige la variante:</strong>
            @for (v of lista(); track v.hash) {
              <button type="button" class="btn small" [class.primary]="v.hash === variante()?.hash" (click)="elegir(v)">{{ v.nombre }}</button>
            }
          </div>
        }
        @if (variante(); as v) {
          <div class="datos">
            <strong>{{ v.nombre }}</strong>
            @for (d of v.datos; track d.clave) {
              <span class="chip"><span class="hint">{{ d.clave }}:</span> {{ d.valor }}</span>
            }
          </div>
        }
        @if (crudo()['vehiculo'] !== undefined && !variante()) {
          <details><summary class="hint">Datos sin formato</summary><pre>{{ crudo()['vehiculo'] | json }}</pre></details>
        }
      </section>

      @if (variante(); as v) {
        <div class="cuerpo">
          <section class="card arbol">
            <form class="fila" (ngSubmit)="buscar()">
              <input name="q" [(ngModel)]="q" placeholder="Buscar pieza o referencia" aria-label="Buscar pieza o referencia" />
              <button type="submit" class="btn small" [disabled]="!q.trim()">Buscar</button>
            </form>
            <nav class="migas">
              @for (m of migas(); track $index; let i = $index, ultimo = $last) {
                @if (!ultimo) {
                  <button type="button" class="enlace" (click)="volverA(i)">{{ m.nombre }}</button> ›
                } @else {
                  <strong>{{ m.nombre }}</strong>
                }
              }
            </nav>
            @for (n of nivel(); track $index) {
              <button type="button" class="nodo" [class.activo]="n.hash !== null && n.hash === seccionAbierta()" (click)="abrir(n)">
                @if (n.imagen) {
                  <img [src]="urlImagen(n.imagen)" alt="" loading="lazy" />
                }
                <span>
                  {{ n.nombre }}{{ n.hijos.length ? ' (' + n.hijos.length + ')' : '' }}
                  @if (n.encontradas.length) {
                    <span class="hint mono encontradas">{{ n.encontradas.join(', ') }}</span>
                  }
                </span>
              </button>
            } @empty {
              <p class="hint">{{ cargando() ? 'Cargando…' : 'Sin secciones.' }}</p>
            }
            @if (crudo()['nivel'] !== undefined && !nivel().length) {
              <details><summary class="hint">Datos sin formato</summary><pre>{{ crudo()['nivel'] | json }}</pre></details>
            }
          </section>

          <section class="card esquema">
            @if (esq(); as e) {
              <h2 style="margin-top: 0">{{ e.nombre ?? 'Esquema' }}</h2>
              @if (e.imagen) {
                <div class="lienzo">
                  <img [src]="urlImagen(e.imagen)" alt="Esquema" (load)="medir($event)" />
                  @if (tamano(); as t) {
                    @for (p of e.puntos; track $index) {
                      <button type="button" class="punto" [class.activo]="p.etiqueta === posicion()"
                        [style.left.%]="pct(p.x, t.w)" [style.top.%]="pct(p.y, t.h)"
                        [style.width.%]="pct(p.ancho || 18, t.w)" [style.height.%]="pct(p.alto || 18, t.h)"
                        (click)="posicion.set(p.etiqueta)" [attr.aria-label]="'Posición ' + p.etiqueta"></button>
                    }
                  }
                </div>
              }
              @if (e.piezas.length) {
                <div class="table-wrap">
                  <table>
                    <thead><tr><th>Pos.</th><th>Referencia</th><th>Pieza</th><th class="num">Cant.</th><th>Nota</th></tr></thead>
                    <tbody>
                      @for (p of e.piezas; track $index) {
                        <tr [class.activa]="p.posicion !== null && p.posicion === posicion()" (click)="posicion.set(p.posicion)">
                          <td class="mono">{{ p.posicion ?? '' }}</td>
                          <td class="mono">
                            @if (p.referencia) {
                              {{ p.referencia }}
                              <button type="button" class="enlace" (click)="copiar(p.referencia); $event.stopPropagation()" title="Copiar referencia">📋</button>
                              <a class="autodoc" [href]="urlAutodoc(p.referencia)" target="_blank" rel="noopener noreferrer"
                                (click)="$event.stopPropagation()" [title]="'Buscar ' + p.referencia + ' en Autodoc'">Autodoc ↗</a>
                            }
                          </td>
                          <td>{{ p.nombre ?? '' }}</td>
                          <td class="num">{{ p.cantidad ?? '' }}</td>
                          <td class="hint">{{ p.nota ?? '' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
              @if (!e.imagen && !e.piezas.length) {
                <p class="hint">No se ha podido interpretar este esquema.</p>
              }
              <details><summary class="hint">Datos sin formato</summary><pre>{{ crudo()['esquema'] | json }}</pre></details>
            } @else {
              <p class="hint" style="margin: 0">Elige un grupo y una sección para ver su esquema y sus referencias.</p>
            }
          </section>
        </div>
      }
    }
  `,
  styles: `
    .fila { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: flex-end; }
    .fila input { min-width: 220px; }
    .variantes, .datos { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-top: 0.8rem; }
    .chip { font-size: 0.82rem; padding: 0.15rem 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--bg); }
    .cuerpo { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 860px) { .cuerpo { grid-template-columns: 1fr; } }
    .arbol .fila input { flex: 1; min-width: 0; padding: 0.35rem 0.5rem; }
    .migas { margin: 0.7rem 0 0.4rem; font-size: 0.88rem; }
    .autodoc { margin-left: 0.4rem; font-family: var(--font-body); font-size: 0.75rem; white-space: nowrap; }
    .enlace { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; text-decoration: underline; }
    .nodo { display: flex; gap: 0.5rem; align-items: center; width: 100%; text-align: left; padding: 0.4rem 0.5rem; border: 0; border-top: 1px solid var(--border); background: none; cursor: pointer; font: inherit; }
    .nodo:hover, .nodo.activo { background: var(--bg); }
    .nodo img { width: 44px; height: 34px; object-fit: contain; flex: none; background: #fff; }
    .encontradas { display: block; font-size: 0.75rem; }
    .lienzo { position: relative; display: inline-block; max-width: 100%; margin-bottom: 0.8rem; border: 1px solid var(--border); background: #fff; }
    .lienzo img { display: block; max-width: 100%; max-height: 75vh; width: auto; height: auto; }
    .punto { position: absolute; border: 2px solid transparent; background: rgba(198, 255, 0, 0.15); border-radius: 3px; cursor: pointer; padding: 0; }
    .punto:hover { border-color: var(--primary); }
    .punto.activo { border-color: var(--brand-ochre); background: rgba(198, 255, 0, 0.35); }
    tr.activa td { background: rgba(198, 255, 0, 0.18); }
    tbody tr { cursor: pointer; }
    pre { max-height: 300px; overflow: auto; font-size: 0.75rem; background: var(--bg); padding: 0.5rem; }
  `
})
export class DespieceOem implements OnInit {
  /** Búsqueda de la referencia original en Autodoc España (sin espacios ni guiones, como la indexa Autodoc). */
  protected urlAutodoc(referencia: string) {
    return `https://www.autodoc.es/search?keyword=${encodeURIComponent(referencia.replace(/[\s.-]/g, ''))}`;
  }

  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly configurado = signal(true);
  protected readonly vehiculo = signal<VehiculoDetalle | null>(null);
  protected readonly lista = signal<VarianteVehiculo[]>([]);
  protected readonly variante = signal<VarianteVehiculo | null>(null);
  protected readonly migas = signal<Miga[]>([]);
  protected readonly nivel = computed(() => this.migas().at(-1)?.hijos ?? []);
  protected readonly seccionAbierta = signal<string | null>(null);
  protected readonly esq = signal<EsquemaPiezas | null>(null);
  protected readonly posicion = signal<string | null>(null);
  protected readonly tamano = signal<{ w: number; h: number } | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Respuestas tal cual, para verlas si no se han podido interpretar. */
  protected readonly crudo = signal<Record<string, unknown>>({});
  protected readonly urlImagen = urlImagen;
  protected identificador = '';
  protected q = '';

  ngOnInit() {
    this.api.estadoVinalfa().subscribe({ next: e => this.configurado.set(e.configurado), error: () => {} });
    this.api.vehiculo(this.id()).subscribe({
      next: v => {
        this.vehiculo.set(v);
        this.identificador = (v.bastidor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (this.identificador.length >= 7) this.identificar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected identificar() {
    const bastidor = (this.vehiculo()?.bastidor ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const id = this.identificador.trim();
    this.reiniciar();
    this.pedir('vehiculo', this.api.vinalfaVehiculo(this.id(), id && id !== bastidor ? id : undefined), datos => {
      const v = variantes(datos);
      this.lista.set(v);
      if (v.length >= 1) this.elegir(v[0]);
      else this.error.set('Vinalfa ha respondido, pero no se ha podido leer el vehículo. Mira los datos sin formato.');
    });
  }

  protected elegir(v: VarianteVehiculo) {
    this.variante.set(v);
    this.esq.set(null);
    this.pedir('nivel', this.api.vinalfaGrupos(v.hash), datos => this.migas.set([{ nombre: 'Grupos', hijos: nodos(datos) }]));
  }

  /**
   * Los grupos principales traen sus subgrupos dentro; los esquemas se abren; del resto se piden sus subsecciones
   * y, si no tiene, se intenta abrir como esquema.
   */
  protected abrir(n: NodoCatalogo) {
    if (n.hijos.length) {
      this.migas.update(m => [...m, { nombre: n.nombre, hijos: n.hijos }]);
      return;
    }
    if (!n.hash) return;
    if (n.esEsquema) {
      this.abrirEsquema(n);
      return;
    }
    this.pedir('nivel', this.api.vinalfaSubsecciones(n.hash), datos => {
      const hijos = nodos(datos);
      if (hijos.length) this.migas.update(m => [...m, { nombre: n.nombre, hijos }]);
      else this.abrirEsquema(n);
    });
  }

  protected volverA(i: number) {
    this.migas.update(m => m.slice(0, i + 1));
  }

  protected buscar() {
    const v = this.variante();
    if (!v || !this.q.trim()) return;
    this.pedir('nivel', this.api.vinalfaBuscar(v.hash, this.q.trim()), datos => {
      const raiz = this.migas().slice(0, 1);
      this.migas.set([...raiz, { nombre: `Búsqueda: ${this.q.trim()}`, hijos: nodos(datos) }]);
    });
  }

  protected medir(e: Event) {
    const img = e.target as HTMLImageElement;
    this.tamano.set({ w: img.naturalWidth, h: img.naturalHeight });
  }

  /** Las coordenadas pueden venir en píxeles de la imagen original o ya como fracción (0-1). */
  protected pct(valor: number, total: number) {
    return valor <= 1 ? valor * 100 : (valor / total) * 100;
  }

  protected copiar(referencia: string) {
    navigator.clipboard?.writeText(referencia).catch(() => {});
  }

  private abrirEsquema(n: NodoCatalogo) {
    const v = this.variante();
    if (!v || !n.hash) return;
    this.seccionAbierta.set(n.hash);
    this.tamano.set(null);
    this.posicion.set(null);
    this.pedir('esquema', this.api.vinalfaPiezas(n.hash, v.hash), datos => {
      const e = esquema(datos);
      this.esq.set({ ...e, nombre: e.nombre ?? n.nombre });
    });
  }

  private reiniciar() {
    this.lista.set([]);
    this.variante.set(null);
    this.migas.set([]);
    this.esq.set(null);
    this.crudo.set({});
    this.error.set(null);
  }

  private pedir(clave: string, peticion: Observable<unknown>, siguiente: (datos: unknown) => void) {
    this.cargando.set(true);
    this.error.set(null);
    peticion.subscribe({
      next: datos => {
        this.cargando.set(false);
        this.crudo.update(c => ({ ...c, [clave]: datos }));
        siguiente(datos);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
