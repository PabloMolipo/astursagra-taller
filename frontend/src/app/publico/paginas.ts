import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../core/api';
import { opciones, TIPOS_SERVICIO } from '../core/etiquetas';
import { InicioPublico, Servicio, TipoServicio, TrabajoDetalle, TrabajoListItem } from '../core/models';
import { EtiquetaPipe } from '../shared/pipes';
import { DatosPublicos } from './datos-publicos';
import { IconoServicio } from './icono-servicio';

const ICONO_WHATSAPP = 'M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.6z M9 8.5c0 3.5 3 6.5 6.5 6.5l1-1.6-2-1-1 .9a5 5 0 0 1-2.8-2.8l.9-1-1-2z';
const ICONO_TELEFONO = 'M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2';

/** Tarjeta de un trabajo realizado (portada y listado). */
@Component({
  selector: 'app-tarjeta-trabajo',
  imports: [RouterLink, DatePipe],
  template: `
    @let t = trabajo();
    <a class="pub-trabajo" [routerLink]="['/trabajos', t.slug]">
      <div class="foto">
        @if (t.portada && t.portadaEsVideo) {
          <video [src]="t.portada + '#t=0.5'" muted playsinline preload="metadata" [attr.aria-label]="t.titulo"></video>
          <span class="insignia-video" aria-hidden="true">▶</span>
        } @else if (t.portada) {
          <img [src]="t.portada" [alt]="t.titulo" loading="lazy" />
          @if (t.numVideos) {
            <span class="insignia-video" aria-hidden="true">▶</span>
          }
        } @else {
          <img class="sin-foto" src="brand/astursagra-simbolo-lima.svg" alt="" />
        }
      </div>
      <div class="cuerpo">
        <span class="meta">{{ t.fecha | date: 'MMMM yyyy' }}{{ t.vehiculo ? ' · ' + t.vehiculo : '' }}</span>
        <h3>{{ t.titulo }}</h3>
        <p>{{ t.resumen }}</p>
      </div>
    </a>
  `,
  host: { style: 'display: contents' }
})
export class TarjetaTrabajo {
  readonly trabajo = input.required<TrabajoListItem>();
}

@Component({
  selector: 'app-inicio',
  imports: [RouterLink, IconoServicio, TarjetaTrabajo],
  template: `
    @let d = datos.datos();
    <section class="pub-hero">
      <div class="pub-contenedor">
        <h1>Reparación <span>de vehículos</span></h1>
        <p>{{ inicio()?.datos?.presentacion ?? d?.presentacion }}</p>
        <div class="pub-acciones">
          @if (datos.whatsAppUrl(); as wa) {
            <a class="pub-btn pub-btn-oro" [href]="wa" target="_blank" rel="noopener">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="iconoWhatsApp" /></svg>
              Pide cita por WhatsApp
            </a>
          }
          @if (datos.telefonoUrl(); as tel) {
            <a class="pub-btn pub-btn-claro" [href]="tel">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="iconoTelefono" /></svg>
              {{ d?.telefono }}
            </a>
          }
          <a class="pub-btn pub-btn-claro" routerLink="/servicios">Ver servicios</a>
        </div>
      </div>
    </section>

    <div class="pub-cinta">
      <ul class="pub-contenedor">
        <li>Turismos</li><li>Motos</li><li>Furgonetas</li><li>Camiones</li><li>Tractores</li><li>Maquinaria agrícola</li>
      </ul>
    </div>

    <section class="pub-seccion">
      <div class="pub-contenedor">
        <div class="pub-cabecera-seccion">
          <span class="antetitulo">Qué hacemos</span>
          <h2>Un taller para todo tipo de vehículos</h2>
          <p>De la diagnosis electrónica a la chapa, del turismo al tractor.</p>
        </div>
        <div class="pub-rejilla-servicios">
          @for (s of inicio()?.servicios ?? []; track s.id) {
            <a class="pub-servicio" routerLink="/servicios" [fragment]="s.slug">
              <span class="icono-caja"><app-icono-servicio [icono]="s.icono" /></span>
              <h3>{{ s.titulo }}</h3>
              <p>{{ s.resumen }}</p>
            </a>
          }
        </div>
      </div>
    </section>

    @if (inicio()?.destacados?.length) {
      <section class="pub-seccion gris">
        <div class="pub-contenedor">
          <div class="pub-cabecera-seccion">
            <span class="antetitulo">Trabajos realizados</span>
            <h2>Lo último que ha pasado por el taller</h2>
          </div>
          <div class="pub-rejilla-trabajos">
            @for (t of inicio()!.destacados; track t.id) {
              <app-tarjeta-trabajo [trabajo]="t" />
            }
          </div>
          <p style="text-align: center; margin: 2rem 0 0">
            <a class="pub-btn pub-btn-borde" routerLink="/trabajos">Ver todos los trabajos</a>
          </p>
        </div>
      </section>
    }

    <section class="pub-seccion">
      <div class="pub-contenedor pub-presentacion">
        <div>
          <div class="pub-cabecera-seccion" style="text-align: left; margin: 0 0 1.25rem">
            <span class="antetitulo">Quiénes somos</span>
            <h2>Raíces asturianas, taller en La Sagra</h2>
          </div>
          <p class="texto">{{ d?.presentacion }}</p>
        </div>
        <img class="sello" src="brand/astursagra-simbolo-lima.svg" alt="" />
      </div>
    </section>

    <section class="pub-seccion gris">
      <div class="pub-contenedor">
        <div class="pub-llamada">
          <h2>¿Tu vehículo necesita una revisión?</h2>
          <p>Cuéntanos qué le pasa y te damos cita.</p>
          <div class="pub-acciones">
            @if (datos.whatsAppUrl(); as wa) {
              <a class="pub-btn pub-btn-oro" [href]="wa" target="_blank" rel="noopener">WhatsApp</a>
            }
            @if (datos.telefonoUrl(); as tel) {
              <a class="pub-btn pub-btn-claro" [href]="tel">Llamar</a>
            }
            <a class="pub-btn pub-btn-claro" routerLink="/contacto">Cómo llegar</a>
          </div>
        </div>
      </div>
    </section>
  `
})
export class Inicio {
  protected readonly datos = inject(DatosPublicos);
  protected readonly inicio = signal<InicioPublico | null>(null);
  protected readonly iconoWhatsApp = ICONO_WHATSAPP;
  protected readonly iconoTelefono = ICONO_TELEFONO;

  constructor() {
    inject(Api).inicioPublico().subscribe(i => {
      this.inicio.set(i);
      this.datos.establecer(i.datos);
    });
  }
}

@Component({
  selector: 'app-servicios-publicos',
  imports: [RouterLink, IconoServicio],
  template: `
    <section class="pub-cabecera-pagina">
      <div class="pub-contenedor">
        <div class="miga"><a routerLink="/">Inicio</a> › Servicios</div>
        <h1>Servicios</h1>
        <p>Mecánica, electricidad, electrónica y carrocería para turismos, motos, furgonetas, camiones y maquinaria agrícola.</p>
      </div>
    </section>

    <section class="pub-seccion" style="padding-top: 2rem">
      <div class="pub-contenedor">
        @for (s of servicios(); track s.id) {
          <article class="pub-servicio-detalle" [id]="s.slug">
            <span class="icono-caja"><app-icono-servicio [icono]="s.icono" /></span>
            <div>
              <h2>{{ s.titulo }}</h2>
              <p class="resumen">{{ s.resumen }}</p>
              @if (s.descripcion) {
                <p class="descripcion">{{ s.descripcion }}</p>
              }
            </div>
          </article>
        } @empty {
          <p class="pub-vacio">{{ cargando() ? 'Cargando…' : 'Pronto publicaremos nuestro catálogo de servicios.' }}</p>
        }

        <div class="pub-llamada" style="margin-top: 2.5rem">
          <h2>¿No ves lo que buscas?</h2>
          <p>Pregúntanos: si tiene motor, seguramente podamos ayudarte.</p>
          <div class="pub-acciones">
            <a class="pub-btn pub-btn-oro" routerLink="/contacto">Contactar</a>
          </div>
        </div>
      </div>
    </section>
  `
})
export class ServiciosPublicos {
  protected readonly servicios = signal<Servicio[]>([]);
  protected readonly cargando = signal(true);

  constructor() {
    inject(Api).serviciosPublicos().subscribe({
      next: s => {
        this.servicios.set(s);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }
}

@Component({
  selector: 'app-trabajos-publicos',
  imports: [RouterLink, TarjetaTrabajo],
  template: `
    <section class="pub-cabecera-pagina">
      <div class="pub-contenedor">
        <div class="miga"><a routerLink="/">Inicio</a> › Trabajos</div>
        <h1>Trabajos realizados</h1>
        <p>Algunas de las reparaciones que han pasado por el taller.</p>
      </div>
    </section>

    <section class="pub-seccion" style="padding-top: 2.5rem">
      <div class="pub-contenedor">
        @if (serviciosConTrabajos().length > 1) {
          <div class="pub-filtros">
            <button type="button" [class.activo]="filtro() === ''" (click)="filtro.set('')">Todos</button>
            @for (s of serviciosConTrabajos(); track s.valor) {
              <button type="button" [class.activo]="filtro() === s.valor" (click)="filtro.set(s.valor)">{{ s.etiqueta }}</button>
            }
          </div>
        }
        <div class="pub-rejilla-trabajos">
          @for (t of filtrados(); track t.id) {
            <app-tarjeta-trabajo [trabajo]="t" />
          }
        </div>
        @if (!filtrados().length) {
          <p class="pub-vacio">{{ cargando() ? 'Cargando…' : 'Muy pronto publicaremos aquí nuestros trabajos.' }}</p>
        }
      </div>
    </section>
  `
})
export class TrabajosPublicos {
  private readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly cargando = signal(true);
  protected readonly filtro = signal<TipoServicio | ''>('');

  /** Solo se ofrecen como filtro los servicios que tienen algún trabajo. */
  protected readonly serviciosConTrabajos = computed(() => {
    const usados = new Set(this.trabajos().flatMap(t => t.servicios));
    return opciones(TIPOS_SERVICIO).filter(o => usados.has(o.valor));
  });
  protected readonly filtrados = computed(() => {
    const f = this.filtro();
    return f ? this.trabajos().filter(t => t.servicios.includes(f)) : this.trabajos();
  });

  constructor() {
    inject(Api).trabajosPublicos().subscribe({
      next: t => {
        this.trabajos.set(t);
        this.cargando.set(false);
      },
      error: () => this.cargando.set(false)
    });
  }
}

@Component({
  selector: 'app-trabajo-publico',
  imports: [RouterLink, DatePipe, EtiquetaPipe],
  template: `
    @if (trabajo(); as t) {
      <section class="pub-cabecera-pagina">
        <div class="pub-contenedor">
          <div class="miga"><a routerLink="/">Inicio</a> › <a routerLink="/trabajos">Trabajos</a></div>
          <h1>{{ t.titulo }}</h1>
          <p>{{ t.resumen }}</p>
        </div>
      </section>

      <section class="pub-seccion" style="padding-top: 2.5rem">
        <div class="pub-contenedor pub-detalle">
          <div>
            @if (t.fotos.length) {
              @let foto = t.fotos[actual()];
              <div class="pub-galeria">
                <div class="principal">
                  @if (foto.esVideo) {
                    <video [src]="foto.url" controls playsinline preload="metadata" [attr.aria-label]="foto.pie ?? t.titulo"></video>
                  } @else {
                    <img [src]="foto.url" [alt]="foto.pie ?? t.titulo" />
                  }
                  @if (t.fotos.length > 1) {
                    <button type="button" class="flecha izq" (click)="mover(-1)" aria-label="Anterior">‹</button>
                    <button type="button" class="flecha der" (click)="mover(1)" aria-label="Siguiente">›</button>
                  }
                </div>
                @if (foto.pie) {
                  <p class="pie">{{ foto.pie }}</p>
                }
                @if (t.fotos.length > 1) {
                  <div class="miniaturas">
                    @for (f of t.fotos; track f.id; let i = $index) {
                      <button type="button" [class.activa]="i === actual()" (click)="actual.set(i)" [attr.aria-label]="(f.esVideo ? 'Ver vídeo ' : 'Ver foto ') + (i + 1)">
                        @if (f.esVideo) {
                          <video [src]="f.url + '#t=0.5'" muted playsinline preload="metadata"></video>
                          <span class="insignia-video" aria-hidden="true">▶</span>
                        } @else {
                          <img [src]="f.url" alt="" loading="lazy" />
                        }
                      </button>
                    }
                  </div>
                }
              </div>
            }
            @if (t.descripcion) {
              <p class="texto" [style.margin-top]="t.fotos.length ? '1.75rem' : '0'">{{ t.descripcion }}</p>
            }
          </div>
          <aside>
            <dl class="pub-ficha">
              <dt>Fecha</dt>
              <dd>{{ t.fecha | date: 'MMMM yyyy' }}</dd>
              @if (t.vehiculo) {
                <dt>Vehículo</dt>
                <dd>{{ t.vehiculo }}</dd>
              }
              @if (t.servicios.length) {
                <dt>Servicios</dt>
                <dd>{{ t.servicios | etiqueta: 'servicio' }}</dd>
              }
            </dl>
            <div class="pub-llamada" style="margin-top: 1.25rem; padding: 1.5rem 1.25rem">
              <h2 style="font-size: 1.2rem">¿Algo parecido?</h2>
              <p>Te lo revisamos sin compromiso.</p>
              <a class="pub-btn pub-btn-oro" routerLink="/contacto">Contactar</a>
            </div>
          </aside>
        </div>
      </section>
    } @else if (noEncontrado()) {
      <section class="pub-seccion">
        <div class="pub-contenedor pub-vacio">
          <p>Este trabajo no existe o ya no está publicado.</p>
          <a class="pub-btn pub-btn-borde" routerLink="/trabajos">Ver todos los trabajos</a>
        </div>
      </section>
    }
  `
})
export class TrabajoPublico implements OnInit {
  private readonly api = inject(Api);
  readonly slug = input.required<string>();
  protected readonly trabajo = signal<TrabajoDetalle | null>(null);
  protected readonly noEncontrado = signal(false);
  protected readonly actual = signal(0);

  ngOnInit() {
    this.api.trabajoPublico(this.slug()).subscribe({
      next: t => this.trabajo.set(t),
      error: () => this.noEncontrado.set(true)
    });
  }

  protected mover(paso: number) {
    const n = this.trabajo()?.fotos.length ?? 1;
    this.actual.set((this.actual() + paso + n) % n);
  }
}

@Component({
  selector: 'app-contacto',
  imports: [RouterLink],
  template: `
    @let d = datos.datos();
    <section class="pub-cabecera-pagina">
      <div class="pub-contenedor">
        <div class="miga"><a routerLink="/">Inicio</a> › Contacto</div>
        <h1>Contacto</h1>
        <p>Llámanos, escríbenos por WhatsApp o pásate por el taller.</p>
      </div>
    </section>

    <section class="pub-seccion" style="padding-top: 2.5rem">
      <div class="pub-contenedor">
        <div class="pub-contacto">
          <div class="pub-dato">
            <h3>Dirección</h3>
            <p>{{ datos.direccionCompleta() ?? 'La Sagra, Toledo' }}</p>
            @if (d?.urlMapa) {
              <p><a [href]="d!.urlMapa" target="_blank" rel="noopener">Cómo llegar →</a></p>
            }
          </div>
          <div class="pub-dato">
            <h3>Teléfono y WhatsApp</h3>
            @if (d?.telefono) {
              <p><a [href]="datos.telefonoUrl()">{{ d!.telefono }}</a></p>
            }
            @if (datos.whatsAppUrl(); as wa) {
              <p><a [href]="wa" target="_blank" rel="noopener">Escribir por WhatsApp →</a></p>
            }
            @if (d?.email) {
              <p><a [href]="'mailto:' + d!.email">{{ d!.email }}</a></p>
            }
            @if (!d?.telefono && !d?.email) {
              <p>Muy pronto publicaremos nuestros datos de contacto.</p>
            }
          </div>
          <div class="pub-dato">
            <h3>Horario</h3>
            <p>{{ d?.horario ?? 'Consúltanos' }}</p>
          </div>
        </div>

        <div class="pub-llamada" style="margin-top: 2.5rem">
          <h2>¿Ya eres cliente?</h2>
          <p>Consulta tus vehículos, el estado de tu reparación y el historial de intervenciones.</p>
          <div class="pub-acciones">
            <a class="pub-btn pub-btn-oro" routerLink="/acceso">Entrar en mi área</a>
          </div>
        </div>
      </div>
    </section>
  `
})
export class Contacto {
  protected readonly datos = inject(DatosPublicos);
}
