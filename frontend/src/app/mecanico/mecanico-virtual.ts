import { DatePipe, Location } from '@angular/common';
import { Component, ElementRef, inject, input, numberAttribute, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, mensajeError } from '../core/api';
import { ConversacionMecanico, EventoMecanico, MensajeMecanico } from '../core/models';
import { postEventos } from '../core/sse';
import { MarkdownPipe } from '../shared/markdown';

/** Gestión → Mecánico virtual: chat con Gemini (modelo económico) para dudas de taller. */
@Component({
  selector: 'app-mecanico-virtual',
  imports: [FormsModule, DatePipe, MarkdownPipe],
  template: `
    <div class="page-header">
      <div>
        <h1>Mecánico virtual</h1>
        <div class="subtitle">Dudas de mecánica, electricidad, averías y procedimientos{{ modelo() ? ' · ' + modelo() : '' }}</div>
      </div>
      <button type="button" class="btn primary" (click)="nueva()" [disabled]="!configurado()">+ Nueva conversación</button>
    </div>

    @if (!configurado()) {
      <div class="card"><p class="hint" style="margin: 0">El mecánico virtual no está configurado: falta la clave de Gemini (<span class="mono">Gemini:ApiKey</span>).</p></div>
    } @else {
      <div class="cuerpo">
        <aside class="card lista">
          @for (c of conversaciones(); track c.id) {
            <div class="item" [class.activa]="c.id === actual()">
              <a [href]="'/gestion/mecanico/' + c.id" (click)="$event.preventDefault(); abrir(c.id)">
                <span class="titulo">@if (c.ordenId) {<span class="chip-orden">Orden</span> }{{ c.titulo }}</span>
                <span class="hint">{{ c.actualizada | date: 'dd/MM/yy HH:mm' }}</span>
              </a>
              <button type="button" class="borrar" (click)="eliminar(c)" aria-label="Eliminar conversación">×</button>
            </div>
          } @empty {
            <p class="hint" style="margin: 0">Sin conversaciones todavía.</p>
          }
        </aside>

        <section class="card chat">
          @if (error()) {
            <div class="error">{{ error() }}</div>
          }
          <div class="mensajes" #mensajesEl>
            @for (m of mensajes(); track m.id) {
              @if (m.esUsuario) {
                <div class="usuario"><div class="burbuja">{{ m.texto }}</div></div>
              } @else {
                <div class="modelo respuesta" [innerHTML]="m.texto | markdown"></div>
              }
            }
            @if (pendiente(); as p) {
              <div class="usuario"><div class="burbuja">{{ p }}</div></div>
              <div class="modelo respuesta">
                @if (respuesta()) {
                  <div [innerHTML]="respuesta() | markdown"></div>
                } @else {
                  <span class="hint">Pensando…</span>
                }
              </div>
            }
            @if (!mensajes().length && !pendiente()) {
              <div class="vacio">
                <p>Pregunta lo que necesites. Por ejemplo:</p>
                @for (e of ejemplos; track e) {
                  <button type="button" class="btn small ejemplo" (click)="texto = e">{{ e }}</button>
                }
              </div>
            }
          </div>
          <form class="escribir" (ngSubmit)="enviar()">
            <textarea name="texto" [(ngModel)]="texto" rows="3" placeholder="Describe la avería o la duda (marca, modelo, motor, síntomas…)"
              (keydown.enter)="intro($event)" [disabled]="!!pendiente()"></textarea>
            <div class="acciones">
              <span class="hint">Intro para enviar · Mayús+Intro para nueva línea. Revisa siempre los valores con la documentación del fabricante.</span>
              @if (pendiente()) {
                <button type="button" class="btn" (click)="parar()">Parar</button>
              } @else {
                <button type="submit" class="btn primary" [disabled]="!texto.trim()">Enviar</button>
              }
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styles: `
    .cuerpo { display: grid; grid-template-columns: minmax(220px, 290px) 1fr; gap: 1rem; align-items: start; }
    @media (max-width: 860px) { .cuerpo { grid-template-columns: 1fr; } .lista { max-height: 200px; } }
    .lista { max-height: 72vh; overflow: auto; padding: 0.5rem; }
    .item { display: flex; align-items: center; border-radius: var(--radius); }
    .item.activa, .item:hover { background: var(--bg); }
    .item a { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 0.45rem 0.55rem; color: inherit; text-decoration: none; }
    .item .titulo { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 0.92rem; }
    .chip-orden { font-size: 0.7rem; background: var(--primary-tint); color: var(--primary); border: 1px solid rgba(198, 255, 0, 0.3); border-radius: var(--radius); padding: 0 0.4rem; margin-right: 0.25rem; }
    .borrar { border: 0; background: none; color: var(--muted); font-size: 1.1rem; cursor: pointer; padding: 0 0.5rem; }
    .borrar:hover { color: var(--danger); }
    .chat { display: flex; flex-direction: column; min-height: 60vh; }
    .mensajes { flex: 1; display: flex; flex-direction: column; gap: 0.9rem; max-height: 62vh; overflow: auto; padding-bottom: 0.5rem; }
    .usuario { align-self: flex-end; max-width: 85%; }
    .burbuja { background: var(--primary); color: var(--on-primary); border-radius: var(--radius); padding: 0.6rem 0.9rem; white-space: pre-wrap; }
    .modelo { align-self: flex-start; max-width: 95%; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.8rem 1rem; }
    .respuesta { line-height: 1.55; }
    .respuesta ::ng-deep :is(p, ul, ol) { margin: 0 0 0.6rem; }
    .respuesta ::ng-deep :is(p, ul, ol):last-child { margin-bottom: 0; }
    .respuesta ::ng-deep :is(h3, h4, h5, h6) { margin: 0.8rem 0 0.4rem; color: var(--primary); font-size: 1rem; }
    .respuesta ::ng-deep code { background: var(--surface-2); padding: 0 0.3rem; border-radius: 4px; }
    .respuesta ::ng-deep .dominio { color: var(--muted); font-size: 0.8rem; }
    .vacio { text-align: center; color: var(--muted); padding: 1.5rem 0; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; }
    .ejemplo { white-space: normal; text-align: left; }
    .escribir { border-top: 1px solid var(--border); padding-top: 0.75rem; margin-top: 0.5rem; }
    .escribir textarea { width: 100%; resize: vertical; }
    .acciones { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; margin-top: 0.4rem; flex-wrap: wrap; }
  `
})
export class MecanicoVirtual implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly location = inject(Location);
  /** Parámetro de ruta :id: conversación con la que se abre la página. */
  readonly id = input(undefined, { transform: numberAttribute });
  /**
   * Conversación abierta. Se gestiona aquí (y solo se actualiza la dirección) para no recrear la página a mitad de
   * una respuesta al pasar de /gestion/mecanico a /gestion/mecanico/:id.
   */
  protected readonly actual = signal<number | null>(null);

  private readonly mensajesEl = viewChild<ElementRef<HTMLElement>>('mensajesEl');
  protected readonly configurado = signal(true);
  protected readonly modelo = signal('');
  protected readonly conversaciones = signal<ConversacionMecanico[]>([]);
  protected readonly mensajes = signal<MensajeMecanico[]>([]);
  protected readonly pendiente = signal<string | null>(null);
  protected readonly respuesta = signal('');
  protected readonly error = signal<string | null>(null);
  protected texto = '';
  protected readonly ejemplos = [
    'Golf V 1.9 TDI BKC: tirones al acelerar entre 1.500 y 2.000 rpm, sin códigos. ¿Por dónde empiezo?',
    '¿Cómo compruebo un sensor de presión de rail con el multímetro?',
    'Tractor John Deere 6420: el elevador hidráulico baja solo. Causas probables.'
  ];
  private cancelar?: AbortController;

  ngOnInit() {
    this.api.estadoMecanico().subscribe({
      next: e => {
        this.configurado.set(e.configurado);
        this.modelo.set(e.modelo);
      },
      error: () => {}
    });
    this.cargarLista();
    const id = this.id();
    if (id) this.abrir(id);
  }

  protected abrir(id: number) {
    if (this.pendiente()) return;
    this.actual.set(id);
    this.mensajes.set([]);
    this.error.set(null);
    this.location.replaceState('/gestion/mecanico/' + id);
    this.cargar(id);
  }

  ngOnDestroy() {
    this.cancelar?.abort();
  }

  protected nueva() {
    this.api.crearConversacionMecanico().subscribe({
      next: c => {
        this.conversaciones.update(l => [c, ...l]);
        this.actual.set(c.id);
        this.mensajes.set([]);
        this.location.replaceState('/gestion/mecanico/' + c.id);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminar(c: ConversacionMecanico) {
    if (!confirm(`¿Eliminar la conversación «${c.titulo}»?`)) return;
    this.api.eliminarConversacionMecanico(c.id).subscribe({
      next: () => {
        this.conversaciones.update(l => l.filter(x => x.id !== c.id));
        if (c.id === this.actual()) {
          this.actual.set(null);
          this.mensajes.set([]);
          this.location.replaceState('/gestion/mecanico');
        }
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected intro(e: Event) {
    const k = e as KeyboardEvent;
    if (!k.shiftKey) {
      k.preventDefault();
      this.enviar();
    }
  }

  /** Si no hay conversación abierta, se crea una y se envía en ella. */
  protected async enviar() {
    const texto = this.texto.trim();
    if (!texto || this.pendiente()) return;
    let id = this.actual();
    if (!id) {
      try {
        const c = await new Promise<ConversacionMecanico>((ok, ko) => this.api.crearConversacionMecanico().subscribe({ next: ok, error: ko }));
        this.conversaciones.update(l => [c, ...l]);
        id = c.id;
        this.actual.set(id);
        this.location.replaceState('/gestion/mecanico/' + id);
      } catch (e) {
        this.error.set(mensajeError(e));
        return;
      }
    }

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
          this.conversaciones.update(l => {
            const c = l.find(x => x.id === id);
            return c ? [{ ...c, titulo: e.texto ?? c.titulo, actualizada: ahora }, ...l.filter(x => x.id !== id)] : l;
          });
        }
      }, this.cancelar.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') this.error.set((e as Error).message);
    } finally {
      // Si no ha terminado bien, lo escrito vuelve al cuadro para no perderlo.
      if (!terminado) this.texto = texto;
      this.pendiente.set(null);
      this.respuesta.set('');
      this.bajar();
    }
  }

  protected parar() {
    this.cancelar?.abort();
  }

  private cargar(id: number) {
    this.api.conversacionMecanico(id).subscribe({
      next: c => {
        if (this.actual() !== id) return;
        this.mensajes.set(c.mensajes);
        this.bajar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  private cargarLista() {
    this.api.conversacionesMecanico().subscribe({ next: l => this.conversaciones.set(l), error: () => {} });
  }

  private bajar() {
    setTimeout(() => {
      const el = this.mensajesEl()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
