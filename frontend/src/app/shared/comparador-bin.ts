import { Component, computed, effect, input, signal } from '@angular/core';
import { ascii, BYTES_POR_FILA, Comparacion, comparar, hex2, hexOffset, RegionCambiada, tamanoLegible } from '../core/binario';

export interface ArchivoComparado {
  nombre: string;
  url: string;
  tamano: number;
}

interface FilaDoble {
  offset: number;
  a: number[];
  b: number[];
}

/** Hasta este tamaño se descargan los dos archivos para compararlos en el navegador. */
const MAXIMO = 64 * 1024 * 1024;

/**
 * Compara dos binarios de centralita (original y modificado): bytes cambiados, zonas modificadas y vista
 * hexadecimal de los dos archivos lado a lado con las diferencias resaltadas.
 */
@Component({
  selector: 'app-comparador-bin',
  template: `
    @if (cargando()) {
      <p class="hint">Descargando y comparando {{ a().nombre }} y {{ b().nombre }}…</p>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else if (c(); as c) {
      <div class="resumen">
        <div><span class="hint">Original</span><br /><strong>{{ a().nombre }}</strong> · {{ tamanoLegible(c.tamanoA) }}</div>
        <div><span class="hint">Modificado</span><br /><strong>{{ b().nombre }}</strong> · {{ tamanoLegible(c.tamanoB) }}</div>
        <div><span class="hint">Diferencias</span><br /><strong>{{ c.cambiados.toLocaleString('es-ES') }}</strong> bytes en <strong>{{ c.regiones.length }}</strong> zonas ({{ porcentaje(c) }} %)</div>
      </div>
      @if (c.tamanoA !== c.tamanoB) {
        <p class="aviso">Los archivos tienen distinto tamaño: puede que no sean de la misma centralita o que uno esté incompleto.</p>
      }
      @if (!c.regiones.length) {
        <p>Los dos archivos son idénticos.</p>
      } @else {
        <div class="cuerpo">
          <div class="zonas">
            <div class="hint" style="margin-bottom: 0.3rem">Zonas modificadas{{ c.regiones.length > 500 ? ' (primeras 500)' : '' }}</div>
            @for (r of c.regiones.slice(0, 500); track r.desde; let i = $index) {
              <button type="button" [class.activa]="r === region()" (click)="region.set(r)">
                <span class="mono">{{ hexOffset(r.desde) }}</span>
                <span class="hint">{{ r.hasta - r.desde }} B · {{ r.cambiados }} {{ r.cambiados === 1 ? 'cambio' : 'cambios' }}</span>
              </button>
            }
          </div>
          <div class="doble mono">
            <div class="cab"><span></span><span>Original</span><span>Modificado</span></div>
            @for (f of filas(); track f.offset) {
              <div class="fila">
                <span class="off">{{ hexOffset(f.offset) }}</span>
                <span class="bytes">@for (x of f.a; track $index) {<span [class.dif]="x !== f.b[$index]">{{ hex2(x) }}</span>}</span>
                <span class="bytes">@for (x of f.b; track $index) {<span [class.dif]="x !== f.a[$index]">{{ hex2(x) }}</span>}</span>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: `
    .resumen { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; margin-bottom: 0.75rem; }
    .aviso { color: var(--danger); }
    .cuerpo { display: grid; grid-template-columns: 210px 1fr; gap: 0.75rem; }
    @media (max-width: 860px) { .cuerpo { grid-template-columns: 1fr; } .zonas { max-height: 180px; } }
    .zonas { max-height: 60vh; overflow: auto; border: 1px solid var(--border); border-radius: var(--radius); padding: 0.4rem; }
    .zonas button { display: flex; justify-content: space-between; gap: 0.5rem; width: 100%; border: 0; background: none; padding: 0.3rem 0.4rem; border-radius: 4px; cursor: pointer; font: inherit; font-size: 0.82rem; text-align: left; }
    .zonas button:hover, .zonas button.activa { background: var(--bg); }
    .doble { font-size: 0.78rem; line-height: 1.45; background: #050505; color: #d7e3f4; border-radius: var(--radius); padding: 0.6rem 0.8rem; overflow: auto; max-height: 60vh; }
    .cab, .fila { display: grid; grid-template-columns: 9ch auto auto; column-gap: 1.4rem; white-space: pre; }
    .cab { color: var(--primary); margin-bottom: 0.2rem; }
    .off { color: var(--primary); }
    .bytes { display: inline-grid; grid-template-columns: repeat(16, 2.2ch); column-gap: 0.45ch; color: #6c7f99; }
    .bytes .dif { color: var(--on-primary); background: var(--primary); border-radius: 2px; }
  `
})
export class ComparadorBin {
  readonly a = input.required<ArchivoComparado>();
  readonly b = input.required<ArchivoComparado>();

  protected readonly hex2 = hex2;
  protected readonly hexOffset = hexOffset;
  protected readonly ascii = ascii;
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly cargando = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly c = signal<Comparacion | null>(null);
  protected readonly region = signal<RegionCambiada | null>(null);
  private datosA = new Uint8Array();
  private datosB = new Uint8Array();

  /** Filas alrededor de la zona elegida (como mucho 64 filas: 1 KB). */
  protected readonly filas = computed<FilaDoble[]>(() => {
    const r = this.region();
    if (!r) return [];
    const desde = Math.max(0, Math.floor(r.desde / BYTES_POR_FILA) * BYTES_POR_FILA - 4 * BYTES_POR_FILA);
    const hasta = Math.min(Math.max(this.datosA.length, this.datosB.length), Math.min(desde + 64 * BYTES_POR_FILA, Math.ceil(r.hasta / BYTES_POR_FILA) * BYTES_POR_FILA + 4 * BYTES_POR_FILA));
    const filas: FilaDoble[] = [];
    for (let o = desde; o < hasta; o += BYTES_POR_FILA) {
      filas.push({ offset: o, a: Array.from(this.datosA.subarray(o, o + BYTES_POR_FILA)), b: Array.from(this.datosB.subarray(o, o + BYTES_POR_FILA)) });
    }
    return filas;
  });

  constructor() {
    effect(() => {
      const a = this.a();
      const b = this.b();
      this.comparar(a, b);
    });
  }

  protected porcentaje(c: Comparacion) {
    const total = Math.max(c.tamanoA, c.tamanoB) || 1;
    return ((100 * c.cambiados) / total).toLocaleString('es-ES', { maximumFractionDigits: 2 });
  }

  private async comparar(a: ArchivoComparado, b: ArchivoComparado) {
    this.c.set(null);
    this.region.set(null);
    this.error.set(null);
    if (a.tamano > MAXIMO || b.tamano > MAXIMO) {
      this.error.set('Los archivos son demasiado grandes para compararlos en el navegador (máximo 64 MB).');
      return;
    }
    this.cargando.set(true);
    try {
      const [ra, rb] = await Promise.all([fetch(a.url, { credentials: 'same-origin' }), fetch(b.url, { credentials: 'same-origin' })]);
      if (!ra.ok || !rb.ok) throw new Error('No se han podido leer los archivos de SharePoint.');
      this.datosA = new Uint8Array(await ra.arrayBuffer());
      this.datosB = new Uint8Array(await rb.arrayBuffer());
      const c = comparar(this.datosA, this.datosB);
      this.c.set(c);
      this.region.set(c.regiones[0] ?? null);
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
