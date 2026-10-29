import { HttpClient, HttpErrorResponse, HttpEvent, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Acceso, AccesoCreado, CodigoAveriaDetalle, CodigoAveriaListItem, CodigoLeido, EstadoAsistente, FichaDiagnosis,
  FichaDiagnosisRequest, SesionAsistente, SesionAsistenteItem, Combustible, DocumentacionVehiculo, DocumentoTecnico,
  DocumentoTecnicoRequest, EnlacePortal, CatalogoDespiece, CatalogoDespieceRequest, EnlaceReferencia, ConsultaMatricula, ConversacionMecanico, ConversacionMecanicoDetalle, ReproDetalle, ReproListItem, TipoDocumento, EstadoSharePoint, EtapaMultimedia, MultimediaOrden, ValorReferencia, ValorReferenciaRequest, ClienteDetalle, ClienteListItem, ClienteRequest, DatosTaller, EstadoOrden, InicioPublico,
  LineaRequest, OrdenActualizarRequest, OrdenCrearRequest, OrdenDetalle, OrdenListItem, PortalOrdenDetalle,
  PortalVehiculo, PortalVehiculoDetalle, Servicio, ServicioRequest, TipoServicio, TrabajoDetalle, TrabajoListItem,
  TrabajoRequest, UsuarioAcceso, VehiculoDetalle, VehiculoListItem, VehiculoRequest, VehiculoResumen, ImagenVehiculo, PortalVehiculoResumen, ResumenContabilidad, Gasto, GastoRequest, CategoriaGasto, AjustesContabilidad, Factura
} from './models';

type Filtros = Record<string, string | number | boolean | null | undefined>;

function params(filtros: Filtros): HttpParams {
  let p = new HttpParams();
  for (const [clave, valor] of Object.entries(filtros)) {
    if (valor !== null && valor !== undefined && valor !== '') {
      p = p.set(clave, String(valor));
    }
  }
  return p;
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  // Clientes
  clientes(q?: string) {
    return this.http.get<ClienteListItem[]>('/api/clientes', { params: params({ q }) });
  }
  cliente(id: number) {
    return this.http.get<ClienteDetalle>(`/api/clientes/${id}`);
  }
  crearCliente(req: ClienteRequest) {
    return this.http.post<ClienteDetalle>('/api/clientes', req);
  }
  actualizarCliente(id: number, req: ClienteRequest) {
    return this.http.put<ClienteDetalle>(`/api/clientes/${id}`, req);
  }
  eliminarCliente(id: number) {
    return this.http.delete<void>(`/api/clientes/${id}`);
  }

  // Vehículos
  vehiculos(filtros: { q?: string; clienteId?: number } = {}) {
    return this.http.get<VehiculoListItem[]>('/api/vehiculos', { params: params(filtros) });
  }
  vehiculo(id: number) {
    return this.http.get<VehiculoDetalle>(`/api/vehiculos/${id}`);
  }
  crearVehiculo(req: VehiculoRequest) {
    return this.http.post<VehiculoDetalle>('/api/vehiculos', req);
  }
  actualizarVehiculo(id: number, req: VehiculoRequest) {
    return this.http.put<VehiculoDetalle>(`/api/vehiculos/${id}`, req);
  }
  eliminarVehiculo(id: number) {
    return this.http.delete<void>(`/api/vehiculos/${id}`);
  }

  // Órdenes de trabajo
  ordenes(filtros: { q?: string; estado?: EstadoOrden | ''; abiertas?: boolean; pagado?: boolean } = {}) {
    return this.http.get<OrdenListItem[]>('/api/ordenes', { params: params(filtros) });
  }
  /** Órdenes abiertas y entregadas en los últimos días, para el tablero. */
  tablero(diasEntregados = 7) {
    return this.http.get<OrdenListItem[]>('/api/ordenes/tablero', { params: { diasEntregados } });
  }
  orden(id: number) {
    return this.http.get<OrdenDetalle>(`/api/ordenes/${id}`);
  }
  crearOrden(req: OrdenCrearRequest) {
    return this.http.post<OrdenDetalle>('/api/ordenes', req);
  }
  actualizarOrden(id: number, req: OrdenActualizarRequest) {
    return this.http.put<OrdenDetalle>(`/api/ordenes/${id}`, req);
  }
  factura(ordenId: number) {
    return this.http.get<Factura>(`/api/ordenes/${ordenId}/factura`);
  }
  emitirFactura(ordenId: number, fecha: string | null = null) {
    return this.http.post<Factura>(`/api/ordenes/${ordenId}/factura`, { fecha });
  }
  /** Vuelve a generar la factura con los datos actuales de cliente, vehículo y taller (mismo número, fecha e importes). */
  reemitirFactura(ordenId: number) {
    return this.http.put<Factura>(`/api/ordenes/${ordenId}/factura`, {});
  }
  /** fecha (yyyy-mm-dd): día del pago, para cargar histórico; si no se indica, ahora. */
  marcarPagado(id: number, pagado: boolean, fecha: string | null = null) {
    return this.http.put<OrdenDetalle>(`/api/ordenes/${id}/pagado`, { pagado, fecha });
  }
  cambiarFechaSalida(id: number, fecha: string) {
    return this.http.put<OrdenDetalle>(`/api/ordenes/${id}/salida`, { fecha });
  }
  cambiarEstado(id: number, estado: EstadoOrden) {
    return this.http.put<OrdenDetalle>(`/api/ordenes/${id}/estado`, { estado });
  }
  eliminarOrden(id: number) {
    return this.http.delete<void>(`/api/ordenes/${id}`);
  }
  agregarLinea(ordenId: number, req: LineaRequest) {
    return this.http.post<OrdenDetalle>(`/api/ordenes/${ordenId}/lineas`, req);
  }
  actualizarLinea(ordenId: number, lineaId: number, req: LineaRequest) {
    return this.http.put<OrdenDetalle>(`/api/ordenes/${ordenId}/lineas/${lineaId}`, req);
  }
  eliminarLinea(ordenId: number, lineaId: number) {
    return this.http.delete<OrdenDetalle>(`/api/ordenes/${ordenId}/lineas/${lineaId}`);
  }

  // Acceso de clientes al portal
  acceso(clienteId: number) {
    return this.http.get<Acceso>(`/api/clientes/${clienteId}/acceso`);
  }
  crearAcceso(clienteId: number, usuario: string) {
    return this.http.post<AccesoCreado>(`/api/clientes/${clienteId}/acceso`, { usuario });
  }
  restablecerAcceso(clienteId: number) {
    return this.http.post<AccesoCreado>(`/api/clientes/${clienteId}/acceso/restablecer`, {});
  }
  eliminarAcceso(clienteId: number) {
    return this.http.delete<void>(`/api/clientes/${clienteId}/acceso`);
  }

  // Usuarios (todos los accesos)
  usuarios() {
    return this.http.get<UsuarioAcceso[]>('/api/usuarios');
  }
  crearUsuarioTaller(usuario: string) {
    return this.http.post<AccesoCreado>('/api/usuarios', { usuario });
  }
  restablecerUsuario(id: string) {
    return this.http.post<AccesoCreado>(`/api/usuarios/${id}/restablecer`, {});
  }
  desbloquearUsuario(id: string) {
    return this.http.post<void>(`/api/usuarios/${id}/desbloquear`, {});
  }
  eliminarUsuario(id: string) {
    return this.http.delete<void>(`/api/usuarios/${id}`);
  }

  // Diagnóstico: ficha de cada orden
  ficha(ordenId: number) {
    return this.http.get<FichaDiagnosis>(`/api/ordenes/${ordenId}/diagnosis`);
  }
  guardarFicha(ordenId: number, req: FichaDiagnosisRequest) {
    return this.http.put<FichaDiagnosis>(`/api/ordenes/${ordenId}/diagnosis`, req);
  }
  anadirCodigos(ordenId: number, codigos: Pick<CodigoLeido, 'codigo' | 'estado'>[]) {
    return this.http.post<FichaDiagnosis>(`/api/ordenes/${ordenId}/diagnosis/codigos`, { codigos });
  }
  subirAdjunto(ordenId: number, archivo: File) {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return this.http.post<FichaDiagnosis>(`/api/ordenes/${ordenId}/diagnosis/adjuntos`, datos);
  }
  visibleAdjunto(id: number, visible: boolean) {
    return this.http.put<void>(`/api/diagnosis/adjuntos/${id}/visible`, { visible });
  }
  eliminarAdjunto(id: number) {
    return this.http.delete<void>(`/api/diagnosis/adjuntos/${id}`);
  }

  // Diagnóstico: biblioteca de códigos
  codigos(q?: string, soloConCasos = false) {
    return this.http.get<CodigoAveriaListItem[]>('/api/codigos-averia', { params: params({ q, soloConCasos: soloConCasos || undefined }) });
  }
  codigo(codigo: string) {
    return this.http.get<CodigoAveriaDetalle>(`/api/codigos-averia/${encodeURIComponent(codigo)}`);
  }
  guardarCodigo(codigo: string, req: { descripcion: string; sistema: string | null; notas: string | null }) {
    return this.http.put<CodigoAveriaDetalle>(`/api/codigos-averia/${encodeURIComponent(codigo)}`, req);
  }
  eliminarCodigo(codigo: string) {
    return this.http.delete<void>(`/api/codigos-averia/${encodeURIComponent(codigo)}`);
  }

  // Diagnóstico: valores de referencia
  valoresReferencia(filtros: { q?: string; categoria?: string; combustible?: Combustible | '' } = {}) {
    return this.http.get<ValorReferencia[]>('/api/valores-referencia', { params: params(filtros) });
  }
  crearValorReferencia(req: ValorReferenciaRequest) {
    return this.http.post<ValorReferencia>('/api/valores-referencia', req);
  }
  actualizarValorReferencia(id: number, req: ValorReferenciaRequest) {
    return this.http.put<ValorReferencia>(`/api/valores-referencia/${id}`, req);
  }
  eliminarValorReferencia(id: number) {
    return this.http.delete<void>(`/api/valores-referencia/${id}`);
  }

  // Fotos y vídeos de las órdenes
  multimedia(ordenId: number) {
    return this.http.get<MultimediaOrden[]>(`/api/ordenes/${ordenId}/multimedia`);
  }
  /** Devuelve los eventos de la subida para poder mostrar el progreso. */
  subirMultimedia(ordenId: number, archivo: File, etapa: EtapaMultimedia, visibleCliente: boolean): Observable<HttpEvent<MultimediaOrden>> {
    const f = new FormData();
    f.append('archivo', archivo);
    f.append('etapa', etapa);
    f.append('visibleCliente', String(visibleCliente));
    return this.http.post<MultimediaOrden>(`/api/ordenes/${ordenId}/multimedia`, f, { reportProgress: true, observe: 'events' });
  }
  actualizarMultimedia(id: number, req: { etapa: EtapaMultimedia; descripcion: string | null; visibleCliente: boolean }) {
    return this.http.put<MultimediaOrden>(`/api/multimedia/${id}`, req);
  }
  eliminarMultimedia(id: number) {
    return this.http.delete<void>(`/api/multimedia/${id}`);
  }

  // Documentación técnica
  documentos(q?: string, tipo?: TipoDocumento | '') {
    return this.http.get<DocumentoTecnico[]>('/api/documentacion', { params: params({ q, tipo }) });
  }
  documentacionVehiculo(vehiculoId: number) {
    return this.http.get<DocumentacionVehiculo>(`/api/vehiculos/${vehiculoId}/documentacion`);
  }
  subirDocumento(archivo: File, datos: DocumentoTecnicoRequest) {
    const f = new FormData();
    f.append('archivo', archivo);
    for (const [k, v] of Object.entries(datos)) {
      if (v !== null && v !== undefined && v !== '') {
        f.append(k, String(v));
      }
    }
    return this.http.post<DocumentoTecnico>('/api/documentacion', f);
  }
  actualizarDocumento(id: number, datos: DocumentoTecnicoRequest) {
    return this.http.put<DocumentoTecnico>(`/api/documentacion/${id}`, datos);
  }
  eliminarDocumento(id: number) {
    return this.http.delete<void>(`/api/documentacion/${id}`);
  }
  estadoSharePoint() {
    return this.http.get<EstadoSharePoint>('/api/sharepoint/estado');
  }
  sincronizarSharePoint() {
    return this.http.post<void>('/api/sharepoint/sincronizar', {});
  }
  portales() {
    return this.http.get<EnlacePortal[]>('/api/portales');
  }
  crearPortal(p: Omit<EnlacePortal, 'id'>) {
    return this.http.post<EnlacePortal>('/api/portales', p);
  }
  actualizarPortal(id: number, p: Omit<EnlacePortal, 'id'>) {
    return this.http.put<EnlacePortal>(`/api/portales/${id}`, p);
  }
  eliminarPortal(id: number) {
    return this.http.delete<void>(`/api/portales/${id}`);
  }

  // Mecánico virtual (Gemini). Los mensajes se envían en streaming con postEventos (core/sse.ts).
  estadoMecanico() {
    return this.http.get<{ configurado: boolean; modelo: string }>('/api/mecanico/estado');
  }
  conversacionesMecanico() {
    return this.http.get<ConversacionMecanico[]>('/api/mecanico/conversaciones');
  }
  crearConversacionMecanico() {
    return this.http.post<ConversacionMecanico>('/api/mecanico/conversaciones', {});
  }
  conversacionMecanico(id: number) {
    return this.http.get<ConversacionMecanicoDetalle>(`/api/mecanico/conversaciones/${id}`);
  }
  /** Conversación del usuario para una orden (la última, o una nueva). Se contextualiza con la orden en el servidor. */
  conversacionMecanicoDeOrden(ordenId: number, nueva = false) {
    return this.http.post<ConversacionMecanicoDetalle>(`/api/mecanico/ordenes/${ordenId}/conversacion`, {}, { params: nueva ? { nueva: true } : {} });
  }
  eliminarConversacionMecanico(id: number) {
    return this.http.delete<void>(`/api/mecanico/conversaciones/${id}`);
  }

  // Reprogramaciones (REPRO de SharePoint). El contenido de los archivos se pide a /api/repro/archivos/{id}/contenido.
  reprogramaciones(q?: string, sinVincular = false) {
    const params: Record<string, string> = {};
    if (q?.trim()) params['q'] = q.trim();
    if (sinVincular) params['sinVincular'] = 'true';
    return this.http.get<ReproListItem[]>('/api/repro', { params });
  }
  /** Visión 360 de la ficha del vehículo. */
  resumenVehiculo(id: number) {
    return this.http.get<VehiculoResumen>(`/api/vehiculos/${id}/resumen`);
  }
  /** Genera con Gemini la imagen orientativa del vehículo (tarda unos segundos). */
  generarImagenVehiculo(id: number, color: string | null = null) {
    return this.http.post<ImagenVehiculo>(`/api/vehiculos/${id}/imagen/generar`, { color });
  }
  subirImagenVehiculo(id: number, archivo: File) {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return this.http.post<ImagenVehiculo>(`/api/vehiculos/${id}/imagen`, datos);
  }
  quitarImagenVehiculo(id: number) {
    return this.http.delete<void>(`/api/vehiculos/${id}/imagen`);
  }
  reprogramacionesDeVehiculo(vehiculoId: number) {
    return this.http.get<ReproListItem[]>(`/api/vehiculos/${vehiculoId}/repro`);
  }
  reprogramacion(id: number) {
    return this.http.get<ReproDetalle>(`/api/repro/${id}`);
  }
  vincularReprogramacion(id: number, vehiculoId: number | null) {
    return this.http.put<void>(`/api/repro/${id}/vehiculo`, { vehiculoId });
  }
  notasReprogramacion(id: number, notas: string | null) {
    return this.http.put<void>(`/api/repro/${id}/notas`, { notas });
  }

  // Datos por matrícula (MatriculaAPI)
  estadoMatricula() {
    return this.http.get<{ configurado: boolean }>('/api/matricula/estado');
  }
  consultarMatricula(matricula: string, moto: boolean, repetir = false) {
    return this.http.post<ConsultaMatricula>('/api/matricula/consultar', { matricula, moto, repetir });
  }

  // Despiece original (Vinalfa). Las respuestas llegan tal cual; las interpreta core/vinalfa.ts.
  estadoVinalfa() {
    return this.http.get<{ configurado: boolean }>('/api/vinalfa/estado');
  }
  vinalfaVehiculo(vehiculoId: number, identificador?: string) {
    return this.http.get<unknown>(`/api/vinalfa/vehiculos/${vehiculoId}`, { params: identificador ? { identificador } : {} });
  }
  vinalfaGrupos(vehiculoHash: string) {
    return this.http.get<unknown>(`/api/vinalfa/catalogo/${vehiculoHash}/grupos`);
  }
  vinalfaBuscar(vehiculoHash: string, q: string) {
    return this.http.get<unknown>(`/api/vinalfa/catalogo/${vehiculoHash}/buscar`, { params: { q } });
  }
  vinalfaSubsecciones(seccionHash: string) {
    return this.http.get<unknown>(`/api/vinalfa/secciones/${seccionHash}/subsecciones`);
  }
  vinalfaPiezas(seccionHash: string, vehiculoHash: string) {
    return this.http.get<unknown>(`/api/vinalfa/secciones/${seccionHash}/piezas`, { params: { vehiculo: vehiculoHash } });
  }

  // Catálogos de despieces
  catalogos() {
    return this.http.get<CatalogoDespiece[]>('/api/catalogos');
  }
  crearCatalogo(c: CatalogoDespieceRequest) {
    return this.http.post<CatalogoDespiece>('/api/catalogos', c);
  }
  actualizarCatalogo(id: number, c: CatalogoDespieceRequest) {
    return this.http.put<CatalogoDespiece>(`/api/catalogos/${id}`, c);
  }
  eliminarCatalogo(id: number) {
    return this.http.delete<void>(`/api/catalogos/${id}`);
  }
  /** Enlaces para buscar una referencia de pieza; con vehículo, solo en los catálogos de su marca. */
  buscarReferencia(q: string, vehiculoId?: number) {
    return this.http.get<EnlaceReferencia[]>('/api/catalogos/referencia', { params: vehiculoId ? { q, vehiculoId } : { q } });
  }

  // Diagnóstico: asistente
  estadoAsistente() {
    return this.http.get<EstadoAsistente>('/api/asistente/estado');
  }
  sesionesAsistente(ordenId?: number) {
    return this.http.get<SesionAsistenteItem[]>('/api/asistente/sesiones', { params: params({ ordenId }) });
  }
  crearSesionAsistente(ordenId: number | null) {
    return this.http.post<SesionAsistente>('/api/asistente/sesiones', { ordenId });
  }
  sesionAsistente(id: number) {
    return this.http.get<SesionAsistente>(`/api/asistente/sesiones/${id}`);
  }
  eliminarSesionAsistente(id: number) {
    return this.http.delete<void>(`/api/asistente/sesiones/${id}`);
  }

  // Contenido de la web (gestión)
  webDatos() {
    return this.http.get<DatosTaller>('/api/web/datos');
  }
  guardarWebDatos(datos: DatosTaller) {
    return this.http.put<DatosTaller>('/api/web/datos', datos);
  }
  webServicios() {
    return this.http.get<Servicio[]>('/api/web/servicios');
  }
  crearServicio(req: ServicioRequest) {
    return this.http.post<Servicio>('/api/web/servicios', req);
  }
  actualizarServicio(id: number, req: ServicioRequest) {
    return this.http.put<Servicio>(`/api/web/servicios/${id}`, req);
  }
  eliminarServicio(id: number) {
    return this.http.delete<void>(`/api/web/servicios/${id}`);
  }
  webTrabajos() {
    return this.http.get<TrabajoListItem[]>('/api/web/trabajos');
  }
  webTrabajo(id: number) {
    return this.http.get<TrabajoDetalle>(`/api/web/trabajos/${id}`);
  }
  crearTrabajo(req: TrabajoRequest) {
    return this.http.post<TrabajoDetalle>('/api/web/trabajos', req);
  }
  actualizarTrabajo(id: number, req: TrabajoRequest) {
    return this.http.put<TrabajoDetalle>(`/api/web/trabajos/${id}`, req);
  }
  eliminarTrabajo(id: number) {
    return this.http.delete<void>(`/api/web/trabajos/${id}`);
  }
  /** Sube una foto o un vídeo al trabajo, con eventos de progreso (los vídeos pueden pesar cientos de MB). */
  subirFoto(trabajoId: number, archivo: File, pie?: string): Observable<HttpEvent<TrabajoDetalle>> {
    const datos = new FormData();
    datos.append('archivo', archivo);
    if (pie) {
      datos.append('pie', pie);
    }
    return this.http.post<TrabajoDetalle>(`/api/web/trabajos/${trabajoId}/fotos`, datos, { reportProgress: true, observe: 'events' });
  }
  actualizarFoto(trabajoId: number, fotoId: number, pie: string | null, orden: number) {
    return this.http.put<TrabajoDetalle>(`/api/web/trabajos/${trabajoId}/fotos/${fotoId}`, { pie, orden });
  }
  eliminarFoto(trabajoId: number, fotoId: number) {
    return this.http.delete<TrabajoDetalle>(`/api/web/trabajos/${trabajoId}/fotos/${fotoId}`);
  }

  // Portal del cliente
  misVehiculos() {
    return this.http.get<PortalVehiculo[]>('/api/portal/vehiculos');
  }
  miResumenVehiculo(id: number) {
    return this.http.get<PortalVehiculoResumen>(`/api/portal/vehiculos/${id}/resumen`);
  }
  /** Cliente cuya área se ve (el de la sesión o el de la vista previa del taller). */
  miCliente() {
    return this.http.get<{ id: number; nombre: string }>('/api/portal/cliente');
  }
  miVehiculo(id: number) {
    return this.http.get<PortalVehiculoDetalle>(`/api/portal/vehiculos/${id}`);
  }
  miOrden(id: number) {
    return this.http.get<PortalOrdenDetalle>(`/api/portal/ordenes/${id}`);
  }

  // Contabilidad
  resumenContabilidad(desde: string, hasta: string, conIva = true) {
    return this.http.get<ResumenContabilidad>('/api/contabilidad/resumen', { params: { desde, hasta, conIva } });
  }
  ajustesContabilidad() {
    return this.http.get<AjustesContabilidad>('/api/contabilidad/ajustes');
  }
  guardarAjustesContabilidad(a: AjustesContabilidad) {
    return this.http.put<AjustesContabilidad>('/api/contabilidad/ajustes', a);
  }
  gastos(filtros: { desde?: string; hasta?: string; categoria?: CategoriaGasto | ''; ordenId?: number; q?: string } = {}) {
    return this.http.get<Gasto[]>('/api/gastos', { params: params(filtros) });
  }
  proveedoresGastos() {
    return this.http.get<string[]>('/api/gastos/proveedores');
  }
  crearGasto(req: GastoRequest) {
    return this.http.post<Gasto>('/api/gastos', req);
  }
  actualizarGasto(id: number, req: GastoRequest) {
    return this.http.put<Gasto>(`/api/gastos/${id}`, req);
  }
  eliminarGasto(id: number) {
    return this.http.delete<void>(`/api/gastos/${id}`);
  }
  subirAdjuntoGasto(id: number, archivo: File) {
    const datos = new FormData();
    datos.append('archivo', archivo);
    return this.http.post<Gasto>(`/api/gastos/${id}/adjunto`, datos);
  }
  quitarAdjuntoGasto(id: number) {
    return this.http.delete<Gasto>(`/api/gastos/${id}/adjunto`);
  }

  // Web pública
  inicioPublico() {
    return this.http.get<InicioPublico>('/api/publico/inicio');
  }
  datosPublicos() {
    return this.http.get<DatosTaller>('/api/publico/datos');
  }
  serviciosPublicos() {
    return this.http.get<Servicio[]>('/api/publico/servicios');
  }
  trabajosPublicos(servicio?: TipoServicio | '') {
    return this.http.get<TrabajoListItem[]>('/api/publico/trabajos', { params: params({ servicio }) });
  }
  trabajoPublico(slug: string) {
    return this.http.get<TrabajoDetalle>(`/api/publico/trabajos/${encodeURIComponent(slug)}`);
  }
}

/** Convierte un error de la API (ProblemDetails) en un mensaje legible. */
export function mensajeError(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return 'No se puede conectar con el servidor.';
    }
    const problema = err.error;
    if (problema?.errors) {
      const mensajes = Object.values(problema.errors as Record<string, string[]>).flat();
      return [...new Set(mensajes)].join(' ');
    }
    if (problema?.detail) {
      return problema.detail;
    }
    if (err.status === 404) {
      return 'No encontrado.';
    }
  }
  return 'Ha ocurrido un error inesperado.';
}

/** Valores de formulario: cadenas vacías → null. */
/** Fecha (yyyy-mm-dd) en la hora local del navegador: la de hoy o la de un instante ISO. */
export function fechaLocal(instante: string | Date = new Date()): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function limpiar<T extends object>(valor: T): T {
  return Object.fromEntries(
    Object.entries(valor).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? null : v])
  ) as T;
}
