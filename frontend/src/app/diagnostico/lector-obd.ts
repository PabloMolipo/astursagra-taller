import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, mensajeError } from '../core/api';
import { EstadoCodigo, ValorReferencia } from '../core/models';
import { comparar, rango } from '../core/referencias';
import { CodigoObd, LectorObd, Pid, PIDS } from '../core/obd';
import { NumOrdenPipe } from '../shared/pipes';

interface CodigoMostrado extends CodigoObd {
  descripcion: string;
}

interface Lectura {
  pid: Pid;
  valor: number | null;
  minimo: number | null;
  maximo: number | null;
}

const NOMBRE_ESTADO: Record<EstadoCodigo, string> = {
  Activo: 'Almacenado',
  Pendiente: 'Pendiente',
  Permanente: 'Permanente',
  Historico: 'Histórico'
};

@Component({
  selector: 'app-lector-obd',
  imports: [FormsModule, RouterLink, DecimalPipe, NumOrdenPipe],
  template: `
    @if (ordenId(); as o) {
      <div class="contexto">
        Lectura para <a [routerLink]="['/gestion/ordenes', o]"><strong>{{ o | numOrden }}</strong></a>: los códigos y valores se pueden pasar a su ficha de diagnosis.
      </div>
    }

    @if (!disponible && !lector.demo()) {
      <div class="aviso">
        Este navegador no puede conectar adaptadores OBD. Usa <strong>Chrome o Edge en un ordenador</strong>
        (en el móvil no funciona). Mientras, puedes probar el <strong>modo demostración</strong>.
      </div>
    }

    <section class="card">
      <div class="toolbar" style="margin: 0; justify-content: space-between">
        <div class="toolbar" style="margin: 0">
          @if (lector.estado() === 'conectado') {
            <span class="badge estado-Listo">{{ lector.demo() ? 'Demostración' : 'Conectado' }}</span>
            <span class="hint">{{ lector.protocolo() }} · Batería {{ lector.tension() }}</span>
          } @else {
            <label class="field">
              Velocidad del adaptador
              <select [(ngModel)]="baudios" name="baudios">
                <option [ngValue]="38400">38400 (la más habitual)</option>
                <option [ngValue]="9600">9600</option>
                <option [ngValue]="115200">115200</option>
              </select>
            </label>
          }
        </div>
        <div class="toolbar" style="margin: 0">
          @if (lector.estado() === 'conectado') {
            <button type="button" class="btn" (click)="desconectar()">Desconectar</button>
          } @else {
            <button type="button" class="btn" (click)="conectar(true)" [disabled]="lector.estado() === 'conectando'">Modo demostración</button>
            <button type="button" class="btn primary" (click)="conectar(false)" [disabled]="!disponible || lector.estado() === 'conectando'">
              {{ lector.estado() === 'conectando' ? 'Conectando…' : 'Conectar adaptador' }}
            </button>
          }
        </div>
      </div>
      @if (lector.estado() !== 'conectado') {
        <p class="hint" style="margin-bottom: 0">
          Conecta el ELM327 a la toma OBD (bajo el volante), pon el contacto y pulsa «Conectar adaptador». Si es Bluetooth,
          emparéjalo antes en Windows: aparecerá como un puerto COM.
        </p>
      }
      @if (lector.error()) {
        <div class="error" style="margin: 0.75rem 0 0">{{ lector.error() }}</div>
      }
    </section>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (mensaje()) {
      <div class="aviso" style="background: var(--success-tint); border-color: rgba(74, 222, 128, 0.4); color: var(--success)">{{ mensaje() }}</div>
    }

    @if (lector.estado() === 'conectado') {
      <section class="card">
        <h2>Vehículo</h2>
        <div class="toolbar" style="margin: 0">
          <button type="button" class="btn" (click)="leerVin()" [disabled]="ocupado()">Leer VIN</button>
          @if (vin()) {
            <span class="mono grande">{{ vin() }}</span>
            <button type="button" class="btn small" (click)="copiar(vin()!)">Copiar</button>
          } @else if (vinLeido()) {
            <span class="hint">La centralita no ha devuelto el VIN.</span>
          }
        </div>
      </section>

      <section class="card">
        <h2>Códigos de avería</h2>
        <div class="toolbar">
          <button type="button" class="btn primary" (click)="leerCodigos()" [disabled]="ocupado()">{{ ocupado() ? 'Leyendo…' : 'Leer códigos' }}</button>
          @if (ordenId() && codigos().length) {
            <button type="button" class="btn" (click)="pasarCodigos()">Añadir a la ficha de {{ ordenId()! | numOrden }}</button>
          }
          <button type="button" class="btn danger" style="margin-left: auto" (click)="borrar()" [disabled]="ocupado()">Borrar códigos</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Código</th><th>Tipo</th><th>Descripción</th><th></th></tr></thead>
            <tbody>
              @for (c of codigos(); track c.codigo + c.estado) {
                <tr>
                  <td class="mono"><strong>{{ c.codigo }}</strong></td>
                  <td><span class="badge" [class.estado-Cancelado]="c.estado === 'Activo'" [class.estado-EnDiagnostico]="c.estado !== 'Activo'">{{ estadoNombre(c.estado) }}</span></td>
                  <td>{{ c.descripcion }}</td>
                  <td class="num"><a [routerLink]="['/gestion/diagnostico/codigos', c.codigo]">Casos del taller →</a></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">{{ codigosLeidos() ? 'Sin códigos de avería.' : 'Pulsa «Leer códigos».' }}</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Datos en vivo</h2>
        <div class="checks" style="margin-bottom: 0.75rem">
          @for (p of pidsDisponibles(); track p.pid) {
            <label><input type="checkbox" [checked]="seleccionados().has(p.pid)" (change)="alternar(p.pid)" [disabled]="enVivo()" /> {{ p.nombre }}</label>
          }
        </div>
        <div class="toolbar">
          @if (enVivo()) {
            <button type="button" class="btn" (click)="parar()">Parar</button>
            <span class="hint">Actualizando… {{ ciclos() }} lecturas</span>
          } @else {
            <button type="button" class="btn primary" (click)="enVivoIniciar()" [disabled]="!seleccionados().size || ocupado()">Iniciar lectura</button>
          }
        </div>
        @if (lecturas().length) {
          <div class="table-wrap">
            <table>
              <thead><tr><th>Parámetro</th><th class="num">Actual</th><th class="num">Mín.</th><th class="num">Máx.</th><th>Referencia</th><th></th></tr></thead>
              <tbody>
                @for (l of lecturas(); track l.pid.pid) {
                  <tr>
                    <td>{{ l.pid.nombre }}</td>
                    <td class="num valor" [class.fuera]="fuera(l)">{{ l.valor === null ? '—' : (l.valor | number: '1.' + l.pid.decimales + '-' + l.pid.decimales) }} <span class="hint">{{ l.pid.unidad }}</span></td>
                    <td class="num">{{ l.minimo === null ? '' : (l.minimo | number: '1.' + l.pid.decimales + '-' + l.pid.decimales) }}</td>
                    <td class="num">{{ l.maximo === null ? '' : (l.maximo | number: '1.' + l.pid.decimales + '-' + l.pid.decimales) }}</td>
                    <td>
                      @for (r of referenciasDe(l.pid.pid); track r.id) {
                        <div><strong>{{ rango(r) }}</strong> <span class="hint">{{ r.condicion }}</span></div>
                      }
                    </td>
                    <td class="num">
                      @if (ordenId() && l.valor !== null) {
                        <button type="button" class="btn small" (click)="aFicha(l)">→ Ficha</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </section>
    }
  `,
  styles: `
    .contexto { background: var(--primary-tint); border: 1px solid rgba(198, 255, 0, 0.3); border-radius: var(--radius); padding: 0.6rem 0.9rem; margin-bottom: 1rem; }
    .grande { font-size: 1.15rem; font-weight: 700; letter-spacing: 0.05em; }
    .valor { font-size: 1.1rem; font-weight: 700; }
    .valor.fuera { color: var(--danger); }
  `
})
export class LectorObdPagina implements OnDestroy {
  private readonly api = inject(Api);
  protected readonly lector = inject(LectorObd);
  protected readonly disponible = LectorObd.disponible();

  /** ?ordenId= cuando se abre desde una orden. */
  readonly ordenId = input(undefined, { transform: numberAttribute });

  protected baudios = 38400;
  protected readonly ocupado = signal(false);
  protected readonly vin = signal<string | null>(null);
  protected readonly vinLeido = signal(false);
  protected readonly codigos = signal<CodigoMostrado[]>([]);
  protected readonly codigosLeidos = signal(false);
  protected readonly soportados = signal<Set<string> | null>(null);
  protected readonly seleccionados = signal(new Set(['0C', '05', '42', '04']));
  protected readonly lecturas = signal<Lectura[]>([]);
  protected readonly enVivo = signal(false);
  protected readonly ciclos = signal(0);
  protected readonly error = signal<string | null>(null);
  protected readonly mensaje = signal<string | null>(null);

  protected readonly rango = rango;
  private readonly referencias = signal<ValorReferencia[]>([]);

  constructor() {
    this.api.valoresReferencia().subscribe(r => this.referencias.set(r.filter(x => x.pidObd)));
  }

  protected referenciasDe(pid: string): ValorReferencia[] {
    return this.referencias().filter(r => r.pidObd === pid);
  }

  /** Fuera de alguna de las referencias enlazadas a ese PID. */
  protected fuera(l: Lectura): boolean {
    return this.referenciasDe(l.pid.pid).some(r => { const c = comparar(l.valor, r); return c === 'bajo' || c === 'alto'; });
  }

  protected readonly pidsDisponibles = computed(() => {
    const s = this.soportados();
    return s ? PIDS.filter(p => s.has(p.pid)) : PIDS;
  });

  ngOnDestroy() {
    this.enVivo.set(false);
  }

  protected estadoNombre(e: EstadoCodigo) {
    return NOMBRE_ESTADO[e];
  }

  protected async conectar(demo: boolean) {
    this.error.set(null);
    await this.lector.conectar(this.baudios, demo);
    if (this.lector.estado() === 'conectado') {
      try {
        const s = await this.lector.pidsSoportados();
        this.soportados.set(s.size ? s : null);
        this.seleccionados.update(sel => new Set([...sel].filter(p => !s.size || s.has(p))));
      } catch {
        this.soportados.set(null);
      }
    }
  }

  protected async desconectar() {
    this.enVivo.set(false);
    await this.lector.desconectar();
  }

  protected async leerVin() {
    await this.tarea(async () => {
      this.vin.set(await this.lector.leerVin());
      this.vinLeido.set(true);
    });
  }

  protected async leerCodigos() {
    await this.tarea(async () => {
      const leidos: CodigoObd[] = [];
      for (const modo of ['03', '07', '0A'] as const) {
        leidos.push(...(await this.lector.leerCodigos(modo)));
      }
      const conDescripcion = await Promise.all(
        leidos.map(async c => {
          const d = await firstValueFrom(this.api.codigo(c.codigo)).catch(() => null);
          return { ...c, descripcion: d?.descripcion ?? '' };
        })
      );
      this.codigos.set(conDescripcion);
      this.codigosLeidos.set(true);
    });
  }

  protected async borrar() {
    if (!confirm(
      'Se borrarán los códigos y los datos congelados de la centralita de motor, y se reiniciarán los monitores ' +
      '(el coche puede no pasar la ITV hasta completar ciclos de conducción). Hazlo con el motor parado y el contacto puesto. ¿Borrar?'
    )) {
      return;
    }
    await this.tarea(async () => {
      if (await this.lector.borrarCodigos()) {
        this.mensaje.set('Códigos borrados. Vuelve a leer para comprobar si reaparecen.');
        this.codigos.set([]);
        this.codigosLeidos.set(false);
      } else {
        this.error.set('La centralita no ha confirmado el borrado (puede que necesite el motor parado y el contacto puesto).');
      }
    });
  }

  protected pasarCodigos() {
    const ordenId = this.ordenId();
    if (!ordenId) {
      return;
    }
    this.api.anadirCodigos(ordenId, this.codigos().map(c => ({ codigo: c.codigo, estado: c.estado }))).subscribe({
      next: () => this.mensaje.set(`Códigos añadidos a la ficha de diagnosis.`),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected alternar(pid: string) {
    this.seleccionados.update(s => {
      const n = new Set(s);
      if (n.has(pid)) {
        n.delete(pid);
      } else {
        n.add(pid);
      }
      return n;
    });
  }

  protected async enVivoIniciar() {
    const pids = this.pidsDisponibles().filter(p => this.seleccionados().has(p.pid));
    this.lecturas.set(pids.map(pid => ({ pid, valor: null, minimo: null, maximo: null })));
    this.ciclos.set(0);
    this.enVivo.set(true);
    try {
      while (this.enVivo() && this.lector.estado() === 'conectado') {
        for (const pid of pids) {
          if (!this.enVivo()) {
            break;
          }
          const valor = await this.lector.leerPid(pid);
          this.lecturas.update(ls => ls.map(l => l.pid.pid !== pid.pid || valor === null ? l : {
            ...l,
            valor,
            minimo: l.minimo === null ? valor : Math.min(l.minimo, valor),
            maximo: l.maximo === null ? valor : Math.max(l.maximo, valor)
          }));
        }
        this.ciclos.update(n => n + 1);
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.enVivo.set(false);
    }
  }

  protected parar() {
    this.enVivo.set(false);
  }

  /** Añade la lectura actual como medición en la ficha de la orden. */
  protected aFicha(l: Lectura) {
    const ordenId = this.ordenId();
    if (!ordenId || l.valor === null) {
      return;
    }
    this.api.ficha(ordenId).subscribe({
      next: f => {
        const valor = l.valor!.toFixed(l.pid.decimales).replace('.', ',');
        this.api.guardarFicha(ordenId, {
          ...f,
          mediciones: [...f.mediciones, { parametro: `${l.pid.nombre} (OBD)`, valor, unidad: l.pid.unidad, valorEsperado: null, resultado: 'SinValorar', nota: null }]
        }).subscribe({
          next: () => this.mensaje.set(`${l.pid.nombre}: ${valor} ${l.pid.unidad} añadido a la ficha.`),
          error: e => this.error.set(mensajeError(e))
        });
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected copiar(texto: string) {
    navigator.clipboard.writeText(texto);
  }

  private async tarea(trabajo: () => Promise<void>) {
    this.ocupado.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    try {
      await trabajo();
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.ocupado.set(false);
    }
  }
}
