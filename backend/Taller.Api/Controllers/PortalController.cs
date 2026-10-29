using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>
/// Portal del cliente: solo lectura y solo sus propios vehículos. Todo se filtra por el cliente de la sesión,
/// así que pedir un vehículo u orden ajeno devuelve 404 (no se revela si existe).
/// </summary>
[ApiController]
[Route("api/portal")]
// El taller también entra, en vista previa de un cliente (ver VistaCliente): solo lectura, igual que el cliente.
[Authorize(Roles = Roles.Cliente + "," + Roles.Taller)]
[VistaCliente.Filtro]
public class PortalController(TallerDbContext db, AlmacenPrivado almacen) : ControllerBase
{
    private int ClienteId => HttpContext.ClienteIdPortal();

    /// <summary>Nombre del cliente cuya área se muestra (para el saludo y la vista previa del taller).</summary>
    [HttpGet("cliente")]
    public async Task<ActionResult<PortalClienteDto>> Cliente(CancellationToken ct)
    {
        var c = await db.Clientes.AsNoTracking().Where(c => c.Id == ClienteId).Select(c => new PortalClienteDto(c.Id, c.Nombre)).FirstOrDefaultAsync(ct);
        return c is null ? NotFound() : c;
    }

    [HttpGet("vehiculos")]
    public async Task<IReadOnlyList<PortalVehiculo>> Vehiculos(CancellationToken ct)
    {
        var vehiculos = await db.Vehiculos.AsNoTracking()
            .Where(v => v.ClienteId == ClienteId)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .OrderBy(v => v.Marca).ThenBy(v => v.Modelo)
            .ToListAsync(ct);

        return vehiculos.Select(ToDto).ToList();
    }

    [HttpGet("vehiculos/{id:int}")]
    public async Task<ActionResult<PortalVehiculoDetalle>> Vehiculo(int id, CancellationToken ct)
    {
        var v = await db.Vehiculos.AsNoTracking()
            .Where(v => v.Id == id && v.ClienteId == ClienteId)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(ct);

        if (v is null)
        {
            return NotFound();
        }

        return new PortalVehiculoDetalle(ToDto(v), v.Ordenes.OrderByDescending(o => o.FechaEntrada).Select(Resumen).ToList());
    }

    /// <summary>Visión 360 de uno de sus vehículos.</summary>
    [HttpGet("vehiculos/{id:int}/resumen")]
    public async Task<ActionResult<PortalVehiculoResumen>> ResumenVehiculo(int id, CancellationToken ct)
    {
        var v = await db.Vehiculos.AsNoTracking()
            .Where(v => v.Id == id && v.ClienteId == ClienteId)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(ct);
        if (v is null)
        {
            return NotFound();
        }

        var ordenes = v.Ordenes.Where(o => o.Estado != EstadoOrden.Cancelado).OrderBy(o => o.FechaEntrada).ToList();
        var ordenIds = ordenes.Select(o => o.Id).ToList();
        var media = await db.MultimediaOrdenes.AsNoTracking()
            .Where(m => ordenIds.Contains(m.OrdenTrabajoId) && m.VisibleCliente)
            .Select(m => new { m.OrdenTrabajoId, m.TipoContenido, m.Fecha })
            .ToListAsync(ct);
        var videos = media.Count(m => m.TipoContenido.StartsWith("video/"));
        var enCurso = ordenes.LastOrDefault(o => o.Estado != EstadoOrden.Entregado);

        return new PortalVehiculoResumen(
            v.Imagen is null ? null : $"/api/portal/vehiculos/{v.Id}/imagen?v={Path.GetFileNameWithoutExtension(v.Imagen)[..8]}",
            v.ImagenGenerada, v.Color, v.Motor,
            await Contracts.ResumenVehiculo.TecnicosAsync(db, v.Matricula, ct),
            Contracts.ResumenVehiculo.Uso(v, ordenes),
            ordenes.Count, ordenes.FirstOrDefault()?.FechaEntrada, ordenes.LastOrDefault()?.FechaEntrada, ordenes.LastOrDefault()?.MotivoEntrada,
            ordenes.Sum(o => Totales.De(o.Lineas).Total),
            enCurso is null ? null : Resumen(enCurso),
            media.Count - videos, videos, media.MaxBy(m => m.Fecha)?.OrdenTrabajoId);
    }

    [HttpGet("vehiculos/{id:int}/imagen")]
    public async Task<IActionResult> ImagenVehiculo(int id, CancellationToken ct)
    {
        var imagen = await db.Vehiculos.Where(v => v.Id == id && v.ClienteId == ClienteId).Select(v => v.Imagen).FirstOrDefaultAsync(ct);
        if (imagen is null || !System.IO.File.Exists(almacen.Ruta(imagen)))
        {
            return NotFound();
        }
        var tipo = Path.GetExtension(imagen).ToLowerInvariant() switch { ".png" => "image/png", ".webp" => "image/webp", _ => "image/jpeg" };
        return PhysicalFile(almacen.Ruta(imagen), tipo);
    }

    /// <summary>Descarga un documento de una de sus órdenes (solo si el taller lo ha dejado visible).</summary>
    [HttpGet("documentos/{id:int}")]
    public async Task<IActionResult> Documento(int id, CancellationToken ct)
    {
        var adjunto = await db.AdjuntosDiagnosis.AsNoTracking()
            .FirstOrDefaultAsync(a => a.Id == id && a.VisibleCliente && a.FichaDiagnosis.OrdenTrabajo.Vehiculo.ClienteId == ClienteId, ct);
        if (adjunto is null || !System.IO.File.Exists(almacen.Ruta(adjunto.Archivo)))
        {
            return NotFound();
        }
        // PDF e imágenes se abren en el navegador; el nombre original se conserva al guardar.
        Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(adjunto.NombreOriginal)}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(almacen.Ruta(adjunto.Archivo), adjunto.TipoContenido);
    }

    [HttpGet("ordenes/{id:int}")]
    public async Task<ActionResult<PortalOrdenDetalle>> Orden(int id, CancellationToken ct)
    {
        var o = await db.OrdenesTrabajo.AsNoTracking()
            .Where(o => o.Id == id && o.Vehiculo.ClienteId == ClienteId)
            .Include(o => o.Lineas)
            .FirstOrDefaultAsync(ct);

        if (o is null)
        {
            return NotFound();
        }

        // El resumen del vehículo necesita todas sus órdenes; se carga aparte para no crear un Include circular.
        var vehiculo = await db.Vehiculos.AsNoTracking()
            .Include(v => v.Ordenes).ThenInclude(x => x.Lineas)
            .AsSplitQuery()
            .FirstAsync(v => v.Id == o.VehiculoId, ct);

        var diagnosis = await DiagnosisAsync(o.Id, ct);
        var documentos = await db.AdjuntosDiagnosis.AsNoTracking()
            .Where(a => a.FichaDiagnosis.OrdenTrabajoId == o.Id && a.VisibleCliente)
            .OrderBy(a => a.Fecha)
            .Select(a => new PortalDocumento(a.Id, a.NombreOriginal, a.TipoContenido, a.Tamano, a.Fecha, "/api/portal/documentos/" + a.Id))
            .ToListAsync(ct);

        var multimedia = await db.MultimediaOrdenes.AsNoTracking()
            .Where(m => m.OrdenTrabajoId == o.Id && m.VisibleCliente)
            .OrderBy(m => m.Etapa).ThenBy(m => m.Fecha)
            .Select(m => new PortalMultimedia(m.Id, m.Etapa, m.Descripcion, m.TipoContenido, m.Fecha, "/api/multimedia/" + m.Id + "/archivo"))
            .ToListAsync(ct);

        var totales = Totales.De(o.Lineas);
        return new PortalOrdenDetalle(
            o.Id, o.Estado, o.Servicios, o.FechaEntrada, o.FechaPrevista, o.FechaSalida, o.MotivoEntrada, o.Diagnostico,
            o.KilometrosEntrada, o.HorasEntrada, ToDto(vehiculo),
            o.Lineas.OrderBy(l => l.Id)
                .Select(l => new PortalLinea(l.Tipo, l.Descripcion, l.Referencia, l.Cantidad, l.PrecioUnitario, l.DescuentoPorcentaje, l.IvaPorcentaje, l.BaseImponible))
                .ToList(),
            new PortalTotales(totales.BaseImponible, totales.Iva, totales.Total),
            multimedia,
            o.Pagado,
            diagnosis,
            documentos);
    }

    /// <summary>
    /// Ficha de diagnosis de la orden para el cliente (null si no hay o está vacía). Los códigos sin descripción
    /// toman la de la biblioteca de códigos del taller.
    /// </summary>
    private async Task<PortalDiagnosis?> DiagnosisAsync(int ordenId, CancellationToken ct)
    {
        var f = await db.FichasDiagnosis.AsNoTracking()
            .Include(f => f.Codigos)
            .Include(f => f.Mediciones)
            .Include(f => f.Pruebas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(f => f.OrdenTrabajoId == ordenId, ct);
        if (f is null || (string.IsNullOrWhiteSpace(f.Sintomas) && string.IsNullOrWhiteSpace(f.Conclusion)
            && f.Codigos.Count == 0 && f.Mediciones.Count == 0 && f.Pruebas.Count == 0))
        {
            return null;
        }

        var sinDescripcion = f.Codigos.Where(c => string.IsNullOrWhiteSpace(c.Descripcion)).Select(c => c.Codigo).ToList();
        var biblioteca = sinDescripcion.Count == 0
            ? new Dictionary<string, string>()
            : await db.CodigosAveria.AsNoTracking().Where(c => sinDescripcion.Contains(c.Codigo)).ToDictionaryAsync(c => c.Codigo, c => c.Descripcion, ct);

        return new PortalDiagnosis(
            f.Sintomas, f.Conclusion, f.FechaActualizacion,
            f.Codigos.OrderBy(c => c.Estado == EstadoCodigo.Historico).ThenBy(c => c.Id)
                .Select(c => new PortalCodigo(c.Codigo, string.IsNullOrWhiteSpace(c.Descripcion) ? biblioteca.GetValueOrDefault(c.Codigo) : c.Descripcion, c.Estado))
                .ToList(),
            f.Mediciones.OrderBy(m => m.Id).Select(m => new PortalMedicion(m.Parametro, m.Valor, m.Unidad, m.ValorEsperado, m.Resultado)).ToList(),
            f.Pruebas.OrderBy(p => p.Id).Select(p => new PortalPrueba(p.Descripcion, p.Resultado)).ToList());
    }

    private static PortalOrdenResumen Resumen(OrdenTrabajo o) => new(
        o.Id, o.Estado, o.Servicios, o.FechaEntrada, o.FechaPrevista, o.FechaSalida, o.MotivoEntrada, Totales.De(o.Lineas).Total, o.Pagado);

    private static PortalVehiculo ToDto(Vehiculo v) => new(
        v.Id, v.Tipo, v.Matricula, v.Bastidor, v.Marca, v.Modelo, v.Anio, v.Kilometros, v.Horas,
        v.Ordenes.Count,
        v.Ordenes.OrderByDescending(o => o.FechaEntrada).Select(Resumen).FirstOrDefault());
}
