import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, mensajeError } from '../core/api';
import { AccesoCreado, Rol, UsuarioAcceso } from '../core/models';
import { CajaCredenciales } from '../shared/caja-credenciales';

type Filtro = Rol | '';

/** Gestión → Usuarios: todos los accesos (taller y clientes). */
@Component({
  selector: 'app-usuarios',
  imports: [FormsModule, RouterLink, DatePipe, CajaCredenciales],
  template: `
    <div class="page-header">
      <div>
        <h1>Usuarios de acceso</h1>
        <div class="subtitle">Quién puede entrar en la gestión del taller y en "Mi área".</div>
      </div>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }
    @if (credenciales(); as c) {
      <app-caja-credenciales
        [credenciales]="c.datos"
        [titulo]="c.taller ? 'Datos de acceso a la gestión del taller.' : 'Pásale estos datos al cliente.'"
        [saludo]="c.taller ? 'Tu acceso a la gestión de AsturSagra:' : 'Hola, ya puedes consultar tus vehículos y reparaciones en'"
        (cerrar)="credenciales.set(null)" />
    }

    <div class="toolbar">
      <input type="search" placeholder="Buscar por usuario o nombre…" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" />
      <div class="chips">
        <button type="button" [class.active]="filtro() === ''" (click)="filtro.set('')">Todos ({{ usuarios().length }})</button>
        <button type="button" [class.active]="filtro() === 'Taller'" (click)="filtro.set('Taller')">Taller ({{ cuenta('Taller') }})</button>
        <button type="button" [class.active]="filtro() === 'Cliente'" (click)="filtro.set('Cliente')">Clientes ({{ cuenta('Cliente') }})</button>
      </div>
    </div>

    <div class="card table-wrap" style="padding: 0">
      <table>
        <thead>
          <tr><th>Usuario</th><th>Nombre</th><th>Tipo</th><th>Último acceso</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          @for (u of visibles(); track u.id) {
            <tr>
              <td class="mono">{{ u.usuario }}</td>
              <td>
                @if (u.clienteId) {
                  <a [routerLink]="['/gestion/clientes', u.clienteId]">{{ u.nombre }}</a>
                } @else {
                  {{ u.nombre }}
                }
                @if (u.esYo) {
                  <span class="hint">(tú)</span>
                }
              </td>
              <td>
                <span class="badge" [class.estado-Presupuestado]="u.rol === 'Taller'">{{ u.rol === 'Taller' ? 'Taller' : 'Cliente' }}</span>
              </td>
              <td>{{ u.ultimoAcceso ? (u.ultimoAcceso | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
              <td>
                @if (u.bloqueado) {
                  <span class="badge estado-Cancelado">Bloqueado</span>
                } @else if (u.pendienteCambio) {
                  <span class="badge estado-EnDiagnostico">Contraseña temporal</span>
                } @else {
                  <span class="badge estado-Listo">Activo</span>
                }
              </td>
              <td class="num">
                @if (!u.esYo) {
                  @if (u.bloqueado) {
                    <button type="button" class="btn small" (click)="desbloquear(u)">Desbloquear</button>
                  }
                  <button type="button" class="btn small" (click)="restablecer(u)">Nueva contraseña</button>
                  <button type="button" class="btn small danger" (click)="eliminar(u)" aria-label="Eliminar usuario">×</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="empty">{{ cargando() ? 'Cargando…' : 'No hay usuarios con ese filtro.' }}</td></tr>
          }
        </tbody>
      </table>
    </div>

    <form class="card" (ngSubmit)="crear()">
      <h2>Nuevo usuario del taller</h2>
      <p class="hint" style="margin-top: 0">
        Para un mecánico o administrativo con acceso completo a la gestión. Los accesos de clientes se crean desde la ficha de cada cliente.
      </p>
      <div class="toolbar" style="margin: 0">
        <label class="field" style="flex: 1; min-width: 220px">
          Usuario
          <input name="nuevo" [(ngModel)]="nuevo" autocapitalize="none" spellcheck="false" />
          <span class="hint">Letras sin tildes, números y . _ - @ +</span>
        </label>
        <button type="submit" class="btn primary" [disabled]="!nuevo.trim()">Crear usuario</button>
      </div>
    </form>
  `
})
export class Usuarios {
  private readonly api = inject(Api);

  protected readonly usuarios = signal<UsuarioAcceso[]>([]);
  protected readonly filtro = signal<Filtro>('');
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly credenciales = signal<{ datos: AccesoCreado; taller: boolean } | null>(null);
  protected nuevo = '';

  protected readonly busqueda = signal('');

  protected readonly visibles = computed(() => {
    const f = this.filtro();
    const q = this.busqueda().trim().toLowerCase();
    return this.usuarios().filter(u =>
      (!f || u.rol === f) && (!q || u.usuario.includes(q) || u.nombre.toLowerCase().includes(q)));
  });

  constructor() {
    this.cargar();
  }

  protected cuenta(rol: Rol) {
    return this.usuarios().filter(u => u.rol === rol).length;
  }

  protected crear() {
    this.api.crearUsuarioTaller(this.nuevo.trim()).subscribe({
      next: c => {
        this.nuevo = '';
        this.mostrar(c, true);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected restablecer(u: UsuarioAcceso) {
    if (confirm(`Se generará una contraseña temporal nueva para "${u.usuario}" y se cerrarán sus sesiones abiertas. ¿Continuar?`)) {
      this.api.restablecerUsuario(u.id).subscribe({
        next: c => this.mostrar(c, u.rol === 'Taller'),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  protected desbloquear(u: UsuarioAcceso) {
    this.api.desbloquearUsuario(u.id).subscribe({ next: () => this.cargar(), error: e => this.error.set(mensajeError(e)) });
  }

  protected eliminar(u: UsuarioAcceso) {
    const aviso = u.rol === 'Taller'
      ? `¿Eliminar el usuario del taller "${u.usuario}"? Dejará de poder entrar en la gestión.`
      : `¿Quitar el acceso de "${u.nombre}"? El cliente y sus datos no se borran.`;
    if (confirm(aviso)) {
      this.api.eliminarUsuario(u.id).subscribe({ next: () => this.cargar(), error: e => this.error.set(mensajeError(e)) });
    }
  }

  private mostrar(c: AccesoCreado, taller: boolean) {
    this.error.set(null);
    this.credenciales.set({ datos: c, taller });
    this.cargar();
  }

  private cargar() {
    this.api.usuarios().subscribe({
      next: u => {
        this.usuarios.set(u);
        this.cargando.set(false);
      },
      error: e => {
        this.cargando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
