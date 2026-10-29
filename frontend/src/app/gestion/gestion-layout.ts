import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MenuUsuario } from '../shared/menu-usuario';

/** Marco del área de gestión del taller. */
@Component({
  selector: 'app-gestion-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MenuUsuario],
  host: { class: 'marco' },
  template: `
    <header class="marco-header">
      <a class="marca" routerLink="/gestion" aria-label="AsturSagra, gestión">
        <img src="brand/astursagra-simbolo-lima.svg" alt="" width="36" height="36" />
        <span class="nombre"><span class="astur">Astur</span><span class="sagra">Sagra</span></span>
      </a>
      <nav class="marco-nav">
        <a routerLink="/gestion/tablero" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="5" height="16" /><rect x="10" y="4" width="5" height="10" /><rect x="17" y="4" width="4" height="13" /></svg>
          Tablero
        </a>
        <a routerLink="/gestion/ordenes" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v3H9z" /><path d="M7 5H5v16h14V5h-2" /><path d="M9 12h6M9 16h4" /></svg>
          Órdenes
        </a>
        <a routerLink="/gestion/clientes" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.9 3 2.9 3 5.5" /></svg>
          Clientes
        </a>
        <a routerLink="/gestion/vehiculos" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 16v-4l2-5h14l2 5v4z" /><path d="M3 12h18" /><circle cx="7.5" cy="16.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></svg>
          Vehículos
        </a>
        <a routerLink="/gestion/diagnostico" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h4l2-5 4 10 2-5h6" /></svg>
          Diagnóstico
        </a>
        <a routerLink="/gestion/mecanico" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-4 4v-4H4z" /><path d="M14.5 8.5a2 2 0 1 0-2.7 2.7l-2.3 2.3 1 1 2.3-2.3a2 2 0 0 0 2.7-2.7l-1.1 1.1-1-1z" /></svg>
          Mecánico virtual
        </a>
        <a routerLink="/gestion/contabilidad" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
          Contabilidad
        </a>
        <a routerLink="/gestion/usuarios" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          Usuarios
        </a>
        <a routerLink="/gestion/web" routerLinkActive="active">
          <svg class="icono" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" /></svg>
          Web
        </a>
      </nav>
      <div class="marco-derecha">
        @if (apiCaida()) {
          <span class="estado-api">Sin conexión con la base de datos</span>
        }
        <app-menu-usuario />
      </div>
    </header>

    <section class="hero" aria-hidden="true">
      <div class="hero-texto">
        <p class="lema">Reparación de vehículos</p>
        <p class="servicios">Mecánica · Electromecánica · Programación · Chapa y pintura</p>
      </div>
    </section>

    <main class="marco-main">
      <router-outlet />
    </main>
  `
})
export class GestionLayout {
  protected readonly apiCaida = signal(false);

  constructor() {
    inject(HttpClient).get<{ database: string }>('/api/health').subscribe({
      next: h => this.apiCaida.set(h.database !== 'up'),
      error: () => this.apiCaida.set(true)
    });
  }
}
