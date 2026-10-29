namespace Taller.Api.Domain;

/// <summary>
/// Factura de una orden. Se numera de forma correlativa por año (F2026-0001, F2026-0002…) y, una vez emitida, no cambia:
/// Contenido guarda en JSON los datos del taller, del cliente y de las líneas tal y como estaban al emitirla.
/// Mientras exista, los conceptos facturados de la orden no se pueden modificar y la orden no se puede borrar.
/// </summary>
public class Factura
{
    public int Id { get; set; }
    public int OrdenTrabajoId { get; set; }
    public OrdenTrabajo OrdenTrabajo { get; set; } = null!;

    public int Anio { get; set; }
    public int Numero { get; set; }
    public required string Codigo { get; set; }
    public DateOnly Fecha { get; set; }

    /// <summary>Sin NIF del cliente: factura simplificada (solo hasta 400 € con IVA).</summary>
    public bool Simplificada { get; set; }
    public decimal Total { get; set; }

    /// <summary>FacturaContenido serializado (JSON).</summary>
    public required string Contenido { get; set; }
    public DateTimeOffset FechaAlta { get; set; }
}
