import { Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Auth } from '../core/auth';
import { DatosPublicos } from './datos-publicos';

/** Marco de la web pública: cabecera con menú, contenido y pie con los datos de contacto. */
@Component({
  selector: 'app-publico-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header class="pub-header">
      <div class="pub-contenedor pub-header-fila">
        <a routerLink="/" class="pub-logo" aria-label="AsturSagra, inicio">
          <img src="brand/astursagra-logo-lima.svg" alt="AsturSagra · Taller mecánico" />
        </a>
        <button type="button" class="pub-hamburguesa" (click)="menu.set(!menu())" [attr.aria-expanded]="menu()" aria-controls="menu-publico">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          <span class="sr-only">Menú</span>
        </button>
        <nav id="menu-publico" class="pub-nav" [class.abierto]="menu()">
          <a routerLink="/" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">Inicio</a>
          <a routerLink="/servicios" routerLinkActive="activo">Servicios</a>
          <a routerLink="/trabajos" routerLinkActive="activo">Trabajos</a>
          <a routerLink="/contacto" routerLinkActive="activo">Contacto</a>
          @if (datos.telefonoUrl(); as tel) {
            <a class="pub-btn pub-btn-borde" [href]="tel">Llamar</a>
          }
          <a class="pub-btn pub-btn-azul" [routerLink]="areaUrl()">{{ areaTexto() }}</a>
        </nav>
      </div>
    </header>

    <main>
      <router-outlet />
    </main>

    <footer class="pub-footer">
      <div class="pub-contenedor pub-footer-rejilla">
        <div>
          <img src="brand/astursagra-logo-lima.svg" alt="AsturSagra · Taller mecánico" class="pub-footer-logo" />
          <p>{{ datos.datos()?.lema ?? 'Reparación de vehículos' }}</p>
        </div>
        <div>
          <h3>Contacto</h3>
          @if (datos.direccionCompleta(); as dir) {
            <p>{{ dir }}</p>
          }
          @if (datos.datos()?.telefono; as tel) {
            <p><a [href]="datos.telefonoUrl()">{{ tel }}</a></p>
          }
          @if (datos.datos()?.email; as email) {
            <p><a [href]="'mailto:' + email">{{ email }}</a></p>
          }
        </div>
        <div>
          <h3>Horario</h3>
          <p class="pre">{{ datos.datos()?.horario ?? 'Consúltanos' }}</p>
        </div>
        <div>
          <h3>La web</h3>
          <p><a routerLink="/servicios">Servicios</a></p>
          <p><a routerLink="/trabajos">Trabajos realizados</a></p>
          <p><a routerLink="/acceso">Área de clientes</a></p>
        </div>
      </div>
      <div class="pub-contenedor pub-legal">© {{ anio }} {{ datos.datos()?.nombre ?? 'AsturSagra' }} · Taller mecánico</div>
    </footer>
  `
})
export class PublicoLayout {
  protected readonly datos = inject(DatosPublicos);
  private readonly auth = inject(Auth);
  protected readonly menu = signal(false);
  protected readonly anio = new Date().getFullYear();

  protected readonly areaUrl = computed(() => {
    const s = this.auth.sesion();
    return s ? this.auth.inicio(s) : '/acceso';
  });
  protected readonly areaTexto = computed(() => {
    const s = this.auth.sesion();
    return !s ? 'Área clientes' : s.rol === 'Taller' ? 'Gestión' : 'Mi área';
  });

  constructor() {
    this.datos.cargar();
    this.auth.cargar();
    // Cierra el menú móvil al cambiar de página (el router ya sube al principio).
    inject(Router).events.pipe(filter(e => e instanceof NavigationEnd)).subscribe(() => this.menu.set(false));
  }
}
