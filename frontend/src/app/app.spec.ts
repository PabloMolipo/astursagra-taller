import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { GestionLayout } from './gestion/gestion-layout';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, GestionLayout],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the management navigation', async () => {
    const fixture = TestBed.createComponent(GestionLayout);
    await fixture.whenStable();
    const links = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')).map(a => a.textContent?.trim());
    expect(links).toEqual(['Tablero', 'Órdenes', 'Clientes', 'Vehículos', 'Diagnóstico', 'Mecánico virtual', 'Contabilidad', 'Usuarios', 'Web']);
  });
});
