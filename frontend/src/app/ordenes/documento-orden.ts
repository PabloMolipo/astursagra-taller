import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, input, numberAttribute, OnInit, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { Api, mensajeError } from '../core/api';
import { TIPOS_LINEA, TIPOS_SERVICIO } from '../core/etiquetas';
import { ClienteDetalle, DatosTaller, Factura, OrdenDetalle } from '../core/models';

type TipoDocumento = 'presupuesto' | 'proforma' | 'factura';

/** Datos del cliente y del taller que salen en la hoja (en la factura, los guardados al emitirla). */
type ClienteDoc = Pick<ClienteDetalle, 'nombre' | 'nifCif' | 'direccion' | 'codigoPostal' | 'poblacion'> & { telefono?: string | null };
type TallerDoc = Pick<DatosTaller, 'nombre' | 'direccion' | 'codigoPostal' | 'poblacion' | 'provincia' | 'telefono' | 'email'> & { razonSocial?: string; nif?: string };

/**
 * Presupuesto, factura proforma o factura de una orden, en una página lista para imprimir o guardar como PDF (A4, fondo blanco).
 * La proforma indica que no es una factura. La factura se muestra con los datos guardados al emitirla, no con los actuales.
 */
@Component({
  selector: 'app-documento-orden',
  imports: [CurrencyPipe, DatePipe, DecimalPipe],
  template: `
    <div class="barra no-imprimir">
      <button type="button" class="btn primary" (click)="imprimir()" [disabled]="!orden()">🖨️ Imprimir o guardar en PDF</button>
      <button type="button" class="btn" (click)="cerrar()">Cerrar</button>
      <span class="hint">En el diálogo de impresión elige «Guardar como PDF» para enviarlo por WhatsApp o email.</span>
    </div>

    @if (error()) {
      <div class="error no-imprimir">{{ error() }}</div>
    }

    @if (orden(); as o) {
      <article class="hoja">
        <header class="cabecera">
          <div class="taller">
            <img src="brand/astursagra-simbolo-lima.svg" alt="" class="logo" />
            @if (datos(); as t) {
              <div class="datos-taller">
                <div class="marca"><span>ASTUR</span><span class="s2">SAGRA</span></div>
                @if (t.nombre && t.nombre !== 'AsturSagra') { <strong>{{ t.nombre }}</strong> }
                @if (t.razonSocial) { <div>{{ t.razonSocial }}</div> }
                @if (t.nif) { <div>NIF: {{ t.nif }}</div> }
                @if (t.direccion) { <div>{{ t.direccion }}</div> }
                @if (t.codigoPostal || t.poblacion) { <div>{{ t.codigoPostal }} {{ t.poblacion }}{{ t.provincia ? ' (' + t.provincia + ')' : '' }}</div> }
                @if (t.telefono) { <div>Tel. {{ t.telefono }}</div> }
                @if (t.email) { <div>{{ t.email }}</div> }
                <div>www.astursagra.es</div>
              </div>
            }
          </div>
          <div class="titulo">
            <h1>{{ titulo() }}</h1>
            <table class="meta">
              <tr><th>Nº</th><td class="mono">{{ numero() }}</td></tr>
              <tr><th>Fecha</th><td>{{ fecha() | date: 'dd/MM/yyyy' }}</td></tr>
              @if (tipo() === 'presupuesto') {
                <tr><th>Válido hasta</th><td>{{ validoHasta | date: 'dd/MM/yyyy' }}</td></tr>
              }
              <tr><th>Orden</th><td class="mono">OT-{{ pad(o.id) }}</td></tr>
            </table>
          </div>
        </header>

        <section class="bloques">
          <div class="bloque">
            <h2>Cliente</h2>
            @if (cliente(); as c) {
              <strong>{{ c.nombre }}</strong>
              @if (c.nifCif) { <div>NIF/CIF: {{ c.nifCif }}</div> }
              @if (c.direccion) { <div>{{ c.direccion }}</div> }
              @if (c.codigoPostal || c.poblacion) { <div>{{ c.codigoPostal }} {{ c.poblacion }}</div> }
              @if (c.telefono) { <div>Tel. {{ c.telefono }}</div> }
            } @else {
              <strong>{{ o.vehiculo.clienteNombre }}</strong>
            }
          </div>
          <div class="bloque">
            <h2>Vehículo</h2>
            <strong>{{ o.vehiculo.marca }} {{ o.vehiculo.modelo }}</strong>
            @if (o.vehiculo.matricula) { <div>Matrícula: <span class="mono">{{ o.vehiculo.matricula }}</span></div> }
            @if (o.vehiculo.bastidor) { <div>Bastidor: <span class="mono">{{ o.vehiculo.bastidor }}</span></div> }
            @if (o.kilometrosEntrada) { <div>Kilómetros: {{ o.kilometrosEntrada | number: '1.0-0' }}</div> }
            @if (o.horasEntrada) { <div>Horas: {{ o.horasEntrada | number: '1.0-0' }}</div> }
          </div>
        </section>

        <section class="trabajo">
          <h2>{{ tipo() === 'presupuesto' ? 'Trabajo a realizar' : 'Trabajo realizado' }}</h2>
          <p>{{ o.motivoEntrada }}</p>
          @if (o.diagnostico) {
            <p class="diag"><strong>Diagnóstico:</strong> {{ o.diagnostico }}</p>
          }
          <p class="servicios">{{ servicios() }}</p>
        </section>

        <table class="lineas">
          <thead>
            <tr>
              <th>Concepto</th><th class="num">Cant.</th><th class="num">Precio</th>
              @if (hayDescuentos()) { <th class="num">Dto.</th> }
              @if (hayIva()) { <th class="num">IVA</th> }
              <th class="num">Importe</th>
            </tr>
          </thead>
          <tbody>
            @for (l of o.lineas; track l.id) {
              <tr>
                <td>{{ l.descripcion }}<div class="sub">{{ tiposLinea[l.tipo] }}{{ l.referencia ? ' · Ref. ' + l.referencia : '' }}</div></td>
                <td class="num">{{ l.cantidad | number: '1.0-2' }}</td>
                <td class="num">{{ l.precioUnitario | currency: 'EUR' }}</td>
                @if (hayDescuentos()) { <td class="num">{{ l.descuentoPorcentaje ? (l.descuentoPorcentaje | number: '1.0-2') + ' %' : '' }}</td> }
                @if (hayIva()) { <td class="num">{{ l.ivaPorcentaje | number: '1.0-2' }} %</td> }
                <td class="num">{{ l.baseImponible | currency: 'EUR' }}</td>
              </tr>
            } @empty {
              <tr><td [attr.colspan]="columnas()" class="vacio">Sin conceptos todavía.</td></tr>
            }
          </tbody>
        </table>

        <table class="totales">
          @if (hayIva()) {
            <tr><th>Base imponible</th><td>{{ o.totales.baseImponible | currency: 'EUR' }}</td></tr>
            <tr><th>IVA</th><td>{{ o.totales.iva | currency: 'EUR' }}</td></tr>
          }
          <tr class="total"><th>Total</th><td>{{ o.totales.total | currency: 'EUR' }}</td></tr>
        </table>

        <footer class="pie">
          @if (tipo() === 'presupuesto') {
            <p>Presupuesto válido durante 30 días. Los importes pueden variar si durante la reparación aparecen averías no previstas; se avisará antes de realizar cualquier trabajo adicional.</p>
            <div class="firma"><span>Conforme, el cliente:</span></div>
          } @else if (tipo() === 'proforma') {
            <p>Documento sin validez como factura.</p>
          } @else if (pie()) {
            <p class="pie-factura">{{ pie() }}</p>
          }
        </footer>
      </article>
    } @else if (!error()) {
      <p class="empty">Cargando…</p>
    }
  `,
  styles: `
    :host { display: block; min-height: 100vh; background: #e9e9e9; padding: 1rem; color: #111; font-family: var(--font-body); }
    .barra { max-width: 210mm; margin: 0 auto 0.8rem; display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; }
    .barra .hint { color: #555; font-size: 0.8rem; }
    .hoja { background: #fff; color: #111; max-width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 15mm; box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15); font-size: 10.5pt; line-height: 1.4; }
    .cabecera { display: flex; justify-content: space-between; gap: 1.5rem; border-bottom: 3px solid #9bcf00; padding-bottom: 10px; }
    .taller { display: flex; gap: 12px; align-items: flex-start; }
    .logo { width: 58px; height: 58px; flex: none; }
    .marca { font-family: var(--font-display); font-weight: 700; font-size: 17pt; letter-spacing: 0.03em; line-height: 1.1; margin-bottom: 2px; color: #111; }
    .marca span { margin: 0; padding: 0; }
    .marca .s2 { color: #5f8500; }
    /* La hoja es siempre clara: anula los estilos de tabla del tema oscuro del portal. */
    .hoja table, .hoja thead, .hoja tbody, .hoja tr, .hoja th, .hoja td { background: transparent !important; color: #111 !important; }
    .hoja .meta th, .hoja .totales th, .hoja .lineas .sub { color: #555 !important; }
    .datos-taller { font-size: 9pt; color: #333; }
    .titulo h1 { font-family: var(--font-display); text-transform: uppercase; font-size: 18pt; margin: 0 0 6px; text-align: right; letter-spacing: 0.04em; }
    .meta { margin-left: auto; font-size: 9.5pt; border-collapse: collapse; }
    .meta th { text-align: left; color: #555; font-weight: 500; padding: 1px 10px 1px 0; }
    .meta td { text-align: right; }
    .mono { font-family: var(--font-mono, monospace); }
    .bloques { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 14px 0; }
    .bloque { border: 1px solid #ddd; padding: 8px 10px; font-size: 9.5pt; }
    h2 { font-family: var(--font-display); text-transform: uppercase; font-size: 9pt; letter-spacing: 0.08em; color: #555; margin: 0 0 4px; }
    .trabajo p { margin: 0 0 4px; }
    .trabajo .servicios { color: #555; font-size: 9pt; }
    .lineas { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 9.5pt; }
    .lineas th { text-align: left; border-bottom: 2px solid #111; padding: 4px 6px; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.04em; }
    .lineas td { border-bottom: 1px solid #e3e3e3; padding: 5px 6px; vertical-align: top; }
    .lineas .sub { color: #666; font-size: 8.5pt; }
    .num { text-align: right; white-space: nowrap; }
    .vacio { text-align: center; color: #777; }
    .totales { margin: 10px 0 0 auto; border-collapse: collapse; min-width: 60mm; }
    .totales th { text-align: left; font-weight: 500; padding: 3px 12px 3px 0; color: #444; }
    .totales td { text-align: right; padding: 3px 0; }
    .totales .total th, .totales .total td { border-top: 2px solid #111; font-size: 13pt; font-weight: 700; padding-top: 6px; }
    .pie { margin-top: 24px; font-size: 8.5pt; color: #555; }
    .pie-factura { white-space: pre-line; }
    .firma { margin-top: 28px; border-top: 1px solid #999; width: 70mm; padding-top: 4px; }
    @media print {
      :host { background: #fff; padding: 0; }
      .no-imprimir { display: none !important; }
      .hoja { box-shadow: none; margin: 0; max-width: none; min-height: auto; padding: 0; }
      @page { size: A4; margin: 14mm 13mm; }
    }
  `
})
export class DocumentoOrden implements OnInit {
  private readonly api = inject(Api);
  readonly id = input.required({ transform: numberAttribute });
  readonly tipo = input<TipoDocumento>('presupuesto');

  protected readonly tiposLinea = TIPOS_LINEA;
  protected readonly orden = signal<OrdenDetalle | null>(null);
  protected readonly cliente = signal<ClienteDoc | null>(null);
  protected readonly datos = signal<TallerDoc | null>(null);
  protected readonly factura = signal<Factura | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly hoy = new Date();
  protected readonly validoHasta = new Date(Date.now() + 30 * 86_400_000);

  // La factura siempre desglosa base, tipo y cuota de IVA (aunque sea 0 %).
  protected readonly hayIva = computed(() => this.tipo() === 'factura' || (this.orden()?.lineas ?? []).some(l => l.ivaPorcentaje > 0));
  protected readonly hayDescuentos = computed(() => (this.orden()?.lineas ?? []).some(l => l.descuentoPorcentaje > 0));
  protected readonly columnas = computed(() => 4 + (this.hayIva() ? 1 : 0) + (this.hayDescuentos() ? 1 : 0));
  protected readonly numero = computed(() =>
    this.factura()?.codigo ?? `${this.tipo() === 'presupuesto' ? 'PRE' : 'PRO'}-${this.pad(this.id())}`);
  protected readonly titulo = computed(() =>
    ({ presupuesto: 'Presupuesto', proforma: 'Factura proforma', factura: this.factura()?.simplificada ? 'Factura simplificada' : 'Factura' })[this.tipo()]);
  protected readonly fecha = computed(() => (this.factura() ? new Date(this.factura()!.fecha + 'T00:00:00') : this.hoy));
  protected readonly pie = computed(() => this.factura()?.contenido.pie ?? null);
  protected readonly servicios = computed(() => (this.orden()?.servicios ?? []).map(s => TIPOS_SERVICIO[s] ?? s).join(' · '));

  ngOnInit() {
    if (this.tipo() === 'factura') {
      this.api.factura(this.id()).subscribe({
        next: f => {
          const { emisor, cliente, orden } = f.contenido;
          this.factura.set(f);
          this.datos.set(emisor);
          this.cliente.set(cliente);
          this.orden.set(orden);
          document.title = `Factura ${f.codigo} · ${orden.vehiculo.matricula ?? orden.vehiculo.marca}`;
        },
        error: e => this.error.set(e?.status === 404 ? 'Esta orden aún no tiene factura: emítela desde la orden de trabajo.' : mensajeError(e))
      });
      return;
    }
    forkJoin({ orden: this.api.orden(this.id()), datos: this.api.datosPublicos() }).subscribe({
      next: ({ orden, datos }) => {
        this.orden.set(orden);
        this.datos.set(datos);
        document.title = `${this.numero()} · ${orden.vehiculo.matricula ?? orden.vehiculo.marca}`;
        this.api.cliente(orden.vehiculo.clienteId).subscribe({ next: c => this.cliente.set(c), error: () => {} });
      },
      error: e => this.error.set(mensajeError(e))
    });
  }

  protected pad(n: number) {
    return String(n).padStart(5, '0');
  }

  protected imprimir() {
    window.print();
  }

  protected cerrar() {
    if (history.length > 1) history.back();
    else window.close();
  }
}
