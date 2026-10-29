import { Component, computed, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { mensajeError } from '../core/api';
import { Auth } from '../core/auth';

function coinciden(grupo: AbstractControl): ValidationErrors | null {
  return grupo.get('nueva')?.value === grupo.get('repetir')?.value ? null : { noCoinciden: true };
}

@Component({
  selector: 'app-cambiar-password',
  imports: [ReactiveFormsModule, RouterLink],
  styleUrl: './pantalla-acceso.scss',
  template: `
    <div class="pantalla">
      <form class="tarjeta" [formGroup]="form" (ngSubmit)="guardar()">
        <a routerLink="/" class="logo" aria-label="Volver a la web de AsturSagra">
          <img src="brand/astursagra-logo-lima.svg" alt="AsturSagra · Taller mecánico" />
        </a>
        <h1>{{ obligatorio() ? 'Elige tu contraseña' : 'Cambiar contraseña' }}</h1>
        @if (obligatorio()) {
          <p class="ayuda">Estás usando una contraseña temporal. Elige una nueva que solo sepas tú para continuar.</p>
        }

        @if (error()) {
          <div class="error" role="alert">{{ error() }}</div>
        }

        <label class="field">
          {{ obligatorio() ? 'Contraseña temporal' : 'Contraseña actual' }}
          <input formControlName="actual" type="password" autocomplete="current-password" />
        </label>
        <label class="field">
          Contraseña nueva
          <input formControlName="nueva" type="password" autocomplete="new-password" />
          <span class="hint">Al menos 8 caracteres, con alguna letra minúscula y algún número.</span>
        </label>
        <label class="field">
          Repite la contraseña nueva
          <input formControlName="repetir" type="password" autocomplete="new-password" />
        </label>

        <button type="submit" class="btn primary entrar" [disabled]="enviando()">Guardar contraseña</button>
        @if (!obligatorio()) {
          <p class="pie"><a [routerLink]="volverA()">Cancelar</a></p>
        } @else {
          <p class="pie"><button type="button" class="enlace" (click)="auth.logout()">Salir</button></p>
        }
      </form>
    </div>
  `
})
export class CambiarPassword {
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);

  protected readonly obligatorio = computed(() => this.auth.sesion()?.debeCambiarPassword ?? false);
  protected readonly volverA = computed(() => this.auth.inicio(this.auth.sesion() ?? null));
  protected readonly error = signal<string | null>(null);
  protected readonly enviando = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      actual: ['', Validators.required],
      nueva: ['', [Validators.required, Validators.minLength(8)]],
      repetir: ['', Validators.required]
    },
    { validators: coinciden }
  );

  protected guardar() {
    const v = this.form.getRawValue();
    if (!v.actual || !v.nueva) {
      this.error.set('Rellena todos los campos.');
      return;
    }
    if (this.form.hasError('noCoinciden')) {
      this.error.set('Las dos contraseñas nuevas no coinciden.');
      return;
    }
    if (this.form.invalid) {
      this.error.set('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }

    this.enviando.set(true);
    this.auth.cambiarPassword(v.actual, v.nueva).subscribe({
      next: s => this.router.navigateByUrl(this.auth.inicio(s)),
      error: e => {
        this.enviando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
