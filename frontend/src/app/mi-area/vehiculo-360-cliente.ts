import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COLORES_VEHICULO } from '../core/etiquetas';
import { PortalVehiculo, PortalVehiculoResumen } from '../core/models';
import { EstadoBadge } from '../shared/estado-badge';
import { EtiquetaPipe } from '../shared/pipes';
import { SiluetaVehiculo } from '../vehiculos/silueta-vehiculo';

/**
 * Visión 360 del vehículo en el área del cliente: su coche en el centro y alrededor identificación, uso, historial y la
 * reparación en curso. Solo lectura y solo datos del cliente (sin márgenes ni información interna del taller).
 */
@Component({
  selector: 'app-vehiculo-360-cliente',
  imports: [RouterLink, DatePipe, DecimalPipe, CurrencyPipe, EtiquetaPipe, EstadoBadge, SiluetaVehiculo],
  template: `
    @let v = vehiculo();
    @let r = resumen();
    <div class="orbital">
      <div class="centro">
        <div class="anillo" aria-hidden="true"></div>
        @if (v.matricula) {
          <div class="matricula"><span class="ue">E</span><span class="txt">{{ v.matricula }}</span></div>
        }
        <figure class="imagen">
          @if (r.imagenUrl) {
            <img [src]="r.imagenUrl" [alt]="'Imagen de ' + v.marca + ' ' + (v.modelo ?? '')" />
            @if (r.imagenGenerada) {
              <figcaption>Imagen orientativa</figcaption>
            }
          } @else {
            <app-silueta-vehiculo [tipo]="v.tipo" />
          }
        </figure>
        @if (r.enCurso; as o) {
          <a class="en-curso" [routerLink]="['/mi-area/ordenes', o.id]">
            <span class="hint">En el taller ahora</span>
            <span class="fila-curso"><app-estado-badge [estado]="o.estado" /> {{ o.motivoEntrada }}</span>
            @if (o.fechaPrevista) {
              <span class="hint">Previsto para el {{ o.fechaPrevista | date: 'dd/MM/yyyy' }}</span>
            }
          </a>
        }
      </div>

      <section class="bloque izq">
        <h3>Identificación</h3>
        <div class="fila"><span>Tipo</span><span>{{ v.tipo | etiqueta: 'vehiculo' }}</span></div>
        @if (v.bastidor) {
          <div class="fila"><span>Bastidor</span><span class="mono">{{ v.bastidor }}</span></div>
        }
        @if (v.anio) {
          <div class="fila"><span>Año</span><span>{{ v.anio }}</span></div>
        }
        @if (r.color) {
          <div class="fila">
            <span>Color</span>
            <span class="color">
              @if (muestra(); as m) {
                <i class="punto" [style.background]="m"></i>
              }
              {{ r.color }}
            </span>
          </div>
        }
        @if (motorizacion()) {
          <div class="fila"><span>Motor</span><span>{{ motorizacion() }}</span></div>
        }
        @if (r.tecnicos?.fechaMatriculacion) {
          <div class="fila"><span>Matriculación</span><span>{{ r.tecnicos!.fechaMatriculacion | date: 'dd/MM/yyyy' }}</span></div>
        }
      </section>

      <section class="bloque der">
        <h3>Historial <span class="n">{{ r.visitas }} {{ r.visitas === 1 ? 'visita' : 'visitas' }}</span></h3>
        @if (r.ultima) {
          <div class="fila"><span>Cliente desde</span><span>{{ r.primera | date: 'MM/yyyy' }}</span></div>
          <div class="fila"><span>Última visita</span><span>{{ r.ultima | date: 'dd/MM/yyyy' }}</span></div>
          @if (r.ultimoMotivo) {
            <div class="motivo hint">{{ r.ultimoMotivo }}</div>
          }
          <div class="fila"><span>Total en el taller</span><span class="lima">{{ r.facturado | currency: 'EUR' }}</span></div>
        } @else {
          <div class="hint">Todavía no ha pasado por el taller.</div>
        }
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
          <div class="hint">≈ {{ r.uso.porAnio | number: '1.0-0' }} {{ r.uso.enHoras ? 'h' : 'km' }}/año</div>
        }
      </section>

      @if (r.ultimaOrdenConFotos; as ordenId) {
        <a class="bloque der acceso" [routerLink]="['/mi-area/ordenes', ordenId]">
          <h3>Fotos y vídeos <span class="n">{{ r.fotos + r.videos }}</span></h3>
          <span class="hint">{{ r.fotos }} {{ r.fotos === 1 ? 'foto' : 'fotos' }} · {{ r.videos }} {{ r.videos === 1 ? 'vídeo' : 'vídeos' }} de tus visitas</span>
          <span class="enlace">Ver las últimas →</span>
        </a>
      } @else {
        <section class="bloque der">
          <h3>Fotos y vídeos</h3>
          <span class="hint">Aquí verás las fotos que el taller comparta de tus reparaciones.</span>
        </section>
      }
    </div>
  `,
  styles: `
    :host { display: block; margin-bottom: 1rem; }
    .orbital { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr) minmax(0, 1fr); gap: 14px; }
    .centro { grid-column: 2; grid-row: 1 / span 2; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; position: relative; }
    .anillo { position: absolute; inset: 2% 0; border: 1px dashed color-mix(in srgb, var(--primary) 22%, transparent); border-radius: 50%; pointer-events: none; }
    .matricula { display: inline-flex; border: 2px solid #dcdcdc; background: #f2f2f2; color: #111; font-family: var(--font-mono, monospace); font-weight: 700; font-size: 1.2rem; letter-spacing: 0.08em; position: relative; }
    .matricula .ue { background: #1f47b8; color: #fff; font-size: 0.6rem; display: grid; place-items: end center; padding: 2px 4px; letter-spacing: 0; }
    .matricula .txt { padding: 1px 10px; }
    .imagen { width: 100%; max-width: 440px; margin: 0; position: relative; }
    .imagen img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; border: 1px solid var(--border); background: #0a0a0a; }
    .imagen app-silueta-vehiculo { padding: 6% 4% 0; }
    .imagen figcaption { font-size: 0.72rem; color: var(--muted); text-align: center; margin-top: 4px; }
    .en-curso { position: relative; display: flex; flex-direction: column; gap: 3px; align-items: center; text-align: center; padding: 8px 14px; border: 1px solid #ffb020; background: var(--surface-2); color: inherit; text-decoration: none; max-width: 420px; }
    .en-curso:hover { border-color: var(--primary); }
    .fila-curso { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: center; font-weight: 600; }

    .bloque { background: var(--surface-2); border: 1px solid var(--border); padding: 12px 14px; position: relative; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .bloque h3 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); display: flex; align-items: center; gap: 8px; margin: 0 0 6px; }
    .n { margin-left: auto; color: var(--primary); font-family: var(--font-display); font-size: 0.85rem; }
    .izq::after, .der::after { content: ''; position: absolute; top: 50%; width: 14px; border-top: 1px solid var(--primary); }
    .izq::after { right: -15px; } .der::after { left: -15px; }
    .fila { display: flex; justify-content: space-between; gap: 10px; font-size: 0.86rem; padding: 1px 0; }
    .fila > :first-child { color: var(--muted); flex: none; }
    .fila > :last-child { text-align: right; min-width: 0; overflow-wrap: anywhere; }
    .color { display: inline-flex; align-items: center; gap: 6px; justify-content: flex-end; }
    .punto { display: inline-block; width: 10px; height: 10px; border: 1px solid var(--border-strong); }
    .grande { font-family: var(--font-display); font-size: 1.5rem; font-weight: 700; }
    .grafica { width: 100%; height: 44px; margin: 4px 0; }
    .motivo { font-size: 0.82rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .lima { color: var(--primary); }
    .acceso { color: inherit; text-decoration: none; transition: border-color 0.12s; }
    .acceso:hover { border-color: var(--primary); }
    .enlace { color: var(--primary); font-size: 0.8rem; margin-top: 4px; }

    @media (max-width: 900px) {
      .orbital { grid-template-columns: minmax(0, 1fr); }
      .centro { grid-column: 1; grid-row: auto; order: -1; }
      .izq::after, .der::after, .anillo { display: none; }
    }
  `
})
export class Vehiculo360Cliente {
  readonly vehiculo = input.required<PortalVehiculo>();
  readonly resumen = input.required<PortalVehiculoResumen>();

  protected readonly muestra = computed(() => {
    const color = this.resumen().color?.trim().toLowerCase();
    return COLORES_VEHICULO.find(c => c.nombre.toLowerCase() === color)?.muestra ?? null;
  });

  protected readonly motorizacion = computed(() => {
    const r = this.resumen();
    const t = r.tecnicos;
    return [t?.combustible, t?.cilindrada ? `${t.cilindrada} cc` : null, t?.potenciaCv ? `${Math.round(t.potenciaCv)} CV` : null, t ? null : r.motor]
      .filter(Boolean)
      .join(' · ');
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
}
