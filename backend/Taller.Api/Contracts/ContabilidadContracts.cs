using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record GastoDto(
    int Id, DateOnly Fecha, CategoriaGasto Categoria, string Concepto, string? Proveedor, decimal Importe, MetodoPago MetodoPago,
    string? Notas, int? OrdenTrabajoId, string? OrdenMatricula, string? AdjuntoNombre, string? AdjuntoTipo, string? AdjuntoUrl);

public record GastoRequest(
    DateOnly Fecha,
    CategoriaGasto Categoria,
    [Required, MaxLength(300)] string Concepto,
    [MaxLength(150)] string? Proveedor,
    [Range(0.01, 9999999)] decimal Importe,
    MetodoPago MetodoPago,
    [MaxLength(2000)] string? Notas,
    int? OrdenTrabajoId);

/// <summary>IVA por defecto de las líneas nuevas y datos fiscales del taller para las facturas.</summary>
public record AjustesContabilidad(
    [Range(0, 100)] decimal IvaPorDefecto,
    [MaxLength(200)] string? RazonSocial = null,
    [MaxLength(20)] string? Nif = null,
    [MaxLength(1000)] string? PieFactura = null);

/// <summary>
/// Resumen del periodo [Desde, Hasta]. Facturado: órdenes entregadas en el periodo (lo que se ha cobrado o se debe).
/// Cobrado: órdenes marcadas como pagadas en el periodo. Margen de las órdenes: ventas sin IVA − coste de las piezas
/// según las líneas. Resultado: cobrado − gastos registrados en el periodo (incluidas las compras de recambios).
/// Con ConIva=false, los importes de las órdenes van sin IVA (base imponible). Beneficio: cobrado − coste real de las piezas
/// de las órdenes cobradas (líneas) − gastos generales (los no ligados a una orden, para no restar dos veces las piezas).
/// </summary>
public record ResumenContabilidad(
    DateOnly Desde, DateOnly Hasta,
    decimal Facturado, decimal Cobrado, decimal PendienteCobro, int OrdenesPendientesCobro,
    int OrdenesEntregadas, decimal ManoObra, decimal Piezas, decimal CostePiezas, decimal MargenOrdenes,
    decimal Gastos, decimal Resultado,
    IReadOnlyList<ImporteCategoria> GastosPorCategoria,
    IReadOnlyList<ImporteServicio> IngresosPorServicio,
    IReadOnlyList<ClienteImporte> MejoresClientes,
    IReadOnlyList<MesContable> Meses,
    IReadOnlyList<OrdenContable> Ordenes,
    IReadOnlyList<OrdenContable> SinCobrar,
    bool ConIva = true,
    decimal CostePiezasCobradas = 0, decimal GastosGenerales = 0, decimal Beneficio = 0);

public record ImporteCategoria(CategoriaGasto Categoria, decimal Importe, int Numero);

public record ImporteServicio(TipoServicio Servicio, decimal Importe);

public record ClienteImporte(int ClienteId, string Nombre, decimal Importe, int Ordenes);

/// <summary>Mes (primer día) con lo facturado, lo cobrado y los gastos.</summary>
public record MesContable(DateOnly Mes, decimal Facturado, decimal Cobrado, decimal Gastos);

public record OrdenContable(
    int Id, DateTimeOffset? FechaSalida, string Vehiculo, string? Matricula, int ClienteId, string ClienteNombre,
    decimal Total, decimal Coste, decimal Margen, bool Pagado, DateTimeOffset? FechaPago, EstadoOrden Estado);
