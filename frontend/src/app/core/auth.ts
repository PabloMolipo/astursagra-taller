import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { catchError, firstValueFrom, of, tap, throwError } from 'rxjs';
import { Rol, SesionUsuario } from './models';
import { terminarVistaCliente, vistaClienteId } from './vista-cliente';

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** null = sin sesión. undefined = aún no se ha comprobado. */
  readonly sesion = signal<SesionUsuario | null | undefined>(undefined);
  private carga?: Promise<SesionUsuario | null>;

  /** Comprueba la sesión una vez (la cookie la pone el servidor; aquí no se guarda nada). */
  cargar(): Promise<SesionUsuario | null> {
    this.carga ??= firstValueFrom(
      this.http.get<SesionUsuario>('/api/auth/sesion').pipe(catchError(() => of(null)))
    ).then(s => {
      this.sesion.set(s);
      return s;
    });
    return this.carga;
  }

  login(usuario: string, password: string, recordar: boolean) {
    return this.http.post<SesionUsuario>('/api/auth/login', { usuario, password, recordar }).pipe(tap(s => this.establecer(s)));
  }

  cambiarPassword(actual: string, nueva: string) {
    return this.http.post<SesionUsuario>('/api/auth/cambiar-password', { actual, nueva }).pipe(tap(s => this.establecer(s)));
  }

  logout() {
    terminarVistaCliente();
    this.http.post('/api/auth/logout', {}).subscribe({ complete: () => this.cerrada(), error: () => this.cerrada() });
  }

  /** Sesión caducada o cerrada en el servidor. */
  cerrada(volver?: string) {
    this.establecer(null);
    this.router.navigate(['/acceso'], volver ? { queryParams: { volver } } : {});
  }

  /** Página de inicio de cada rol. */
  inicio(s: SesionUsuario | null): string {
    if (!s) {
      return '/acceso';
    }
    if (s.debeCambiarPassword) {
      return '/cambiar-password';
    }
    return s.rol === 'Taller' ? '/gestion' : '/mi-area';
  }

  private establecer(s: SesionUsuario | null) {
    this.sesion.set(s);
    this.carga = Promise.resolve(s);
  }
}

function requiereRol(rol?: Rol): CanActivateFn {
  return async (_route, state): Promise<boolean | UrlTree> => {
    const auth = inject(Auth);
    const router = inject(Router);
    const s = await auth.cargar();

    if (!s) {
      return router.createUrlTree(['/acceso'], { queryParams: { volver: state.url } });
    }
    if (s.debeCambiarPassword) {
      return router.createUrlTree(['/cambiar-password']);
    }
    if (rol && s.rol !== rol) {
      return router.parseUrl(auth.inicio(s));
    }
    return true;
  };
}

export const soloTaller = requiereRol('Taller');
export const soloCliente = requiereRol('Cliente');

/** Área de clientes: el cliente, o el taller en vista previa de un cliente (desde su ficha). */
export const areaCliente: CanActivateFn = async (route, state) => {
  const auth = inject(Auth);
  const s = await auth.cargar();
  if (s?.rol === 'Taller') {
    return vistaClienteId() ? true : inject(Router).parseUrl('/gestion/clientes');
  }
  return (await soloCliente(route, state)) as boolean | UrlTree;
};

/** Para cambiar la contraseña basta con tener sesión, aunque sea temporal. */
export const conSesion: CanActivateFn = async (_route, state) => {
  const s = await inject(Auth).cargar();
  return s ? true : inject(Router).createUrlTree(['/acceso'], { queryParams: { volver: state.url } });
};

/** Si ya hay sesión, la página de acceso lleva directamente a su área. */
export const sinSesion: CanActivateFn = async () => {
  const auth = inject(Auth);
  const s = await auth.cargar();
  return s ? inject(Router).parseUrl(auth.inicio(s)) : true;
};

/**
 * Si el servidor responde 401 en mitad del uso (sesión caducada o contraseña restablecida), vuelve al acceso.
 * Las llamadas de /api/auth gestionan sus propios errores.
 */
export const sesionInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const router = inject(Router);
  return next(req).pipe(
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && e.status === 401 && !req.url.startsWith('/api/auth/') && auth.sesion()) {
        auth.cerrada(router.url);
      }
      return throwError(() => e);
    })
  );
};
