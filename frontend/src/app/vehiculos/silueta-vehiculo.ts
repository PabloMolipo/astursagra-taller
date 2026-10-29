import { Component, computed, input } from '@angular/core';
import { TipoVehiculo } from '../core/models';

type Forma = 'turismo' | 'furgoneta' | 'moto' | 'camion' | 'tractor';

const FORMAS: Record<TipoVehiculo, Forma> = {
  Turismo: 'turismo',
  Furgoneta: 'furgoneta',
  Moto: 'moto',
  Camion: 'camion',
  Tractor: 'tractor',
  MaquinariaAgricola: 'tractor',
  Otro: 'turismo'
};

/** Silueta lineal en lima del tipo de vehículo, de perfil: la imagen de la ficha cuando no hay foto ni imagen generada. */
@Component({
  selector: 'app-silueta-vehiculo',
  template: `
    <svg viewBox="0 0 420 160" role="img" [attr.aria-label]="'Silueta de ' + tipo()">
      <g fill="#161616" stroke="var(--primary)" stroke-width="2.2" stroke-linejoin="round">
        @switch (forma()) {
          @case ('furgoneta') {
            <path d="M20 112 L22 70 Q26 44 62 40 L320 36 Q344 36 352 50 L390 84 Q402 90 402 104 L402 112 Z" />
            <path d="M330 46 L352 52 L380 82 L330 82 Z" fill="#0d0d0d" stroke-width="1.4" />
            <path d="M300 44 L300 108 M40 92 L392 92" stroke-width="0.8" opacity="0.4" />
            <circle cx="92" cy="114" r="26" fill="#0a0a0a" /><circle cx="330" cy="114" r="26" fill="#0a0a0a" />
          }
          @case ('moto') {
            <circle cx="96" cy="108" r="34" fill="#0a0a0a" /><circle cx="322" cy="108" r="34" fill="#0a0a0a" />
            <path d="M96 108 L170 76 L262 70 L322 108" fill="none" />
            <path d="M176 72 Q200 44 242 50 L262 70 Q220 76 176 72 Z" />
            <path d="M120 70 L176 66 L180 74 L122 80 Z" />
            <path d="M262 70 L286 30 L306 26 M286 30 L322 108" fill="none" />
            <path d="M190 86 L240 86 L236 104 L196 104 Z" stroke-width="1.4" />
          }
          @case ('camion') {
            <rect x="20" y="22" width="270" height="80" />
            <path d="M298 112 L298 48 Q300 38 318 38 L366 42 Q390 48 396 80 L400 112 Z" />
            <path d="M318 48 L364 50 Q380 56 384 76 L318 76 Z" fill="#0d0d0d" stroke-width="1.4" />
            <path d="M20 102 L298 102 L298 112 L20 112 Z" stroke-width="1.4" />
            <circle cx="70" cy="118" r="20" fill="#0a0a0a" /><circle cx="118" cy="118" r="20" fill="#0a0a0a" />
            <circle cx="350" cy="118" r="20" fill="#0a0a0a" />
          }
          @case ('tractor') {
            <path d="M96 16 L196 16 L204 84 L90 84 Z" fill="#0d0d0d" stroke-width="1.6" />
            <path d="M88 84 L210 84 L210 64 L372 72 Q388 74 388 92 L388 106 L180 106 L170 98 L88 98 Z" />
            <path d="M226 64 L226 40 L234 40 L234 66" stroke-width="1.6" />
            <circle cx="128" cy="104" r="48" fill="#0a0a0a" /><circle cx="128" cy="104" r="22" fill="none" stroke-width="1.2" opacity="0.6" />
            <circle cx="334" cy="122" r="28" fill="#0a0a0a" /><circle cx="334" cy="122" r="12" fill="none" stroke-width="1.2" opacity="0.6" />
          }
          @default {
            <path d="M18 112 L26 86 Q34 74 66 70 L132 64 Q168 34 214 30 L270 30 Q302 32 334 64 L374 72 Q398 78 402 96 L404 112 Z" />
            <path d="M146 64 Q174 40 212 38 L236 38 L236 64 Z M246 38 L268 38 Q294 40 318 64 L246 64 Z" fill="#0d0d0d" stroke-width="1.4" />
            <path d="M40 92 L392 92" stroke-width="0.8" opacity="0.35" />
            <circle cx="100" cy="114" r="27" fill="#0a0a0a" /><circle cx="100" cy="114" r="12" fill="none" stroke-width="1.2" opacity="0.6" />
            <circle cx="322" cy="114" r="27" fill="#0a0a0a" /><circle cx="322" cy="114" r="12" fill="none" stroke-width="1.2" opacity="0.6" />
          }
        }
      </g>
      <path d="M0 146 L420 146" stroke="var(--border)" />
    </svg>
  `,
  styles: `
    :host { display: block; }
    svg { width: 100%; height: auto; display: block; }
  `
})
export class SiluetaVehiculo {
  readonly tipo = input.required<TipoVehiculo>();
  protected readonly forma = computed(() => FORMAS[this.tipo()] ?? 'turismo');
}
