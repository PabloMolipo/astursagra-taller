import { Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';

/**
 * Botones para añadir fotos y vídeos: cámara del móvil o tableta (foto o vídeo), archivos ya hechos y la cámara del
 * equipo (webcam) dentro de la página, para ordenadores. Emite los archivos; quien lo usa decide cuándo subirlos.
 */
@Component({
  selector: 'app-captura-multimedia',
  template: `
    <div class="botones">
      <label class="btn primary">
        <input type="file" accept="image/*" capture="environment" (change)="elegidos($event)" />
        📷 Foto
      </label>
      <label class="btn primary">
        <input type="file" accept="video/*" capture="environment" (change)="elegidos($event)" />
        🎥 Vídeo
      </label>
      <label class="btn">
        <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm,image/*,video/*" multiple (change)="elegidos($event)" />
        📁 Archivos
      </label>
      @if (hayCamara) {
        <button type="button" class="btn" (click)="abrir()">🖥️ Cámara del equipo</button>
      }
    </div>

    @if (abierta()) {
      <div class="capa" role="dialog" aria-modal="true" aria-label="Cámara">
        <div class="panel">
          <video #visor autoplay muted playsinline></video>
          @if (aviso()) {
            <p class="aviso">{{ aviso() }}</p>
          }
          <div class="controles">
            @if (grabando()) {
              <span class="rec">● {{ tiempo() }}</span>
              <button type="button" class="btn danger" (click)="pararVideo()">⏹ Parar</button>
            } @else {
              <button type="button" class="btn primary" (click)="hacerFoto()" [disabled]="!lista()">📷 Foto</button>
              <button type="button" class="btn primary" (click)="grabarVideo()" [disabled]="!lista() || !puedeGrabar">🎥 Grabar</button>
              <button type="button" class="btn" (click)="cambiarCamara()" [disabled]="!lista()">🔄 Cambiar cámara</button>
              <button type="button" class="btn" (click)="cerrar()">Cerrar</button>
            }
          </div>
          @if (hechas()) {
            <p class="hint hechas">{{ hechas() }} {{ hechas() === 1 ? 'archivo añadido' : 'archivos añadidos' }}</p>
          }
        </div>
      </div>
    }
  `,
  styles: `
    .botones { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .botones label { position: relative; cursor: pointer; }
    .botones input { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .capa { position: fixed; inset: 0; z-index: 100; background: rgba(0, 0, 0, 0.92); display: grid; place-items: center; padding: 1rem; }
    .panel { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; max-width: 100%; }
    video { max-width: min(960px, 100%); max-height: 70vh; border-radius: var(--radius); background: #000; }
    .controles { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; align-items: center; }
    .rec { color: #ff6b6b; font-weight: 600; font-variant-numeric: tabular-nums; }
    .aviso { color: #ffd479; margin: 0; text-align: center; }
    .hechas { color: #c9d6e5; margin: 0; }
  `
})
export class CapturaMultimedia implements OnDestroy {
  readonly archivos = output<File[]>();

  private readonly visor = viewChild<ElementRef<HTMLVideoElement>>('visor');
  protected readonly hayCamara = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  protected readonly puedeGrabar = typeof MediaRecorder !== 'undefined';
  protected readonly abierta = signal(false);
  protected readonly lista = signal(false);
  protected readonly grabando = signal(false);
  protected readonly tiempo = signal('0:00');
  protected readonly aviso = signal<string | null>(null);
  protected readonly hechas = signal(0);

  private flujo: MediaStream | null = null;
  private grabadora: MediaRecorder | null = null;
  private trozos: Blob[] = [];
  private trasera = true;
  private reloj?: ReturnType<typeof setInterval>;

  protected elegidos(e: Event) {
    const entrada = e.target as HTMLInputElement;
    const archivos = Array.from(entrada.files ?? []);
    entrada.value = '';
    if (archivos.length) this.archivos.emit(archivos);
  }

  protected async abrir() {
    this.abierta.set(true);
    this.hechas.set(0);
    await this.encender();
  }

  protected cerrar() {
    this.apagar();
    this.abierta.set(false);
  }

  protected async cambiarCamara() {
    this.trasera = !this.trasera;
    await this.encender();
  }

  protected hacerFoto() {
    const video = this.visor()?.nativeElement;
    if (!video || !video.videoWidth) return;
    const lienzo = document.createElement('canvas');
    lienzo.width = video.videoWidth;
    lienzo.height = video.videoHeight;
    lienzo.getContext('2d')!.drawImage(video, 0, 0);
    lienzo.toBlob(b => b && this.entregar(new File([b], `foto-${this.marca()}.jpg`, { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  }

  protected grabarVideo() {
    if (!this.flujo) return;
    // MP4 si el navegador lo graba (Safari, Chrome reciente); si no, WebM. Los dos los admite el taller.
    const tipo = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    try {
      this.grabadora = new MediaRecorder(this.flujo, tipo ? { mimeType: tipo } : undefined);
    } catch {
      this.aviso.set('Este navegador no puede grabar vídeo. Usa el botón «Vídeo» o graba con el móvil.');
      return;
    }
    this.trozos = [];
    this.grabadora.ondataavailable = e => e.data.size && this.trozos.push(e.data);
    this.grabadora.onstop = () => {
      const mime = (this.grabadora?.mimeType || tipo || 'video/webm').split(';')[0];
      const extension = mime.includes('mp4') ? 'mp4' : 'webm';
      this.entregar(new File(this.trozos, `video-${this.marca()}.${extension}`, { type: mime }));
      this.trozos = [];
    };
    this.grabadora.start(1000);
    this.grabando.set(true);
    const inicio = Date.now();
    this.tiempo.set('0:00');
    this.reloj = setInterval(() => {
      const s = Math.floor((Date.now() - inicio) / 1000);
      this.tiempo.set(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
    }, 500);
  }

  protected pararVideo() {
    clearInterval(this.reloj);
    this.grabando.set(false);
    if (this.grabadora?.state === 'recording') this.grabadora.stop();
  }

  ngOnDestroy() {
    this.apagar();
  }

  private entregar(archivo: File) {
    this.hechas.update(n => n + 1);
    this.archivos.emit([archivo]);
  }

  private async encender() {
    this.apagar(false);
    this.lista.set(false);
    this.aviso.set(null);
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.trasera ? 'environment' : 'user', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: this.puedeGrabar
      });
    } catch (e) {
      // Sin micrófono (o sin permiso para él) se puede seguir haciendo fotos y vídeo mudo.
      try {
        this.flujo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: this.trasera ? 'environment' : 'user' } });
      } catch (e2) {
        const nombre = (e2 as DOMException)?.name ?? (e as DOMException)?.name;
        this.aviso.set(
          nombre === 'NotAllowedError' ? 'No hay permiso para usar la cámara. Permítelo en el candado de la barra de direcciones.'
          : nombre === 'NotFoundError' ? 'No se ha encontrado ninguna cámara en este equipo.'
          : 'No se ha podido abrir la cámara.'
        );
        return;
      }
    }
    // El <video> aparece al abrir el diálogo: se espera a que esté en la página.
    for (let i = 0; i < 20 && !this.visor(); i++) await new Promise(r => setTimeout(r, 25));
    const video = this.visor()?.nativeElement;
    if (video) {
      video.srcObject = this.flujo;
      video.onloadedmetadata = () => this.lista.set(true);
    }
  }

  private apagar(pararGrabacion = true) {
    if (pararGrabacion && this.grabando()) this.pararVideo();
    this.flujo?.getTracks().forEach(t => t.stop());
    this.flujo = null;
  }

  private marca() {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
}
