import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { areaCliente, Auth, conSesion, sinSesion } from './auth';
import { SesionUsuario } from './models';

/** Los guards esperan la sesión (asíncrona): comprueba que no usan inject() después de esperarla. */
describe('guards de sesión', () => {
  const cliente = { usuario: 'cli', rol: 'Cliente', nombre: 'Cliente', clienteId: 1, debeCambiarPassword: false } as SesionUsuario;
  let sesion: SesionUsuario | null;

  beforeEach(() => {
    sesion = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: Auth,
          useValue: {
            cargar: () => Promise.resolve(sesion),
            inicio: (s: SesionUsuario | null) => (s ? (s.rol === 'Taller' ? '/gestion' : '/mi-area') : '/acceso')
          }
        }
      ]
    });
  });

  const ejecutar = (guard: typeof areaCliente, url = '/mi-area') =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;
  const ruta = (r: boolean | UrlTree) => (r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r);

  it('deja entrar al cliente en su área', async () => {
    sesion = cliente;
    expect(await ejecutar(areaCliente)).toBe(true);
  });

  it('manda al taller sin vista previa a la lista de clientes', async () => {
    sesion = { ...cliente, rol: 'Taller', clienteId: null };
    expect(ruta(await ejecutar(areaCliente))).toBe('/gestion/clientes');
  });

  it('sin sesión, el área de clientes lleva al acceso', async () => {
    expect(ruta(await ejecutar(areaCliente))).toBe('/acceso?volver=%2Fmi-area');
  });

  it('con sesión, la página de acceso lleva a su área', async () => {
    sesion = cliente;
    expect(ruta(await ejecutar(sinSesion, '/acceso'))).toBe('/mi-area');
  });

  it('cambiar la contraseña sin sesión lleva al acceso', async () => {
    expect(ruta(await ejecutar(conSesion, '/cambiar-password'))).toBe('/acceso?volver=%2Fcambiar-password');
  });
});
