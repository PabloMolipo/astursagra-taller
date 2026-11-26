import { Component, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { catchError, forkJoin, of } from 'rxjs';
import { Api, mensajeError } from '../core/api';
import { ClienteDetalle, DatosTaller, FichaDiagnosis, MultimediaOrden, OrdenDetalle, VehiculoDetalle, VehiculoResumen } from '../core/models';
import { HojaInforme } from './hoja-informe';

/**
 * Informe de la reparación de una orden en una página lista para imprimir o guardar como PDF (A4, fondo blanco).
 * Antes de imprimir se elige qué incluir; la hoja en sí es el componente HojaInforme.
 */
@Component({
  selector: 'app-informe-reparacion',
  imports: [FormsModule, HojaInforme],
  template: `
    <div class="barra no-imprimir">
      <button type="button" class="btn primary" (click)="imprimir()" [disabled]="!orden()">🖨️ Imprimir o guardar en PDF</button>
      <button type="button" class="btn" (click)="cerrar()">Cerrar</button>
      <label><input type="checkbox" [(ngModel)]="importes" /> Importes</label>
      <label><input type="checkbox" [(ngModel)]="fotos" /> Fotos</label>
      @if (fotos) {
        <label title="Si se desmarca, también salen las fotos internas del taller"><input type="checkbox" [ngModel]="soloCliente()" (ngModelChange)="soloCliente.set($event)" /> Solo fotos visibles para el cliente</label>
      }
      <span class="hint">En el diálogo de impresión elige «Guardar como PDF» para enviarlo por WhatsApp o email.</span>
    </div>

    @if (error()) {
      <div class="error no-imprimir">{{ error() }}</div>
    }

    @if (orden(); as o) {
      <app-hoja-informe [orden]="o" [cliente]="cliente()" [datos]="datos()" [ficha]="ficha()" [multimedia]="multimedia()"
        [importes]="importes" [fotos]="fotos" [soloCliente]="soloCliente()" [vehiculo]="vehiculo()" [resumenVehiculo]="resumenVehiculo()" />
    } @else if (!error()) {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: #e9e9e9; padding: 1rem; color: #111; font-family: var(--font-body); }
    .barra { max-width: 210mm; margin: 0 auto 0.8rem; display: flex; flex-wrap: wrap; gap: 0.6rem 1rem; align-items: center; }
    .barra label { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.9rem; color: #222; cursor: pointer; }
    .barra .hint { color: #555; font-size: 0.8rem; flex-basis: 100%; }
    @media print {
      :host { background: #fff; padding: 0; }
      .no-imprimir { display: none !important; }
      @page { size: A4; margin: 14mm 13mm; }
    }
  `
})
export class InformeReparacion implements OnInit {
  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });

  protected readonly orden = signal<OrdenDetalle | null>(null);
  protected readonly cliente = signal<ClienteDetalle | null>(null);
  protected readonly datos = signal<DatosTaller | null>(null);
  protected readonly ficha = signal<FichaDiagnosis | null>(null);
  protected readonly multimedia = signal<MultimediaOrden[]>([]);
  protected readonly vehiculo = signal<VehiculoDetalle | null>(null);
  protected readonly resumenVehiculo = signal<VehiculoResumen | null>(null);
  protected readonly error = signal<string | null>(null);

  protected importes = true;
  protected fotos = true;
  protected readonly soloCliente = signal(true);

  ngOnInit() {
    forkJoin({
      orden: this.api.orden(this.id()),
      datos: this.api.datosPublicos(),
      // La diagnosis y las fotos son opcionales: si fallan, el informe sale sin ellas.
      ficha: this.api.ficha(this.id()).pipe(catchError(() => of(null))),
      multimedia: this.api.multimedia(this.id()).pipe(catchError(() => of([] as MultimediaOrden[])))
    }).subscribe({
      next: ({ orden, datos, ficha, multimedia }) => {
        this.orden.set(orden);
        this.datos.set(datos);
        this.ficha.set(ficha);
        this.multimedia.set(multimedia);
        document.title = `Informe OT-${String(orden.id).padStart(5, '0')} · ${orden.vehiculo.matricula ?? orden.vehiculo.marca}`;
        this.api.cliente(orden.vehiculo.clienteId).subscribe({ next: c => this.cliente.set(c), error: () => {} });
        // Imagen y datos del vehículo: opcionales, si fallan el informe sale con los datos de la orden.
        this.api.vehiculo(orden.vehiculo.id).subscribe({ next: v => this.vehiculo.set(v), error: () => {} });
        this.api.resumenVehiculo(orden.vehiculo.id).subscribe({ next: r => this.resumenVehiculo.set(r), error: () => {} });
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected imprimir() {
    window.print();
  }

  protected cerrar() {
    if (history.length > 1) history.back();
    else window.close();
  }
}
