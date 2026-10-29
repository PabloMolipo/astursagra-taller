export type TipoCliente = 'Particular' | 'Empresa';
export type TipoVehiculo = 'Turismo' | 'Moto' | 'Furgoneta' | 'Camion' | 'Tractor' | 'MaquinariaAgricola' | 'Otro';
export type EstadoOrden = 'Recibido' | 'EnDiagnostico' | 'Presupuestado' | 'EnReparacion' | 'Listo' | 'Entregado' | 'Cancelado';
export type TipoServicio = 'Mecanica' | 'MecanicaMaquinaria' | 'Electromecanica' | 'Programacion' | 'ChapaPintura' | 'Mantenimiento' | 'Diagnosis' | 'Otro';
export type TipoLinea = 'ManoObra' | 'Pieza';

export interface ClienteListItem {
  id: number;
  tipo: TipoCliente;
  nombre: string;
  nifCif: string | null;
  telefono: string | null;
  poblacion: string | null;
  numVehiculos: number;
}

export interface ClienteRequest {
  tipo: TipoCliente;
  nombre: string;
  nifCif: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  codigoPostal: string | null;
  poblacion: string | null;
  provincia: string | null;
  notas: string | null;
}

export interface ClienteDetalle extends ClienteRequest {
  id: number;
  fechaAlta: string;
  vehiculos: VehiculoListItem[];
}

export interface VehiculoListItem {
  id: number;
  tipo: TipoVehiculo;
  matricula: string | null;
  bastidor: string | null;
  marca: string;
  modelo: string | null;
  anio: number | null;
  clienteId: number;
  clienteNombre: string;
  motor?: string | null;
}

export interface VehiculoRequest {
  clienteId: number;
  tipo: TipoVehiculo;
  matricula: string | null;
  bastidor: string | null;
  marca: string;
  modelo: string | null;
  anio: number | null;
  kilometros: number | null;
  horas: number | null;
  notas: string | null;
  /** Código de motor, p. ej. BKC. */
  motor: string | null;
  /** Color de la carrocería en texto libre («Gris plata»). */
  color: string | null;
}

export interface VehiculoDetalle extends VehiculoRequest {
  id: number;
  clienteNombre: string;
  ordenes: OrdenListItem[];
}

export interface OrdenListItem {
  id: number;
  estado: EstadoOrden;
  servicios: TipoServicio[];
  fechaEntrada: string;
  fechaPrevista: string | null;
  fechaSalida: string | null;
  vehiculoId: number;
  vehiculo: string;
  matricula: string | null;
  clienteId: number;
  clienteNombre: string;
  motivoEntrada: string;
  total: number;
  margen: number;
  tipoVehiculo?: TipoVehiculo | null;
  pagado: boolean;
}

export interface LineaRequest {
  tipo: TipoLinea;
  descripcion: string;
  referencia: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  ivaPorcentaje: number;
  /** Coste de compra por unidad (no se factura; sirve para el margen). */
  costeUnitario: number | null;
}

export interface Linea extends LineaRequest {
  id: number;
  baseImponible: number;
  iva: number;
  coste: number;
}

export interface Totales {
  baseImponible: number;
  iva: number;
  total: number;
  coste: number;
  /** Base imponible − coste. */
  margen: number;
}

export interface OrdenDetalle {
  id: number;
  estado: EstadoOrden;
  servicios: TipoServicio[];
  fechaEntrada: string;
  fechaPrevista: string | null;
  fechaSalida: string | null;
  motivoEntrada: string;
  diagnostico: string | null;
  kilometrosEntrada: number | null;
  horasEntrada: number | null;
  observaciones: string | null;
  vehiculo: VehiculoListItem;
  lineas: Linea[];
  totales: Totales;
  pagado: boolean;
  fechaPago: string | null;
  /** Factura emitida, si la hay. */
  factura: { codigo: string; fecha: string } | null;
}

/** Factura emitida: los datos se guardan tal y como estaban al emitirla. */
export interface Factura {
  id: number;
  codigo: string;
  fecha: string;
  simplificada: boolean;
  total: number;
  contenido: {
    emisor: { nombre: string; razonSocial: string; nif: string; direccion: string | null; codigoPostal: string | null; poblacion: string | null; provincia: string | null; telefono: string | null; email: string | null };
    cliente: { nombre: string; nifCif: string | null; direccion: string | null; codigoPostal: string | null; poblacion: string | null; provincia: string | null };
    orden: OrdenDetalle;
    pie: string | null;
  };
}

export interface AjustesContabilidad {
  ivaPorDefecto: number;
  razonSocial: string | null;
  nif: string | null;
  pieFactura: string | null;
}

export interface OrdenCrearRequest {
  vehiculoId: number;
  servicios: TipoServicio[];
  /** Día de entrada (yyyy-mm-dd); por defecto, hoy. */
  fechaEntrada: string | null;
  fechaPrevista: string | null;
  motivoEntrada: string;
  kilometrosEntrada: number | null;
  horasEntrada: number | null;
  observaciones: string | null;
}

export interface OrdenActualizarRequest {
  servicios: TipoServicio[];
  fechaEntrada: string | null;
  fechaPrevista: string | null;
  motivoEntrada: string;
  diagnostico: string | null;
  kilometrosEntrada: number | null;
  horasEntrada: number | null;
  observaciones: string | null;
}

// Autenticación

export type Rol = 'Taller' | 'Cliente';

export interface SesionUsuario {
  usuario: string;
  rol: Rol;
  nombre: string;
  clienteId: number | null;
  debeCambiarPassword: boolean;
}

export interface Acceso {
  usuario: string;
  fechaAlta: string;
  ultimoAcceso: string | null;
  bloqueado: boolean;
  pendienteCambio: boolean;
}

export interface AccesoCreado {
  usuario: string;
  passwordTemporal: string;
}

// Portal del cliente (sin costes ni notas internas)

export interface PortalOrdenResumen {
  id: number;
  estado: EstadoOrden;
  servicios: TipoServicio[];
  fechaEntrada: string;
  fechaPrevista: string | null;
  fechaSalida: string | null;
  motivoEntrada: string;
  total: number;
  pagado: boolean;
}

export interface PortalVehiculo {
  id: number;
  tipo: TipoVehiculo;
  matricula: string | null;
  bastidor: string | null;
  marca: string;
  modelo: string | null;
  anio: number | null;
  kilometros: number | null;
  horas: number | null;
  numIntervenciones: number;
  ultimaIntervencion: PortalOrdenResumen | null;
}

export interface PortalVehiculoDetalle {
  vehiculo: PortalVehiculo;
  ordenes: PortalOrdenResumen[];
}

export interface PortalLinea {
  tipo: TipoLinea;
  descripcion: string;
  referencia: string | null;
  cantidad: number;
  precioUnitario: number;
  descuentoPorcentaje: number;
  ivaPorcentaje: number;
  baseImponible: number;
}

export interface PortalOrdenDetalle {
  id: number;
  estado: EstadoOrden;
  servicios: TipoServicio[];
  fechaEntrada: string;
  fechaPrevista: string | null;
  fechaSalida: string | null;
  motivoEntrada: string;
  diagnostico: string | null;
  kilometrosEntrada: number | null;
  horasEntrada: number | null;
  vehiculo: PortalVehiculo;
  lineas: PortalLinea[];
  totales: { baseImponible: number; iva: number; total: number };
  multimedia: PortalMultimedia[];
  pagado: boolean;
  diagnosis: PortalDiagnosis | null;
  documentos: PortalDocumento[] | null;
}

export interface PortalDocumento {
  id: number;
  nombre: string;
  tipoContenido: string;
  tamano: number;
  fecha: string;
  url: string;
}

/** Ficha de diagnosis que ve el cliente (sin notas internas ni adjuntos). */
export interface PortalDiagnosis {
  sintomas: string | null;
  conclusion: string | null;
  fecha: string;
  codigos: { codigo: string; descripcion: string | null; estado: EstadoCodigo }[];
  mediciones: { parametro: string; valor: string; unidad: string | null; valorEsperado: string | null; resultado: ResultadoMedicion }[];
  pruebas: { descripcion: string; resultado: string | null }[];
}

// Web pública

export interface DatosTaller {
  nombre: string;
  lema: string | null;
  presentacion: string | null;
  telefono: string | null;
  whatsApp: string | null;
  email: string | null;
  direccion: string | null;
  codigoPostal: string | null;
  poblacion: string | null;
  provincia: string | null;
  horario: string | null;
  urlMapa: string | null;
}

export interface Servicio {
  id: number;
  slug: string;
  titulo: string;
  resumen: string;
  descripcion: string | null;
  icono: string;
  orden: number;
  publicado: boolean;
}

export type ServicioRequest = Omit<Servicio, 'id' | 'slug'>;

/** Foto o vídeo de un trabajo realizado. */
export interface Foto {
  id: number;
  url: string;
  pie: string | null;
  orden: number;
  esVideo: boolean;
}

export interface TrabajoListItem {
  id: number;
  slug: string;
  titulo: string;
  resumen: string;
  fecha: string;
  vehiculo: string | null;
  tipoVehiculo: TipoVehiculo | null;
  servicios: TipoServicio[];
  publicado: boolean;
  destacado: boolean;
  portada: string | null;
  numFotos: number;
  /** La portada es un vídeo (el trabajo no tiene fotos). */
  portadaEsVideo: boolean;
  numVideos: number;
}

export interface TrabajoDetalle extends Omit<TrabajoListItem, 'portada' | 'numFotos' | 'portadaEsVideo' | 'numVideos'> {
  descripcion: string | null;
  fotos: Foto[];
}

export interface TrabajoRequest {
  titulo: string;
  resumen: string;
  descripcion: string | null;
  fecha: string;
  vehiculo: string | null;
  tipoVehiculo: TipoVehiculo | null;
  servicios: TipoServicio[];
  publicado: boolean;
  destacado: boolean;
}

export interface InicioPublico {
  datos: DatosTaller;
  servicios: Servicio[];
  destacados: TrabajoListItem[];
}

export interface UsuarioAcceso {
  id: string;
  usuario: string;
  rol: Rol;
  nombre: string;
  clienteId: number | null;
  fechaAlta: string;
  ultimoAcceso: string | null;
  bloqueado: boolean;
  pendienteCambio: boolean;
  /** El usuario con la sesión abierta. */
  esYo: boolean;
}

// Diagnóstico

export type EstadoCodigo = 'Activo' | 'Pendiente' | 'Permanente' | 'Historico';
export type ResultadoMedicion = 'SinValorar' | 'Correcto' | 'FueraDeRango';

export interface CodigoLeido {
  codigo: string;
  descripcion: string | null;
  estado: EstadoCodigo;
  nota: string | null;
}

export interface Medicion {
  parametro: string;
  valor: string;
  unidad: string | null;
  valorEsperado: string | null;
  resultado: ResultadoMedicion;
  nota: string | null;
  /** Referencia con la que se compara (opcional). */
  valorReferenciaId?: number | null;
}

export interface Prueba {
  descripcion: string;
  resultado: string | null;
}

export interface Adjunto {
  id: number;
  nombreOriginal: string;
  tipoContenido: string;
  tamano: number;
  fecha: string;
  visibleCliente: boolean;
}

export interface FichaDiagnosis {
  ordenTrabajoId: number;
  sintomas: string | null;
  conclusion: string | null;
  fechaActualizacion: string | null;
  codigos: CodigoLeido[];
  mediciones: Medicion[];
  pruebas: Prueba[];
  adjuntos: Adjunto[];
}

export type FichaDiagnosisRequest = Pick<FichaDiagnosis, 'sintomas' | 'conclusion' | 'codigos' | 'mediciones' | 'pruebas'>;

export interface CodigoAveriaListItem {
  codigo: string;
  descripcion: string;
  sistema: string | null;
  esPropio: boolean;
  tieneNotas: boolean;
  numCasos: number;
}

export interface CasoTaller {
  ordenId: number;
  fecha: string;
  vehiculo: string;
  tipoVehiculo: TipoVehiculo;
  estado: EstadoOrden;
  motivoEntrada: string;
  diagnostico: string | null;
  conclusion: string | null;
  codigos: string[];
  trabajos: string[];
}

export interface CodigoAveriaDetalle {
  codigo: string;
  descripcion: string;
  sistema: string | null;
  notas: string | null;
  esPropio: boolean;
  enBiblioteca: boolean;
  estructura: string | null;
  casos: CasoTaller[];
}

// Asistente

export interface EstadoAsistente {
  configurado: boolean;
  modelo: string;
}

export interface SesionAsistenteItem {
  id: number;
  titulo: string;
  ordenId: number | null;
  vehiculo: string | null;
  fechaActualizacion: string;
  tokens: number;
}

export interface HerramientaUsada {
  nombre: string;
  entrada: string;
}

export interface MensajeAsistente {
  rol: 'user' | 'assistant';
  texto: string;
  razonamiento: string | null;
  herramientas: HerramientaUsada[];
  fichaEnviada: boolean;
  fecha: string;
  adjuntos?: string[] | null;
}

export interface SesionAsistente {
  id: number;
  titulo: string;
  ordenId: number | null;
  vehiculo: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  mensajes: MensajeAsistente[];
}

/** Evento recibido mientras el asistente responde. */
export interface EventoAsistente {
  tipo: 'texto' | 'pensando' | 'herramienta' | 'resultado' | 'aviso' | 'error' | 'fin';
  texto?: string;
  nombre?: string;
  datos?: unknown;
}

// Valores de referencia

export type Combustible = 'Todos' | 'Gasolina' | 'Diesel';

export interface ValorReferencia {
  id: number;
  parametro: string;
  categoria: string;
  condicion: string | null;
  minimo: number | null;
  maximo: number | null;
  unidad: string;
  combustible: Combustible;
  aplicacion: string | null;
  pidObd: string | null;
  notas: string | null;
  esPropio: boolean;
}

export type ValorReferenciaRequest = Omit<ValorReferencia, 'id' | 'esPropio'>;

// Documentación técnica

export type TipoDocumento = 'EsquemaElectrico' | 'Manual' | 'Procedimiento' | 'Boletin' | 'DatosTecnicos' | 'Otro';

export interface DocumentoTecnico {
  id: number;
  titulo: string;
  tipo: TipoDocumento;
  marca: string | null;
  modelo: string | null;
  motor: string | null;
  anioDesde: number | null;
  anioHasta: number | null;
  sistema: string | null;
  notas: string | null;
  nombreOriginal: string;
  tipoContenido: string;
  tamano: number;
  fechaAlta: string;
  /** Conversaciones del asistente que lo usan (mientras haya alguna, no se puede borrar). */
  usosAsistente: number;
  /** Carpeta de SharePoint de la que viene (si es sincronizado). */
  sharePointRuta?: string | null;
  deSharePoint?: boolean;
  eliminadoEnSharePoint?: boolean;
}

export interface EstadoSharePoint {
  configurado: boolean;
  siteUrl: string | null;
  biblioteca: string | null;
  carpeta: string | null;
  intervaloMinutos: number;
  enCurso: boolean;
  progreso: string | null;
  ultimaSincronizacion: string | null;
  ultimoResultado: string | null;
  ultimaConError: boolean;
  documentos: number;
  repro: EstadoRepro | null;
}

export interface EstadoRepro {
  biblioteca: string;
  ultimaSincronizacion: string | null;
  ultimoResultado: string | null;
  ultimaConError: boolean;
  reprogramaciones: number;
  sinVincular: number;
}

// Reprogramaciones (biblioteca REPRO de SharePoint)

export interface ReproVehiculo {
  id: number;
  marca: string;
  modelo: string | null;
  matricula: string | null;
  bastidor: string | null;
  clienteId: number;
  clienteNombre: string;
}

export interface ReproListItem {
  id: number;
  nombre: string;
  fecha: string;
  modificada: string;
  archivos: number;
  vehiculo: ReproVehiculo | null;
  vinculoManual: boolean;
}

export type VisorArchivo = 'pdf' | 'imagen' | 'video' | 'texto' | 'office' | 'binario';

export interface ArchivoRepro {
  id: number;
  nombre: string;
  ruta: string;
  tamano: number;
  modificado: string;
  visor: VisorArchivo;
  webUrl: string | null;
}

export interface ReproDetalle {
  id: number;
  nombre: string;
  fecha: string;
  modificada: string;
  webUrl: string | null;
  notas: string | null;
  vehiculo: ReproVehiculo | null;
  vinculoManual: boolean;
  archivos: ArchivoRepro[];
}

export type DocumentoTecnicoRequest = Pick<DocumentoTecnico,
  'titulo' | 'tipo' | 'marca' | 'modelo' | 'motor' | 'anioDesde' | 'anioHasta' | 'sistema' | 'notas'>;

export interface EnlacePortal {
  id: number;
  nombre: string;
  url: string;
  marca: string | null;
  orden: number;
}

export interface DocumentacionVehiculo {
  documentos: DocumentoTecnico[];
  portales: { nombre: string; url: string }[];
  catalogos: CatalogoVehiculo[];
  /** Bastidor normalizado (mayúsculas, sin espacios), para copiarlo. */
  bastidor: string | null;
}

// Catálogos gratuitos de despieces y esquemas (otras webs)

export interface CatalogoDespiece {
  id: number;
  nombre: string;
  descripcion: string | null;
  urlVehiculo: string;
  urlReferencia: string | null;
  marcas: string | null;
  aliasMarcas: string | null;
  activo: boolean;
  orden: number;
}

export type CatalogoDespieceRequest = Omit<CatalogoDespiece, 'id'>;

export interface CatalogoVehiculo {
  id: number;
  nombre: string;
  descripcion: string | null;
  /** null si falta un dato del vehículo (ver falta). */
  url: string | null;
  falta: string | null;
  buscaReferencias: boolean;
}

export interface EnlaceReferencia {
  nombre: string;
  url: string;
}

// Fotos y vídeos de las órdenes

export type EtapaMultimedia = 'Recepcion' | 'Diagnostico' | 'Reparacion' | 'Entrega' | 'Otro';

export interface MultimediaOrden {
  id: number;
  etapa: EtapaMultimedia;
  descripcion: string | null;
  visibleCliente: boolean;
  nombreOriginal: string;
  tipoContenido: string;
  tamano: number;
  fecha: string;
  subidoPor: string | null;
  url: string;
}

export interface PortalMultimedia {
  id: number;
  etapa: EtapaMultimedia;
  descripcion: string | null;
  tipoContenido: string;
  fecha: string;
  url: string;
}

// Datos por matrícula (MatriculaAPI, de pago por consulta)

export interface ConsultaMatricula {
  matricula: string;
  fecha: string;
  /** Ya se había consultado: no ha costado nada. */
  desdeGuardada: boolean;
  bastidor: string | null;
  marca: string | null;
  modelo: string | null;
  variante: string | null;
  descripcion: string | null;
  anio: number | null;
  fechaMatriculacion: string | null;
  cilindrada: number | null;
  combustible: string | null;
  potenciaCv: number | null;
  puertas: number | null;
}

// Mecánico virtual (Gemini)

export interface ConversacionMecanico {
  id: number;
  titulo: string;
  creada: string;
  actualizada: string;
  /** Si se abrió desde una orden (la burbuja de la orden). */
  ordenId: number | null;
}

export interface MensajeMecanico {
  id: number;
  esUsuario: boolean;
  texto: string;
  fecha: string;
}

export interface ConversacionMecanicoDetalle {
  id: number;
  titulo: string;
  ordenId: number | null;
  mensajes: MensajeMecanico[];
}

export interface EventoMecanico {
  tipo: 'texto' | 'error' | 'fin';
  texto?: string;
  id?: number;
}

// Visión 360 de la ficha del vehículo

export interface ImagenVehiculo {
  url: string;
  fecha: string;
  /** Generada con IA (no es una foto real). */
  generada: boolean;
}

export interface VehiculoResumen {
  imagen: ImagenVehiculo | null;
  /** Se puede generar la imagen con Gemini (hay clave). */
  generadorImagen: boolean;
  tecnicos: {
    variante: string | null;
    combustible: string | null;
    cilindrada: number | null;
    potenciaCv: number | null;
    fechaMatriculacion: string | null;
    fecha: string;
  } | null;
  propietario: {
    id: number;
    nombre: string;
    tipo: TipoCliente;
    telefono: string | null;
    email: string | null;
    poblacion: string | null;
    fechaAlta: string;
    vehiculos: number;
  };
  uso: { enHoras: boolean; actual: number | null; puntos: { fecha: string; valor: number }[]; porAnio: number | null };
  historial: {
    visitas: number;
    primera: string | null;
    ultima: string | null;
    ultimoMotivo: string | null;
    facturado: number;
    margen: number;
    abierta: OrdenListItem | null;
    /** Importe de las órdenes sin pagar (sin canceladas). */
    pendienteCobro: number;
  };
  diagnostico: {
    activos: { codigo: string; descripcion: string | null; estado: EstadoCodigo }[];
    repetidos: string[];
    ordenId: number | null;
    fecha: string | null;
    conclusion: string | null;
  };
  repro: { total: number; ultima: string | null; fecha: string | null };
  multimedia: { fotos: number; videos: number; ultimaOrdenId: number | null; ultima: string | null };
  conversaciones: number;
}

/** Visión 360 del vehículo en el área del cliente (solo lo que puede ver el cliente). */
export interface PortalVehiculoResumen {
  imagenUrl: string | null;
  imagenGenerada: boolean;
  color: string | null;
  motor: string | null;
  tecnicos: VehiculoResumen['tecnicos'];
  uso: VehiculoResumen['uso'];
  visitas: number;
  primera: string | null;
  ultima: string | null;
  ultimoMotivo: string | null;
  facturado: number;
  enCurso: PortalOrdenResumen | null;
  fotos: number;
  videos: number;
  ultimaOrdenConFotos: number | null;
}

// Contabilidad

export type CategoriaGasto =
  | 'Recambios' | 'Consumibles' | 'Herramientas' | 'Alquiler' | 'Suministros' | 'Combustible' | 'Seguros'
  | 'Vehiculos' | 'Software' | 'Publicidad' | 'Gestoria' | 'Tasas' | 'Otros';
export type MetodoPago = 'Efectivo' | 'Tarjeta' | 'Transferencia' | 'Bizum' | 'Otro';

export interface Gasto {
  id: number;
  fecha: string;
  categoria: CategoriaGasto;
  concepto: string;
  proveedor: string | null;
  importe: number;
  metodoPago: MetodoPago;
  notas: string | null;
  ordenTrabajoId: number | null;
  ordenMatricula: string | null;
  adjuntoNombre: string | null;
  adjuntoTipo: string | null;
  adjuntoUrl: string | null;
}

export interface GastoRequest {
  fecha: string;
  categoria: CategoriaGasto;
  concepto: string;
  proveedor: string | null;
  importe: number;
  metodoPago: MetodoPago;
  notas: string | null;
  ordenTrabajoId: number | null;
}

export interface OrdenContable {
  id: number;
  fechaSalida: string | null;
  vehiculo: string;
  matricula: string | null;
  clienteId: number;
  clienteNombre: string;
  total: number;
  coste: number;
  margen: number;
  pagado: boolean;
  fechaPago: string | null;
  estado: EstadoOrden;
}

export interface ResumenContabilidad {
  desde: string;
  hasta: string;
  facturado: number;
  cobrado: number;
  pendienteCobro: number;
  ordenesPendientesCobro: number;
  ordenesEntregadas: number;
  manoObra: number;
  piezas: number;
  costePiezas: number;
  margenOrdenes: number;
  gastos: number;
  resultado: number;
  gastosPorCategoria: { categoria: CategoriaGasto; importe: number; numero: number }[];
  ingresosPorServicio: { servicio: TipoServicio; importe: number }[];
  mejoresClientes: { clienteId: number; nombre: string; importe: number; ordenes: number }[];
  meses: { mes: string; facturado: number; cobrado: number; gastos: number }[];
  ordenes: OrdenContable[];
  sinCobrar: OrdenContable[];
  /** Importes de las órdenes con IVA (true) o sin IVA (false). */
  conIva: boolean;
  /** Coste real de las piezas (líneas) de las órdenes cobradas en el periodo. */
  costePiezasCobradas: number;
  /** Gastos del periodo no ligados a una orden. */
  gastosGenerales: number;
  /** Cobrado − coste de las piezas − gastos generales. */
  beneficio: number;
}
