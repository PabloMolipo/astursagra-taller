import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { COLORES_VEHICULO, ESTADOS_ORDEN, TIPOS_CLIENTE } from '../core/etiquetas';
import { VehiculoDetalle, VehiculoResumen } from '../core/models';
import { EtiquetaPipe, NumOrdenPipe } from '../shared/pipes';
import { SiluetaVehiculo } from './silueta-vehiculo';

/**
 * Visión 360 de la ficha del vehículo: la imagen en el centro (generada con Gemini, una foto subida o la silueta del tipo)
 * y alrededor la información agrupada: identificación, propietario, uso, historial, diagnóstico y electrónica; debajo,
 * accesos a fotos, documentación, despiece y mecánico virtual.
 */
@Component({
  selector: 'app-vehiculo-360',
  imports: [RouterLink, DatePipe, DecimalPipe, CurrencyPipe, EtiquetaPipe, NumOrdenPipe, SiluetaVehiculo],
  template: `
    @let v = vehiculo();
    @let r = resumen();
    <div class="orbital">
      <!-- Centro: el vehículo -->
      <div class="centro">
        <div class="anillo" aria-hidden="true"></div>
        <div class="anillo dos" aria-hidden="true"></div>
        <div class="titulo">
          @if (v.matricula) {
            <div class="matricula"><span class="ue">E</span><span class="txt">{{ v.matricula }}</span></div>
          } @else {
            <div class="sin-matricula mono">{{ v.bastidor ?? 'Sin matrícula ni bastidor' }}</div>
          }
          <h2>{{ v.marca }} {{ v.modelo }}</h2>
          <div class="hint">
            {{ v.tipo | etiqueta: 'vehiculo' }}{{ v.anio ? ' · ' + v.anio : '' }} · de
            <a [routerLink]="['/gestion/clientes', v.clienteId]">{{ v.clienteNombre }}</a>
          </div>
        </div>

        <figure class="imagen" [class.generando]="generando()">
          @if (r.imagen; as img) {
            <img [src]="img.url" [alt]="'Imagen de ' + v.marca + ' ' + (v.modelo ?? '')" />
            <figcaption>{{ img.generada ? 'Imagen orientativa generada con IA' : 'Foto del vehículo' }} · {{ img.fecha | date: 'dd/MM/yyyy' }}</figcaption>
          } @else {
            <app-silueta-vehiculo [tipo]="v.tipo" />
            <figcaption>Silueta orientativa</figcaption>
          }
          @if (generando()) {
            <div class="velo"><span class="giro" aria-hidden="true"></span>Generando la imagen con Gemini…</div>
          }
        </figure>

        <div class="acciones-imagen">
          @if (r.generadorImagen) {
            <button type="button" class="btn small" (click)="abrirColores()" [disabled]="ocupado()" [attr.aria-expanded]="eligiendo()">
              ✨ {{ r.imagen?.generada ? 'Generar otra' : 'Generar imagen con IA' }}
            </button>
          }
          <label class="btn small" [class.disabled]="ocupado()">
            <input type="file" accept="image/jpeg,image/png,image/webp" (change)="subir($event)" [disabled]="ocupado()" />
            📷 Subir foto
          </label>
          @if (r.imagen) {
            <button type="button" class="btn small ghost" (click)="quitar()" [disabled]="ocupado()">Quitar</button>
          }
        </div>
        @if (eligiendo()) {
          <div class="selector-color" role="dialog" aria-label="Color de la imagen">
            <div class="hint">Color de la carrocería</div>
            <div class="muestras">
              @for (c of colores; track c.nombre) {
                <button type="button" class="muestra" [class.elegida]="color() === c.nombre" [style.background]="c.muestra"
                  [title]="c.nombre" [attr.aria-label]="c.nombre" [attr.aria-pressed]="color() === c.nombre" (click)="color.set(c.nombre)"></button>
              }
            </div>
            <div class="fila-color">
              <input [value]="color()" (input)="color.set($any($event.target).value)" maxlength="40" placeholder="Otro: azul eléctrico, blanco perla…" aria-label="Color" />
              <button type="button" class="btn small primary" (click)="generar()">Generar</button>
              <button type="button" class="btn small ghost" (click)="eligiendo.set(false)">Cancelar</button>
            </div>
            <div class="hint">Se guarda como color del vehículo. Si lo dejas vacío, gris grafito.</div>
          </div>
        }
        @if (errorImagen()) {
          <div class="error-imagen">{{ errorImagen() }}</div>
        }

        <div class="estado">
          @if (r.historial.abierta; as o) {
            <a class="chip ambar" [routerLink]="['/gestion/ordenes', o.id]">{{ o.id | numOrden }} · {{ estados[o.estado] }}</a>
          }
          @if (r.diagnostico.activos.length) {
            <span class="chip rojo">{{ r.diagnostico.activos.length }} {{ r.diagnostico.activos.length === 1 ? 'avería activa' : 'averías activas' }}</span>
          }
          @if (!r.historial.abierta && !r.diagnostico.activos.length) {
            <span class="chip lima">Sin trabajos abiertos</span>
          }
        </div>
      </div>

      <!-- Órbita izquierda -->
      <section class="bloque izq">
        <h3>Identificación <button type="button" class="enlace" (click)="editar.emit()">Editar</button></h3>
        <div class="fila"><span>Bastidor</span><span class="mono">{{ v.bastidor ?? '—' }}</span></div>
        <div class="fila"><span>Motor</span><span class="mono lima">{{ v.motor ?? '—' }}</span></div>
        @if (v.color) {
          <div class="fila">
            <span>Color</span>
            <span class="color-fila">
              @if (muestra(v.color); as m) {
                <i class="punto" [style.background]="m"></i>
              }
              {{ v.color }}
            </span>
          </div>
        }
        <div class="fila"><span>Año</span><span>{{ v.anio ?? (r.tecnicos?.fechaMatriculacion | date: 'yyyy') ?? '—' }}</span></div>
        @if (r.tecnicos; as t) {
          @if (t.combustible || t.cilindrada || t.potenciaCv) {
            <div class="fila"><span>Motorización</span><span>{{ motorizacion() }}</span></div>
          }
          @if (t.variante) {
            <div class="fila"><span>Versión</span><span>{{ t.variante }}</span></div>
          }
          @if (t.fechaMatriculacion) {
            <div class="fila"><span>Matriculación</span><span>{{ t.fechaMatriculacion | date: 'dd/MM/yyyy' }}</span></div>
          }
        }
      </section>

      <section class="bloque der">
        <h3>Propietario <a class="enlace" [routerLink]="['/gestion/clientes', r.propietario.id]">Ver</a></h3>
        <div class="destacado">{{ r.propietario.nombre }}</div>
        <div class="hint">{{ tiposCliente[r.propietario.tipo] }}{{ r.propietario.poblacion ? ' · ' + r.propietario.poblacion : '' }} · cliente desde {{ r.propietario.fechaAlta | date: 'yyyy' }}</div>
        @if (r.propietario.telefono) {
          <div class="fila"><span>Teléfono</span><a [href]="'tel:' + r.propietario.telefono">{{ r.propietario.telefono }}</a></div>
        }
        @if (r.propietario.email) {
          <div class="fila"><span>Email</span><a [href]="'mailto:' + r.propietario.email" class="corta">{{ r.propietario.email }}</a></div>
        }
        <div class="fila"><span>Vehículos</span><span>{{ r.propietario.vehiculos }}</span></div>
      </section>

      <section class="bloque izq">
        <h3>Uso</h3>
        @if (r.uso.actual) {
          <div class="grande">{{ r.uso.actual | number: '1.0-0' }} <span class="hint">{{ r.uso.enHoras ? 'h' : 'km' }}</span></div>
        } @else {
          <div class="hint">Sin {{ r.uso.enHoras ? 'horas' : 'kilómetros' }} registrados</div>
        }
        @if (grafica(); as g) {
          <svg viewBox="0 0 200 44" class="grafica" preserveAspectRatio="none" aria-hidden="true">
            <polyline [attr.points]="g" fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke" />
          </svg>
        }
        @if (r.uso.porAnio) {
          <div class="hint">≈ {{ r.uso.porAnio | number: '1.0-0' }} {{ r.uso.enHoras ? 'h' : 'km' }}/año según las visitas</div>
        }
      </section>

      <section class="bloque der">
        <h3>Historial <span class="n">{{ r.historial.visitas }} {{ r.historial.visitas === 1 ? 'visita' : 'visitas' }}</span></h3>
        @if (r.historial.ultima) {
          <div class="fila"><span>Última</span><span>{{ r.historial.ultima | date: 'dd/MM/yyyy' }}</span></div>
          @if (r.historial.ultimoMotivo) {
            <div class="motivo hint">{{ r.historial.ultimoMotivo }}</div>
          }
          <div class="fila"><span>Facturado</span><span class="lima">{{ r.historial.facturado | currency: 'EUR' }}</span></div>
          <div class="fila"><span>Margen</span><span>{{ r.historial.margen | currency: 'EUR' }}</span></div>
          @if (r.historial.pendienteCobro > 0) {
            <div class="fila"><span>Sin cobrar</span><span class="ambar">{{ r.historial.pendienteCobro | currency: 'EUR' }}</span></div>
          }
          <button type="button" class="enlace" (click)="ir('historial')">Ver todas las órdenes ↓</button>
        } @else {
          <div class="hint">Todavía no ha pasado por el taller.</div>
        }
      </section>

      <section class="bloque izq">
        <h3>Diagnóstico <span class="n" [class.rojo]="r.diagnostico.activos.length">{{ r.diagnostico.activos.length || '' }}</span></h3>
        @if (r.diagnostico.activos.length) {
          <div>
            @for (c of r.diagnostico.activos; track c.codigo) {
              <span class="chip" [class.rojo]="c.estado !== 'Pendiente'" [class.ambar]="c.estado === 'Pendiente'" [title]="c.descripcion ?? ''">{{ c.codigo }}{{ c.descripcion ? ' · ' + c.descripcion : '' }}</span>
            }
          </div>
        } @else if (r.diagnostico.conclusion) {
          <div class="motivo hint">{{ r.diagnostico.conclusion }}</div>
        } @else {
          <div class="hint">Sin fichas de diagnosis.</div>
        }
        @if (r.diagnostico.repetidos.length) {
          <div class="hint repetidos">Repetidos en varias visitas: <span class="mono">{{ r.diagnostico.repetidos.join(', ') }}</span></div>
        }
        @if (r.diagnostico.ordenId) {
          <a class="enlace" [routerLink]="['/gestion/ordenes', r.diagnostico.ordenId]">Última ficha · {{ r.diagnostico.fecha | date: 'dd/MM/yyyy' }} →</a>
        }
      </section>

      <section class="bloque der">
        <h3>Electrónica / REPRO <span class="n">{{ r.repro.total || '' }}</span></h3>
        @if (r.repro.ultima) {
          <div class="destacado corta">{{ r.repro.ultima }}</div>
          <div class="hint">{{ r.repro.fecha | date: 'dd/MM/yyyy' }}</div>
          <button type="button" class="enlace" (click)="ir('repro')">Ver archivos ↓</button>
        } @else {
          <div class="hint">Sin reprogramaciones registradas.</div>
        }
      </section>

      <!-- Accesos -->
      <div class="abajo">
        @if (r.multimedia.ultimaOrdenId; as ordenId) {
          <a class="bloque acceso" [routerLink]="['/gestion/ordenes', ordenId]">
            <h3>Fotos y vídeos <span class="n">{{ r.multimedia.fotos + r.multimedia.videos }}</span></h3>
            <span class="hint">{{ r.multimedia.fotos }} fotos · {{ r.multimedia.videos }} vídeos · última {{ r.multimedia.ultima | date: 'dd/MM' }}</span>
          </a>
        } @else {
          <div class="bloque acceso apagado"><h3>Fotos y vídeos</h3><span class="hint">Se hacen desde cada orden</span></div>
        }
        <button type="button" class="bloque acceso" (click)="ir('documentacion')">
          <h3>Documentación <span class="n">{{ documentos() ?? '' }}</span></h3>
          <span class="hint">Manuales, esquemas y catálogos</span>
        </button>
        <a class="bloque acceso" [routerLink]="['/gestion/vehiculos', v.id, 'despiece']">
          <h3>Despiece OEM</h3>
          <span class="hint">{{ v.bastidor ? 'Por bastidor (Vinalfa)' : 'Necesita el bastidor' }}</span>
        </a>
        <a class="bloque acceso" [routerLink]="r.historial.abierta ? ['/gestion/ordenes', r.historial.abierta.id] : ['/gestion/mecanico']">
          <h3>Mecánico virtual <span class="n">{{ r.conversaciones || '' }}</span></h3>
          <span class="hint">{{ r.historial.abierta ? 'Pregúntale desde la orden abierta' : 'Abrir el chat' }}</span>
        </a>
      </div>
    </div>
  `,
  styles: `
    .orbital { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.5fr) minmax(0, 1fr); gap: 14px; }
    .centro { grid-column: 2; grid-row: 1 / span 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; position: relative; padding: 8px 0; }
    .anillo { position: absolute; inset: 4% 0; border: 1px dashed color-mix(in srgb, var(--primary) 22%, transparent); border-radius: 50%; pointer-events: none; }
    .anillo.dos { inset: 16% 10%; border-color: var(--border); }
    .titulo { text-align: center; position: relative; }
    .titulo h2 { margin: 8px 0 2px; font-size: 1.5rem; }
    .matricula { display: inline-flex; border: 2px solid #dcdcdc; background: #f2f2f2; color: #111; font-family: var(--font-mono, monospace); font-weight: 700; font-size: 1.25rem; letter-spacing: 0.08em; }
    .matricula .ue { background: #1f47b8; color: #fff; font-size: 0.6rem; display: grid; place-items: end center; padding: 2px 4px; letter-spacing: 0; }
    .matricula .txt { padding: 1px 10px; }
    .sin-matricula { color: var(--muted); }

    .imagen { position: relative; width: 100%; max-width: 460px; margin: 0; }
    .imagen img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; border: 1px solid var(--border); background: #0a0a0a; }
    .imagen app-silueta-vehiculo { padding: 6% 4% 0; }
    .imagen figcaption { font-size: 0.72rem; color: var(--muted); text-align: center; margin-top: 4px; }
    .imagen.generando img, .imagen.generando app-silueta-vehiculo { opacity: 0.3; }
    .velo { position: absolute; inset: 0; display: flex; flex-direction: column; gap: 10px; align-items: center; justify-content: center; color: var(--primary); font-weight: 600; text-align: center; }
    .giro { width: 28px; height: 28px; border: 3px solid var(--border-strong); border-top-color: var(--primary); border-radius: 50%; animation: girar 0.9s linear infinite; }
    @keyframes girar { to { transform: rotate(360deg); } }
    .acciones-imagen { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; position: relative; }
    .acciones-imagen label { position: relative; cursor: pointer; }
    .acciones-imagen label.disabled { opacity: 0.5; pointer-events: none; }
    .acciones-imagen input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .selector-color { background: var(--surface-2); border: 1px solid var(--primary); padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; width: 100%; max-width: 440px; position: relative; z-index: 1; }
    .muestras { display: flex; flex-wrap: wrap; gap: 6px; }
    .muestra { width: 26px; height: 26px; border: 1px solid var(--border-strong); cursor: pointer; padding: 0; }
    .muestra.elegida { outline: 2px solid var(--primary); outline-offset: 2px; }
    .fila-color { display: flex; gap: 6px; align-items: center; }
    .fila-color input { flex: 1; min-width: 0; }
    .color-fila { display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .punto { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--border-strong); }
    .error-imagen { color: #ff6b6b; font-size: 0.82rem; text-align: center; max-width: 420px; position: relative; }
    .estado { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; position: relative; }

    .bloque { background: var(--surface-2); border: 1px solid var(--border); padding: 12px 14px; position: relative; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .bloque h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
    .bloque h3 .n, .bloque h3 .enlace { margin-left: auto; }
    .n { color: var(--primary); font-family: var(--font-display); font-size: 0.85rem; }
    .n.rojo { color: #ff6b6b; }
    .izq::after, .der::after { content: ''; position: absolute; top: 50%; width: 14px; border-top: 1px solid var(--primary); }
    .izq::after { right: -15px; } .der::after { left: -15px; }
    .fila { display: flex; justify-content: space-between; gap: 10px; font-size: 0.86rem; padding: 1px 0; }
    .fila > :first-child { color: var(--muted); flex: none; }
    .fila > :last-child { text-align: right; min-width: 0; overflow-wrap: anywhere; }
    .destacado { font-weight: 600; }
    .grande { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; }
    .grafica { width: 100%; height: 44px; margin: 4px 0; }
    .motivo { font-size: 0.82rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .corta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .repetidos { margin-top: 6px; font-size: 0.8rem; }
    .lima { color: var(--primary); }
    .ambar { color: #ffc24d; font-weight: 600; }
    .enlace { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; font: inherit; font-size: 0.8rem; text-transform: none; letter-spacing: 0; text-align: left; margin-top: 4px; }
    .enlace:hover { text-decoration: underline; }
    .chip { display: inline-block; font-size: 0.75rem; border: 1px solid var(--border-strong); padding: 1px 7px; margin: 2px 3px 0 0; color: inherit; text-decoration: none; }
    .chip.rojo { border-color: #ff5c5c; color: #ff6b6b; }
    .chip.ambar { border-color: #ffb020; color: #ffc24d; }
    .chip.lima { border-color: var(--primary); color: var(--primary); }

    .abajo { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
    .acceso { text-align: left; color: inherit; text-decoration: none; cursor: pointer; font: inherit; transition: border-color 0.12s; }
    .acceso:hover { border-color: var(--primary); }
    .acceso.apagado { cursor: default; } .acceso.apagado:hover { border-color: var(--border); }

    @media (max-width: 900px) {
      .orbital { grid-template-columns: minmax(0, 1fr); }
      .centro { grid-column: 1; grid-row: auto; order: -1; }
      .izq::after, .der::after, .anillo { display: none; }
      .abajo { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `
})
export class Vehiculo360 {
  private readonly api = inject(Api);

  readonly vehiculo = input.required<VehiculoDetalle>();
  readonly resumen = input.required<VehiculoResumen>();
  /** Nº de documentos técnicos encontrados para el vehículo (null mientras carga). */
  readonly documentos = input<number | null>(null);
  readonly editar = output<void>();
  /** La imagen ha cambiado: hay que volver a pedir el resumen. */
  readonly imagenCambiada = output<void>();
  /** Se ha guardado un color nuevo para el vehículo al generar la imagen. */
  readonly colorCambiado = output<string>();

  protected readonly estados = ESTADOS_ORDEN;
  protected readonly tiposCliente = TIPOS_CLIENTE;
  protected readonly generando = signal(false);
  protected readonly subiendo = signal(false);
  protected readonly ocupado = computed(() => this.generando() || this.subiendo());
  protected readonly errorImagen = signal<string | null>(null);
  protected readonly colores = COLORES_VEHICULO;
  protected readonly eligiendo = signal(false);
  protected readonly color = signal('');

  protected readonly motorizacion = computed(() => {
    const t = this.resumen().tecnicos;
    if (!t) return '';
    return [t.combustible, t.cilindrada ? `${t.cilindrada} cc` : null, t.potenciaCv ? `${Math.round(t.potenciaCv)} CV` : null].filter(Boolean).join(' · ');
  });

  /** Puntos de la línea de uso (kilómetros u horas en el tiempo), escalados a 200×44. */
  protected readonly grafica = computed(() => {
    const p = this.resumen().uso.puntos;
    if (p.length < 2) return null;
    const t = p.map(x => Date.parse(x.fecha));
    const [t0, t1] = [Math.min(...t), Math.max(...t)];
    const [v0, v1] = [Math.min(...p.map(x => x.valor)), Math.max(...p.map(x => x.valor))];
    return p.map((x, i) => `${(((t[i] - t0) / (t1 - t0 || 1)) * 200).toFixed(1)},${(40 - ((x.valor - v0) / (v1 - v0 || 1)) * 36).toFixed(1)}`).join(' ');
  });

  protected muestra(nombre: string) {
    return this.colores.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase())?.muestra ?? null;
  }

  /** Antes de generar se elige el color (por defecto, el que tenga el vehículo). */
  protected abrirColores() {
    this.color.set(this.vehiculo().color ?? '');
    this.errorImagen.set(null);
    this.eligiendo.set(true);
  }

  protected generar() {
    const color = this.color().trim();
    if (color && !/^[\p{L} -]+$/u.test(color)) {
      this.errorImagen.set('El color solo puede llevar letras, espacios y guiones.');
      return;
    }
    if (this.resumen().imagen && !confirm('¿Generar una imagen nueva? Sustituye a la actual.')) return;
    this.eligiendo.set(false);
    this.generando.set(true);
    this.errorImagen.set(null);
    this.api.generarImagenVehiculo(this.vehiculo().id, color || null).subscribe({
      next: () => {
        this.generando.set(false);
        if (color) this.colorCambiado.emit(color);
        this.imagenCambiada.emit();
      },
      error: e => {
        this.generando.set(false);
        this.errorImagen.set(mensajeError(e));
      }
    });
  }

  protected subir(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivo = entrada.files?.[0];
    entrada.value = '';
    if (!archivo) return;
    this.subiendo.set(true);
    this.errorImagen.set(null);
    this.api.subirImagenVehiculo(this.vehiculo().id, archivo).subscribe({
      next: () => {
        this.subiendo.set(false);
        this.imagenCambiada.emit();
      },
      error: err => {
        this.subiendo.set(false);
        this.errorImagen.set(mensajeError(err));
      }
    });
  }

  protected quitar() {
    if (!confirm('¿Quitar la imagen del vehículo?')) return;
    this.api.quitarImagenVehiculo(this.vehiculo().id).subscribe({
      next: () => this.imagenCambiada.emit(),
      error: e => this.errorImagen.set(mensajeError(e))
    });
  }

  /** Baja a una sección de la ficha (documentación, REPRO, historial). */
  protected ir(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
