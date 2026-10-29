import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { Acceso, AccesoCreado } from '../core/models';
import { CajaCredenciales } from '../shared/caja-credenciales';

/** Bloque de la ficha del cliente para darle, restablecer o quitar el acceso a "Mi área". */
@Component({
  selector: 'app-acceso-portal',
  imports: [FormsModule, DatePipe, CajaCredenciales],
  template: `
    <section class="card">
      <h2>Acceso al área de clientes</h2>

      @if (error()) {
        <div class="error">{{ error() }}</div>
      }

      @if (creado(); as c) {
        <app-caja-credenciales [credenciales]="c" (cerrar)="creado.set(null)" />
      }

      @if (cargando()) {
        <p class="hint">Cargando…</p>
      } @else if (acceso(); as a) {
        <dl class="datos">
          <div><dt>Usuario</dt><dd class="mono">{{ a.usuario }}</dd></div>
          <div><dt>Alta</dt><dd>{{ a.fechaAlta | date: 'dd/MM/yyyy' }}</dd></div>
          <div><dt>Último acceso</dt><dd>{{ a.ultimoAcceso ? (a.ultimoAcceso | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}</dd></div>
          <div>
            <dt>Estado</dt>
            <dd>
              @if (a.bloqueado) {
                <span class="badge estado-Cancelado">Bloqueado por intentos fallidos</span>
              } @else if (a.pendienteCambio) {
                <span class="badge estado-EnDiagnostico">Pendiente de primer acceso</span>
              } @else {
                <span class="badge estado-Listo">Activo</span>
              }
            </dd>
          </div>
        </dl>
        <div class="form-actions">
          <button type="button" class="btn danger" (click)="quitar()" style="margin-right: auto">Quitar acceso</button>
          <button type="button" class="btn" (click)="restablecer()">{{ a.bloqueado ? 'Desbloquear y nueva contraseña' : 'Nueva contraseña' }}</button>
        </div>
      } @else {
        <p class="hint" style="margin-top: 0">Este cliente aún no puede entrar en "Mi área" para ver sus vehículos y reparaciones.</p>
        <form class="toolbar" (ngSubmit)="crear()" style="margin: 0">
          <label class="field" style="flex: 1; min-width: 220px">
            Usuario
            <input name="usuario" [(ngModel)]="usuario" autocapitalize="none" spellcheck="false" />
            <span class="hint">Su teléfono o email, por ejemplo. Letras sin tildes, números y . _ - @ +</span>
          </label>
          <button type="submit" class="btn primary" [disabled]="!usuario.trim()">Dar acceso</button>
        </form>
      }
    </section>
  `
})
export class AccesoPortal implements OnInit {
  private readonly api = inject(Api);

  readonly clienteId = input.required<number>();
  /** Usuario propuesto (teléfono o email del cliente). */
  readonly sugerencia = input<string | null>(null);

  protected readonly acceso = signal<Acceso | null>(null);
  protected readonly creado = signal<AccesoCreado | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal<string | null>(null);
  protected usuario = '';

  ngOnInit() {
    this.usuario = (this.sugerencia() ?? '').replace(/\s+/g, '').toLowerCase();
    this.cargar();
  }

  protected crear() {
    this.api.crearAcceso(this.clienteId(), this.usuario.trim()).subscribe({
      next: c => this.mostrarCredenciales(c),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected restablecer() {
    if (!confirm('Se generará una contraseña temporal nueva y se cerrarán las sesiones abiertas del cliente. ¿Continuar?')) {
      return;
    }
    this.api.restablecerAcceso(this.clienteId()).subscribe({
      next: c => this.mostrarCredenciales(c),
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected quitar() {
    if (!confirm('El cliente dejará de poder entrar en "Mi área". ¿Quitar el acceso?')) {
      return;
    }
    this.api.eliminarAcceso(this.clienteId()).subscribe({
      next: () => {
        this.acceso.set(null);
        this.creado.set(null);
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  private mostrarCredenciales(c: AccesoCreado) {
    this.error.set(null);
    this.creado.set(c);
    this.cargar();
  }

  private cargar() {
    this.api.acceso(this.clienteId()).subscribe({
      next: a => {
        this.acceso.set(a);
        this.cargando.set(false);
      },
      error: (e: unknown) => {
        this.cargando.set(false);
        this.acceso.set(null);
        if (!(e instanceof HttpErrorResponse && e.status === 404)) {
          this.error.set(mensajeError(e));
        }
      }
    });
  }
}
