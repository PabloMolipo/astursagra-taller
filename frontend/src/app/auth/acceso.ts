import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../core/api';
import { Auth } from '../core/auth';

@Component({
  selector: 'app-acceso',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './pantalla-acceso.scss',
  template: `
    <div class="pantalla">
      <form class="tarjeta" [formGroup]="form" (ngSubmit)="entrar()">
        <a routerLink="/" class="logo" aria-label="Volver a la web de AsturSagra">
          <img src="brand/astursagra-logo-lima.svg" alt="AsturSagra · Taller mecánico" />
        </a>
        <h1>Acceso</h1>
        <p class="ayuda">Clientes: consulta tus vehículos y el estado de tus reparaciones.</p>

        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }

        <label class="field">
          Usuario
          <input formControlName="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" />
        </label>
        <label class="field">
          Contraseña
          <span class="con-boton">
            <input formControlName="password" [type]="ver() ? 'text' : 'password'" autocomplete="current-password" />
            <button type="button" class="ver" (click)="ver.set(!ver())" [attr.aria-label]="ver() ? 'Ocultar contraseña' : 'Mostrar contraseña'">
              {{ ver() ? 'Ocultar' : 'Ver' }}
            </button>
          </span>
        </label>
        <label class="recordar">
          <input type="checkbox" formControlName="recordar" />
          Mantener la sesión en este dispositivo
        </label>

        <button type="submit" class="btn primary entrar" [disabled]="enviando()">
          {{ enviando() ? 'Entrando…' : 'Entrar' }}
        </button>
        <p class="pie">¿No tienes usuario o lo has olvidado? Pídeselo al taller.</p>
      </form>
    </div>
  `
})
export class Acceso {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);

  /** ?volver= para regresar a la página que pidió el acceso. */
  readonly volver = input<string>();

  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);
  protected readonly ver = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    usuario: ['', Validators.required],
    password: ['', Validators.required],
    recordar: [false]
  });

  protected entrar() {
    if (this.form.invalid) {
      this.error.set('Escribe tu usuario y tu contraseña.');
      return;
    }
    const { usuario, password, recordar } = this.form.getRawValue();
    this.enviando.set(true);
    this.auth.login(usuario, password, recordar).subscribe({
      next: s => {
        const destino = this.auth.inicio(s);
        const volver = this.volver();
        // Solo rutas internas de su propia área (evita redirecciones abiertas).
        const valido = volver?.startsWith('/') && !volver.startsWith('//') && !s.debeCambiarPassword && volver.startsWith(destino);
        this.router.navigateByUrl(valido ? volver! : destino);
      },
      error: e => {
        this.enviando.set(false);
        this.form.controls.password.reset('');
        this.error.set(mensajeError(e));
      }
    });
  }
}
