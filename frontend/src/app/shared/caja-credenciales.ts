import { Component, input, output, signal } from '@angular/core';
import { AccesoCreado } from '../core/models';

/** Muestra una sola vez el usuario y la contraseña temporal recién generados, con botón para copiar el mensaje. */
@Component({
  selector: 'app-caja-credenciales',
  template: `
    @let c = credenciales();
    <div class="credenciales" role="status">
      <p><strong>{{ titulo() }}</strong> La contraseña es temporal: tendrá que cambiarla al entrar. No se volverá a mostrar.</p>
      <dl>
        <div><dt>Dirección</dt><dd class="mono">{{ origen }}/acceso</dd></div>
        <div><dt>Usuario</dt><dd class="mono">{{ c.usuario }}</dd></div>
        <div><dt>Contraseña temporal</dt><dd class="mono grande">{{ c.passwordTemporal }}</dd></div>
      </dl>
      <div class="toolbar" style="margin: 0.75rem 0 0">
        <button type="button" class="btn small" (click)="copiar()">{{ copiado() ? 'Copiado ✓' : 'Copiar mensaje' }}</button>
        <button type="button" class="btn small" (click)="cerrar.emit()">Hecho</button>
      </div>
    </div>
  `,
  styles: `
    .credenciales {
      background: var(--warning-tint); border: 1px solid rgba(255, 176, 32, 0.4); border-radius: var(--radius); padding: 0.9rem 1rem; margin-bottom: 1rem;
      p { margin: 0 0 0.6rem; }
      dl { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.5rem 1.5rem; margin: 0; }
      dt { font-size: 0.8rem; color: var(--muted); }
      dd { margin: 0.1rem 0 0; overflow-wrap: anywhere; }
      .grande { font-size: 1.25rem; font-weight: 700; letter-spacing: 0.05em; }
    }
  `
})
export class CajaCredenciales {
  readonly credenciales = input.required<AccesoCreado>();
  readonly titulo = input('Pásale estos datos al cliente.');
  /** Texto de saludo del mensaje copiado. */
  readonly saludo = input('Hola, ya puedes consultar tus vehículos y reparaciones en');
  readonly cerrar = output<void>();

  protected readonly origen = window.location.origin;
  protected readonly copiado = signal(false);

  protected copiar() {
    const c = this.credenciales();
    const texto = `${this.saludo()} ${this.origen}/acceso\nUsuario: ${c.usuario}\nContraseña temporal: ${c.passwordTemporal}\n(Te pedirá cambiarla al entrar.)`;
    navigator.clipboard.writeText(texto).then(() => {
      this.copiado.set(true);
      setTimeout(() => this.copiado.set(false), 2000);
    });
  }
}
