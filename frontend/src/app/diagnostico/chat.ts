import { DecimalPipe } from '@angular/common';
import { Component, ElementRef, inject, input, numberAttribute, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { enviarAlAsistente } from '../core/asistente-stream';
import { firstValueFrom } from 'rxjs';
import { DocumentoTecnico, EstadoAsistente, HerramientaUsada, SesionAsistente } from '../core/models';
import { MarkdownPipe } from '../shared/markdown';
import { NumOrdenPipe } from '../shared/pipes';

const NOMBRES_HERRAMIENTA: Record<string, string> = {
  buscar_casos_similares: 'Casos similares en el taller',
  consultar_codigo: 'Código de avería',
  consultar_valores_referencia: 'Valores de referencia',
  listar_documentacion: 'Documentación del vehículo',
  ver_documento: 'Abre documento'
};

/** Resume la entrada de una herramienta para mostrarla: "P0401" o "tirones, EGR". */
function resumenEntrada(h: HerramientaUsada): string {
  try {
    const e = JSON.parse(h.entrada);
    if (e.codigo) {
      return e.codigo;
    }
    if (e.texto) {
      return e.texto;
    }
    if (e.id) {
      return '#' + e.id;
    }
    return [...(e.palabras_clave ?? []), ...(e.codigos ?? [])].join(', ');
  } catch {
    return '';
  }
}

@Component({
  selector: 'app-asistente-chat',
  imports: [FormsModule, RouterLink, DecimalPipe, MarkdownPipe, NumOrdenPipe],
  template: `
    @if (sesion(); as s) {
      <div class="toolbar" style="justify-content: space-between">
        <div class="toolbar" style="margin: 0">
          <a class="btn" routerLink="/gestion/diagnostico/asistente">← Consultas</a>
          @if (s.ordenId) {
            <a class="btn" [routerLink]="['/gestion/ordenes', s.ordenId]">Ver {{ s.ordenId | numOrden }}</a>
          }
        </div>
        <div class="toolbar" style="margin: 0">
          <span class="hint">{{ (s.tokensEntrada + s.tokensSalida) | number: '1.0-0' }} tokens usados</span>
          <button type="button" class="btn small danger" (click)="eliminar(s.id)">Eliminar consulta</button>
        </div>
      </div>

      @if (s.ordenId) {
        <div class="contexto">
          Consulta sobre <strong>{{ s.ordenId | numOrden }}</strong>{{ s.vehiculo ? ' · ' + s.vehiculo : '' }}.
          El asistente ve la ficha de diagnosis de la orden y puede consultar el historial del taller. Si cambias la ficha,
          se le envía actualizada con tu siguiente mensaje.
        </div>
      }

      @if (estado()?.configurado === false) {
        <div class="aviso">El asistente no está configurado: falta la clave de la API de Anthropic. Mira las instrucciones en la lista de consultas.</div>
      }

      <div class="conversacion" #conversacion (click)="enlace($event)">
        @for (m of s.mensajes; track $index) {
          @if (m.rol === 'user') {
            <div class="mensaje usuario">
              @if (m.fichaEnviada) {
                <div class="ficha-enviada">Ficha de la orden enviada</div>
              }
              @for (a of m.adjuntos ?? []; track $index) {
                <div class="ficha-enviada">📎 {{ a }}</div>
              }
              <div class="burbuja">{{ m.texto }}</div>
            </div>
          } @else {
            <div class="mensaje asistente">
              @if (m.herramientas.length) {
                <div class="herramientas">
                  @for (h of m.herramientas; track $index) {
                    <span class="chip">🔎 {{ nombre(h.nombre) }}{{ resumen(h) ? ': ' + resumen(h) : '' }}</span>
                  }
                </div>
              }
              @if (m.razonamiento) {
                <details class="razonamiento"><summary>Razonamiento</summary><div [innerHTML]="m.razonamiento | markdown"></div></details>
              }
              <div class="respuesta" [innerHTML]="m.texto | markdown"></div>
            </div>
          }
        }

        @if (enviando()) {
          <div class="mensaje usuario"><div class="burbuja">{{ pendiente() }}</div></div>
          <div class="mensaje asistente">
            @if (herramientasEnCurso().length) {
              <div class="herramientas">
                @for (h of herramientasEnCurso(); track $index) {
                  <span class="chip">🔎 {{ h }}</span>
                }
              </div>
            }
            @if (pensando() && !respuesta()) {
              <details class="razonamiento" open><summary>Pensando…</summary><div [innerHTML]="pensando() | markdown"></div></details>
            }
            @if (respuesta()) {
              <div class="respuesta" [innerHTML]="respuesta() | markdown"></div>
            } @else if (!pensando()) {
              <div class="escribiendo"><span></span><span></span><span></span></div>
            }
          </div>
        }

        @if (!s.mensajes.length && !enviando()) {
          <div class="vacio">
            <p>Describe la avería o pregunta directamente. Algunas ideas:</p>
            <div class="sugerencias">
              @for (sug of sugerencias(s.ordenId); track sug) {
                <button type="button" class="btn small" (click)="texto = sug; enviar()">{{ sug }}</button>
              }
            </div>
          </div>
        }
      </div>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
      @if (aviso()) {
        <div class="aviso">{{ aviso() }}</div>
      }

      @if (adjuntos().length) {
        <div class="adjuntos">
          @for (d of adjuntos(); track d.id) {
            <span class="chip">📎 {{ d.titulo }} <button type="button" (click)="quitarAdjunto(d.id)" aria-label="Quitar adjunto">×</button></span>
          }
        </div>
      }
      @if (panelDocs()) {
        <div class="panel-docs card">
          <div class="toolbar" style="margin-bottom: 0.5rem">
            <strong>Adjuntar documentación</strong>
            <input type="search" placeholder="Buscar en la biblioteca…" (input)="buscarDocs($any($event.target).value)" />
            <button type="button" class="btn small" style="margin-left: auto" (click)="panelDocs.set(false)">Cerrar</button>
          </div>
          @for (d of docs(); track d.id) {
            <div class="doc-opcion">
              <span>{{ d.tipoContenido === 'application/pdf' ? '📄' : '🖼️' }} {{ d.titulo }} <span class="hint">{{ [d.marca, d.modelo, d.motor].filter(x => !!x).join(' ') }} · {{ (d.tamano / 1024 / 1024).toFixed(1) }} MB</span></span>
              <button type="button" class="btn small" [disabled]="estaAdjunto(d.id)" (click)="adjuntar(d)">{{ estaAdjunto(d.id) ? 'Adjuntado' : 'Adjuntar' }}</button>
            </div>
          } @empty {
            <p class="hint">No hay documentos{{ s.ordenId ? ' para este vehículo' : '' }}. Busca en la biblioteca o súbelos en Diagnóstico → Documentación.</p>
          }
          <p class="hint" style="margin-bottom: 0">Los documentos grandes encarecen la consulta: mejor adjuntar solo el esquema o las páginas que interesen.</p>
        </div>
      }

      <form class="entrada" (ngSubmit)="enviar()">
        <textarea name="texto" [(ngModel)]="texto" rows="3" [disabled]="enviando()"
          placeholder="Síntomas, cuándo ocurre, qué has comprobado… (Ctrl+Intro para enviar)"
          (keydown.control.enter)="enviar()"></textarea>
        <button type="button" class="btn" (click)="abrirDocs()" [disabled]="enviando()" title="Adjuntar documentación" aria-label="Adjuntar documentación">📎</button>
        @if (enviando()) {
          <button type="button" class="btn" (click)="detener()">Detener</button>
        } @else {
          <button type="submit" class="btn primary" [disabled]="!texto.trim()">Enviar</button>
        }
      </form>
      <p class="hint">Las respuestas son orientativas: comprueba siempre antes de sustituir piezas. Los datos de la ficha y del historial se envían a Anthropic para generar la respuesta; nunca los datos del cliente.</p>
    } @else if (error()) {
      <div class="error">{{ error() }}</div>
    } @else {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    .contexto { background: var(--primary-tint); border: 1px solid rgba(198, 255, 0, 0.3); border-radius: var(--radius); padding: 0.6rem 0.9rem; margin-bottom: 1rem; font-size: 0.9rem; }
    .conversacion { display: flex; flex-direction: column; gap: 1rem; margin-bottom: 1rem; }
    .mensaje { display: flex; flex-direction: column; max-width: 92%; }
    .usuario { align-self: flex-end; align-items: flex-end; }
    .asistente { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 0.9rem 1.1rem; width: 92%; }
    .burbuja { background: var(--primary); color: var(--on-primary); border-radius: var(--radius); padding: 0.6rem 0.9rem; white-space: pre-wrap; }
    .ficha-enviada { font-size: 0.75rem; color: var(--muted); margin-bottom: 0.25rem; }
    .respuesta { line-height: 1.55; }
    .respuesta :is(p, ul, ol) { margin: 0 0 0.6rem; }
    .respuesta :is(h3, h4, h5, h6) { margin: 0.8rem 0 0.4rem; color: var(--primary); font-size: 1rem; }
    .respuesta ::ng-deep .dominio { color: var(--muted); font-size: 0.8rem; }
    .respuesta code { background: var(--surface-2); padding: 0 0.3rem; border-radius: 4px; }
    .herramientas { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.6rem; }
    .chip { font-size: 0.8rem; background: var(--warning-tint); border: 1px solid rgba(255, 176, 32, 0.4); color: var(--warning); border-radius: var(--radius); padding: 0.15rem 0.6rem; }
    .razonamiento { margin-bottom: 0.6rem; font-size: 0.88rem; color: var(--muted); }
    .razonamiento summary { cursor: pointer; }
    .razonamiento > div { border-left: 3px solid var(--border); padding-left: 0.75rem; margin-top: 0.4rem; }
    .vacio { text-align: center; color: var(--muted); padding: 1.5rem 0; }
    .sugerencias { display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: center; }
    .adjuntos { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 0.4rem; }
    .adjuntos button { border: 0; background: none; cursor: pointer; color: inherit; }
    .panel-docs { margin-bottom: 0.6rem; }
    .doc-opcion { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; padding: 0.3rem 0; border-top: 1px solid var(--border); }
    .entrada { display: flex; gap: 0.6rem; align-items: flex-end; position: sticky; bottom: 0; background: var(--bg); padding: 0.5rem 0; }
    .entrada textarea { flex: 1; resize: vertical; }
    .escribiendo { display: flex; gap: 4px; padding: 0.3rem 0; }
    .escribiendo span { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: punto 1.2s infinite ease-in-out; }
    .escribiendo span:nth-child(2) { animation-delay: 0.2s; }
    .escribiendo span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes punto { 0%, 80%, 100% { opacity: 0.2; } 40% { opacity: 1; } }
  `
})
export class AsistenteChat implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly sesion = signal<SesionAsistente | null>(null);
  protected readonly estado = signal<EstadoAsistente | null>(null);
  protected readonly enviando = signal(false);
  protected readonly pendiente = signal('');
  protected readonly respuesta = signal('');
  protected readonly pensando = signal('');
  protected readonly herramientasEnCurso = signal<string[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly aviso = signal<string | null>(null);
  protected texto = '';
  protected readonly adjuntos = signal<DocumentoTecnico[]>([]);
  protected readonly panelDocs = signal(false);
  protected readonly docs = signal<DocumentoTecnico[]>([]);
  private docsVehiculo: DocumentoTecnico[] = [];
  private temporizadorDocs?: ReturnType<typeof setTimeout>;

  private readonly conversacion = viewChild<ElementRef<HTMLElement>>('conversacion');
  private cancelar?: AbortController;

  ngOnInit() {
    this.api.estadoAsistente().subscribe(e => this.estado.set(e));
    this.cargar();
  }

  ngOnDestroy() {
    this.cancelar?.abort();
  }

  protected nombre(n: string) {
    return NOMBRES_HERRAMIENTA[n] ?? n;
  }

  protected resumen(h: HerramientaUsada) {
    return resumenEntrada(h);
  }

  protected sugerencias(ordenId: number | null): string[] {
    return ordenId
      ? [
          '¿Qué causas ves más probables y qué compruebo primero?',
          '¿Hemos tenido casos parecidos en el taller?',
          '¿Qué valores debería esperar en las mediciones de la ficha?'
        ]
      : ['Golf 1.9 TDI con P0401 y pérdida de potencia: ¿por dónde empiezo?', 'Tractor que no arranca en frío y echa humo blanco'];
  }

  protected async enviar() {
    const texto = this.texto.trim();
    const s = this.sesion();
    if (!texto || !s || this.enviando()) {
      return;
    }

    this.error.set(null);
    this.aviso.set(null);
    this.pendiente.set(texto);
    this.respuesta.set('');
    this.pensando.set('');
    this.herramientasEnCurso.set([]);
    this.enviando.set(true);
    this.texto = '';
    this.cancelar = new AbortController();
    this.bajar();

    let fallo = false;
    try {
      await enviarAlAsistente(s.id, texto, this.adjuntos().map(d => d.id), e => {
        switch (e.tipo) {
          case 'texto':
            this.respuesta.update(r => r + (e.texto ?? ''));
            this.bajar();
            break;
          case 'pensando':
            this.pensando.update(p => p + (e.texto ?? ''));
            break;
          case 'herramienta':
            this.herramientasEnCurso.update(h => [...h, this.nombre(e.nombre ?? '')]);
            break;
          case 'resultado':
            this.herramientasEnCurso.update(h => [...h.slice(0, -1), `${this.nombre(e.nombre ?? '')}: ${e.texto}`]);
            // Tras consultar, el asistente sigue escribiendo en un bloque nuevo.
            this.respuesta.update(r => (r ? r + '\n\n' : r));
            break;
          case 'aviso':
            this.aviso.set(e.texto ?? null);
            break;
          case 'error':
            fallo = true;
            this.error.set(e.texto ?? 'Error del asistente.');
            break;
        }
      }, this.cancelar.signal);
    } catch (e) {
      fallo = true;
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        this.error.set(e instanceof Error ? e.message : String(e));
      }
    }

    // Si el turno no se completó no se ha guardado: se devuelve el texto para reintentarlo.
    if (fallo) {
      this.texto = texto;
    } else {
      this.adjuntos.set([]);
      this.panelDocs.set(false);
    }
    this.enviando.set(false);
    this.cargar();
  }

  /** Abre el panel con la documentación del vehículo de la orden (o la biblioteca si la consulta no tiene orden). */
  protected async abrirDocs() {
    this.panelDocs.set(true);
    const ordenId = this.sesion()?.ordenId;
    if (ordenId) {
      const orden = await firstValueFrom(this.api.orden(ordenId));
      this.docsVehiculo = (await firstValueFrom(this.api.documentacionVehiculo(orden.vehiculo.id))).documentos;
      this.docs.set(this.docsVehiculo);
    } else {
      this.docs.set(await firstValueFrom(this.api.documentos()));
    }
  }

  protected buscarDocs(q: string) {
    clearTimeout(this.temporizadorDocs);
    this.temporizadorDocs = setTimeout(async () => {
      this.docs.set(q.trim() ? await firstValueFrom(this.api.documentos(q)) : this.docsVehiculo);
    }, 250);
  }

  protected adjuntar(d: DocumentoTecnico) {
    this.adjuntos.update(a => [...a, d]);
  }

  protected quitarAdjunto(id: number) {
    this.adjuntos.update(a => a.filter(d => d.id !== id));
  }

  protected estaAdjunto(id: number) {
    return this.adjuntos().some(d => d.id === id);
  }

  protected detener() {
    this.cancelar?.abort();
  }

  protected eliminar(id: number) {
    if (confirm('¿Eliminar esta consulta y toda su conversación?')) {
      this.api.eliminarSesionAsistente(id).subscribe(() => this.router.navigate(['/gestion/diagnostico/asistente']));
    }
  }

  /** Los enlaces a órdenes dentro de las respuestas navegan sin recargar la página. */
  protected enlace(e: MouseEvent) {
    const a = (e.target as HTMLElement).closest('a');
    const href = a?.getAttribute('href');
    if (href?.startsWith('/gestion/')) {
      e.preventDefault();
      this.router.navigateByUrl(href);
    }
  }

  private cargar() {
    this.api.sesionAsistente(this.id()).subscribe({
      next: s => {
        this.sesion.set(s);
        this.bajar();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  private bajar() {
    setTimeout(() => {
      const el = this.conversacion()?.nativeElement;
      el?.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    });
  }
}
