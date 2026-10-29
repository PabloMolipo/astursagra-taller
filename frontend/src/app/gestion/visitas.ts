import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { geoConicConformal, geoPath, GeoProjection } from 'd3-geo';
import type { Feature, FeatureCollection, MultiPolygon } from 'geojson';
import { mensajeError } from '../core/api';

interface ResumenVisitas {
  desde: string;
  hasta: string;
  paginas: number;
  visitantes: number;
  visitantesEspana: number;
  porcentajeMovil: number;
  geolocalizacion: boolean;
  comunidades: { codigo: string; nombre: string; visitantes: number; paginas: number }[];
  ciudades: { ciudad: string; region: string | null; latitud: number; longitud: number; visitantes: number; paginas: number }[];
  paises: { pais: string; visitantes: number }[];
  dias: { fecha: string; visitantes: number; paginas: number }[];
  paginasMasVistas: { ruta: string; paginas: number }[];
  origenes: { origen: string; visitantes: number }[];
}

type Comunidad = Feature<MultiPolygon, { codigo: string; nombre: string }>;
type Periodo = '7' | '30' | 'mes' | 'mes-anterior' | 'anio' | 'personalizado';
type Tipo = 'Publico' | 'Cliente' | 'Taller' | 'todos';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ANCHO = 720, ALTO = 640;
/** Recuadro de Canarias (abajo a la izquierda, en una franja reservada para no tapar la península). */
const CANARIAS = { x: 8, y: ALTO - 140, ancho: 230, alto: 130 };
const NOMBRES_PAIS = new Intl.DisplayNames(['es'], { type: 'region' });

/** Visitas a la web: mapa de España por comunidades y ciudades, evolución, países, páginas y origen. */
@Component({
  selector: 'app-visitas',
  imports: [FormsModule, DatePipe, DecimalPipe],
  template: `
    <div class="toolbar filtros">
      <div class="chips" role="group" aria-label="Periodo">
        @for (p of periodos; track p.valor) {
          <button type="button" [class.active]="periodo() === p.valor" (click)="elegir(p.valor)">{{ p.texto }}</button>
        }
      </div>
      <select [ngModel]="tipo()" (ngModelChange)="tipo.set($event); cargar()" aria-label="Visitantes">
        <option value="Publico">Visitantes de la web (sin sesión)</option>
        <option value="Cliente">Clientes con sesión</option>
        <option value="Taller">Taller</option>
        <option value="todos">Todos</option>
      </select>
      @if (periodo() === 'personalizado') {
        <label class="fecha">Desde <input type="date" [ngModel]="desde()" (ngModelChange)="desde.set($event); cargar()" /></label>
        <label class="fecha">Hasta <input type="date" [ngModel]="hasta()" (ngModelChange)="hasta.set($event); cargar()" /></label>
      }
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    @if (r(); as r) {
      @if (!r.geolocalizacion) {
        <div class="aviso">La base de datos de geolocalización no está cargada: las visitas nuevas se guardan sin zona.</div>
      }
      <div class="kpis">
        <div class="kpi"><span class="k">Visitantes</span><span class="v">{{ r.visitantes | number }}</span><span class="hint">Únicos por día</span></div>
        <div class="kpi"><span class="k">Desde España</span><span class="v lima">{{ r.visitantesEspana | number }}</span><span class="hint">{{ r.visitantes ? (100 * r.visitantesEspana / r.visitantes | number: '1.0-0') : 0 }} % del total</span></div>
        <div class="kpi"><span class="k">Páginas vistas</span><span class="v">{{ r.paginas | number }}</span><span class="hint">{{ r.visitantes ? (r.paginas / r.visitantes | number: '1.1-1') : 0 }} por visitante</span></div>
        <div class="kpi"><span class="k">Desde el móvil</span><span class="v">{{ r.porcentajeMovil | number: '1.0-0' }} %</span><span class="hint">El resto, ordenador o tableta</span></div>
      </div>

      <section class="card mapa-card">
        <div class="cabecera">
          <h2>Mapa de España</h2>
          <button type="button" class="btn small" (click)="verTabla.set(!verTabla())">{{ verTabla() ? 'Ver mapa' : 'Ver tabla' }}</button>
        </div>
        @if (!verTabla()) {
          <p class="lectura" aria-live="polite">
            @if (destacado(); as d) {
              <strong>{{ d.nombre }}</strong> · {{ d.visitantes | number }} {{ d.visitantes === 1 ? 'visitante' : 'visitantes' }} · {{ d.paginas | number }} páginas
            } @else {
              <span class="hint">Pasa el ratón (o toca) sobre una comunidad o una ciudad.</span>
            }
          </p>
          @if (mapa(); as m) {
            <svg class="mapa" [attr.viewBox]="'0 0 ' + ancho + ' ' + alto" role="img" aria-label="Visitantes por comunidad autónoma y ciudad">
              @for (c of m.comunidades; track c.codigo) {
                <path [attr.d]="c.d" class="comunidad" [style.fill]="c.color" [class.activa]="activo() === 'c' + c.codigo"
                  (mouseenter)="activo.set('c' + c.codigo)" (mouseleave)="activo.set(null)" (click)="activo.set('c' + c.codigo)" />
              }
              <rect [attr.x]="canarias.x" [attr.y]="canarias.y" [attr.width]="canarias.ancho" [attr.height]="canarias.alto" class="recuadro" />
              @for (p of m.puntos; track p.clave) {
                <circle [attr.cx]="p.x" [attr.cy]="p.y" [attr.r]="p.r" class="ciudad" [class.activa]="activo() === p.clave"
                  (mouseenter)="activo.set(p.clave)" (mouseleave)="activo.set(null)" (click)="activo.set(p.clave)" />
              }
              @for (p of m.etiquetas; track p.clave) {
                <text [attr.x]="p.x + p.r + 4" [attr.y]="p.y + 4" class="etiqueta">{{ p.nombre }}</text>
              }
            </svg>
            <div class="leyenda">
              <span>Menos</span>
              @for (paso of m.pasos; track $index) {
                <i [style.background]="paso"></i>
              }
              <span>Más visitantes</span>
              <span class="hint">· Los círculos son ciudades (tamaño = visitantes)</span>
            </div>
          }
        } @else {
          <div class="dos">
            <div class="table-wrap">
              <table>
                <thead><tr><th>Comunidad</th><th class="num">Visitantes</th><th class="num">Páginas</th></tr></thead>
                <tbody>
                  @for (c of r.comunidades; track c.codigo) {
                    <tr><td>{{ c.nombre }}</td><td class="num">{{ c.visitantes }}</td><td class="num">{{ c.paginas }}</td></tr>
                  } @empty {
                    <tr><td colspan="3" class="empty">Sin visitas desde España.</td></tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Ciudad</th><th class="num">Visitantes</th><th class="num">Páginas</th></tr></thead>
                <tbody>
                  @for (c of r.ciudades; track c.ciudad + c.region) {
                    <tr><td>{{ c.ciudad }}</td><td class="num">{{ c.visitantes }}</td><td class="num">{{ c.paginas }}</td></tr>
                  } @empty {
                    <tr><td colspan="3" class="empty">Sin ciudades.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </section>

      <section class="card">
        <h2>Visitantes por día</h2>
        <p class="lectura" aria-live="polite">
          @if (diaActivo(); as d) {
            <strong>{{ d.fecha | date: 'EEEE d MMM' }}</strong> · {{ d.visitantes }} visitantes · {{ d.paginas }} páginas
          } @else {
            <span class="hint">Pasa el ratón sobre un día.</span>
          }
        </p>
        <svg class="dias" [attr.viewBox]="'0 0 ' + grafico().ancho + ' ' + grafico().alto" role="img" aria-label="Visitantes por día">
          <line x1="0" [attr.x2]="grafico().ancho" [attr.y1]="grafico().base" [attr.y2]="grafico().base" class="rejilla" />
          @for (b of grafico().barras; track b.i) {
            <g (mouseenter)="dia.set(b.i)" (mouseleave)="dia.set(null)" (click)="dia.set(b.i)">
              <rect [attr.x]="b.x" y="0" [attr.width]="b.paso" [attr.height]="grafico().base" class="zona" />
              <path [attr.d]="b.d" class="barra" [class.atenuada]="dia() !== null && dia() !== b.i" />
            </g>
          }
          <text x="0" [attr.y]="grafico().alto - 2" class="eje">{{ r.desde | date: 'd MMM' }}</text>
          <text [attr.x]="grafico().ancho" [attr.y]="grafico().alto - 2" class="eje" text-anchor="end">{{ r.hasta | date: 'd MMM' }}</text>
          <text x="2" y="10" class="eje">{{ grafico().max }}</text>
        </svg>
      </section>

      <div class="tres">
        <section class="card">
          <h2>Países</h2>
          @for (p of r.paises; track p.pais) {
            <div class="fila"><span>{{ pais(p.pais) }}</span><span class="num">{{ p.visitantes }}</span></div>
          } @empty {
            <p class="hint">Sin visitas.</p>
          }
        </section>
        <section class="card">
          <h2>Páginas más vistas</h2>
          @for (p of r.paginasMasVistas; track p.ruta) {
            <div class="fila"><span class="mono corta">{{ p.ruta }}</span><span class="num">{{ p.paginas }}</span></div>
          } @empty {
            <p class="hint">Sin visitas.</p>
          }
        </section>
        <section class="card">
          <h2>De dónde llegan</h2>
          @for (o of r.origenes; track o.origen) {
            <div class="fila"><span class="corta">{{ o.origen }}</span><span class="num">{{ o.visitantes }}</span></div>
          } @empty {
            <p class="hint">Sin enlaces de otras webs (entran directamente o desde búsquedas sin datos).</p>
          }
        </section>
      </div>
      <p class="hint nota">
        La zona se calcula con la IP en el servidor (base de datos DB-IP, sin enviarla a nadie) y no se guarda la IP. Es aproximada:
        las conexiones móviles suelen aparecer en la ciudad de la operadora. Los robots no se cuentan.
        <a href="https://db-ip.com" target="_blank" rel="noopener">IP Geolocation by DB-IP</a> (CC BY 4.0).
      </p>
    } @else if (!error()) {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    .filtros { align-items: flex-end; }
    .fecha { display: inline-flex; gap: 0.4rem; align-items: center; font-size: 0.85rem; }
    .aviso { border: 1px solid #ffb020; color: #ffc24d; padding: 0.5rem 0.8rem; margin-bottom: 0.8rem; font-size: 0.88rem; }
    .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.75rem; margin-bottom: 1rem; }
    .kpi { background: var(--surface); border: 1px solid var(--border); border-left: 3px solid var(--border-strong); padding: 0.75rem 0.9rem; display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
    .kpi .k { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
    .kpi .v { font-family: var(--font-display); font-size: 1.6rem; font-weight: 700; }
    .lima { color: var(--primary); }
    .cabecera { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
    .cabecera h2 { margin: 0; }
    .lectura { min-height: 1.5rem; margin: 0.5rem 0; font-size: 0.88rem; }
    .mapa { width: 100%; max-width: 760px; height: auto; display: block; margin: 0 auto; }
    .comunidad { stroke: var(--surface); stroke-width: 1; cursor: pointer; transition: opacity 0.12s; }
    .comunidad.activa { stroke: var(--primary); stroke-width: 2; }
    .recuadro { fill: none; stroke: var(--border-strong); stroke-dasharray: 4 3; }
    .ciudad { fill: #c6ff00; fill-opacity: 0.75; stroke: var(--surface); stroke-width: 2; cursor: pointer; }
    .ciudad.activa { fill-opacity: 1; stroke: #fff; }
    .etiqueta { fill: var(--text); font-size: 11px; paint-order: stroke; stroke: var(--surface); stroke-width: 3px; pointer-events: none; }
    .leyenda { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; justify-content: center; font-size: 0.78rem; margin-top: 0.4rem; }
    .leyenda i { display: inline-block; width: 22px; height: 10px; }
    .dias { width: 100%; height: auto; display: block; }
    .dias .rejilla { stroke: var(--border); }
    .dias .zona { fill: transparent; cursor: pointer; }
    .dias .barra { fill: #729f00; }
    .dias .barra.atenuada { opacity: 0.35; }
    .dias .eje { fill: var(--muted); font-size: 10px; }
    .dos { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
    .tres { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; }
    .tres .card { margin: 0; }
    .fila { display: flex; justify-content: space-between; gap: 0.8rem; padding: 0.3rem 0; border-bottom: 1px solid var(--border); font-size: 0.88rem; }
    .corta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
    .num { font-variant-numeric: tabular-nums; }
    .nota { margin-top: 1rem; font-size: 0.78rem; }
    @media (max-width: 800px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
  `
})
export class Visitas {
  private readonly http = inject(HttpClient);

  protected readonly periodos: { valor: Periodo; texto: string }[] = [
    { valor: '7', texto: '7 días' },
    { valor: '30', texto: '30 días' },
    { valor: 'mes', texto: 'Este mes' },
    { valor: 'mes-anterior', texto: 'Mes anterior' },
    { valor: 'anio', texto: 'Este año' },
    { valor: 'personalizado', texto: 'Fechas…' }
  ];
  protected readonly ancho = ANCHO;
  protected readonly alto = ALTO;
  protected readonly canarias = CANARIAS;

  protected readonly periodo = signal<Periodo>('30');
  protected readonly tipo = signal<Tipo>('Publico');
  protected readonly desde = signal('');
  protected readonly hasta = signal('');
  protected readonly r = signal<ResumenVisitas | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly verTabla = signal(false);
  protected readonly activo = signal<string | null>(null);
  protected readonly dia = signal<number | null>(null);
  private readonly geo = signal<FeatureCollection<MultiPolygon, { codigo: string; nombre: string }> | null>(null);

  /** Proyecciones: península y Baleares a tamaño completo; Canarias en su recuadro. */
  private readonly proyecciones = computed(() => {
    const g = this.geo();
    if (!g) return null;
    const peninsula: FeatureCollection = { type: 'FeatureCollection', features: g.features.filter(f => f.properties.codigo !== '05') };
    const islas = g.features.find(f => f.properties.codigo === '05');
    const principal = geoConicConformal().rotate([3.5, 0]).parallels([37, 43]).fitExtent([[10, 10], [ANCHO - 10, CANARIAS.y - 10]], peninsula);
    const canarias = geoConicConformal().rotate([15.5, 0]).parallels([27, 29]);
    if (islas) canarias.fitExtent([[CANARIAS.x + 8, CANARIAS.y + 8], [CANARIAS.x + CANARIAS.ancho - 8, CANARIAS.y + CANARIAS.alto - 8]], islas);
    return { principal, canarias };
  });

  protected readonly mapa = computed(() => {
    const g = this.geo(), p = this.proyecciones(), r = this.r();
    if (!g || !p || !r) return null;
    const porCodigo = new Map(r.comunidades.map(c => [c.codigo, c]));
    const max = Math.max(1, ...r.comunidades.map(c => c.visitantes));
    const pasos = [0.12, 0.3, 0.5, 0.72, 0.95].map(t => this.color(t));
    const comunidades = g.features.map((f: Comunidad) => {
      const datos = porCodigo.get(f.properties.codigo);
      const proyeccion: GeoProjection = f.properties.codigo === '05' ? p.canarias : p.principal;
      const v = datos?.visitantes ?? 0;
      return {
        codigo: f.properties.codigo,
        nombre: f.properties.nombre,
        d: geoPath(proyeccion)(f) ?? '',
        color: v === 0 ? 'var(--surface-2)' : this.color(0.12 + 0.83 * Math.sqrt(v / max)),
        visitantes: v,
        paginas: datos?.paginas ?? 0
      };
    });
    const maxCiudad = Math.max(1, ...r.ciudades.map(c => c.visitantes));
    const puntos = r.ciudades
      .map(c => {
        const proyeccion = c.region === '05' || (c.longitud < -12 && c.latitud < 30) ? p.canarias : p.principal;
        const xy = proyeccion([c.longitud, c.latitud]);
        return xy ? { clave: 'p' + c.ciudad + c.region, nombre: c.ciudad, x: xy[0], y: xy[1], r: 3 + 11 * Math.sqrt(c.visitantes / maxCiudad), visitantes: c.visitantes, paginas: c.paginas } : null;
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.r - a.r);
    return { comunidades, puntos, etiquetas: puntos.slice(0, 5), pasos };
  });

  protected readonly destacado = computed(() => {
    const a = this.activo(), m = this.mapa();
    if (!a || !m) return null;
    return a.startsWith('c') ? m.comunidades.find(c => 'c' + c.codigo === a) ?? null : m.puntos.find(p => p.clave === a) ?? null;
  });

  protected readonly grafico = computed(() => {
    const dias = this.r()?.dias ?? [];
    const ancho = 760, alto = 120, base = 104;
    const max = Math.max(1, ...dias.map(d => d.visitantes));
    const paso = ancho / Math.max(1, dias.length);
    const w = Math.max(2, paso - 2);
    const barras = dias.map((d, i) => {
      const x = i * paso + (paso - w) / 2, h = (d.visitantes / max) * (base - 12), top = base - h, rr = Math.min(3, h / 2, w / 2);
      return { i, x: i * paso, paso, d: h <= 0 ? '' : `M${x},${base} V${top + rr} Q${x},${top} ${x + rr},${top} H${x + w - rr} Q${x + w},${top} ${x + w},${top + rr} V${base} Z` };
    });
    return { ancho, alto, base, barras, max };
  });

  protected readonly diaActivo = computed(() => {
    const i = this.dia();
    return i === null ? null : this.r()?.dias[i] ?? null;
  });

  constructor() {
    this.http.get<FeatureCollection<MultiPolygon, { codigo: string; nombre: string }>>('/geo/comunidades.json').subscribe({
      next: g => this.geo.set(g),
      error: () => this.error.set('No se ha podido cargar el mapa de España.')
    });
    this.cargar();
  }

  protected elegir(p: Periodo) {
    this.periodo.set(p);
    if (p === 'personalizado') {
      if (!this.desde()) { this.desde.set(this.r()?.desde ?? iso(new Date())); this.hasta.set(this.r()?.hasta ?? iso(new Date())); }
      return;
    }
    this.cargar();
  }

  protected cargar() {
    const hoy = new Date();
    let desde = '', hasta = '';
    switch (this.periodo()) {
      case '7': desde = iso(new Date(hoy.getTime() - 6 * 86_400_000)); hasta = iso(hoy); break;
      case '30': desde = iso(new Date(hoy.getTime() - 29 * 86_400_000)); hasta = iso(hoy); break;
      case 'mes': desde = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)); hasta = iso(hoy); break;
      case 'mes-anterior': desde = iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)); hasta = iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)); break;
      case 'anio': desde = iso(new Date(hoy.getFullYear(), 0, 1)); hasta = iso(hoy); break;
      case 'personalizado': desde = this.desde(); hasta = this.hasta(); break;
    }
    if (!desde || !hasta) return;
    this.http.get<ResumenVisitas>('/api/estadisticas/visitas', { params: { desde, hasta, tipo: this.tipo() } }).subscribe({
      next: r => {
        this.r.set(r);
        this.error.set(null);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected pais(codigo: string) {
    if (codigo === '??') return 'Desconocido';
    try {
      return NOMBRES_PAIS.of(codigo) ?? codigo;
    } catch {
      return codigo;
    }
  }

  /** Escala secuencial de un solo tono (lima) sobre el fondo oscuro: t entre 0 (poco) y 1 (mucho). */
  private color(t: number) {
    return `color-mix(in oklab, #b8ef00 ${Math.round(t * 100)}%, #1b1b1b)`;
  }
}
