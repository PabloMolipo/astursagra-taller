import { Component, HostListener, input, signal } from '@angular/core';

export interface ElementoMultimedia {
  id: number;
  url: string;
  tipoContenido: string;
  descripcion: string | null;
}

/** Cuadrícula de fotos y vídeos con vista ampliada (flechas y Escape para navegar/cerrar). */
@Component({
  selector: 'app-visor-multimedia',
  template: `
    <div class="rejilla">
      @for (e of elementos(); track e.id; let i = $index) {
        <button type="button" class="miniatura" (click)="abrir(i)" [attr.aria-label]="'Ver ' + (e.descripcion ?? (esVideo(e) ? 'vídeo' : 'foto'))">
          @if (esVideo(e)) {
            <video [src]="e.url + '#t=0.5'" preload="metadata" muted playsinline></video>
            <span class="play" aria-hidden="true">▶</span>
          } @else {
            <img [src]="e.url" [alt]="e.descripcion ?? ''" loading="lazy" />
          }
          @if (e.descripcion) {
            <span class="pie">{{ e.descripcion }}</span>
          }
        </button>
      }
    </div>

    @if (actual() !== null) {
      @let e = elementos()[actual()!];
      <div class="capa" (click)="cerrar()" role="dialog" aria-modal="true" aria-label="Vista ampliada">
        <div class="contenido" (click)="$event.stopPropagation()">
          @if (esVideo(e)) {
            <video [src]="e.url" controls autoplay playsinline></video>
          } @else {
            <img [src]="e.url" [alt]="e.descripcion ?? ''" />
          }
          @if (e.descripcion) {
            <p>{{ e.descripcion }}</p>
          }
        </div>
        <button type="button" class="cerrar" (click)="cerrar()" aria-label="Cerrar">×</button>
        @if (elementos().length > 1) {
          <button type="button" class="flecha izq" (click)="mover(-1); $event.stopPropagation()" aria-label="Anterior">‹</button>
          <button type="button" class="flecha der" (click)="mover(1); $event.stopPropagation()" aria-label="Siguiente">›</button>
        }
      </div>
    }
  `,
  styles: `
    .rejilla { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 0.6rem; }
    .miniatura { position: relative; aspect-ratio: 4 / 3; padding: 0; border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; background: #050505; cursor: pointer; }
    .miniatura img, .miniatura video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .play { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; font-size: 2rem; text-shadow: 0 2px 8px rgba(0,0,0,.6); }
    .pie { position: absolute; left: 0; right: 0; bottom: 0; padding: 0.25rem 0.4rem; font-size: 0.75rem; color: #fff; background: rgba(0,0,0,.55); text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .capa { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, 0.92); display: grid; place-items: center; padding: 3rem 1rem; }
    .contenido { max-width: 100%; max-height: 100%; display: flex; flex-direction: column; align-items: center; gap: 0.5rem; }
    .contenido img, .contenido video { max-width: min(1200px, 100%); max-height: 80vh; border-radius: var(--radius); }
    .contenido p { color: #e3ebf5; margin: 0; text-align: center; }
    .cerrar { position: absolute; top: 0.75rem; right: 1rem; font-size: 2rem; color: #fff; background: none; border: 0; cursor: pointer; }
    .flecha { position: absolute; top: 50%; transform: translateY(-50%); width: 46px; height: 46px; border-radius: 50%; border: 0; background: rgba(255,255,255,.85); font-size: 1.6rem; cursor: pointer; }
    .izq { left: 1rem; }
    .der { right: 1rem; }
  `
})
export class VisorMultimedia {
  readonly elementos = input.required<ElementoMultimedia[]>();
  protected readonly actual = signal<number | null>(null);

  protected esVideo(e: ElementoMultimedia) {
    return e.tipoContenido.startsWith('video/');
  }

  protected abrir(i: number) {
    this.actual.set(i);
  }

  protected cerrar() {
    this.actual.set(null);
  }

  protected mover(paso: number) {
    const n = this.elementos().length;
    this.actual.update(a => (a === null ? null : (a + paso + n) % n));
  }

  @HostListener('document:keydown', ['$event'])
  protected tecla(e: KeyboardEvent) {
    if (this.actual() === null) {
      return;
    }
    if (e.key === 'Escape') this.cerrar();
    if (e.key === 'ArrowLeft') this.mover(-1);
    if (e.key === 'ArrowRight') this.mover(1);
  }
}
