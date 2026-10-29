import { Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { opciones, TIPOS_SERVICIO } from '../core/etiquetas';
import { TipoServicio } from '../core/models';

/** Casillas de tipos de servicio para usar con formControlName. */
@Component({
  selector: 'app-servicios-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ServiciosInput), multi: true }],
  template: `
    <div class="checks">
      @for (s of servicios; track s.valor) {
        <label>
          <input type="checkbox" [checked]="seleccion().includes(s.valor)" [disabled]="deshabilitado()" (change)="alternar(s.valor)" />
          {{ s.etiqueta }}
        </label>
      }
    </div>
  `
})
export class ServiciosInput implements ControlValueAccessor {
  protected readonly servicios = opciones(TIPOS_SERVICIO);
  protected readonly seleccion = signal<TipoServicio[]>([]);
  protected readonly deshabilitado = signal(false);

  private onChange: (v: TipoServicio[]) => void = () => {};
  private onTouched: () => void = () => {};

  protected alternar(s: TipoServicio) {
    const actual = this.seleccion();
    const nueva = actual.includes(s) ? actual.filter(x => x !== s) : [...actual, s];
    this.seleccion.set(nueva);
    this.onChange(nueva);
    this.onTouched();
  }

  writeValue(v: TipoServicio[] | null): void {
    this.seleccion.set(v ?? []);
  }
  registerOnChange(fn: (v: TipoServicio[]) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(disabled: boolean): void {
    this.deshabilitado.set(disabled);
  }
}
