import { Component, computed, effect, ElementRef, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ascii, FilaHex, filasHex, hex2, hexOffset, leerOffset, tamanoLegible } from '../core/binario';

const PAGINA = 4096;

/**
 * Visor hexadecimal de un archivo servido con Range: pide solo la página que muestra (4 KB), así se pueden ver
 * archivos de centralita grandes sin descargarlos enteros.
 */
@Component({
  selector: 'app-visor-hex',
  imports: [FormsModule],
  template: `
    <div class="barra">
      <button type="button" class="btn small" (click)="ir(0)" [disabled]="cargando() || offset() === 0">⏮</button>
      <button type="button" class="btn small" (click)="ir(offset() - PAGINA)" [disabled]="cargando() || offset() === 0">◀</button>
      <span class="mono">{{ hexOffset(offset()) }} – {{ hexOffset(Math.min(offset() + PAGINA, tamano()) - 1) }}</span>
      <button type="button" class="btn small" (click)="ir(offset() + PAGINA)" [disabled]="cargando() || offset() + PAGINA >= tamano()">▶</button>
      <button type="button" class="btn small" (click)="ir(ultima())" [disabled]="cargando() || offset() >= ultima()">⏭</button>
      <form (ngSubmit)="saltar()" class="saltar">
        <input name="destino" [(ngModel)]="destino" placeholder="Ir a offset (hex)" class="mono" aria-label="Ir a offset en hexadecimal" />
      </form>
      <span class="hint">{{ tamanoLegible(tamano()) }} · página {{ Math.floor(offset() / PAGINA) + 1 }} de {{ paginas() }}</span>
    </div>
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    <div class="hex mono" [class.cargando]="cargando()">
      @for (f of filas(); track f.offset) {
        <div class="fila" [class.marcada]="f.offset === marcada()" [attr.data-offset]="f.offset">
          <span class="off">{{ hexOffset(f.offset) }}</span>
          <span class="bytes">
            @for (b of f.bytes; track $index) {<span [class.cero]="b === 0" [class.ff]="b === 255">{{ hex2(b) }}</span>}
          </span>
          <span class="txt">{{ texto(f.bytes) }}</span>
        </div>
      }
    </div>
  `,
  styles: `
    .barra { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 0.5rem; }
    .saltar input { width: 150px; padding: 0.25rem 0.4rem; }
    .hex { font-size: 0.8rem; line-height: 1.45; background: #050505; color: #d7e3f4; border-radius: var(--radius); padding: 0.6rem 0.8rem; overflow-x: auto; max-height: 60vh; overflow-y: auto; }
    .hex.cargando { opacity: 0.5; }
    .fila { display: flex; gap: 1.2rem; white-space: pre; }
    .fila.marcada { background: rgba(198, 255, 0, 0.25); border-radius: 3px; }
    .off { color: var(--primary); }
    .bytes { display: inline-grid; grid-template-columns: repeat(16, 2.2ch); column-gap: 0.45ch; }
    .bytes .cero { color: #6c7f99; }
    .bytes .ff { color: #8fb3e0; }
    .txt { color: #9fd3a5; }
  `
})
export class VisorHex {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly url = input.required<string>();
  readonly tamano = input.required<number>();

  protected readonly PAGINA = PAGINA;
  protected readonly Math = Math;
  protected readonly hex2 = hex2;
  protected readonly hexOffset = hexOffset;
  protected readonly ascii = ascii;
  protected readonly tamanoLegible = tamanoLegible;
  protected readonly offset = signal(0);
  protected readonly filas = signal<FilaHex[]>([]);
  protected readonly cargando = signal(false);
  /** Fila a la que se ha saltado con «Ir a offset». */
  protected readonly marcada = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly paginas = computed(() => Math.max(1, Math.ceil(this.tamano() / PAGINA)));
  protected readonly ultima = computed(() => (this.paginas() - 1) * PAGINA);
  protected destino = '';

  constructor() {
    // Al cambiar de archivo, se empieza por el principio.
    effect(() => {
      this.url();
      this.cargar(0);
    });
  }

  protected texto(bytes: number[]) {
    return bytes.map(ascii).join('');
  }

  protected ir(offset: number) {
    this.marcada.set(null);
    this.cargar(Math.max(0, Math.min(offset, this.ultima())));
  }

  protected saltar() {
    const o = leerOffset(this.destino);
    if (o === null || o >= this.tamano()) {
      this.error.set('Offset fuera del archivo. Escríbelo en hexadecimal (p. ej. 1F400) o en decimal acabado en d.');
      return;
    }
    const fila = Math.floor(o / 16) * 16;
    this.marcada.set(fila);
    this.cargar(Math.floor(o / PAGINA) * PAGINA).then(() =>
      setTimeout(() => this.host.nativeElement.querySelector(`[data-offset="${fila}"]`)?.scrollIntoView({ block: 'center' }))
    );
  }

  private async cargar(offset: number): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const fin = Math.min(offset + PAGINA, this.tamano()) - 1;
      const r = await fetch(this.url(), { headers: { Range: `bytes=${offset}-${fin}` }, credentials: 'same-origin' });
      if (!r.ok) throw new Error(r.status === 401 ? 'Tu sesión ha caducado.' : 'No se ha podido leer el archivo de SharePoint.');
      let datos = new Uint8Array(await r.arrayBuffer());
      // Si el servidor ignorara el Range y mandara todo, se recorta la página.
      if (r.status === 200 && datos.length > PAGINA) datos = datos.subarray(offset, fin + 1);
      this.offset.set(offset);
      this.filas.set(filasHex(datos, offset));
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.cargando.set(false);
    }
  }
}
