import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, mensajeError } from '../core/api';
import { opciones, TIPOS_DOCUMENTO } from '../core/etiquetas';
import { DocumentoTecnico, DocumentoTecnicoRequest } from '../core/models';

/** Formulario para subir un documento técnico o editar sus datos. Se puede abrir ya rellenado con un vehículo. */
@Component({
  selector: 'app-form-documento',
  imports: [FormsModule],
  template: `
    <form (ngSubmit)="guardar()">
      @if (error()) {
        <div class="error">{{ error() }}</div>
      }
      <div class="form-grid">
        @if (!documento()) {
          <label class="field full">
            Archivo * (PDF, JPG, PNG o WebP, hasta 25 MB)
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" (change)="elegir($event)" />
          </label>
        }
        <label class="field" style="grid-column: span 2">Título *<input name="titulo" [(ngModel)]="datos.titulo" placeholder="Esquema inyección y precalentamiento" /></label>
        <label class="field">
          Tipo
          <select name="tipo" [(ngModel)]="datos.tipo">@for (t of tipos; track t.valor) {<option [value]="t.valor">{{ t.etiqueta }}</option>}</select>
        </label>
        <label class="field">Marca<input name="marca" [(ngModel)]="datos.marca" placeholder="Volkswagen" /></label>
        <label class="field">Modelo<input name="modelo" [(ngModel)]="datos.modelo" placeholder="Golf" /></label>
        <label class="field">Código de motor<input name="motor" [(ngModel)]="datos.motor" class="mono" placeholder="BKC" /></label>
        <label class="field">Año desde<input name="desde" type="number" [(ngModel)]="datos.anioDesde" /></label>
        <label class="field">Año hasta<input name="hasta" type="number" [(ngModel)]="datos.anioHasta" /></label>
        <label class="field">Sistema<input name="sistema" [(ngModel)]="datos.sistema" placeholder="Inyección, cierre centralizado…" /></label>
        <label class="field full">Notas<input name="notas" [(ngModel)]="datos.notas" /></label>
      </div>
      <p class="hint">
        Sin marca, el documento solo aparece en la biblioteca. Con marca (y si quieres modelo, motor y años) aparece en
        cada vehículo compatible. Respeta las condiciones de tu suscripción si el documento viene de un proveedor.
      </p>
      <div class="form-actions">
        <button type="button" class="btn" (click)="cancelar.emit()">Cancelar</button>
        <button type="submit" class="btn primary" [disabled]="guardando()">{{ guardando() ? 'Guardando…' : documento() ? 'Guardar cambios' : 'Subir documento' }}</button>
      </div>
    </form>
  `
})
export class FormDocumento implements OnInit {
  private readonly api = inject(Api);

  /** Documento a editar; si no hay, se sube uno nuevo. */
  readonly documento = input<DocumentoTecnico | null>(null);
  /** Datos iniciales (p. ej. los del vehículo) al subir uno nuevo. */
  readonly inicial = input<Partial<DocumentoTecnicoRequest>>({});
  readonly guardado = output<DocumentoTecnico>();
  readonly cancelar = output<void>();

  protected readonly tipos = opciones(TIPOS_DOCUMENTO);
  protected readonly error = signal<string | null>(null);
  protected readonly guardando = signal(false);
  protected datos: DocumentoTecnicoRequest = { titulo: '', tipo: 'EsquemaElectrico', marca: null, modelo: null, motor: null, anioDesde: null, anioHasta: null, sistema: null, notas: null };
  private archivo: File | null = null;

  ngOnInit() {
    const d = this.documento();
    this.datos = d ? { ...d } : { ...this.datos, ...this.inicial() };
  }

  protected elegir(e: Event) {
    this.archivo = (e.target as HTMLInputElement).files?.[0] ?? null;
    if (this.archivo && !this.datos.titulo) {
      this.datos.titulo = this.archivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
    }
  }

  protected guardar() {
    const datos = Object.fromEntries(
      Object.entries(this.datos).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v ?? null])
    ) as DocumentoTecnicoRequest;
    if (!datos.titulo) {
      this.error.set('El título es obligatorio.');
      return;
    }
    const d = this.documento();
    if (!d && !this.archivo) {
      this.error.set('Elige el archivo.');
      return;
    }
    this.guardando.set(true);
    (d ? this.api.actualizarDocumento(d.id, datos) : this.api.subirDocumento(this.archivo!, datos)).subscribe({
      next: r => {
        this.guardando.set(false);
        this.guardado.emit(r);
      },
      error: e => {
        this.guardando.set(false);
        this.error.set(mensajeError(e));
      }
    });
  }
}
