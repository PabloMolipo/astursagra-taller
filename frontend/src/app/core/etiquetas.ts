import { CategoriaGasto, MetodoPago, EstadoOrden, EtapaMultimedia, TipoCliente, TipoDocumento, TipoLinea, TipoServicio, TipoVehiculo } from './models';

export const TIPOS_CLIENTE: Record<TipoCliente, string> = {
  Particular: 'Particular',
  Empresa: 'Empresa'
};

export const TIPOS_VEHICULO: Record<TipoVehiculo, string> = {
  Turismo: 'Turismo',
  Moto: 'Moto',
  Furgoneta: 'Furgoneta',
  Camion: 'Camión',
  Tractor: 'Tractor',
  MaquinariaAgricola: 'Maquinaria agrícola',
  Otro: 'Otro'
};

export const ESTADOS_ORDEN: Record<EstadoOrden, string> = {
  Recibido: 'Recibido',
  EnDiagnostico: 'En diagnóstico',
  Presupuestado: 'Presupuestado',
  EnReparacion: 'En reparación',
  Listo: 'Listo',
  Entregado: 'Entregado',
  Cancelado: 'Cancelado'
};

export const TIPOS_SERVICIO: Record<TipoServicio, string> = {
  Mecanica: 'Mecánica',
  MecanicaMaquinaria: 'Mecánica maquinaria',
  Electromecanica: 'Electromecánica',
  Programacion: 'Programación',
  ChapaPintura: 'Chapa y pintura',
  Mantenimiento: 'Mantenimiento',
  Diagnosis: 'Diagnosis',
  Otro: 'Otro'
};

export const TIPOS_DOCUMENTO: Record<TipoDocumento, string> = {
  EsquemaElectrico: 'Esquema eléctrico',
  Manual: 'Manual',
  Procedimiento: 'Procedimiento',
  Boletin: 'Boletín técnico',
  DatosTecnicos: 'Datos técnicos',
  Otro: 'Otro'
};

export const ETAPAS_MULTIMEDIA: Record<EtapaMultimedia, string> = {
  Recepcion: 'Recepción',
  Diagnostico: 'Diagnóstico',
  Reparacion: 'Reparación',
  Entrega: 'Entrega',
  Otro: 'Otro'
};

export const TIPOS_LINEA: Record<TipoLinea, string> = {
  ManoObra: 'Mano de obra',
  Pieza: 'Pieza'
};

/** Tractores y maquinaria se miden en horas; el resto en kilómetros. */
/** Colores habituales (los mismos nombres que entiende el generador de imágenes), con su muestra. */
export const COLORES_VEHICULO: { nombre: string; muestra: string }[] = [
  { nombre: 'Negro', muestra: '#0b0b0b' },
  { nombre: 'Blanco', muestra: '#f2f2f2' },
  { nombre: 'Gris plata', muestra: '#b8bcc2' },
  { nombre: 'Gris', muestra: '#7c8087' },
  { nombre: 'Gris oscuro', muestra: '#3d4045' },
  { nombre: 'Azul', muestra: '#2f6fd6' },
  { nombre: 'Azul oscuro', muestra: '#1b2a4e' },
  { nombre: 'Rojo', muestra: '#c8202a' },
  { nombre: 'Granate', muestra: '#6e1424' },
  { nombre: 'Verde', muestra: '#2e8b4a' },
  { nombre: 'Verde oscuro', muestra: '#1f3b2b' },
  { nombre: 'Beige', muestra: '#cdb991' },
  { nombre: 'Marrón', muestra: '#5c3b26' },
  { nombre: 'Amarillo', muestra: '#f2c230' },
  { nombre: 'Naranja', muestra: '#e8731c' }
];

export const CATEGORIAS_GASTO: Record<CategoriaGasto, string> = {
  Recambios: 'Recambios',
  Consumibles: 'Consumibles (aceite, líquidos…)',
  Herramientas: 'Herramientas y maquinaria',
  Alquiler: 'Alquiler',
  Suministros: 'Luz, agua, internet',
  Combustible: 'Combustible',
  Seguros: 'Seguros',
  Vehiculos: 'Grúa y vehículos',
  Software: 'Software y suscripciones',
  Publicidad: 'Publicidad',
  Gestoria: 'Gestoría y asesoría',
  Tasas: 'Tasas y licencias',
  Otros: 'Otros'
};

export const METODOS_PAGO: Record<MetodoPago, string> = {
  Efectivo: 'Efectivo',
  Tarjeta: 'Tarjeta',
  Transferencia: 'Transferencia',
  Bizum: 'Bizum',
  Otro: 'Otro'
};

export function usaHoras(tipo: TipoVehiculo): boolean {
  return tipo === 'Tractor' || tipo === 'MaquinariaAgricola';
}

export function opciones<T extends string>(etiquetas: Record<T, string>): { valor: T; etiqueta: string }[] {
  return (Object.keys(etiquetas) as T[]).map(valor => ({ valor, etiqueta: etiquetas[valor] }));
}
