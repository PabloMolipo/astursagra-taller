using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

/// <summary>Margen = base imponible − coste de compra.</summary>
public record Totales(decimal BaseImponible, decimal Iva, decimal Total, decimal Coste, decimal Margen)
{
    public static Totales De(IEnumerable<LineaTrabajo> lineas)
    {
        var lista = lineas.ToList();
        var baseImponible = lista.Sum(l => l.BaseImponible);
        var iva = lista.Sum(l => l.Iva);
        var coste = lista.Sum(l => l.Coste);
        return new Totales(baseImponible, iva, baseImponible + iva, coste, baseImponible - coste);
    }
}

public record OrdenListItem(
    int Id,
    EstadoOrden Estado,
    IReadOnlyList<TipoServicio> Servicios,
    DateTimeOffset FechaEntrada,
    DateOnly? FechaPrevista,
    DateTimeOffset? FechaSalida,
    int VehiculoId,
    string Vehiculo,
    string? Matricula,
    int ClienteId,
    string ClienteNombre,
    string MotivoEntrada,
    decimal Total,
    decimal Margen,
    TipoVehiculo? TipoVehiculo = null,
    bool Pagado = false);

public record LineaDto(
    int Id,
    TipoLinea Tipo,
    string Descripcion,
    string? Referencia,
    decimal Cantidad,
    decimal PrecioUnitario,
    decimal DescuentoPorcentaje,
    decimal IvaPorcentaje,
    decimal BaseImponible,
    decimal Iva,
    decimal? CosteUnitario,
    decimal Coste);

public record OrdenDetalle(
    int Id,
    EstadoOrden Estado,
    IReadOnlyList<TipoServicio> Servicios,
    DateTimeOffset FechaEntrada,
    DateOnly? FechaPrevista,
    DateTimeOffset? FechaSalida,
    string MotivoEntrada,
    string? Diagnostico,
    int? KilometrosEntrada,
    int? HorasEntrada,
    string? Observaciones,
    VehiculoListItem Vehiculo,
    IReadOnlyList<LineaDto> Lineas,
    Totales Totales,
    bool Pagado = false,
    DateTimeOffset? FechaPago = null,
    FacturaResumen? Factura = null);

public record FacturaResumen(string Codigo, DateOnly Fecha);

/// <summary>Datos del taller y del cliente, y la orden, tal y como estaban al emitir la factura.</summary>
public record FacturaContenido(EmisorFactura Emisor, ClienteFactura Cliente, OrdenDetalle Orden, string? Pie);

public record EmisorFactura(
    string Nombre, string RazonSocial, string Nif, string? Direccion, string? CodigoPostal, string? Poblacion, string? Provincia,
    string? Telefono, string? Email);

public record ClienteFactura(string Nombre, string? NifCif, string? Direccion, string? CodigoPostal, string? Poblacion, string? Provincia);

public record FacturaDto(int Id, string Codigo, DateOnly Fecha, bool Simplificada, decimal Total, FacturaContenido Contenido);

/// <summary>Fecha: día de expedición (por defecto, hoy).</summary>
public record EmitirFacturaRequest(DateOnly? Fecha);

/// <summary>FechaEntrada: día de entrada del vehículo (por defecto, hoy).</summary>
public record OrdenCrearRequest(
    int VehiculoId,
    [MinLength(1)] List<TipoServicio> Servicios,
    DateOnly? FechaEntrada,
    DateOnly? FechaPrevista,
    [Required, MaxLength(2000)] string MotivoEntrada,
    [Range(0, int.MaxValue)] int? KilometrosEntrada,
    [Range(0, int.MaxValue)] int? HorasEntrada,
    string? Observaciones);

/// <summary>FechaEntrada: si se indica y cambia el día, se corrige la fecha de entrada.</summary>
public record OrdenActualizarRequest(
    [MinLength(1)] List<TipoServicio> Servicios,
    DateOnly? FechaEntrada,
    DateOnly? FechaPrevista,
    [Required, MaxLength(2000)] string MotivoEntrada,
    [MaxLength(4000)] string? Diagnostico,
    [Range(0, int.MaxValue)] int? KilometrosEntrada,
    [Range(0, int.MaxValue)] int? HorasEntrada,
    string? Observaciones);

public record CambiarEstadoRequest(EstadoOrden Estado);

/// <summary>Fecha: día del pago (para cargar histórico); si no se indica, ahora.</summary>
public record MarcarPagadoRequest(bool Pagado, DateOnly? Fecha = null);

/// <summary>Día de entrega al cliente (para cargar histórico o corregirlo).</summary>
public record FechaSalidaRequest(DateOnly Fecha);

public record LineaRequest(
    TipoLinea Tipo,
    [Required, MaxLength(500)] string Descripcion,
    [MaxLength(100)] string? Referencia,
    [Range(0.01, 99999)] decimal Cantidad,
    [Range(0, 9999999)] decimal PrecioUnitario,
    [Range(0, 100)] decimal DescuentoPorcentaje,
    [Range(0, 100)] decimal IvaPorcentaje,
    [Range(0, 9999999)] decimal? CosteUnitario = null);
