import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import { ESTADOS_ORDEN, ETAPAS_MULTIMEDIA, TIPOS_LINEA, TIPOS_SERVICIO } from '../core/etiquetas';
import { ClienteDetalle, DatosTaller, EtapaMultimedia, FichaDiagnosis, MultimediaOrden, OrdenDetalle, VehiculoDetalle, VehiculoResumen } from '../core/models';
import { ESTADOS, RESULTADOS } from './ficha-diagnosis';

/**
 * Hoja A4 del informe de la reparación de una orden: motivo de entrada, diagnosis (síntomas, códigos, mediciones,
 * pruebas y conclusión), trabajos con o sin importes, fotos por etapa y observaciones. La usan el informe de una orden
 * y el anexo del informe mensual de contabilidad.
 */
@Component({
  selector: 'app-hoja-informe',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    @let o = orden();
    <article class="hoja">
      <header class="cabecera">
        <div class="taller">
          <img src="brand/astursagra-simbolo-lima.svg" alt="" class="logo" />
          @if (datos(); as t) {
            <div class="datos-taller">
              <div class="marca"><span>ASTUR</span><span class="s2">SAGRA</span></div>
              @if (t.nombre && t.nombre !== 'AsturSagra') { <strong>{{ t.nombre }}</strong> }
              @if (t.direccion) { <div>{{ t.direccion }}</div> }
              @if (t.codigoPostal || t.poblacion) { <div>{{ t.codigoPostal }} {{ t.poblacion }}{{ t.provincia ? ' (' + t.provincia + ')' : '' }}</div> }
              @if (t.telefono) { <div>Tel. {{ t.telefono }}</div> }
              @if (t.email) { <div>{{ t.email }}</div> }
              <div>www.astursagra.es</div>
            </div>
          }
        </div>
        <div class="titulo">
          <h1>Informe de reparación</h1>
          <table class="meta">
            <tr><th>Orden</th><td class="mono">OT-{{ pad(o.id) }}</td></tr>
            <tr><th>Entrada</th><td>{{ o.fechaEntrada | date: 'dd/MM/yyyy' }}</td></tr>
            @if (o.fechaSalida) {
              <tr><th>Salida</th><td>{{ o.fechaSalida | date: 'dd/MM/yyyy' }}</td></tr>
            }
            <tr><th>Estado</th><td>{{ estados[o.estado] }}</td></tr>
          </table>
        </div>
      </header>

      <section class="bloques">
        <div class="bloque">
          <h2>Cliente</h2>
          <strong>{{ cliente()?.nombre ?? o.vehiculo.clienteNombre }}</strong>
          @if (cliente()?.telefono; as tel) { <div>Tel. {{ tel }}</div> }
          @if (cliente()?.email; as email) { <div>{{ email }}</div> }
        </div>
        <div class="bloque">
          <h2>Vehículo</h2>
          <div class="ficha-vehiculo">
            @if (imagen(); as img) {
              <figure class="foto-vehiculo">
                <img [src]="img.url" [alt]="'Imagen de ' + o.vehiculo.marca + ' ' + (o.vehiculo.modelo ?? '')" />
                @if (img.generada) { <figcaption>Imagen orientativa</figcaption> }
              </figure>
            }
            <div>
              <strong>{{ o.vehiculo.marca }} {{ o.vehiculo.modelo }}</strong>
              @if (tecnicos()?.variante; as variante) { <div class="sub">{{ variante }}</div> }
              <table class="datos-vehiculo">
                @if (o.vehiculo.matricula) { <tr><th>Matrícula</th><td class="mono">{{ o.vehiculo.matricula }}</td></tr> }
                @if (o.vehiculo.bastidor) { <tr><th>Bastidor</th><td class="mono">{{ o.vehiculo.bastidor }}</td></tr> }
                @if (tecnicos()?.fechaMatriculacion; as f) {
                  <tr><th>Matriculación</th><td>{{ f | date: 'dd/MM/yyyy' }}</td></tr>
                } @else if (o.vehiculo.anio) {
                  <tr><th>Año</th><td>{{ o.vehiculo.anio }}</td></tr>
                }
                @if (motor()) { <tr><th>Motor</th><td>{{ motor() }}</td></tr> }
                @if (vehiculo()?.color; as color) { <tr><th>Color</th><td>{{ color }}</td></tr> }
                @if (o.kilometrosEntrada) { <tr><th>Kilómetros</th><td>{{ o.kilometrosEntrada | number: '1.0-0' }}</td></tr> }
                @if (o.horasEntrada) { <tr><th>Horas</th><td>{{ o.horasEntrada | number: '1.0-0' }}</td></tr> }
              </table>
            </div>
          </div>
        </div>
      </section>

      <section class="apartado">
        <h2>Motivo de entrada</h2>
        <p class="texto">{{ o.motivoEntrada }}</p>
        @if (servicios()) { <p class="sub">{{ servicios() }}</p> }
      </section>

      @if (hayDiagnosis()) {
        <section class="apartado">
          <h2>Diagnosis</h2>
          @let f = ficha();
          @if (f?.sintomas) {
            <h3>Síntomas</h3>
            <p class="texto">{{ f!.sintomas }}</p>
          }
          @if (f?.codigos?.length) {
            <h3>Códigos de avería leídos</h3>
            <table class="tabla">
              <thead><tr><th>Código</th><th>Descripción</th><th>Estado</th><th>Nota</th></tr></thead>
              <tbody>
                @for (c of f!.codigos; track $index) {
                  <tr><td class="mono">{{ c.codigo }}</td><td>{{ c.descripcion }}</td><td>{{ estadoCodigo(c.estado) }}</td><td>{{ c.nota }}</td></tr>
                }
              </tbody>
            </table>
          }
          @if (f?.mediciones?.length) {
            <h3>Mediciones</h3>
            <table class="tabla">
              <thead><tr><th>Parámetro</th><th class="num">Valor</th><th class="num">Esperado</th><th>Resultado</th><th>Nota</th></tr></thead>
              <tbody>
                @for (m of f!.mediciones; track $index) {
                  <tr>
                    <td>{{ m.parametro }}</td>
                    <td class="num">{{ m.valor }} {{ m.unidad }}</td>
                    <td class="num">{{ m.valorEsperado }}</td>
                    <td [class.mal]="m.resultado === 'FueraDeRango'" [class.bien]="m.resultado === 'Correcto'">{{ resultado(m.resultado) }}</td>
                    <td>{{ m.nota }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
          @if (f?.pruebas?.length) {
            <h3>Pruebas realizadas</h3>
            <table class="tabla">
              <thead><tr><th>Prueba</th><th>Resultado</th></tr></thead>
              <tbody>
                @for (p of f!.pruebas; track $index) {
                  <tr><td>{{ p.descripcion }}</td><td>{{ p.resultado }}</td></tr>
                }
              </tbody>
            </table>
          }
          @if (f?.conclusion || o.diagnostico) {
            <h3>Conclusión</h3>
            <p class="texto">{{ f?.conclusion || o.diagnostico }}</p>
          }
        </section>
      }

      <section class="apartado">
        <h2>{{ realizado() ? 'Trabajos realizados' : 'Presupuesto' }}</h2>
        <table class="tabla lineas">
          <thead>
            <tr>
              <th>Concepto</th><th class="num">Cant.</th>
              @if (importes()) { <th class="num">Precio</th><th class="num">Importe</th> }
            </tr>
          </thead>
          <tbody>
            @for (l of o.lineas; track l.id) {
              <tr>
                <td>{{ l.descripcion }}<div class="sub">{{ tiposLinea[l.tipo] }}{{ l.referencia ? ' · Ref. ' + l.referencia : '' }}</div></td>
                <td class="num">{{ l.cantidad | number: '1.0-2' }}</td>
                @if (importes()) {
                  <td class="num">{{ l.precioUnitario | currency: 'EUR' }}</td>
                  <td class="num">{{ l.baseImponible | currency: 'EUR' }}</td>
                }
              </tr>
            } @empty {
              <tr><td [attr.colspan]="importes() ? 4 : 2" class="vacio">Sin conceptos todavía.</td></tr>
            }
          </tbody>
        </table>
        @if (importes() && o.lineas.length) {
          <table class="totales">
            @if (o.totales.iva) {
              <tr><th>Base imponible</th><td>{{ o.totales.baseImponible | currency: 'EUR' }}</td></tr>
              <tr><th>IVA</th><td>{{ o.totales.iva | currency: 'EUR' }}</td></tr>
            }
            <tr class="total"><th>Total</th><td>{{ o.totales.total | currency: 'EUR' }}</td></tr>
          </table>
        }
      </section>

      @if (fotos() && grupos().length) {
        <section class="apartado">
          <h2>Fotos</h2>
          @for (g of grupos(); track g.etapa) {
            <div class="grupo">
              <h3>{{ g.etiqueta }}</h3>
              <div class="rejilla">
                @for (m of g.fotos; track m.id) {
                  <figure>
                    <img [src]="m.url" [alt]="m.descripcion ?? g.etiqueta" />
                    @if (m.descripcion) { <figcaption>{{ m.descripcion }}</figcaption> }
                  </figure>
                }
              </div>
            </div>
          }
          @if (videos()) {
            <p class="sub">{{ videos() === 1 ? 'Hay 1 vídeo' : 'Hay ' + videos() + ' vídeos' }} de la reparación que no se incluyen en el informe.</p>
          }
        </section>
      }

      @if (o.observaciones) {
        <section class="apartado">
          <h2>Observaciones</h2>
          <p class="texto">{{ o.observaciones }}</p>
        </section>
      }

      @if (firmas()) {
        <footer class="pie">
          <p>Informe emitido el {{ hoy | date: 'dd/MM/yyyy' }}. Este documento no es una factura.</p>
          <div class="firmas">
            <div class="firma"><span>El taller:</span></div>
            <div class="firma"><span>Conforme, el cliente:</span></div>
          </div>
        </footer>
      }
    </article>
  `,
  styles: `
    :host { display: block; }
    .hoja { background: #fff; color: #111; max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 15mm; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); font-size: 10.5pt; line-height: 1.4; }
    .cabecera { display: flex; justify-content: space-between; gap: 1.5rem; border-bottom: 3px solid #9bcf00; padding-bottom: 10px; }
    .taller { display: flex; gap: 12px; align-items: flex-start; }
    .logo { width: 58px; height: 58px; flex: none; }
    .marca { font-family: var(--font-display); font-weight: 700; font-size: 17pt; letter-spacing: 0.03em; line-height: 1.1; margin-bottom: 2px; color: #111; }
    .marca span { margin: 0; padding: 0; }
    .marca .s2 { color: #5f8500; }
    /* La hoja es siempre clara: anula los estilos de tabla del tema oscuro del portal. */
    .hoja table, .hoja thead, .hoja tbody, .hoja tr, .hoja th, .hoja td { background: transparent !important; color: #111 !important; }
    .hoja .meta th, .hoja .totales th, .hoja .sub { color: #555 !important; }
    .hoja td.mal { color: #b42318 !important; font-weight: 600; }
    .hoja td.bien { color: #3f6b00 !important; }
    .datos-taller { font-size: 9pt; color: #333; }
    .titulo h1 { font-family: var(--font-display); text-transform: uppercase; font-size: 18pt; margin: 0 0 6px; text-align: right; letter-spacing: 0.04em; }
    .meta { margin-left: auto; font-size: 9.5pt; border-collapse: collapse; }
    .meta th { text-align: left; color: #555; font-weight: 500; padding: 1px 10px 1px 0; }
    .meta td { text-align: right; }
    .mono { font-family: var(--font-mono, monospace); }
    .bloques { display: grid; grid-template-columns: 1fr 2fr; gap: 12px; margin: 14px 0; }
    .ficha-vehiculo { display: flex; gap: 10px; align-items: flex-start; }
    .foto-vehiculo { flex: none; width: 42mm; }
    .foto-vehiculo img { aspect-ratio: 4 / 3; object-fit: cover; }
    .hoja .datos-vehiculo { border-collapse: collapse; margin-top: 3px; font-size: 9pt; }
    .hoja .datos-vehiculo th { text-align: left; font-weight: 500; color: #666 !important; padding: 0 10px 0 0; border: none; }
    .hoja .datos-vehiculo td { padding: 0; border: none; }
    .bloque { border: 1px solid #ddd; padding: 8px 10px; font-size: 9.5pt; }
    h2 { font-family: var(--font-display); text-transform: uppercase; font-size: 9pt; letter-spacing: 0.08em; color: #555; margin: 0 0 4px; }
    .apartado { margin-top: 16px; }
    .apartado > h2 { border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-bottom: 6px; }
    h3 { font-size: 9.5pt; margin: 10px 0 3px; color: #222; }
    .texto { margin: 0 0 4px; white-space: pre-line; }
    .sub { color: #666; font-size: 8.5pt; margin: 0; }
    .tabla { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
    .tabla th { text-align: left; border-bottom: 2px solid #111; padding: 4px 6px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
    .tabla td { border-bottom: 1px solid #e3e3e3; padding: 4px 6px; vertical-align: top; }
    .tabla tr { break-inside: avoid; }
    .num, .tabla th.num { text-align: right; white-space: nowrap; }
    .vacio { text-align: center; color: #777; }
    .totales { margin: 10px 0 0 auto; border-collapse: collapse; min-width: 60mm; }
    .totales th { text-align: left; font-weight: 500; padding: 3px 12px 3px 0; color: #444; }
    .totales td { text-align: right; padding: 3px 0; }
    .totales .total th, .totales .total td { border-top: 2px solid #111; font-size: 13pt; font-weight: 700; padding-top: 6px; }
    .rejilla { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    /* Que el título de cada etapa no se quede solo al pie de una página, separado de sus fotos. */
    .grupo h3, .apartado > h2 { break-after: avoid; }
    figure { margin: 0; break-inside: avoid; }
    figure img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; border: 1px solid #ddd; }
    figcaption { font-size: 8pt; color: #444; margin-top: 2px; }
    .pie { margin-top: 24px; font-size: 8.5pt; color: #555; break-inside: avoid; }
    .firmas { display: flex; justify-content: space-between; gap: 2rem; }
    .firma { margin-top: 28px; border-top: 1px solid #999; width: 70mm; padding-top: 4px; }
    @media print {
      .hoja { box-shadow: none; margin: 0; max-width: none; min-height: auto; padding: 0; }
    }
  `
})
export class HojaInforme {
  readonly orden = input.required<OrdenDetalle>();
  readonly cliente = input<ClienteDetalle | null>(null);
  readonly datos = input<DatosTaller | null>(null);
  readonly ficha = input<FichaDiagnosis | null>(null);
  readonly multimedia = input<MultimediaOrden[]>([]);
  readonly importes = input(true);
  readonly fotos = input(true);
  /** Solo las fotos visibles para el cliente (si no, también las internas del taller). */
  readonly soloCliente = input(true);
  /** Pie con la fecha de emisión y las firmas del taller y del cliente. */
  readonly firmas = input(true);
  /** Ficha del vehículo (color, código de motor); opcional. */
  readonly vehiculo = input<VehiculoDetalle | null>(null);
  /** Visión 360 del vehículo: su imagen y los datos técnicos; opcional. */
  readonly resumenVehiculo = input<VehiculoResumen | null>(null);

  protected readonly imagen = computed(() => this.resumenVehiculo()?.imagen ?? null);
  protected readonly tecnicos = computed(() => this.resumenVehiculo()?.tecnicos ?? null);
  /** Código de motor, combustible, cilindrada y potencia, en una línea. */
  protected readonly motor = computed(() => {
    const t = this.tecnicos();
    return [
      this.vehiculo()?.motor ?? this.orden().vehiculo.motor,
      t?.combustible,
      t?.cilindrada ? `${t.cilindrada} cc` : null,
      t?.potenciaCv ? `${Math.round(t.potenciaCv)} CV` : null
    ].filter(Boolean).join(' · ');
  });

  protected readonly tiposLinea = TIPOS_LINEA;
  protected readonly estados = ESTADOS_ORDEN;
  protected readonly hoy = new Date();

  protected readonly realizado = computed(() => {
    const o = this.orden();
    return !!o.factura || o.estado === 'Listo' || o.estado === 'Entregado';
  });
  protected readonly servicios = computed(() => this.orden().servicios.map(s => TIPOS_SERVICIO[s] ?? s).join(' · '));
  protected readonly hayDiagnosis = computed(() => {
    const f = this.ficha();
    return !!this.orden().diagnostico ||
      (!!f && !!(f.sintomas || f.conclusion || f.codigos.length || f.mediciones.length || f.pruebas.length));
  });
  private readonly elegidas = computed(() => this.multimedia().filter(m => !this.soloCliente() || m.visibleCliente));
  /** Fotos agrupadas por etapa, en el orden de la reparación (recepción, diagnóstico, reparación, entrega, otras). */
  protected readonly grupos = computed(() => {
    const fotos = this.elegidas().filter(m => m.tipoContenido.startsWith('image/'));
    return (Object.keys(ETAPAS_MULTIMEDIA) as EtapaMultimedia[])
      .map(etapa => ({ etapa, etiqueta: ETAPAS_MULTIMEDIA[etapa], fotos: fotos.filter(m => m.etapa === etapa) }))
      .filter(g => g.fotos.length);
  });
  protected readonly videos = computed(() => this.elegidas().filter(m => m.tipoContenido.startsWith('video/')).length);

  protected estadoCodigo(valor: string) {
    return ESTADOS.find(e => e.valor === valor)?.etiqueta ?? valor;
  }

  protected resultado(valor: string) {
    return RESULTADOS.find(r => r.valor === valor)?.etiqueta ?? valor;
  }

  protected pad(n: number) {
    return String(n).padStart(5, '0');
  }
}
