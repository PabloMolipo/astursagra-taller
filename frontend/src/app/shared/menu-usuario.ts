import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../core/auth';

/** Nombre del usuario con sesión y su menú (cambiar contraseña, salir). */
@Component({
  selector: 'app-menu-usuario',
  imports: [RouterLink],
  template: `
    @if (auth.sesion(); as s) {
      <div class="menu-usuario" (focusout)="cerrarSiSale($event)">
        <button type="button" class="disparador" [attr.aria-expanded]="abierto()" (click)="abierto.set(!abierto())">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></svg>
          <span class="nombre">{{ s.nombre }}</span>
        </button>
        @if (abierto()) {
          <div class="desplegable" role="menu">
            <div class="cabecera">
              <strong>{{ s.nombre }}</strong>
              <span>{{ s.usuario }} · {{ s.rol === 'Taller' ? 'Taller' : 'Cliente' }}</span>
            </div>
            <a role="menuitem" routerLink="/cambiar-password" (click)="abierto.set(false)">Cambiar contraseña</a>
            <a role="menuitem" routerLink="/" (click)="abierto.set(false)">Ver la web</a>
            <button role="menuitem" type="button" (click)="auth.logout()">Salir</button>
          </div>
        }
      </div>
    }
  `,
  styles: `
    .menu-usuario { position: relative; }
    .disparador {
      display: flex; align-items: center; gap: 0.45rem; background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.18); color: #fff; border-radius: var(--radius); padding: 0.3rem 0.8rem;
      font: inherit; cursor: pointer;
      &:hover { background: rgba(255, 255, 255, 0.16); }
    }
    .nombre { max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .desplegable {
      position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 220px; background: var(--surface-2);
      border: 1px solid var(--border); border-radius: var(--radius); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
      display: flex; flex-direction: column; padding: 0.35rem 0;
      a, button {
        text-align: left; padding: 0.55rem 1rem; color: var(--text); background: none; border: 0; font: inherit;
        cursor: pointer; text-decoration: none;
        &:hover { background: var(--primary-tint); }
      }
    }
    .cabecera {
      display: flex; flex-direction: column; padding: 0.5rem 1rem 0.6rem; border-bottom: 1px solid var(--border);
      margin-bottom: 0.3rem; color: var(--text);
      span { font-size: 0.8rem; color: var(--muted); }
    }
  `
})
export class MenuUsuario {
  protected readonly auth = inject(Auth);
  protected readonly abierto = signal(false);

  protected cerrarSiSale(e: FocusEvent) {
    const destino = e.relatedTarget as Node | null;
    if (!destino || !(e.currentTarget as HTMLElement).contains(destino)) {
      this.abierto.set(false);
    }
  }
}
