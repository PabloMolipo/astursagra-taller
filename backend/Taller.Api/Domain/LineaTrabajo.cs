namespace Taller.Api.Domain;

public class LineaTrabajo
{
    public int Id { get; set; }
    public int OrdenTrabajoId { get; set; }
    public OrdenTrabajo OrdenTrabajo { get; set; } = null!;

    public TipoLinea Tipo { get; set; }
    public required string Descripcion { get; set; }

    /// <summary>Referencia de la pieza (vacío para mano de obra).</summary>
    public string? Referencia { get; set; }

    /// <summary>Unidades de pieza u horas de mano de obra.</summary>
    public decimal Cantidad { get; set; }
    public decimal PrecioUnitario { get; set; }
    public decimal DescuentoPorcentaje { get; set; }
    public decimal IvaPorcentaje { get; set; } = 21m;

    /// <summary>Coste de compra por unidad (piezas). Sirve para calcular el margen; no se factura.</summary>
    public decimal? CosteUnitario { get; set; }

    public decimal BaseImponible => Math.Round(Cantidad * PrecioUnitario * (1 - DescuentoPorcentaje / 100m), 2);
    public decimal Iva => Math.Round(BaseImponible * IvaPorcentaje / 100m, 2);
    public decimal Coste => Math.Round(Cantidad * (CosteUnitario ?? 0), 2);
}
