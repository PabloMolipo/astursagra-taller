import { DatePipe } from '@angular/common';
import { HttpEventType } from '@angular/common/http';
import { Component, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CapturaMultimedia } from '../shared/captura-multimedia';
import { Api, limpiar, mensajeError } from '../core/api';
import { opciones, TIPOS_VEHICULO } from '../core/etiquetas';
import { DatosTaller, Servicio, ServicioRequest, TipoServicio, TipoVehiculo, TrabajoDetalle, TrabajoListItem, TrabajoRequest } from '../core/models';
import { ServiciosInput } from '../ordenes/servicios-input';
import { ICONOS_SERVICIO, IconoServicio } from '../publico/icono-servicio';
import { DatosPublicos } from '../publico/datos-publicos';
import { EtiquetaPipe } from '../shared/pipes';

/** Contenedor de Gestión → Web con sus pestañas. */
@Component({
  selector: 'app-web',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="page-header">
      <div>
        <h1>Web pública</h1>
        <div class="subtitle">Lo que ve cualquiera en la web del taller.</div>
      </div>
      <a class="btn" href="/" target="_blank" rel="noopener">Ver la web ↗</a>
    </div>
    <div class="chips" style="margin-bottom: 1.25rem">
      <a routerLink="/gestion/web/trabajos" routerLinkActive="active" class="chip">Trabajos realizados</a>
      <a routerLink="/gestion/web/servicios" routerLinkActive="active" class="chip">Servicios</a>
      <a routerLink="/gestion/web/datos" routerLinkActive="active" class="chip">Datos del taller</a>
      <a routerLink="/gestion/web/visitas" routerLinkActive="active" class="chip">Visitas</a>
    </div>
    <router-outlet />
  `,
  styles: `
    .chip { border: 1px solid var(--border); background: var(--surface); border-radius: var(--radius); padding: 0.35rem 0.9rem; color: var(--text); text-decoration: none; }
    .chip.active { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
  `
})
export class Web {}

@Component({
  selector: 'app-web-datos',
  imports: [ReactiveFormsModule],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (guardado()) {
      <div class="aviso" style="background: var(--success-tint); border-color: rgba(74, 222, 128, 0.4); color: var(--success)">Guardado. Ya se ve en la web.</div>
    }
    <form class="card" [formGroup]="form" (ngSubmit)="guardar()">
      <div class="form-grid">
        <label class="field">Nombre *<input formControlName="nombre" /></label>
        <label class="field" style="grid-column: span 2">Lema<input formControlName="lema" /></label>
        <label class="field full">
          Presentación (portada y "Quiénes somos")
          <textarea formControlName="presentacion" rows="4"></textarea>
        </label>
        <label class="field">Teléfono<input formControlName="telefono" type="tel" /></label>
        <label class="field">
          WhatsApp
          <input formControlName="whatsApp" type="tel" />
          <span class="hint">Si lo dejas vacío se usa el teléfono</span>
        </label>
        <label class="field">Email<input formControlName="email" type="email" /></label>
        <label class="field full">Dirección<input formControlName="direccion" /></label>
        <label class="field">Código postal<input formControlName="codigoPostal" /></label>
        <label class="field">Población<input formControlName="poblacion" /></label>
        <label class="field">Provincia<input formControlName="provincia" /></label>
        <label class="field full">
          Horario
          <textarea formControlName="horario" rows="3" placeholder="Lunes a viernes: 9:00 – 14:00 y 16:00 – 19:30"></textarea>
        </label>
        <label class="field full">
          Enlace "Cómo llegar"
          <input formControlName="urlMapa" type="url" placeholder="https://maps.app.goo.gl/…" />
          <span class="hint">En Google Maps: busca el taller → Compartir → Copiar enlace</span>
        </label>
      </div>
      <div class="form-actions">
        <button type="submit" class="btn primary" [disabled]="guardando()">Guardar</button>
      </div>
    </form>
  `
})
export class WebDatos {
  private readonly api = inject(Api);
  private readonly publicos = inject(DatosPublicos);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly guardado = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    nombre: ['', [Validators.required, Validators.maxLength(120)]],
    lema: [''],
    presentacion: [''],
    telefono: [''],
    whatsApp: [''],
    email: ['', Validators.email],
    direccion: [''],
    codigoPostal: [''],
    poblacion: [''],
    provincia: [''],
    horario: [''],
    urlMapa: ['']
  });

  constructor() {
    this.api.webDatos().subscribe({
      next: d => this.form.reset(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? ''])) as never),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }
    this.guardando.set(true);
    this.guardado.set(false);
    this.api.guardarWebDatos(limpiar(this.form.getRawValue()) as DatosTaller).subscribe({
      next: d => {
        this.guardando.set(false);
        this.error.set(null);
        this.guardado.set(true);
        this.publicos.establecer(d);
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}

@Component({
  selector: 'app-web-servicios',
  imports: [ReactiveFormsModule, IconoServicio],
  template: `
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th style="width: 48px"></th><th>Servicio</th><th>Orden</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          @for (s of servicios(); track s.id) {
            <tr [style.background]="editando() === s.id ? 'var(--hover)' : null">
              <td><app-icono-servicio [icono]="s.icono" style="width: 26px; height: 26px; color: var(--primary)" /></td>
              <td>
                <strong>{{ s.titulo }}</strong>
                <div class="hint">{{ s.resumen }}</div>
              </td>
              <td>{{ s.orden }}</td>
              <td>
                <span class="badge" [class.estado-Listo]="s.publicado">{{ s.publicado ? 'Publicado' : 'Oculto' }}</span>
              </td>
              <td class="num">
                <button type="button" class="btn small" (click)="editar(s)">Editar</button>
                <button type="button" class="btn small danger" (click)="eliminar(s)">×</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">No hay servicios.</td></tr>
          }
        </tbody>
      </table>
    </div>

    <form class="card" [formGroup]="form" (ngSubmit)="guardar()">
      <h2>{{ editando() ? 'Editar servicio' : 'Nuevo servicio' }}</h2>
      <div class="form-grid">
        <label class="field" style="grid-column: span 2">Título *<input formControlName="titulo" /></label>
        <label class="field">
          Icono
          <select formControlName="icono">
            @for (i of iconos; track i.valor) {
              <option [value]="i.valor">{{ i.etiqueta }}</option>
            }
          </select>
        </label>
        <label class="field">
          Orden
          <input type="number" formControlName="orden" />
          <span class="hint">Los menores salen antes</span>
        </label>
        <label class="field full">Resumen * (una frase, se ve en la tarjeta)<input formControlName="resumen" maxlength="300" /></label>
        <label class="field full">Descripción (página de servicios)<textarea formControlName="descripcion" rows="4"></textarea></label>
        <label class="checks full"><label><input type="checkbox" formControlName="publicado" /> Publicado en la web</label></label>
      </div>
      <div class="form-actions">
        @if (editando()) {
          <button type="button" class="btn" (click)="nuevo()">Cancelar</button>
        }
        <button type="submit" class="btn primary">{{ editando() ? 'Guardar' : '+ Añadir servicio' }}</button>
      </div>
    </form>
  `
})
export class WebServicios {
  private readonly api = inject(Api);
  protected readonly iconos = ICONOS_SERVICIO;
  protected readonly servicios = signal<Servicio[]>([]);
  protected readonly editando = signal<number | null>(null);
  protected readonly error = signal<string | null>(null);

  private readonly vacio = { titulo: '', resumen: '', descripcion: '', icono: 'llave', orden: 0, publicado: true };
  protected readonly form = inject(FormBuilder).nonNullable.group({
    titulo: ['', [Validators.required, Validators.maxLength(120)]],
    resumen: ['', [Validators.required, Validators.maxLength(300)]],
    descripcion: [''],
    icono: ['llave'],
    orden: [0],
    publicado: [true]
  });

  constructor() {
    this.cargar();
  }

  protected editar(s: Servicio) {
    this.editando.set(s.id);
    this.form.reset({ ...s, descripcion: s.descripcion ?? '' });
  }

  protected nuevo() {
    this.editando.set(null);
    this.form.reset({ ...this.vacio, orden: this.servicios().length });
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('El título y el resumen son obligatorios.');
      return;
    }
    const req = limpiar(this.form.getRawValue()) as ServicioRequest;
    const id = this.editando();
    (id ? this.api.actualizarServicio(id, req) : this.api.crearServicio(req)).subscribe({
      next: () => {
        this.error.set(null);
        this.cargar();
        this.nuevo();
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected eliminar(s: Servicio) {
    if (confirm(`¿Eliminar el servicio "${s.titulo}"? Si solo quieres quitarlo de la web, desmarca "Publicado".`)) {
      this.api.eliminarServicio(s.id).subscribe({ next: () => this.cargar(), error: e => this.error.set(mensajeError(e)) });
    }
  }

  private cargar() {
    this.api.webServicios().subscribe({
      next: s => {
        this.servicios.set(s);
        if (!this.editando()) {
          this.form.controls.orden.setValue(s.length);
        }
      },
      error: e => this.error.set(mensajeError(e))
    });
  }
}

@Component({
  selector: 'app-web-trabajos',
  imports: [RouterLink, DatePipe, EtiquetaPipe],
  template: `
    <div class="toolbar">
      <a class="btn primary" routerLink="/gestion/web/trabajos/nuevo">+ Nuevo trabajo</a>
    </div>
    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th style="width: 84px">Foto</th><th>Trabajo</th><th>Fecha</th><th>Fotos y vídeos</th><th>Estado</th></tr>
        </thead>
        <tbody>
          @for (t of trabajos(); track t.id) {
            <tr class="clickable" (click)="router.navigate(['/gestion/web/trabajos', t.id])">
              <td>
                @if (t.portada && t.portadaEsVideo) {
                  <video [src]="t.portada + '#t=0.5'" muted preload="metadata" style="width: 72px; height: 54px; object-fit: cover; display: block"></video>
                } @else if (t.portada) {
                  <img [src]="t.portada" alt="" style="width: 72px; height: 54px; object-fit: cover; display: block" />
                } @else {
                  <span class="hint">Sin foto</span>
                }
              </td>
              <td>
                <strong>{{ t.titulo }}</strong>
                <div class="hint">{{ t.vehiculo }}{{ t.vehiculo && t.servicios.length ? ' · ' : '' }}{{ t.servicios | etiqueta: 'servicio' }}</div>
              </td>
              <td>{{ t.fecha | date: 'dd/MM/yyyy' }}</td>
              <td>{{ t.numFotos }}{{ t.numVideos ? ' + ' + t.numVideos + (t.numVideos === 1 ? ' vídeo' : ' vídeos') : '' }}</td>
              <td>
                <span class="badge" [class.estado-Listo]="t.publicado">{{ t.publicado ? 'Publicado' : 'Borrador' }}</span>
                @if (t.destacado) {
                  <span class="badge estado-EnDiagnostico" style="margin-left: 0.3rem">Destacado</span>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">{{ cargando() ? 'Cargando…' : 'Aún no has publicado trabajos. Sube fotos de tus mejores reparaciones.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `
})
export class WebTrabajos {
  protected readonly router = inject(Router);
  protected readonly trabajos = signal<TrabajoListItem[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);

  constructor() {
    inject(Api).webTrabajos().subscribe({
      next: t => {
        this.trabajos.set(t);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}

@Component({
  selector: 'app-web-trabajo',
  imports: [ReactiveFormsModule, RouterLink, ServiciosInput, CapturaMultimedia],
  template: `
    <div class="toolbar">
      <a class="btn" routerLink="/gestion/web/trabajos">← Trabajos</a>
      @if (trabajo(); as t) {
        @if (t.publicado) {
          <a class="btn" [href]="'/trabajos/' + t.slug" target="_blank" rel="noopener">Ver en la web ↗</a>
        }
      }
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <form class="card" [formGroup]="form" (ngSubmit)="guardar()">
      <h2>{{ id() ? 'Editar trabajo' : 'Nuevo trabajo' }}</h2>
      <div class="form-grid">
        <label class="field" style="grid-column: span 2">
          Título *
          <input formControlName="titulo" placeholder="Cambio de embrague en Volkswagen Golf" />
        </label>
        <label class="field">Fecha *<input type="date" formControlName="fecha" /></label>
        <label class="field full">Resumen * (una o dos frases para la tarjeta)<input formControlName="resumen" maxlength="400" /></label>
        <label class="field" style="grid-column: span 2">Vehículo<input formControlName="vehiculo" placeholder="Volkswagen Golf 1.9 TDI" /></label>
        <label class="field">
          Tipo de vehículo
          <select formControlName="tipoVehiculo">
            <option [ngValue]="null">—</option>
            @for (o of tiposVehiculo; track o.valor) {
              <option [ngValue]="o.valor">{{ o.etiqueta }}</option>
            }
          </select>
        </label>
        <div class="field full">
          <label class="field">Servicios</label>
          <app-servicios-input formControlName="servicios" />
        </div>
        <label class="field full">
          Descripción
          <textarea formControlName="descripcion" rows="6" placeholder="Qué le pasaba, qué encontramos y cómo lo arreglamos."></textarea>
        </label>
        <div class="checks full">
          <label><input type="checkbox" formControlName="publicado" /> Publicado en la web</label>
          <label><input type="checkbox" formControlName="destacado" /> Destacado en la portada</label>
        </div>
      </div>
      <div class="form-actions">
        @if (id()) {
          <button type="button" class="btn danger" (click)="eliminar()" style="margin-right: auto">Eliminar</button>
        }
        <button type="submit" class="btn primary" [disabled]="guardando()">{{ id() ? 'Guardar' : 'Crear y añadir fotos' }}</button>
      </div>
    </form>

    @if (trabajo(); as t) {
      <section class="card">
        <h2>Fotos y vídeos</h2>
        <p class="hint" style="margin-top: 0">
          La primera foto es la portada (si solo hay vídeos, el primero). Fotos JPG, PNG o WebP de hasta 10 MB y vídeos MP4, MOV o WebM de hasta 300 MB;
          puedes elegir varios a la vez. Los vídeos del iPhone en formato HEVC pueden no verse en algunos navegadores: si pasa, grábalos en «Más compatible».
        </p>
        <div class="fotos">
          @for (f of t.fotos; track f.id; let i = $index) {
            <figure>
              @if (f.esVideo) {
                <video [src]="f.url" controls preload="metadata" playsinline></video>
              } @else {
                <img [src]="f.url" alt="" />
              }
              @if (i === 0) {
                <span class="portada">Portada</span>
              }
              <input [value]="f.pie ?? ''" [placeholder]="f.esVideo ? 'Pie del vídeo' : 'Pie de foto'" (change)="cambiarPie(f.id, $any($event.target).value, f.orden)" />
              <div class="acciones">
                <button type="button" class="btn small" [disabled]="i === 0" (click)="mover(i, -1)" aria-label="Mover antes">←</button>
                <button type="button" class="btn small" [disabled]="i === t.fotos.length - 1" (click)="mover(i, 1)" aria-label="Mover después">→</button>
                <button type="button" class="btn small danger" (click)="quitarFoto(f.id)">Quitar</button>
              </div>
            </figure>
          }
        </div>
        <div style="margin-top: 1rem">
          <app-captura-multimedia (archivos)="subir($event)" />
        </div>
        @for (s of subidas(); track s.id) {
          <div class="subida">
            <span class="nombre">{{ s.nombre }}</span>
            <progress [value]="s.progreso" max="100"></progress>
            <span class="hint">{{ s.progreso }} %</span>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .fotos { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1rem; }
    figure { margin: 0; position: relative; display: flex; flex-direction: column; gap: 0.4rem; }
    figure :is(img, video) { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; border-radius: var(--radius); border: 1px solid var(--border); background: #050505; }
    .subida { display: flex; gap: 0.6rem; align-items: center; margin-top: 0.4rem; font-size: 0.9rem; }
    .subida .nombre { max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .subida progress { flex: 1; max-width: 260px; }
    .portada { position: absolute; top: 6px; left: 6px; background: var(--brand-gold); color: var(--on-primary); font-size: 0.75rem; font-weight: 700; padding: 0.1rem 0.5rem; border-radius: var(--radius); }
    .acciones { display: flex; gap: 0.3rem; }
    .acciones .danger { margin-left: auto; }
  `
})
export class WebTrabajo implements OnInit {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly id = input(undefined, { transform: numberAttribute });

  protected readonly tiposVehiculo = opciones(TIPOS_VEHICULO);
  protected readonly trabajo = signal<TrabajoDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected readonly subiendo = signal(0);
  protected readonly subidas = signal<{ id: number; nombre: string; progreso: number }[]>([]);
  private siguienteSubida = 0;

  protected readonly form = inject(FormBuilder).nonNullable.group({
    titulo: ['', [Validators.required, Validators.maxLength(160)]],
    resumen: ['', [Validators.required, Validators.maxLength(400)]],
    descripcion: [''],
    fecha: [new Date().toISOString().slice(0, 10), Validators.required],
    vehiculo: [''],
    tipoVehiculo: [null as TipoVehiculo | null],
    servicios: [[] as TipoServicio[]],
    publicado: [false],
    destacado: [false]
  });

  ngOnInit() {
    const id = this.id();
    if (id) {
      this.api.webTrabajo(id).subscribe({ next: t => this.mostrar(t), error: e => this.error.set(mensajeError(e)) });
    }
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('El título, el resumen y la fecha son obligatorios.');
      return;
    }
    const req = limpiar(this.form.getRawValue()) as TrabajoRequest;
    const id = this.id();
    this.guardando.set(true);
    (id ? this.api.actualizarTrabajo(id, req) : this.api.crearTrabajo(req)).subscribe({
      next: t => {
        this.guardando.set(false);
        this.error.set(null);
        if (id) {
          this.mostrar(t);
        } else {
          this.router.navigate(['/gestion/web/trabajos', t.id]);
        }
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminar() {
    if (confirm('¿Eliminar este trabajo y todas sus fotos?')) {
      this.api.eliminarTrabajo(this.id()!).subscribe({
        next: () => this.router.navigate(['/gestion/web/trabajos']),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  /** Sube las fotos y vídeos de uno en uno, con su progreso (los vídeos pueden tardar). */
  protected async subir(archivos: File[]) {
    const nuevas = archivos.map(a => ({ id: ++this.siguienteSubida, nombre: a.name, progreso: 0 }));
    this.subidas.update(s => [...s, ...nuevas]);
    for (const [i, archivo] of archivos.entries()) {
      const id = nuevas[i].id;
      this.subiendo.update(n => n + 1);
      await new Promise<void>(fin =>
        this.api.subirFoto(this.id()!, archivo).subscribe({
          next: ev => {
            if (ev.type === HttpEventType.UploadProgress && ev.total) {
              const progreso = Math.round((100 * ev.loaded) / ev.total);
              this.subidas.update(s => s.map(x => (x.id === id ? { ...x, progreso } : x)));
            } else if (ev.type === HttpEventType.Response && ev.body) {
              this.trabajo.set(ev.body);
            }
          },
          error: err => {
            this.error.set(`${archivo.name}: ${mensajeError(err)}`);
            fin();
          },
          complete: () => fin()
        })
      );
      this.subidas.update(s => s.filter(x => x.id !== id));
      this.subiendo.update(n => n - 1);
    }
  }

  protected cambiarPie(fotoId: number, pie: string, orden: number) {
    this.api.actualizarFoto(this.id()!, fotoId, pie.trim() || null, orden).subscribe({
      next: t => this.trabajo.set(t),
      error: err => this.error.set(mensajeError(err))
    });
  }

  /** Intercambia el orden con la foto vecina. */
  protected mover(i: number, paso: number) {
    const fotos = this.trabajo()!.fotos;
    const a = fotos[i];
    const b = fotos[i + paso];
    this.api.actualizarFoto(this.id()!, a.id, a.pie, i + paso).subscribe(() =>
      this.api.actualizarFoto(this.id()!, b.id, b.pie, i).subscribe({ next: t => this.renumerar(t), error: err => this.error.set(mensajeError(err)) })
    );
  }

  protected quitarFoto(fotoId: number) {
    if (confirm('¿Quitar esta foto?')) {
      this.api.eliminarFoto(this.id()!, fotoId).subscribe({ next: t => this.trabajo.set(t), error: err => this.error.set(mensajeError(err)) });
    }
  }

  /** Tras reordenar, deja los órdenes consecutivos (0, 1, 2…) para que el siguiente intercambio sea fiable. */
  private renumerar(t: TrabajoDetalle) {
    this.trabajo.set(t);
    t.fotos.forEach((f, i) => {
      if (f.orden !== i) {
        this.api.actualizarFoto(t.id, f.id, f.pie, i).subscribe(r => this.trabajo.set(r));
      }
    });
  }

  private mostrar(t: TrabajoDetalle) {
    this.trabajo.set(t);
    this.form.reset({
      titulo: t.titulo,
      resumen: t.resumen,
      descripcion: t.descripcion ?? '',
      fecha: t.fecha,
      vehiculo: t.vehiculo ?? '',
      tipoVehiculo: t.tipoVehiculo,
      servicios: t.servicios,
      publicado: t.publicado,
      destacado: t.destacado
    });
  }
}
