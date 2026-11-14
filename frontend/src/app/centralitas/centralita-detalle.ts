import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { comparar, hexOffset, leerOffset, tamanoLegible } from '../core/binario';
import { Confianza, ETIQUETAS_CAMBIO, identificar, Identificacion, otraEsOriginal, TipoCambio } from '../core/cambios';
import { cambioMapa, CambioMapa, colorCelda, formatoValor, grupo, GRUPOS, leerMapa, MapaLeido, TIPOS_DATO, zonasSinMapa } from '../core/mapas';
import { CadenaBinario, CentralitaDetalle, CentralitaListItem, DescribirMapaRequest, GrupoMapa, MapaCentralita, MapaRequest, VehiculoListItem } from '../core/models';
import { ModeloMapas, Sugerencia, sugerir } from '../core/reconocimiento';
import { MarkdownPipe } from '../shared/markdown';
import { VisorHex } from '../shared/visor-hex';
import { SECCIONES, seccion } from './centralitas';

type Clase = 'todos' | 'mapas' | 'curvas' | 'manuales';
type Pestana = 'mapas' | 'textos' | 'hex';
const POR_PAGINA = 200;

type ModoVista = 'original' | 'modificada' | 'diferencia';

/**
 * Mapa (tabla con colores) o curva (gráfica y fila de valores), leídos del binario con su definición. Con otra lectura
 * para comparar, muestra la original, la modificada o la diferencia celda a celda (en %).
 */
@Component({
  selector: 'app-visor-mapa',
  template: `
    @if (leido(); as m) {
      @if (definicion().filas === 1) {
        <svg class="curva" viewBox="0 0 400 170" preserveAspectRatio="none" role="img" aria-label="Gráfica de la curva">
          @if (puntosOtra(); as p) {
            <polyline [attr.points]="p" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />
          }
          <polyline [attr.points]="puntos()" fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke" />
        </svg>
        <div class="rango hint">
          mín. {{ formato(m.minimo) }} · máx. {{ formato(m.maximo) }} {{ definicion().unidad ?? '' }}
          @if (puntosOtra()) { · <span class="leyenda">— modificada</span> <span class="leyenda tenue">- - original</span> }
        </div>
      }
      <div class="tabla-mapa">
        <table>
          <thead>
            <tr>
              <th class="esquina">{{ definicion().filas > 1 ? (definicion().ejeYUnidad ?? 'Y') + ' / ' + (definicion().ejeXUnidad ?? 'X') : (definicion().ejeXUnidad ?? 'X') }}</th>
              @for (x of m.ejeX; track $index) {
                <th>{{ formato(x) }}</th>
              }
            </tr>
          </thead>
          <tbody>
            @for (fila of m.valores; track $index; let f = $index) {
              <tr>
                <th>{{ definicion().filas > 1 ? formato(m.ejeY[f]) : (definicion().unidad ?? 'Valor') }}</th>
                @for (v of fila; track $index; let c = $index) {
                  @if (diferencia(); as d) {
                    <td [style.background]="colorDiferencia(d.original[f][c], v)" [title]="formato(d.original[f][c]) + ' → ' + formato(v)">{{ textoDiferencia(d.original[f][c], v) }}</td>
                  } @else {
                    <td [style.background]="color(v, m)" [class.cambiada]="cambiada(f, c)">{{ formato(v) }}</td>
                  }
                }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    .curva { width: 100%; height: 170px; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border); }
    .rango { margin: 0.2rem 0 0.6rem; }
    .leyenda { color: var(--primary); }
    .leyenda.tenue { color: var(--text-muted); }
    .tabla-mapa { overflow: auto; max-height: 65vh; border: 1px solid var(--border); border-radius: var(--radius); }
    .tabla-mapa table { border-collapse: collapse; font-size: 0.75rem; font-variant-numeric: tabular-nums; width: auto; }
    .tabla-mapa th, .tabla-mapa td { padding: 0.2rem 0.4rem; text-align: right; white-space: nowrap; border: 1px solid var(--border); }
    .tabla-mapa td.cambiada { outline: 2px solid var(--warning); outline-offset: -2px; }
    .tabla-mapa thead th { position: sticky; top: 0; background: var(--surface); z-index: 1; }
    .tabla-mapa tbody th { position: sticky; left: 0; background: var(--surface); }
    .tabla-mapa .esquina { left: 0; z-index: 2; color: var(--text-muted); font-weight: normal; }
  `
})
export class VisorMapa {
  readonly datos = input.required<DataView>();
  readonly definicion = input.required<MapaRequest>();
  /** La otra lectura (la modificada) para comparar; null si no se compara. */
  readonly otra = input<DataView | null>(null);
  readonly modo = input<ModoVista>('original');

  protected readonly formato = formatoValor;
  private readonly original = computed(() => leerMapa(this.datos(), this.definicion()));
  private readonly modificada = computed(() => (this.otra() ? leerMapa(this.otra()!, this.definicion()) : null));
  /** Lo que se pinta: la original, o la modificada en las vistas «modificada» y «diferencia». */
  protected readonly leido = computed(() => (this.modo() !== 'original' && this.modificada()) || this.original());
  protected readonly diferencia = computed(() => (this.modo() === 'diferencia' && this.modificada() ? { original: this.original().valores } : null));

  protected readonly puntos = computed(() => this.trazo(this.leido().valores[0] ?? []));
  protected readonly puntosOtra = computed(() => (this.modificada() && this.modo() !== 'original' ? this.trazo(this.original().valores[0] ?? []) : null));

  protected color(v: number, m: MapaLeido) {
    return colorCelda(v, m.minimo, m.maximo);
  }

  /** En la vista original, marca las celdas que cambian en la modificada. */
  protected cambiada(f: number, c: number) {
    const b = this.modificada();
    return !!b && this.modo() === 'original' && b.valores[f][c] !== this.original().valores[f][c];
  }

  protected textoDiferencia(a: number, b: number) {
    if (a === b || Number.isNaN(a) || Number.isNaN(b)) return '·';
    if (a === 0) return (b > 0 ? '+' : '') + formatoValor(b);
    const p = ((b - a) / Math.abs(a)) * 100;
    return `${p > 0 ? '+' : ''}${p.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  }

  /** Verde si sube, rojo si baja; más intenso cuanto más cambia (hasta un 30 %). */
  protected colorDiferencia(a: number, b: number) {
    if (a === b || Number.isNaN(a) || Number.isNaN(b)) return 'transparent';
    const p = a === 0 ? 1 : Math.min(Math.abs((b - a) / a) / 0.3, 1);
    return b > a ? `hsla(130, 70%, 45%, ${0.15 + 0.5 * p})` : `hsla(0, 80%, 55%, ${0.15 + 0.5 * p})`;
  }

  /** Puntos de la gráfica de una curva, en la escala común de las dos lecturas. */
  private trazo(valores: number[]) {
    const todos = [...(this.original().valores[0] ?? []), ...(this.modificada()?.valores[0] ?? [])].filter(v => !Number.isNaN(v));
    const minimo = Math.min(...todos);
    const rango = Math.max(...todos) - minimo || 1;
    return valores.map((v, i) => `${(i / Math.max(valores.length - 1, 1)) * 400},${160 - ((v - minimo) / rango) * 150}`).join(' ');
  }
}

/** Ficha de una lectura: identificación, vehículo, mapas (lista, visor y editor), textos y visor hexadecimal. */
@Component({
  selector: 'app-centralita-detalle',
  imports: [FormsModule, RouterLink, DatePipe, VisorHex, VisorMapa, MarkdownPipe],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (c(); as c) {
      <div class="page-header">
        <div>
          <h2 style="margin: 0; font-size: 1.25rem">{{ c.nombre }}</h2>
          <div class="subtitle">{{ c.nombreArchivo }} · {{ tamanoLegible(c.tamano) }} · subida el {{ c.fechaAlta | date: 'dd/MM/yyyy' }}</div>
        </div>
        <div class="toolbar" style="margin: 0">
          <a class="btn" [href]="'/api/centralitas/' + c.id + '/contenido?descargar=true'">⬇ Descargar</a>
          @if (c.vehiculoId) {
            <a class="btn" [routerLink]="['/gestion/vehiculos', c.vehiculoId]">← Vehículo</a>
          }
          <a class="btn" [routerLink]="['/gestion/centralitas', ruta()]">← Lecturas</a>
        </div>
      </div>

      <section class="card">
        <dl class="datos">
          <div><dt>Familia</dt><dd>{{ c.familia ?? '—' }}</dd></div>
          <div><dt>Hardware</dt><dd class="mono">{{ c.hardware ?? '—' }}</dd></div>
          <div><dt>Software</dt><dd class="mono">{{ c.software ?? '—' }}</dd></div>
          <div><dt>Referencia</dt><dd class="mono">{{ c.referencia ?? '—' }}</dd></div>
          <div><dt>SHA-256</dt><dd class="mono" [title]="c.sha256">{{ c.sha256.slice(0, 16) }}…</dd></div>
        </dl>
        <div class="biblioteca">
          @if (c.claveBiblioteca) {
            <span>📚 <strong>Biblioteca de este software:</strong> {{ c.mapasBiblioteca }} {{ c.mapasBiblioteca === 1 ? 'mapa con nombre' : 'mapas con nombre' }}.
              Lo que nombres aquí se aplica solo a las lecturas con el mismo software ({{ c.software ?? c.referencia }}).
              @if (c.bibliotecaId) { <a [routerLink]="['/gestion/centralitas/biblioteca', c.bibliotecaId]">Ver la biblioteca</a> }</span>
          } @else {
            <span class="hint">📚 Sin número de software ni referencia: los nombres de esta lectura no se pueden reutilizar en otras.</span>
          }
          <label class="btn small" [class.deshabilitado]="trabajando()" title="Definición de TunerPro (XDF) de este software">
            ⬆ Importar XDF
            <input type="file" accept=".xdf,.xml" hidden (change)="importarXdf($any($event.target))" [disabled]="trabajando()" />
          </label>
        </div>
        @if (resultadoXdf(); as r) {
          <div class="aviso">
            <strong>{{ r.titulo ?? 'XDF' }}:</strong> {{ r.importados }} mapas importados{{ r.omitidos ? ', ' + r.omitidos + ' omitidos (no caben en el archivo)' : '' }}.
            @if (r.avisos.length) {
              <details><summary>{{ r.totalAvisos }} avisos</summary><ul>@for (a of r.avisos; track $index) { <li>{{ a }}</li> }</ul></details>
            }
          </div>
        }
        <div class="comparacion">
          @if (c.comparadaConId) {
            <div>
              <strong>⇄ Comparando con</strong>
              <a [routerLink]="['/gestion/centralitas', ruta(), c.comparadaConId]">{{ c.comparadaNombre }}</a>
              @if (resumenComparacion(); as r) {
                <span class="hint"> · {{ r.bytes.toLocaleString('es-ES') }} bytes cambiados en {{ r.zonas }} zonas · {{ r.mapas }} mapas modificados · {{ r.sinMapa }} zonas fuera de los mapas</span>
              } @else if (errorComparada()) {
                <span class="error-texto"> · {{ errorComparada() }}</span>
              } @else {
                <span class="hint"> · cargando…</span>
              }
            </div>
            <div class="toolbar" style="margin: 0">
              <button type="button" class="btn small" (click)="abrirComparar()">Cambiar</button>
              <button type="button" class="btn small" (click)="elegirComparada(null)">Quitar</button>
            </div>
          } @else {
            <span class="hint">⇄ Compárala con la modificada (o con la original) para ver qué mapas cambió la reprogramación.</span>
            <button type="button" class="btn small" (click)="abrirComparar()">Comparar con…</button>
          }
        </div>
        @if (eligiendoComparada()) {
          <div class="copia">
            <label class="btn small subir-mod">
              ⬆ Subir la otra lectura y comparar
              <input type="file" hidden (change)="subirComparada($any($event.target))" [disabled]="trabajando()" />
            </label>
            @for (o of candidatasComparar(); track o.id) {
              <button type="button" (click)="elegirComparada(o.id)" [disabled]="trabajando()">
                <strong>{{ o.nombre }}</strong> · {{ o.nombreArchivo }}
                @if (o.vehiculoId && o.vehiculoId === c.vehiculoId) { <span class="etiqueta">mismo vehículo</span> }
                @if (o.software && o.software === c.software) { <span class="etiqueta">mismo software</span> }
              </button>
            } @empty {
              <p class="hint" style="margin: 0">{{ candidatasComparar() === null ? 'Cargando…' : 'No hay otras lecturas del mismo tamaño: sube la otra.' }}</p>
            }
          </div>
        }
        @if (identificacion(); as id) {
          <section class="identificacion">
            <h3>🔍 Qué hace esta reprogramación</h3>
            @if (id.invertida) {
              <p class="hint">La original parece la otra lectura: los cambios se leen de aquella a esta.</p>
            }
            @for (k of id.conclusiones; track k.clave) {
              <div class="conclusion">
                <span class="confianza" [class]="'confianza ' + k.confianza" [title]="textoConfianza[k.confianza].ayuda">{{ textoConfianza[k.confianza].texto }}</span>
                <div><strong>{{ k.titulo }}</strong> <span class="hint">{{ k.detalle }}</span></div>
              </div>
            } @empty {
              <p class="hint" style="margin: 0">No se ha reconocido ningún cambio típico.</p>
            }
            @if (id.cambios.length) {
              <details class="zonas">
                <summary>{{ id.cambios.length }} cambios identificados uno a uno</summary>
                <div class="grupos" style="margin-top: 0.5rem">
                  <button type="button" [class.activo]="!tipoCambio()" (click)="tipoCambio.set('')">Todos</button>
                  @for (t of tiposCambio(); track t.tipo) {
                    <button type="button" [class.activo]="tipoCambio() === t.tipo" (click)="tipoCambio.set(t.tipo)">{{ etiquetasCambio[t.tipo] }} ({{ t.n }})</button>
                  }
                </div>
                <div class="table-wrap">
                <table>
                  <thead><tr><th>Dirección</th><th>Tipo</th><th>Qué es</th><th class="num">Bytes</th><th></th></tr></thead>
                  <tbody>
                    @for (z of cambiosFiltrados().slice(0, 200); track z.desde) {
                      <tr>
                        <td class="mono">0x{{ hex(z.desde) }}</td>
                        <td><span class="tipo-cambio" [class]="'tipo-cambio ' + z.tipo">{{ etiquetasCambio[z.tipo] }}</span></td>
                        <td>@if (z.mapa) { <strong>{{ z.mapa.nombre }}</strong> · }{{ z.titulo }}</td>
                        <td class="num">{{ z.cambiados }}</td>
                        <td class="acciones">
                          @if (z.mapa) {
                            <button type="button" class="btn small" (click)="abrir(z.mapa)">Abrir mapa</button>
                          } @else {
                            <button type="button" class="btn small" (click)="nuevoEn(z.desde)">Crear mapa aquí</button>
                          }
                          <button type="button" class="btn small" (click)="verHex(z.desde)">Ver en hex</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                </div>
                @if (cambiosFiltrados().length > 200) { <p class="hint">Se muestran los 200 primeros.</p> }
              </details>
            }
          </section>
        }
        <div class="vinculo">
          <div>
            <strong>Vehículo: </strong>
            @if (c.vehiculoId) {
              <a [routerLink]="['/gestion/vehiculos', c.vehiculoId]">{{ c.vehiculo }}</a> <span class="mono hint">{{ c.matricula }}</span>
            } @else {
              <span class="hint">sin vincular</span>
            }
          </div>
          <div class="toolbar" style="margin: 0">
            <button type="button" class="btn small" (click)="buscando.set(!buscando())">{{ c.vehiculoId ? 'Cambiar' : 'Vincular' }}</button>
            @if (c.vehiculoId) {
              <button type="button" class="btn small" (click)="guardar({ vehiculoId: null })">Quitar</button>
            }
          </div>
        </div>
        @if (buscando()) {
          <div class="busqueda">
            <input type="search" placeholder="Matrícula, bastidor, cliente o modelo" [ngModel]="qVehiculo" (ngModelChange)="buscarVehiculo($event)" aria-label="Buscar vehículo" />
            @for (v of vehiculos(); track v.id) {
              <button type="button" (click)="guardar({ vehiculoId: v.id })">{{ v.marca }} {{ v.modelo }} · <span class="mono">{{ v.matricula ?? v.bastidor }}</span> · {{ v.clienteNombre }}</button>
            }
          </div>
        }
        <div class="form-grid" style="margin-top: 0.8rem">
          <label class="field">
            Nombre
            <input [(ngModel)]="nombre" maxlength="200" />
          </label>
          <label class="field">
            Tipo de centralita
            <select [(ngModel)]="tipoLectura">
              @for (s of SECCIONES; track s.tipo) {
                <option [ngValue]="s.tipo">{{ s.titulo }}</option>
              }
            </select>
          </label>
          <label class="field">
            Familia
            <input [(ngModel)]="familia" maxlength="60" placeholder="EDC17C46" />
          </label>
          <label class="field">
            Hardware
            <input [(ngModel)]="hardware" class="mono" maxlength="60" />
          </label>
          <label class="field">
            Software
            <input [(ngModel)]="software" class="mono" maxlength="60" />
          </label>
          <label class="field">
            Referencia
            <input [(ngModel)]="referencia" class="mono" maxlength="60" />
          </label>
          <label class="field full">
            Notas
            <textarea [(ngModel)]="notas" rows="2" placeholder="Vehículo, motor, potencia, qué se hizo…"></textarea>
          </label>
        </div>
        <p class="hint" style="margin: 0.4rem 0 0">El software (o la referencia) decide qué biblioteca de mapas usa la lectura. «Volver a analizar» sustituye familia, hardware, software y referencia por los detectados en el archivo.</p>
        <div class="form-actions" style="margin-top: 0.5rem">
          <button type="button" class="btn danger" (click)="eliminar()">Eliminar lectura</button>
          <button type="button" class="btn" (click)="reanalizar()" [disabled]="trabajando()" title="Vuelve a identificar y buscar mapas; conserva los mapas creados o editados a mano">↻ Volver a analizar</button>
          @if (cambiosPendientes()) {
            <button type="button" class="btn primary" (click)="guardar({})" [disabled]="trabajando() || !nombre.trim()">Guardar cambios</button>
          }
        </div>
      </section>

      <nav class="pestanas-internas" aria-label="Secciones de la lectura">
        <button type="button" [class.active]="pestana() === 'mapas'" (click)="pestana.set('mapas')">Mapas ({{ c.mapas.length }})</button>
        <button type="button" [class.active]="pestana() === 'textos'" (click)="abrirTextos()">Textos</button>
        <button type="button" [class.active]="pestana() === 'hex'" (click)="pestana.set('hex')">Hexadecimal</button>
      </nav>

      @switch (pestana()) {
        @case ('mapas') {
          <div class="mapas">
            <section class="card lista">
              <div class="grupos" role="group" aria-label="Grupos de mapas">
                <button type="button" [class.activo]="grupoFiltro() === ''" (click)="filtrarGrupo('')">Todos</button>
                <button type="button" [class.activo]="grupoFiltro() === 'importantes'" (click)="filtrarGrupo('importantes')">★ Importantes ({{ importantes() }})</button>
                @if (sugerencias().size) {
                  <button type="button" class="sugeridos" [class.activo]="grupoFiltro() === 'sugeridos'" (click)="filtrarGrupo('sugeridos')"
                    title="Mapas sin grupo que el reconocimiento automático cree que son de potencia (par, turbo, inyección, limitadores)">⚡ Posible potencia ({{ sugerencias().size }})</button>
                }
                @if (cambios().size) {
                  <button type="button" class="modificados" [class.activo]="grupoFiltro() === 'modificados'" (click)="filtrarGrupo('modificados')">≠ Modificados ({{ cambios().size }})</button>
                }
                @for (g of resumenGrupos(); track g.valor) {
                  <button type="button" [class.activo]="grupoFiltro() === g.valor" (click)="filtrarGrupo(g.valor)">
                    <span class="punto" [style.background]="g.color"></span>{{ g.etiqueta }} ({{ g.total }})
                  </button>
                }
              </div>
              <div class="filtros">
                <input type="search" placeholder="Nombre o dirección (hex)" [ngModel]="qMapa()" (ngModelChange)="qMapa.set($event); limite.set(POR_PAGINA)" aria-label="Buscar mapa" />
                <select [ngModel]="clase()" (ngModelChange)="clase.set($event); limite.set(POR_PAGINA)" aria-label="Clase de mapa">
                  <option value="todos">Todos</option>
                  <option value="mapas">Mapas (2 ejes)</option>
                  <option value="curvas">Curvas (1 eje)</option>
                  <option value="manuales">Con nombre / manuales</option>
                </select>
                <button type="button" class="btn small" (click)="nuevo()">+ Mapa a mano</button>
                <button type="button" class="btn small" (click)="abrirCopia()" title="Trae los nombres y ajustes de los mapas de otra lectura">⇆ Copiar nombres de otra lectura</button>
              </div>
              @if (copiando()) {
                <div class="copia">
                  <p class="hint" style="margin: 0 0 0.3rem">
                    Se aplican sobre los mapas en la misma dirección y tamaño. Con el mismo software se añaden también los que falten.
                  </p>
                  @for (o of candidatas(); track o.id) {
                    <button type="button" (click)="copiar(o.id)" [disabled]="trabajando()">
                      <strong>{{ o.nombre }}</strong> · {{ o.mapasConNombre }} con nombre
                      @if (o.software && o.software === c.software) { <span class="etiqueta">mismo software</span> }
                      <span class="hint"> · {{ o.vehiculo ?? o.nombreArchivo }}</span>
                    </button>
                  } @empty {
                    <p class="hint" style="margin: 0">{{ candidatas() === null ? 'Cargando…' : 'No hay otras lecturas con mapas con nombre.' }}</p>
                  }
                </div>
              }
              <div class="hint">{{ filtrados().length }} de {{ c.mapas.length }}</div>
              <ul>
                @for (m of filtrados().slice(0, limite()); track m.id) {
                  <li>
                    <button type="button" [class.activa]="m.id === seleccion()?.id" (click)="abrir(m)">
                      <span class="nombre">
                        @if (grupoDe(m.grupo); as g) { <span class="punto" [style.background]="g.color" [title]="g.etiqueta"></span> }
                        {{ m.nombre }}
                      </span>
                      <span class="hint mono">{{ m.filas > 1 ? m.columnas + '×' + m.filas : m.columnas }} · 0x{{ hex(m.direccion) }}{{ m.origen === 'Manual' ? ' · ✎' : '' }}{{ grupoDe(m.grupo) ? ' · ' + grupoDe(m.grupo)!.etiqueta : '' }}
                        @if (cambios().get(m.id); as k) { <span class="cambio" [class.baja]="k.porcentaje < 0">≠ {{ textoCambio(k.porcentaje) }}</span> }
                        @if (sugerencias().get(m.id); as s) { <span class="sugerencia" title="Reconocimiento automático: posible mapa de potencia">⚡ {{ porcentaje(s.probabilidad) }}</span> }</span>
                    </button>
                  </li>
                } @empty {
                  <li class="hint">{{ c.mapas.length ? 'Ningún mapa coincide.' : 'No se han encontrado mapas. Puedes añadirlos a mano si conoces su dirección.' }}</li>
                }
              </ul>
              @if (filtrados().length > limite()) {
                <button type="button" class="btn small" (click)="limite.set(limite() + POR_PAGINA)">Mostrar más</button>
              }
            </section>

            <section class="card visor">
              @if (!datos()) {
                <p class="hint">{{ errorBinario() ?? 'Cargando el binario…' }}</p>
              } @else if (edicion(); as e) {
                <div class="page-header" style="margin-bottom: 0.6rem">
                  <div>
                    <h3 style="margin: 0">{{ e.nombre || 'Mapa nuevo' }}</h3>
                    <div class="hint mono">0x{{ hex(e.direccion) }} · {{ e.filas > 1 ? e.columnas + ' × ' + e.filas : e.columnas + ' puntos' }} · {{ etiquetaTipo(e.tipoDato) }} · {{ e.bigEndian ? 'big endian' : 'little endian' }}{{ e.filas > 1 ? (e.porColumnas ? ' · por columnas' : ' · por filas') : '' }}</div>
                  </div>
                  <div class="toolbar" style="margin: 0">
                    @if (datosOtra()) {
                      <div class="segmentado" role="group" aria-label="Vista">
                        <button type="button" [class.activo]="modo() === 'original'" (click)="modo.set('original')">Esta</button>
                        <button type="button" [class.activo]="modo() === 'modificada'" (click)="modo.set('modificada')">La otra</button>
                        <button type="button" [class.activo]="modo() === 'diferencia'" (click)="modo.set('diferencia')">Diferencia</button>
                      </div>
                    }
                    <button type="button" class="btn small" (click)="ajustando.set(!ajustando())">{{ ajustando() ? 'Ocultar ajustes' : '⚙ Ajustar' }}</button>
                    @if (seleccion()) {
                      <button type="button" class="btn small" (click)="verEnHex()">Ver en hex</button>
                    }
                    <button type="button" class="btn small" (click)="describir()" [disabled]="describiendo()" title="Claude explica qué es probablemente el mapa y, si comparas, qué le cambió la reprogramación">{{ describiendo() ? 'Describiendo…' : '✨ Describir con IA' }}</button>
                  </div>
                </div>
                @if (sugerenciaVista(); as s) {
                  <p class="aviso-sugerencia">
                    ⚡ <strong>Posible mapa de potencia ({{ porcentaje(s.probabilidad) }})</strong>: par, turbo, inyección o limitadores, según su forma.
                    Si lo confirmas, ponle grupo y nombre en «Ajustar»: queda en la biblioteca y servirá de ejemplo la próxima vez que se reentrene el reconocimiento.
                  </p>
                }
                @if (descripcion(); as d) {
                  <div class="descripcion">
                    <div class="cabecera">
                      <strong>✨ Descripción con IA</strong>
                      <span class="hint">orientativa, revísala · {{ d.modelo }}</span>
                    </div>
                    <div [innerHTML]="d.texto | markdown"></div>
                    <div class="form-actions" style="margin-top: 0.4rem">
                      <button type="button" class="btn small" (click)="descripcionANotas()">Añadir a las notas del mapa</button>
                      <button type="button" class="btn small" (click)="descripcion.set(null)">Cerrar</button>
                    </div>
                  </div>
                } @else if (errorDescripcion(); as err) {
                  <p class="aviso">{{ err }}</p>
                }
                @if (seleccion()?.origen === 'Detectado' && !ajustando()) {
                  <p class="hint" style="margin-top: 0">
                    Detectado automáticamente: valores en bruto. Si sabes qué mapa es, ponle nombre, factor y unidades en «Ajustar».
                  </p>
                }
                @if (ajustando()) {
                  <div class="ajustes">
                    <label class="field">Grupo
                      <select [(ngModel)]="e.grupo" (ngModelChange)="refrescar()">
                        <option [ngValue]="null">Sin grupo</option>
                        @for (g of GRUPOS; track g.valor) { <option [ngValue]="g.valor">{{ g.etiqueta }}</option> }
                      </select>
                    </label>
                    <label class="field nombre-mapa">Nombre
                      <input [(ngModel)]="e.nombre" (ngModelChange)="elegirNombre($event)" maxlength="200" list="nombres-habituales" placeholder="Elige uno habitual o escríbelo" />
                      <datalist id="nombres-habituales">
                        @for (n of nombresHabituales(); track n.nombre) { <option [value]="n.nombre">{{ n.unidad ?? '' }}</option> }
                      </datalist>
                    </label>
                    <label class="field">Dirección (hex) <input class="mono" [ngModel]="hex(e.direccion)" (ngModelChange)="direccion('direccion', $event)" /></label>
                    <label class="field">Columnas (X) <input type="number" min="1" max="256" [(ngModel)]="e.columnas" (ngModelChange)="refrescar()" /></label>
                    <label class="field">Filas (Y) <input type="number" min="1" max="256" [(ngModel)]="e.filas" (ngModelChange)="refrescar()" /></label>
                    <label class="field">Tipo de dato
                      <select [(ngModel)]="e.tipoDato" (ngModelChange)="refrescar()">
                        @for (t of TIPOS_DATO; track t.valor) { <option [ngValue]="t.valor">{{ t.etiqueta }}</option> }
                      </select>
                    </label>
                    <label class="field">Orden de bytes
                      <select [(ngModel)]="e.bigEndian" (ngModelChange)="refrescar()">
                        <option [ngValue]="false">Little endian (Tricore)</option>
                        <option [ngValue]="true">Big endian (PowerPC, C167)</option>
                      </select>
                    </label>
                    @if (e.filas > 1) {
                      <label class="field">Guardado
                        <select [(ngModel)]="e.porColumnas" (ngModelChange)="refrescar()">
                          <option [ngValue]="false">Por filas</option>
                          <option [ngValue]="true">Por columnas</option>
                        </select>
                      </label>
                    }
                    <label class="field">Factor <input type="number" step="any" [(ngModel)]="e.factor" (ngModelChange)="refrescar()" /></label>
                    <label class="field">Desplazamiento <input type="number" step="any" [(ngModel)]="e.desplazamiento" (ngModelChange)="refrescar()" /></label>
                    <label class="field">Unidad <input [(ngModel)]="e.unidad" (ngModelChange)="refrescar()" maxlength="30" placeholder="mg/carrera, Nm, °…" /></label>

                    <label class="field">Eje X: dirección (hex) <input class="mono" [ngModel]="e.ejeXDireccion === null ? '' : hex(e.ejeXDireccion)" (ngModelChange)="direccion('ejeXDireccion', $event)" placeholder="vacío = 0, 1, 2…" /></label>
                    <label class="field">Eje X: tipo
                      <select [(ngModel)]="e.ejeXTipo" (ngModelChange)="refrescar()">
                        @for (t of TIPOS_DATO; track t.valor) { <option [ngValue]="t.valor">{{ t.etiqueta }}</option> }
                      </select>
                    </label>
                    <label class="field">Eje X: factor <input type="number" step="any" [(ngModel)]="e.ejeXFactor" (ngModelChange)="refrescar()" /></label>
                    <label class="field">Eje X: desplazamiento <input type="number" step="any" [(ngModel)]="e.ejeXDesplazamiento" (ngModelChange)="refrescar()" /></label>
                    @if (e.ejeXDireccion === null) {
                      <label class="field full">Eje X: valores fijos <input [(ngModel)]="e.ejeXValores" (ngModelChange)="refrescar()" placeholder="Separados por ; (p. ej. 800;1000;1500…), si el eje no está en el binario" /></label>
                    }
                    <label class="field">Eje X: unidad <input [(ngModel)]="e.ejeXUnidad" (ngModelChange)="refrescar()" maxlength="30" placeholder="rpm…" /></label>
                    @if (e.filas > 1) {
                      <label class="field">Eje Y: dirección (hex) <input class="mono" [ngModel]="e.ejeYDireccion === null ? '' : hex(e.ejeYDireccion)" (ngModelChange)="direccion('ejeYDireccion', $event)" placeholder="vacío = 0, 1, 2…" /></label>
                      <label class="field">Eje Y: tipo
                        <select [(ngModel)]="e.ejeYTipo" (ngModelChange)="refrescar()">
                          @for (t of TIPOS_DATO; track t.valor) { <option [ngValue]="t.valor">{{ t.etiqueta }}</option> }
                        </select>
                      </label>
                      <label class="field">Eje Y: factor <input type="number" step="any" [(ngModel)]="e.ejeYFactor" (ngModelChange)="refrescar()" /></label>
                      <label class="field">Eje Y: desplazamiento <input type="number" step="any" [(ngModel)]="e.ejeYDesplazamiento" (ngModelChange)="refrescar()" /></label>
                      @if (e.ejeYDireccion === null) {
                        <label class="field full">Eje Y: valores fijos <input [(ngModel)]="e.ejeYValores" (ngModelChange)="refrescar()" placeholder="Separados por ;" /></label>
                      }
                      <label class="field">Eje Y: unidad <input [(ngModel)]="e.ejeYUnidad" (ngModelChange)="refrescar()" maxlength="30" placeholder="mg/carrera…" /></label>
                    }
                    <label class="field full">Notas <textarea [(ngModel)]="e.notas" rows="2"></textarea></label>
                    <div class="form-actions full">
                      @if (seleccion(); as s) {
                        <button type="button" class="btn danger" (click)="eliminarMapa(s)">Eliminar mapa</button>
                      }
                      <button type="button" class="btn" (click)="cancelarEdicion()">Descartar cambios</button>
                      <button type="button" class="btn primary" (click)="guardarMapa()" [disabled]="trabajando() || !e.nombre.trim()">{{ seleccion() ? 'Guardar mapa' : 'Crear mapa' }}</button>
                    </div>
                  </div>
                }
                <app-visor-mapa [datos]="datos()!" [definicion]="vista()!" [otra]="datosOtra()" [modo]="modo()" />
              } @else {
                <p class="hint">Elige un mapa de la lista para ver sus datos.</p>
              }
            </section>
          </div>
        }
        @case ('textos') {
          <section class="card">
            <p class="hint" style="margin-top: 0">Textos legibles del binario: números de pieza, versión de software, familia, fechas… Útiles para identificarla.</p>
            <input type="search" placeholder="Filtrar" [ngModel]="qTexto()" (ngModelChange)="qTexto.set($event)" aria-label="Filtrar textos" style="max-width: 320px" />
            @if (cadenas() === null) {
              <p class="hint">Cargando…</p>
            } @else {
              <div class="table-wrap textos">
                <table>
                  <thead><tr><th>Dirección</th><th>Texto</th></tr></thead>
                  <tbody>
                    @for (t of textosFiltrados(); track t.direccion) {
                      <tr><td class="mono">0x{{ hex(t.direccion) }}</td><td class="mono">{{ t.texto }}</td></tr>
                    } @empty {
                      <tr><td colspan="2" class="empty">No hay textos.</td></tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        }
        @case ('hex') {
          <section class="card">
            <app-visor-hex [url]="'/api/centralitas/' + c.id + '/contenido'" [tamano]="c.tamano" [inicio]="hexInicio()" />
          </section>
        }
      }
    }
  `,
  styles: `
    .vinculo { display: flex; justify-content: space-between; gap: 1rem; flex-wrap: wrap; align-items: center; margin-top: 0.6rem; }
    .busqueda { display: flex; flex-direction: column; gap: 0.3rem; margin-top: 0.6rem; max-width: 560px; }
    .busqueda button { text-align: left; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 0.4rem 0.6rem; cursor: pointer; font: inherit; color: var(--text); }
    .busqueda button:hover { border-color: var(--primary); }
    .pestanas-internas { display: flex; gap: 0.4rem; margin: 0 0 1rem; flex-wrap: wrap; }
    .pestanas-internas button { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); padding: 0.35rem 0.9rem; color: var(--text); cursor: pointer; font: inherit; }
    .pestanas-internas button.active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .mapas { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 900px) { .mapas { grid-template-columns: 1fr; } }
    .lista ul { list-style: none; margin: 0.4rem 0; padding: 0; max-height: 70vh; overflow-y: auto; }
    .lista li button { display: flex; flex-direction: column; align-items: flex-start; width: 100%; text-align: left; background: none; border: 0; border-radius: var(--radius); padding: 0.3rem 0.45rem; cursor: pointer; font: inherit; color: var(--text); }
    .lista li button:hover { background: var(--bg); }
    .lista li button.activa { background: var(--bg); outline: 1px solid var(--primary); }
    .lista .nombre { font-size: 0.85rem; }
    .lista .hint { font-size: 0.72rem; }
    .filtros { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.3rem; }
    .filtros input { flex: 1; min-width: 140px; }
    .visor { min-width: 0; }
    .ajustes { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 0.5rem 0.8rem; margin-bottom: 1rem; padding: 0.8rem; background: var(--bg); border-radius: var(--radius); }
    .ajustes .full { grid-column: 1 / -1; }
    .textos { max-height: 65vh; overflow: auto; margin-top: 0.6rem; }
    .grupos { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-bottom: 0.5rem; }
    .grupos button { border: 1px solid var(--border); background: var(--surface); border-radius: 999px; padding: 0.15rem 0.6rem; font: inherit; font-size: 0.75rem; color: var(--text); cursor: pointer; }
    .grupos button.activo { border-color: var(--primary); background: var(--bg); }
    .punto { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; margin-right: 0.3rem; vertical-align: baseline; }
    .copia { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.4rem 0; padding: 0.6rem; background: var(--bg); border-radius: var(--radius); }
    .copia button { text-align: left; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); padding: 0.35rem 0.6rem; cursor: pointer; font: inherit; font-size: 0.82rem; color: var(--text); }
    .copia button:hover { border-color: var(--primary); }
    .etiqueta { font-size: 0.7rem; border-radius: var(--radius); padding: 0 0.45rem; margin-left: 0.3rem; background: var(--success-tint); color: var(--success); }
    .ajustes .nombre-mapa { grid-column: span 2; }
    .comparacion { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-top: 0.6rem; padding: 0.5rem 0.7rem; background: var(--bg); border-radius: var(--radius); font-size: 0.88rem; }
    .error-texto { color: var(--danger); }
    .subir-mod { align-self: flex-start; cursor: pointer; }
    .zonas { margin-top: 0.6rem; font-size: 0.85rem; }
    .identificacion { margin-top: 0.6rem; padding: 0.6rem 0.8rem; border: 1px solid var(--border); border-radius: var(--radius); }
    .identificacion h3 { margin: 0 0 0.5rem; font-size: 0.95rem; }
    .conclusion { display: flex; gap: 0.6rem; align-items: baseline; padding: 0.3rem 0; font-size: 0.88rem; }
    .conclusion + .conclusion { border-top: 1px solid var(--border); }
    .conclusion strong, .comparacion strong { margin-right: 0.35rem; }
    .confianza { flex: none; min-width: 4.6rem; text-align: center; font-size: 0.7rem; font-weight: 600; border-radius: 999px; padding: 0.05rem 0.5rem; cursor: help; }
    .confianza.alta { background: var(--success-tint); color: var(--success); }
    .confianza.media { background: var(--warning-tint); color: var(--warning); }
    .confianza.baja { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }
    .tipo-cambio { font-size: 0.72rem; white-space: nowrap; border-radius: var(--radius); padding: 0 0.4rem; background: var(--bg); }
    .tipo-cambio.anulada, .tipo-cambio.maximo, .tipo-cambio.dtc { background: var(--danger-tint); color: var(--danger); }
    .tipo-cambio.subida { background: var(--success-tint); color: var(--success); }
    .tipo-cambio.interruptor, .tipo-cambio.bajada { background: var(--warning-tint); color: var(--warning); }
    .zonas table { margin-top: 0.4rem; }
    .zonas .acciones { text-align: right; white-space: nowrap; }
    .zonas .acciones .btn { margin-left: 0.3rem; }
    .cambio { color: var(--success); font-weight: 600; margin-left: 0.3rem; }
    .cambio.baja { color: var(--danger); }
    .grupos button.modificados { border-color: var(--warning); }
    .grupos button.sugeridos { border-color: var(--primary); }
    .sugerencia { margin-left: 0.35rem; color: var(--primary); font-weight: 600; }
    .aviso-sugerencia { margin-top: 0; padding: 0.4rem 0.6rem; border-left: 3px solid var(--primary); background: var(--bg); border-radius: var(--radius); font-size: 0.85rem; }
    .descripcion { border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.8rem; margin-bottom: 0.8rem; background: var(--bg); font-size: 0.9rem; }
    .descripcion .cabecera { display: flex; justify-content: space-between; gap: 0.5rem; flex-wrap: wrap; }
    .descripcion ul { margin: 0.4rem 0 0; padding-left: 1.2rem; }
    .segmentado { display: inline-flex; border: 1px solid var(--border-strong); }
    .segmentado button { background: transparent; border: 0; color: inherit; padding: 4px 12px; cursor: pointer; font: inherit; font-size: 0.8rem; font-weight: 600; }
    .segmentado button + button { border-left: 1px solid var(--border-strong); }
    .segmentado button.activo { background: var(--primary); color: var(--on-primary); }
    .biblioteca { display: flex; justify-content: space-between; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-top: 0.6rem; padding: 0.5rem 0.7rem; background: var(--bg); border-radius: var(--radius); font-size: 0.88rem; }
    .biblioteca label.btn { cursor: pointer; }
    .biblioteca label.deshabilitado { opacity: 0.5; pointer-events: none; }
    .aviso details { margin-top: 0.3rem; font-size: 0.82rem; }
  `
})
export class CentralitaDetalleComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = input.required({ transform: numberAttribute });
  readonly tipo = input<string>('motor');

  protected readonly SECCIONES = SECCIONES;
  protected readonly TIPOS_DATO = TIPOS_DATO;
  protected readonly GRUPOS = GRUPOS;
  protected readonly grupoDe = grupo;
  protected readonly POR_PAGINA = POR_PAGINA;
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly c = signal<CentralitaDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly trabajando = signal(false);
  protected readonly datos = signal<DataView | null>(null);
  protected readonly errorBinario = signal<string | null>(null);
  protected readonly pestana = signal<Pestana>('mapas');
  protected readonly qMapa = signal('');
  protected readonly clase = signal<Clase>('todos');
  protected readonly limite = signal(POR_PAGINA);
  /** '' todos, 'importantes' los que tienen grupo, 'modificados', 'sugeridos' (posible potencia) o un grupo. */
  protected readonly grupoFiltro = signal<GrupoMapa | '' | 'importantes' | 'modificados' | 'sugeridos'>('');
  /** Modelo de reconocimiento de mapas; null mientras carga o si no se ha podido cargar (entonces no hay sugerencias). */
  private readonly modelo = signal<ModeloMapas | null>(null);
  protected readonly descripcion = signal<{ texto: string; modelo: string } | null>(null);
  protected readonly errorDescripcion = signal<string | null>(null);
  protected readonly describiendo = signal(false);
  /** Binario de la lectura con la que se compara. */
  protected readonly datosOtra = signal<DataView | null>(null);
  protected readonly errorComparada = signal<string | null>(null);
  protected readonly eligiendoComparada = signal(false);
  protected readonly candidatasComparar = signal<CentralitaListItem[] | null>(null);
  protected readonly modo = signal<ModoVista>('original');
  protected readonly copiando = signal(false);
  protected readonly resultadoXdf = signal<{ titulo: string | null; importados: number; omitidos: number; avisos: string[]; totalAvisos: number } | null>(null);
  protected readonly candidatas = signal<CentralitaListItem[] | null>(null);
  protected readonly seleccion = signal<MapaCentralita | null>(null);
  /** Definición en edición (se modifica en el formulario); vista es la copia que se pinta. */
  protected readonly edicion = signal<MapaRequest | null>(null);
  protected readonly vista = signal<MapaRequest | null>(null);
  protected readonly ajustando = signal(false);
  protected readonly hexInicio = signal<number | null>(null);
  protected readonly cadenas = signal<CadenaBinario[] | null>(null);
  protected readonly qTexto = signal('');
  protected readonly buscando = signal(false);
  protected readonly vehiculos = signal<VehiculoListItem[]>([]);
  protected qVehiculo = '';
  protected nombre = '';
  protected tipoLectura = '';
  protected notas = '';
  protected familia = '';
  protected hardware = '';
  protected software = '';
  protected referencia = '';
  private temporizador?: ReturnType<typeof setTimeout>;

  protected readonly ruta = computed(() => SECCIONES.find(s => s.tipo === this.c()?.tipo)?.ruta ?? seccion(this.tipo()).ruta);

  protected readonly filtrados = computed(() => {
    const mapas = this.c()?.mapas ?? [];
    const q = this.qMapa().trim().toLowerCase();
    const direccion = leerOffset(q);
    const g = this.grupoFiltro();
    const filtrados = mapas.filter(m => {
      if (g === 'importantes' && !m.grupo) return false;
      if (g === 'modificados' && !this.cambios().has(m.id)) return false;
      if (g === 'sugeridos' && !this.sugerencias().has(m.id)) return false;
      if (g && g !== 'importantes' && g !== 'modificados' && g !== 'sugeridos' && m.grupo !== g) return false;
      if (this.clase() === 'mapas' && m.filas === 1) return false;
      if (this.clase() === 'curvas' && m.filas > 1) return false;
      if (this.clase() === 'manuales' && m.origen !== 'Manual') return false;
      if (!q) return true;
      return m.nombre.toLowerCase().includes(q) || (direccion !== null && m.direccion <= direccion && direccion < m.direccion + m.columnas * m.filas * 4)
        || this.hex(m.direccion).toLowerCase().includes(q.replace(/^0x/, ''));
    });
    const s = this.sugerencias();
    return g === 'sugeridos' ? filtrados.sort((a, b) => s.get(b.id)!.probabilidad - s.get(a.id)!.probabilidad) : filtrados;
  });

  /** Mapas sin grupo que el modelo cree de potencia (umbral 70 %: en la validación acierta algo más de la mitad de las veces). */
  protected readonly sugerencias = computed(() => {
    const modelo = this.modelo();
    const datos = this.datos();
    const resultado = new Map<number, Sugerencia>();
    if (!modelo || !datos) return resultado;
    for (const m of this.c()?.mapas ?? []) {
      if (m.grupo) continue;
      const s = sugerir(modelo, datos, m, 0.7);
      if (s) resultado.set(m.id, s);
    }
    return resultado;
  });

  protected readonly sugerenciaVista = computed(() => {
    const s = this.seleccion();
    return s && !this.vista()?.grupo ? (this.sugerencias().get(s.id) ?? null) : null;
  });

  protected readonly importantes = computed(() => (this.c()?.mapas ?? []).filter(m => m.grupo).length);

  /** Grupos con algún mapa, con su número. */
  protected readonly resumenGrupos = computed(() => {
    const mapas = this.c()?.mapas ?? [];
    return GRUPOS.map(g => ({ ...g, total: mapas.filter(m => m.grupo === g.valor).length })).filter(g => g.total > 0);
  });

  /** Nombres habituales del grupo elegido (o de todos si no hay grupo). */
  protected readonly nombresHabituales = computed(() => {
    const g = grupo(this.vista()?.grupo ?? null);
    return g ? g.nombres : GRUPOS.flatMap(x => x.nombres);
  });

  protected readonly textosFiltrados = computed(() => {
    const q = this.qTexto().trim().toLowerCase();
    return (this.cadenas() ?? []).filter(t => !q || t.texto.toLowerCase().includes(q)).slice(0, 1000);
  });

  /** Mapas que cambian respecto a la otra lectura (por id). */
  protected readonly cambios = computed(() => {
    const a = this.datos();
    const b = this.datosOtra();
    const resultado = new Map<number, CambioMapa>();
    if (!a || !b) return resultado;
    for (const m of this.c()?.mapas ?? []) {
      const k = cambioMapa(a, b, m);
      if (k) resultado.set(m.id, k);
    }
    return resultado;
  });

  /** Zonas de bytes cambiadas entre las dos lecturas. */
  private readonly regiones = computed(() => {
    const a = this.datos();
    const b = this.datosOtra();
    return a && b ? comparar(new Uint8Array(a.buffer), new Uint8Array(b.buffer)) : null;
  });

  protected readonly zonasFuera = computed(() => (this.regiones() ? zonasSinMapa(this.regiones()!.regiones, this.c()?.mapas ?? []) : []));

  /** Qué hace la reprogramación: conclusiones y cada cambio clasificado (orientado de original a modificada). */
  protected readonly identificacion = computed<Identificacion | null>(() => {
    const a = this.datos();
    const b = this.datosOtra();
    const r = this.regiones();
    const c = this.c();
    if (!a || !b || !r || !c) return null;
    const esta = new Uint8Array(a.buffer);
    const otra = new Uint8Array(b.buffer);
    const nombreOtra = c.comparadaNombre ?? '';
    const invertida = otraEsOriginal(esta, otra, r.regiones, c.nombreArchivo, nombreOtra);
    const resultado = invertida
      ? identificar(otra, esta, r.regiones, c.mapas, c.nombreArchivo, nombreOtra)
      : identificar(esta, otra, r.regiones, c.mapas, nombreOtra, c.nombreArchivo);
    return { invertida, ...resultado };
  });

  protected readonly tipoCambio = signal<TipoCambio | ''>('');
  protected readonly etiquetasCambio = ETIQUETAS_CAMBIO;
  protected readonly textoConfianza: Record<Confianza, { texto: string; ayuda: string }> = {
    alta: { texto: 'Seguro', ayuda: 'Lo confirman mapas con nombre, o el nombre del fichero junto con los cambios' },
    media: { texto: 'Probable', ayuda: 'Por el tipo de cambios (tablas a 0, clases de error…) o el nombre del fichero' },
    baja: { texto: 'Posible', ayuda: 'Solo una pista: el nombre del fichero o cambios sueltos' }
  };

  protected readonly tiposCambio = computed(() => {
    const n = new Map<TipoCambio, number>();
    for (const c of this.identificacion()?.cambios ?? []) n.set(c.tipo, (n.get(c.tipo) ?? 0) + 1);
    return [...n].map(([tipo, cuantos]) => ({ tipo, n: cuantos }));
  });

  protected readonly cambiosFiltrados = computed(() => {
    const t = this.tipoCambio();
    const todos = this.identificacion()?.cambios ?? [];
    return t ? todos.filter(c => c.tipo === t) : todos;
  });

  protected readonly resumenComparacion = computed(() => {
    const r = this.regiones();
    return r ? { bytes: r.cambiados, zonas: r.regiones.length, mapas: this.cambios().size, sinMapa: this.zonasFuera().length } : null;
  });

  ngOnInit() {
    this.cargar();
    // Sin modelo (p. ej. sin conexión) la ficha funciona igual, solo sin sugerencias.
    this.api.modeloMapas().subscribe({ next: m => this.modelo.set(m), error: () => this.modelo.set(null) });
    this.api.binarioCentralita(this.id()).subscribe({
      next: b => this.datos.set(new DataView(b)),
      error: e => this.errorBinario.set(`No se ha podido cargar el binario: ${mensajeError(e)}`)
    });
  }

  protected hex(n: number) {
    return hexOffset(n).replace(/^0{1,2}/, '');
  }

  protected etiquetaTipo(t: string) {
    return TIPOS_DATO.find(x => x.valor === t)?.etiqueta ?? t;
  }

  protected cambiosPendientes() {
    const c = this.c();
    return !!c && (this.nombre.trim() !== c.nombre || this.tipoLectura !== c.tipo || (this.notas.trim() || null) !== c.notas
      || (this.familia.trim() || null) !== c.familia || (this.hardware.trim() || null) !== c.hardware
      || (this.software.trim() || null) !== c.software || (this.referencia.trim() || null) !== c.referencia);
  }

  protected abrir(m: MapaCentralita) {
    this.seleccion.set(m);
    const { id: _id, origen: _origen, ...definicion } = m;
    this.edicion.set({ ...definicion });
    this.vista.set({ ...definicion });
    this.ajustando.set(false);
    this.descripcion.set(null);
    this.errorDescripcion.set(null);
  }

  /** Mapa a mano: empieza en la dirección buscada (si es una) con 16 × 16 valores de 16 bits. */
  protected nuevo() {
    const direccion = leerOffset(this.qMapa()) ?? 0;
    const bigEndian = (this.c()?.mapas ?? []).filter(m => m.bigEndian).length > (this.c()?.mapas.length ?? 0) / 2;
    const e: MapaRequest = {
      nombre: '', grupo: null, direccion, columnas: 16, filas: 16, tipoDato: 'U16', bigEndian, porColumnas: false, factor: 1, desplazamiento: 0, unidad: null,
      ejeXDireccion: null, ejeXTipo: 'U16', ejeXFactor: 1, ejeXUnidad: null, ejeYDireccion: null, ejeYTipo: 'U16', ejeYFactor: 1, ejeYUnidad: null, notas: null,
      ejeXDesplazamiento: 0, ejeXValores: null, ejeYDesplazamiento: 0, ejeYValores: null
    };
    this.seleccion.set(null);
    this.edicion.set(e);
    this.vista.set({ ...e });
    this.ajustando.set(true);
  }

  /** Copia la edición a la vista (el formulario modifica el objeto en sitio). */
  protected refrescar() {
    const e = this.edicion();
    if (!e) return;
    e.columnas = Math.min(Math.max(Math.trunc(Number(e.columnas) || 1), 1), 256);
    e.filas = Math.min(Math.max(Math.trunc(Number(e.filas) || 1), 1), 256);
    this.vista.set({ ...e, factor: Number(e.factor) || 1, ejeXFactor: Number(e.ejeXFactor) || 1, ejeYFactor: Number(e.ejeYFactor) || 1, desplazamiento: Number(e.desplazamiento) || 0 });
  }

  protected direccion(campo: 'direccion' | 'ejeXDireccion' | 'ejeYDireccion', texto: string) {
    const e = this.edicion();
    if (!e) return;
    const valor = leerOffset(texto);
    if (campo === 'direccion') {
      if (valor === null) return;
      e.direccion = valor;
    } else {
      e[campo] = valor;
    }
    this.refrescar();
  }

  protected filtrarGrupo(g: GrupoMapa | '' | 'importantes' | 'modificados' | 'sugeridos') {
    this.grupoFiltro.set(g);
    this.limite.set(POR_PAGINA);
  }

  /** Al elegir un nombre habitual se pone su grupo y las unidades que falten (el factor no: depende de la centralita). */
  protected elegirNombre(nombre: string) {
    const e = this.edicion();
    if (!e) return;
    const g = GRUPOS.find(x => x.nombres.some(n => n.nombre === nombre));
    const n = g?.nombres.find(x => x.nombre === nombre);
    if (g && n) {
      e.grupo ??= g.valor;
      e.unidad ||= n.unidad ?? null;
      e.ejeXUnidad ||= n.ejeX ?? null;
      e.ejeYUnidad ||= e.filas > 1 ? (n.ejeY ?? null) : null;
    }
    this.refrescar();
  }

  protected importarXdf(campo: HTMLInputElement) {
    const archivo = campo.files?.[0];
    campo.value = '';
    if (!archivo) return;
    this.trabajando.set(true);
    this.resultadoXdf.set(null);
    this.api.importarXdf(this.id(), archivo).subscribe({
      next: r => {
        this.trabajando.set(false);
        this.resultadoXdf.set(r);
        this.cargar();
        this.filtrarGrupo('');
        this.clase.set('manuales');
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected abrirCopia() {
    this.copiando.set(!this.copiando());
    if (!this.copiando()) return;
    const c = this.c();
    this.candidatas.set(null);
    this.api.centralitas({ tipo: c?.tipo }).subscribe({
      next: l => {
        // Primero las del mismo software, luego las de la misma familia.
        const peso = (o: CentralitaListItem) => (o.software && o.software === c?.software ? 0 : o.familia && o.familia === c?.familia ? 1 : 2);
        this.candidatas.set(l.filter(o => o.id !== c?.id && o.mapasConNombre > 0).sort((a, b) => peso(a) - peso(b)));
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected copiar(origenId: number) {
    this.trabajando.set(true);
    this.api.copiarMapas(this.id(), origenId).subscribe({
      next: r => {
        this.trabajando.set(false);
        this.copiando.set(false);
        alert(`Copiados: ${r.aplicados} aplicados sobre mapas detectados, ${r.anadidos} añadidos y ${r.omitidos} omitidos (no estaban en la misma dirección).`);
        this.cargar();
        this.filtrarGrupo('importantes');
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected cancelarEdicion() {
    const s = this.seleccion();
    if (s) {
      this.abrir(s);
    } else {
      this.edicion.set(null);
      this.vista.set(null);
    }
  }

  protected guardarMapa() {
    const e = this.edicion();
    const c = this.c();
    if (!e || !c) return;
    this.refrescar();
    const req: MapaRequest = { ...this.vista()!, nombre: e.nombre.trim(), unidad: e.unidad || null, ejeXUnidad: e.ejeXUnidad || null, ejeYUnidad: e.ejeYUnidad || null, notas: e.notas?.trim() || null };
    const s = this.seleccion();
    this.trabajando.set(true);
    (s ? this.api.actualizarMapa(c.id, s.id, req) : this.api.crearMapa(c.id, req)).subscribe({
      next: m => {
        this.trabajando.set(false);
        this.c.update(x => (x ? { ...x, mapas: [...x.mapas.filter(y => y.id !== m.id), m].sort((a, b) => a.direccion - b.direccion) } : x));
        this.abrir(m);
      },
      error: err => {
        this.trabajando.set(false);
        this.error.set(mensajeError(err));
      }
    });
  }

  protected eliminarMapa(m: MapaCentralita) {
    if (!confirm(`¿Eliminar el mapa «${m.nombre}»? Si era detectado, vuelve a aparecer al analizar de nuevo.`)) return;
    this.api.eliminarMapa(this.id(), m.id).subscribe({
      next: () => {
        this.c.update(x => (x ? { ...x, mapas: x.mapas.filter(y => y.id !== m.id) } : x));
        this.seleccion.set(null);
        this.edicion.set(null);
        this.vista.set(null);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected porcentaje(p: number) {
    return Math.round(p * 100) + ' %';
  }

  /** Envía el mapa tal como se ve (con la conversión de la vista y, si se compara, la otra lectura) para describirlo con IA. */
  protected describir() {
    const v = this.vista();
    const datos = this.datos();
    if (!v || !datos) return;
    const nulos = (fila: number[]) => fila.map(x => (Number.isFinite(x) ? x : null));
    const esta = leerMapa(datos, v);
    const otra = this.datosOtra() ? leerMapa(this.datosOtra()!, v) : null;
    const s = this.sugerenciaVista();
    const req: DescribirMapaRequest = {
      nombre: v.nombre || 'Mapa sin nombre', grupo: v.grupo, unidad: v.unidad, detectado: this.seleccion()?.origen === 'Detectado',
      ejeX: nulos(esta.ejeX), ejeXUnidad: v.ejeXUnidad, ejeY: nulos(esta.ejeY), ejeYUnidad: v.ejeYUnidad,
      valores: esta.valores.map(nulos), valoresOtra: otra ? otra.valores.map(nulos) : null,
      otraEsOriginal: this.identificacion()?.invertida ?? false,
      sugerencia: s ? `posible mapa de potencia (${this.porcentaje(s.probabilidad)})` : null
    };
    this.describiendo.set(true);
    this.errorDescripcion.set(null);
    this.api.describirMapa(this.id(), req).subscribe({
      next: d => {
        this.describiendo.set(false);
        this.descripcion.set(d);
      },
      error: e => {
        this.describiendo.set(false);
        this.errorDescripcion.set(`No se ha podido describir el mapa: ${mensajeError(e)}`);
      }
    });
  }

  /** Pasa la descripción a las notas del mapa (hasta su límite de 2000 caracteres); se guarda con «Guardar mapa». */
  protected descripcionANotas() {
    const e = this.edicion();
    const d = this.descripcion();
    if (!e || !d) return;
    e.notas = ((e.notas?.trim() ? e.notas.trim() + '\n\n' : '') + d.texto).slice(0, 2000);
    this.refrescar();
    this.ajustando.set(true);
  }

  protected verEnHex() {
    const s = this.seleccion();
    this.hexInicio.set(s ? (s.ejeXDireccion ?? s.direccion) : null);
    this.pestana.set('hex');
  }

  protected abrirTextos() {
    this.pestana.set('textos');
    if (this.cadenas() !== null) return;
    this.api.cadenasCentralita(this.id()).subscribe({ next: l => this.cadenas.set(l), error: e => this.error.set(mensajeError(e)) });
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

  protected guardar(cambio: { vehiculoId?: number | null }) {
    const c = this.c();
    if (!c) return;
    this.trabajando.set(true);
    this.api
      .actualizarCentralita(c.id, {
        tipo: this.tipoLectura as CentralitaDetalle['tipo'],
        nombre: this.nombre.trim() || c.nombre,
        vehiculoId: cambio.vehiculoId !== undefined ? cambio.vehiculoId : c.vehiculoId,
        notas: this.notas.trim() || null,
        familia: this.familia.trim() || null,
        hardware: this.hardware.trim() || null,
        software: this.software.trim() || null,
        referencia: this.referencia.trim() || null
      })
      .subscribe({
        next: d => {
          this.trabajando.set(false);
          this.buscando.set(false);
          this.vehiculos.set([]);
          this.qVehiculo = '';
          this.mostrar(d);
          if (d.tipo !== c.tipo) this.router.navigate(['/gestion/centralitas', this.ruta(), d.id]);
        },
        error: e => {
          this.trabajando.set(false);
          this.error.set(mensajeError(e));
        }
      });
  }

  protected reanalizar() {
    this.trabajando.set(true);
    this.api.reanalizarCentralita(this.id()).subscribe({
      next: d => {
        this.trabajando.set(false);
        this.mostrar(d);
        this.seleccion.set(null);
        this.edicion.set(null);
        this.vista.set(null);
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminar() {
    const c = this.c();
    if (!c || !confirm(`¿Eliminar la lectura «${c.nombre}» y sus mapas? Se borra también el archivo.`)) return;
    this.api.eliminarCentralita(c.id).subscribe({
      next: () => this.router.navigate(['/gestion/centralitas', this.ruta()]),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected textoCambio(p: number) {
    return `${p > 0 ? '+' : ''}${p.toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  }

  protected abrirComparar() {
    this.eligiendoComparada.set(!this.eligiendoComparada());
    const c = this.c();
    if (!this.eligiendoComparada() || !c) return;
    this.candidatasComparar.set(null);
    this.api.centralitas({ tipo: c.tipo }).subscribe({
      next: l => {
        // Primero las del mismo vehículo, luego las del mismo software.
        const peso = (o: CentralitaListItem) => (o.vehiculoId && o.vehiculoId === c.vehiculoId ? 0 : o.software && o.software === c.software ? 1 : 2);
        this.candidatasComparar.set(l.filter(o => o.id !== c.id && o.tamano === c.tamano).sort((a, b) => peso(a) - peso(b)));
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected elegirComparada(otraId: number | null) {
    this.trabajando.set(true);
    this.api.compararCentralita(this.id(), otraId).subscribe({
      next: d => {
        this.trabajando.set(false);
        this.eligiendoComparada.set(false);
        this.mostrar(d);
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  /** Sube la otra lectura (con el mismo tipo y vehículo) y la deja comparada con esta. */
  protected subirComparada(campo: HTMLInputElement) {
    const archivo = campo.files?.[0];
    campo.value = '';
    const c = this.c();
    if (!archivo || !c) return;
    this.trabajando.set(true);
    this.api.subirCentralita(archivo, c.tipo, c.vehiculoId).subscribe({
      next: e => {
        if (e.type === HttpEventType.Response && e.body) this.elegirComparada(e.body.id);
      },
      error: e => {
        this.trabajando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected nuevoEn(direccion: number) {
    this.qMapa.set(this.hex(direccion));
    this.nuevo();
  }

  protected verHex(direccion: number) {
    this.hexInicio.set(direccion);
    this.pestana.set('hex');
  }

  private mostrar(d: CentralitaDetalle) {
    if (d.comparadaConId !== this.c()?.comparadaConId || (d.comparadaConId && !this.datosOtra())) this.cargarComparada(d.comparadaConId);
    this.c.set(d);
    this.nombre = d.nombre;
    this.tipoLectura = d.tipo;
    this.notas = d.notas ?? '';
    this.familia = d.familia ?? '';
    this.hardware = d.hardware ?? '';
    this.software = d.software ?? '';
    this.referencia = d.referencia ?? '';
  }

  private cargarComparada(otraId: number | null) {
    this.datosOtra.set(null);
    this.errorComparada.set(null);
    this.modo.set('original');
    if (!otraId) return;
    this.api.binarioCentralita(otraId).subscribe({
      next: b => this.datosOtra.set(new DataView(b)),
      error: e => this.errorComparada.set(`no se ha podido cargar: ${mensajeError(e)}`)
    });
  }

  private cargar() {
    this.api.centralita(this.id()).subscribe({
      next: d => this.mostrar(d),
      error: e => this.error.set(mensajeError(e))
    });
  }
}
