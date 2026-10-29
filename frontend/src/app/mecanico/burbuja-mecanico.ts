import { Component, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { EventoMecanico, MensajeMecanico } from '../core/models';
import { postEventos } from '../core/sse';
import { MarkdownPipe } from '../shared/markdown';

/**
 * Burbuja flotante del mecánico virtual dentro de una orden. La conversación queda ligada a la orden y el servidor
 * añade en cada pregunta los datos actuales de la orden, el vehículo y la ficha de diagnosis (sin datos del cliente).
 */
@Component({
  selector: 'app-burbuja-mecanico',
  imports: [FormsModule, RouterLink, MarkdownPipe],
  template: `
    @if (configurado()) {
      @if (!abierta()) {
        <button type="button" class="burbuja" (click)="abrir()" aria-label="Abrir el mecánico virtual">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-4 4v-4H4z" /><path d="M14.5 8.5a2 2 0 1 0-2.7 2.7l-2.3 2.3 1 1 2.3-2.3a2 2 0 0 0 2.7-2.7l-1.1 1.1-1-1z" /></svg>
          <span>Mecánico virtual</span>
        </button>
      } @else {
        <section class="panel" role="dialog" aria-label="Mecánico virtual">
          <header>
            <div>
              <strong>Mecánico virtual</strong>
              <div class="sub">{{ titulo() }}</div>
            </div>
            <div class="acciones-cabecera">
              <button type="button" title="Nueva conversación para esta orden" (click)="nueva()" [disabled]="!!pendiente()">＋</button>
              @if (conversacionId(); as id) {
                <a [routerLink]="['/gestion/mecanico', id]" title="Abrir en pantalla completa">⤢</a>
              }
              <button type="button" title="Cerrar" (click)="abierta.set(false)">×</button>
            </div>
          </header>

          <div class="mensajes" #mensajesEl>
            <p class="contexto">Conoce los datos del vehículo, de esta orden y de su ficha de diagnosis.</p>
            @for (m of mensajes(); track m.id) {
              @if (m.esUsuario) {
                <div class="yo">{{ m.texto }}</div>
              } @else {
                <div class="el respuesta" [innerHTML]="m.texto | markdown"></div>
              }
            }
            @if (pendiente(); as p) {
              <div class="yo">{{ p }}</div>
              <div class="el respuesta">
                @if (respuesta()) {
                  <div [innerHTML]="respuesta() | markdown"></div>
                } @else {
                  <span class="hint">Pensando…</span>
                }
              </div>
            }
            @if (!mensajes().length && !pendiente() && !cargando()) {
              <div class="sugerencias">
                @for (s of sugerencias; track s) {
                  <button type="button" (click)="enviar(s)">{{ s }}</button>
                }
              </div>
            }
          </div>

          @if (error()) {
            <div class="error">{{ error() }}</div>
          }
          <form (ngSubmit)="enviar()">
            <textarea name="texto" [(ngModel)]="texto" rows="2" placeholder="Pregunta sobre este vehículo…"
              (keydown.enter)="intro($event)" [disabled]="!!pendiente() || cargando()"></textarea>
            @if (pendiente()) {
              <button type="button" class="btn small" (click)="cancelar?.abort()">Parar</button>
            } @else {
              <button type="submit" class="btn small primary" [disabled]="!texto.trim() || cargando()">Enviar</button>
            }
          </form>
        </section>
      }
    }
  `,
  styles: `
    :host { position: fixed; right: 1.25rem; bottom: 1.25rem; z-index: 90; }
    .burbuja { display: flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.1rem; border: 0; border-radius: var(--radius); background: var(--primary); color: var(--on-primary); font: inherit; font-weight: 600; cursor: pointer; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6); }
    .burbuja:hover { background: var(--primary-hover); }
    .burbuja svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
    .panel { width: min(420px, calc(100vw - 2rem)); height: min(620px, calc(100vh - 2.5rem)); display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); overflow: hidden; }
    header { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.65rem 0.8rem; background: var(--primary); color: var(--on-primary); }
    header .sub { font-size: 0.78rem; opacity: 0.85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px; }
    .acciones-cabecera { display: flex; gap: 0.15rem; }
    .acciones-cabecera :is(button, a) { width: 30px; height: 30px; display: grid; place-items: center; border: 0; border-radius: var(--radius); background: transparent; color: #fff; font-size: 1.1rem; cursor: pointer; text-decoration: none; }
    .acciones-cabecera :is(button, a):hover { background: rgba(255, 255, 255, 0.15); }
    .mensajes { flex: 1; overflow: auto; padding: 0.8rem; display: flex; flex-direction: column; gap: 0.7rem; background: var(--bg); }
    .contexto { margin: 0; font-size: 0.78rem; color: var(--muted); text-align: center; }
    .yo { align-self: flex-end; max-width: 88%; background: var(--primary); color: var(--on-primary); border-radius: var(--radius); padding: 0.5rem 0.75rem; white-space: pre-wrap; font-size: 0.92rem; }
    .el { align-self: flex-start; max-width: 96%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.6rem 0.8rem; font-size: 0.92rem; }
    .respuesta { line-height: 1.5; }
    .respuesta ::ng-deep :is(p, ul, ol) { margin: 0 0 0.5rem; }
    .respuesta ::ng-deep :is(p, ul, ol):last-child { margin-bottom: 0; }
    .respuesta ::ng-deep :is(h3, h4, h5, h6) { margin: 0.6rem 0 0.3rem; color: var(--primary); font-size: 0.95rem; }
    .respuesta ::ng-deep code { background: var(--surface-2); padding: 0 0.25rem; border-radius: 4px; }
    .sugerencias { display: flex; flex-direction: column; gap: 0.4rem; }
    .sugerencias button { text-align: left; padding: 0.5rem 0.7rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font: inherit; font-size: 0.88rem; cursor: pointer; }
    .sugerencias button:hover { border-color: var(--primary); }
    .error { margin: 0.4rem 0.8rem 0; }
    form { display: flex; gap: 0.5rem; align-items: flex-end; padding: 0.6rem 0.8rem; border-top: 1px solid var(--border); }
    textarea { flex: 1; resize: none; font-size: 0.92rem; }
    @media (max-width: 600px) {
      :host { right: 0.75rem; bottom: 0.75rem; }
      .panel { position: fixed; inset: 0; width: 100vw; height: 100dvh; border-radius: 0; }
    }
  `
})
export class BurbujaMecanico implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  readonly ordenId = input.required<number>();

  private readonly mensajesEl = viewChild<ElementRef<HTMLElement>>('mensajesEl');
  protected readonly configurado = signal(false);
  protected readonly abierta = signal(false);
  protected readonly cargando = signal(false);
  protected readonly conversacionId = signal<number | null>(null);
  protected readonly titulo = signal('');
  protected readonly mensajes = signal<MensajeMecanico[]>([]);
  protected readonly pendiente = signal<string | null>(null);
  protected readonly respuesta = signal('');
  protected readonly error = signal<string | null>(null);
  protected texto = '';
  protected cancelar?: AbortController;
  protected readonly sugerencias = [
    '¿Qué compruebo primero con lo que hay en la orden?',
    'Explícame los códigos de avería de la ficha y por dónde empezar.',
    'Pasos para la reparación y precauciones en este vehículo.'
  ];

  ngOnInit() {
    this.api.estadoMecanico().subscribe({ next: e => this.configurado.set(e.configurado), error: () => {} });
  }

  ngOnDestroy() {
    this.cancelar?.abort();
  }

  protected abrir() {
    this.abierta.set(true);
    if (this.conversacionId() === null) this.cargar(false);
    else this.bajar();
  }

  protected nueva() {
    if (this.mensajes().length && !confirm('¿Empezar una conversación nueva para esta orden? La actual se queda en «Mecánico virtual».')) return;
    this.cargar(true);
  }

  protected intro(e: Event) {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      this.enviar();
    }
  }

  protected async enviar(sugerencia?: string) {
    const texto = (sugerencia ?? this.texto).trim();
    const id = this.conversacionId();
    if (!texto || !id || this.pendiente()) return;
    this.texto = '';
    this.error.set(null);
    this.pendiente.set(texto);
    this.respuesta.set('');
    this.cancelar = new AbortController();
    this.bajar();
    let terminado = false;
    try {
      await postEventos<EventoMecanico>(`/api/mecanico/conversaciones/${id}/mensajes`, { texto }, e => {
        if (e.tipo === 'texto') {
          this.respuesta.update(r => r + (e.texto ?? ''));
          this.bajar();
        } else if (e.tipo === 'error') {
          this.error.set(e.texto ?? 'Error del mecánico virtual.');
        } else if (e.tipo === 'fin') {
          terminado = true;
          const ahora = new Date().toISOString();
          this.mensajes.update(l => [...l, { id: -Date.now(), esUsuario: true, texto, fecha: ahora }, { id: e.id ?? -Date.now() - 1, esUsuario: false, texto: this.respuesta(), fecha: ahora }]);
        }
      }, this.cancelar.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.error.set((e as Error).message);
    } finally {
      if (!terminado) this.texto = texto;
      this.pendiente.set(null);
      this.respuesta.set('');
      this.bajar();
    }
  }

  private cargar(nueva: boolean) {
    this.cargando.set(true);
    this.error.set(null);
    this.api.conversacionMecanicoDeOrden(this.ordenId(), nueva).subscribe({
      next: c => {
        this.cargando.set(false);
        this.conversacionId.set(c.id);
        this.titulo.set(c.titulo);
        this.mensajes.set(c.mensajes);
        this.bajar();
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  private bajar() {
    setTimeout(() => {
      const el = this.mensajesEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
