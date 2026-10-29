import { Component, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, limpiar, mensajeError } from '../core/api';
import { iniciarVistaCliente } from '../core/vista-cliente';
import { opciones, TIPOS_CLIENTE } from '../core/etiquetas';
import { ClienteDetalle, ClienteRequest, TipoCliente } from '../core/models';
import { EtiquetaPipe, IdentificacionPipe } from '../shared/pipes';
import { AccesoPortal } from './acceso-portal';

@Component({
  selector: 'app-cliente-form',
  imports: [ReactiveFormsModule, RouterLink, EtiquetaPipe, IdentificacionPipe, AccesoPortal],
  template: `
    <div class="page-header">
      <div>
        <h1>{{ id() ? cliente()?.nombre ?? 'Cliente' : 'Nuevo cliente' }}</h1>
        @if (cliente(); as c) {
          <div class="subtitle">Cliente desde {{ c.fechaAlta.slice(0, 10) }}</div>
        }
      </div>
      <div class="toolbar" style="margin: 0">
        @if (cliente(); as c) {
          <button type="button" class="btn" (click)="verComoCliente(c.id)" title="Ver su área de cliente tal como la ve el cliente, sin entrar con su usuario">👁 Ver su área de cliente</button>
        }
        <a class="btn" routerLink="/gestion/clientes">← Volver</a>
      </div>
    </div>

    @if (error()) {
      <div class="error">{{ error() }}</div>
    }

    <form class="card" [formGroup]="form" (ngSubmit)="guardar()">
      <div class="form-grid">
        <label class="field">
          Tipo
          <select formControlName="tipo">
            @for (o of tipos; track o.valor) {
              <option [value]="o.valor">{{ o.etiqueta }}</option>
            }
          </select>
        </label>
        <label class="field" style="grid-column: span 2">
          {{ form.value.tipo === 'Empresa' ? 'Razón social' : 'Nombre y apellidos' }} *
          <input formControlName="nombre" />
        </label>
        <label class="field">
          NIF/CIF
          <input formControlName="nifCif" class="mono" />
        </label>
        <label class="field">
          Teléfono
          <input formControlName="telefono" type="tel" />
        </label>
        <label class="field">
          Email
          <input formControlName="email" type="email" />
        </label>
        <label class="field full">
          Dirección
          <input formControlName="direccion" />
        </label>
        <label class="field">
          Código postal
          <input formControlName="codigoPostal" />
        </label>
        <label class="field">
          Población
          <input formControlName="poblacion" />
        </label>
        <label class="field">
          Provincia
          <input formControlName="provincia" />
        </label>
        <label class="field full">
          Notas
          <textarea formControlName="notas"></textarea>
        </label>
      </div>

      <div class="form-actions">
        @if (id()) {
          <button type="button" class="btn danger" (click)="eliminar()" style="margin-right: auto">Eliminar</button>
        }
        <button type="submit" class="btn primary" [disabled]="guardando()">
          {{ id() ? 'Guardar cambios' : 'Crear cliente' }}
        </button>
      </div>
    </form>

    @if (cliente(); as c) {
      <section class="card">
        <div class="page-header" style="margin-bottom: 0.75rem">
          <h2 style="margin: 0">Vehículos</h2>
          <a class="btn small" [routerLink]="['/gestion/vehiculos/nuevo']" [queryParams]="{ clienteId: c.id }">+ Añadir vehículo</a>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Matrícula / bastidor</th><th>Tipo</th><th>Vehículo</th><th>Año</th></tr>
            </thead>
            <tbody>
              @for (v of c.vehiculos; track v.id) {
                <tr class="clickable" (click)="router.navigate(['/gestion/vehiculos', v.id])">
                  <td class="mono">{{ v | identificacion }}</td>
                  <td>{{ v.tipo | etiqueta: 'vehiculo' }}</td>
                  <td>{{ v.marca }} {{ v.modelo }}</td>
                  <td>{{ v.anio }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">Este cliente no tiene vehículos.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <app-acceso-portal [clienteId]="c.id" [sugerencia]="c.telefono ?? c.email" />
    }
  `
})
export class ClienteForm implements OnInit {
  private readonly api = inject(Api);
  protected readonly router = inject(Router);

  /** Abre el área de clientes con los datos de este cliente, en solo lectura y sin cambiar de sesión. */
  protected verComoCliente(id: number) {
    iniciarVistaCliente(id);
    this.router.navigate(['/mi-area']);
  }

  /** Parámetro de ruta :id (ausente al crear). */
  readonly id = input(undefined, { transform: numberAttribute });

  protected readonly tipos = opciones(TIPOS_CLIENTE);
  protected readonly cliente = signal<ClienteDetalle | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    tipo: ['Particular' as TipoCliente],
    nombre: ['', [Validators.required, Validators.maxLength(200)]],
    nifCif: [''],
    telefono: [''],
    email: ['', Validators.email],
    direccion: [''],
    codigoPostal: [''],
    poblacion: [''],
    provincia: [''],
    notas: ['']
  });

  ngOnInit() {
    const id = this.id();
    if (id) {
      this.api.cliente(id).subscribe({
        next: c => this.mostrar(c),
        error: e => this.error.set(mensajeError(e))
      });
    }
  }

  protected guardar() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Revisa los campos marcados.');
      return;
    }

    const req = limpiar(this.form.getRawValue()) as ClienteRequest;
    const id = this.id();
    this.guardando.set(true);

    (id ? this.api.actualizarCliente(id, req) : this.api.crearCliente(req)).subscribe({
      next: c => {
        this.guardando.set(false);
        if (id) {
          this.mostrar(c);
        } else {
          this.router.navigate(['/gestion/clientes', c.id]);
        }
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }

  protected eliminar() {
    const c = this.cliente();
    if (!c || !confirm(`¿Eliminar el cliente "${c.nombre}"?`)) {
      return;
    }
    this.api.eliminarCliente(c.id).subscribe({
      next: () => this.router.navigate(['/gestion/clientes']),
      error: e => this.error.set(mensajeError(e))
    });
  }

  private mostrar(c: ClienteDetalle) {
    this.form.reset({
      tipo: c.tipo,
      nombre: c.nombre,
      nifCif: c.nifCif ?? '',
      telefono: c.telefono ?? '',
      email: c.email ?? '',
      direccion: c.direccion ?? '',
      codigoPostal: c.codigoPostal ?? '',
      poblacion: c.poblacion ?? '',
      provincia: c.provincia ?? '',
      notas: c.notas ?? ''
    });
    this.cliente.set(c);
    this.error.set(null);
  }
}
