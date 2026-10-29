namespace Taller.Api.Domain;

public enum CategoriaGasto
{
    Recambios,
    Consumibles,
    Herramientas,
    Alquiler,
    Suministros,
    Combustible,
    Seguros,
    Vehiculos,
    Software,
    Publicidad,
    Gestoria,
    Tasas,
    Otros
}

public enum MetodoPago
{
    Efectivo,
    Tarjeta,
    Transferencia,
    Bizum,
    Otro
}

/// <summary>
/// Gasto del taller: compra de recambios (opcionalmente ligada a una orden), alquiler, luz, herramientas…
/// Importe es lo pagado en total. El ticket o la factura del proveedor se puede adjuntar (almacén privado).
/// </summary>
public class Gasto
{
    public int Id { get; set; }
    public DateOnly Fecha { get; set; }
    public CategoriaGasto Categoria { get; set; }
    public required string Concepto { get; set; }
    public string? Proveedor { get; set; }
    public decimal Importe { get; set; }
    public MetodoPago MetodoPago { get; set; }
    public string? Notas { get; set; }

    /// <summary>Orden para la que se compró (piezas de esa reparación), si aplica.</summary>
    public int? OrdenTrabajoId { get; set; }
    public OrdenTrabajo? OrdenTrabajo { get; set; }

    public string? Adjunto { get; set; }
    public string? AdjuntoNombre { get; set; }
    public string? AdjuntoTipo { get; set; }

    public DateTimeOffset FechaAlta { get; set; }
}
