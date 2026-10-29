import { Routes } from '@angular/router';
import { areaCliente, conSesion, sinSesion, soloTaller } from './core/auth';

const T = (titulo: string) => `${titulo} · AsturSagra`;

export const routes: Routes = [
  // Web pública
  {
    path: '',
    loadComponent: () => import('./publico/publico-layout').then(m => m.PublicoLayout),
    children: [
      { path: '', title: 'AsturSagra · Taller mecánico en La Sagra', loadComponent: () => import('./publico/paginas').then(m => m.Inicio) },
      { path: 'servicios', title: T('Servicios'), loadComponent: () => import('./publico/paginas').then(m => m.ServiciosPublicos) },
      { path: 'trabajos', title: T('Trabajos realizados'), loadComponent: () => import('./publico/paginas').then(m => m.TrabajosPublicos) },
      { path: 'trabajos/:slug', title: T('Trabajo realizado'), loadComponent: () => import('./publico/paginas').then(m => m.TrabajoPublico) },
      { path: 'contacto', title: T('Contacto'), loadComponent: () => import('./publico/paginas').then(m => m.Contacto) }
    ]
  },

  // Acceso
  { path: 'acceso', title: T('Acceso'), canActivate: [sinSesion], loadComponent: () => import('./auth/acceso').then(m => m.Acceso) },
  { path: 'cambiar-password', title: T('Contraseña'), canActivate: [conSesion], loadComponent: () => import('./auth/cambiar-password').then(m => m.CambiarPassword) },

  // Área de clientes
  {
    path: 'mi-area',
    canActivate: [areaCliente],
    loadComponent: () => import('./mi-area/mi-area').then(m => m.MiAreaLayout),
    children: [
      { path: '', title: T('Mis vehículos'), loadComponent: () => import('./mi-area/mi-area').then(m => m.MisVehiculos) },
      { path: 'vehiculos/:id', title: T('Mi vehículo'), loadComponent: () => import('./mi-area/mi-area').then(m => m.MiVehiculo) },
      { path: 'ordenes/:id', title: T('Intervención'), loadComponent: () => import('./mi-area/mi-area').then(m => m.MiOrden) }
    ]
  },

  // Gestión del taller
  {
    path: 'gestion',
    canActivate: [soloTaller],
    loadComponent: () => import('./gestion/gestion-layout').then(m => m.GestionLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'tablero' },
      { path: 'tablero', title: T('Tablero'), loadComponent: () => import('./gestion/tablero').then(m => m.Tablero) },

      { path: 'ordenes', title: T('Órdenes'), loadComponent: () => import('./ordenes/orden-list').then(m => m.OrdenList) },
      { path: 'ordenes/nueva', title: T('Nueva orden'), loadComponent: () => import('./ordenes/orden-nueva').then(m => m.OrdenNueva) },
      { path: 'ordenes/:id', title: T('Orden'), loadComponent: () => import('./ordenes/orden-detalle').then(m => m.OrdenDetalleComponent) },

      { path: 'clientes', title: T('Clientes'), loadComponent: () => import('./clientes/cliente-list').then(m => m.ClienteList) },
      { path: 'clientes/nuevo', title: T('Nuevo cliente'), loadComponent: () => import('./clientes/cliente-form').then(m => m.ClienteForm) },
      { path: 'clientes/:id', title: T('Cliente'), loadComponent: () => import('./clientes/cliente-form').then(m => m.ClienteForm) },

      { path: 'vehiculos', title: T('Vehículos'), loadComponent: () => import('./vehiculos/vehiculo-list').then(m => m.VehiculoList) },
      { path: 'vehiculos/nuevo', title: T('Nuevo vehículo'), loadComponent: () => import('./vehiculos/vehiculo-form').then(m => m.VehiculoForm) },
      { path: 'vehiculos/:id', title: T('Vehículo'), loadComponent: () => import('./vehiculos/vehiculo-form').then(m => m.VehiculoForm) },
      { path: 'vehiculos/:id/despiece', title: T('Despiece original'), loadComponent: () => import('./vehiculos/despiece-oem').then(m => m.DespieceOem) },

      {
        path: 'diagnostico',
        loadComponent: () => import('./diagnostico/diagnostico').then(m => m.Diagnostico),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'asistente' },
          { path: 'asistente', title: T('Asistente de diagnóstico'), loadComponent: () => import('./diagnostico/diagnostico').then(m => m.AsistenteLista) },
          { path: 'asistente/:id', title: T('Asistente de diagnóstico'), loadComponent: () => import('./diagnostico/chat').then(m => m.AsistenteChat) },
          { path: 'codigos', title: T('Códigos de avería'), loadComponent: () => import('./diagnostico/diagnostico').then(m => m.CodigosLista) },
          { path: 'codigos/:codigo', title: T('Código de avería'), loadComponent: () => import('./diagnostico/diagnostico').then(m => m.CodigoDetalle) },
          { path: 'referencias', title: T('Valores de referencia'), loadComponent: () => import('./diagnostico/referencias').then(m => m.ValoresReferencia) },
          { path: 'documentacion', title: T('Documentación técnica'), loadComponent: () => import('./diagnostico/documentacion').then(m => m.Documentacion) },
          { path: 'repro', title: T('Reprogramaciones'), loadComponent: () => import('./diagnostico/repro').then(m => m.ReproLista) },
          { path: 'repro/:id', title: T('Reprogramación'), loadComponent: () => import('./diagnostico/repro').then(m => m.ReproDetalleComponent) },
          { path: 'obd', title: T('Lector OBD'), loadComponent: () => import('./diagnostico/lector-obd').then(m => m.LectorObdPagina) }
        ]
      },

      { path: 'mecanico', title: T('Mecánico virtual'), loadComponent: () => import('./mecanico/mecanico-virtual').then(m => m.MecanicoVirtual) },
      { path: 'mecanico/:id', title: T('Mecánico virtual'), loadComponent: () => import('./mecanico/mecanico-virtual').then(m => m.MecanicoVirtual) },
      {
        path: 'contabilidad',
        loadComponent: () => import('./gestion/contabilidad').then(m => m.Contabilidad),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'resumen' },
          { path: 'resumen', title: T('Contabilidad'), loadComponent: () => import('./gestion/contabilidad').then(m => m.ContabilidadResumen) },
          { path: 'gastos', title: T('Gastos'), loadComponent: () => import('./gestion/gastos').then(m => m.Gastos) }
        ]
      },
      { path: 'usuarios', title: T('Usuarios'), loadComponent: () => import('./gestion/usuarios').then(m => m.Usuarios) },

      {
        path: 'web',
        loadComponent: () => import('./gestion/web').then(m => m.Web),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'trabajos' },
          { path: 'trabajos', title: T('Web · Trabajos'), loadComponent: () => import('./gestion/web').then(m => m.WebTrabajos) },
          { path: 'trabajos/nuevo', title: T('Web · Nuevo trabajo'), loadComponent: () => import('./gestion/web').then(m => m.WebTrabajo) },
          { path: 'trabajos/:id', title: T('Web · Trabajo'), loadComponent: () => import('./gestion/web').then(m => m.WebTrabajo) },
          { path: 'servicios', title: T('Web · Servicios'), loadComponent: () => import('./gestion/web').then(m => m.WebServicios) },
          { path: 'datos', title: T('Web · Datos del taller'), loadComponent: () => import('./gestion/web').then(m => m.WebDatos) },
          { path: 'visitas', title: T('Web · Visitas'), loadComponent: () => import('./gestion/visitas').then(m => m.Visitas) }
        ]
      }
    ]
  },

  // Presupuesto, proforma o factura de una orden, a página completa para imprimir o guardar en PDF.
  {
    path: 'imprimir/orden/:id/:tipo',
    title: T('Documento'),
    canActivate: [soloTaller],
    loadComponent: () => import('./ordenes/documento-orden').then(m => m.DocumentoOrden)
  },
  { path: '**', redirectTo: '' }
];
