namespace Taller.Api.Domain;

public class OrdenTrabajo
{
    public int Id { get; set; }
    public int VehiculoId { get; set; }
    public Vehiculo Vehiculo { get; set; } = null!;

    public EstadoOrden Estado { get; set; }
    public List<TipoServicio> Servicios { get; set; } = [];

    public DateTimeOffset FechaEntrada { get; set; }
    public DateOnly? FechaPrevista { get; set; }
    public DateTimeOffset? FechaSalida { get; set; }

    /// <summary>Lo que cuenta el cliente al dejar el vehículo.</summary>
    public required string MotivoEntrada { get; set; }
    public string? Diagnostico { get; set; }
    public int? KilometrosEntrada { get; set; }
    public int? HorasEntrada { get; set; }
    public string? Observaciones { get; set; }

    /// <summary>El cliente ha pagado la orden; FechaPago es cuándo se marcó.</summary>
    public bool Pagado { get; set; }
    public DateTimeOffset? FechaPago { get; set; }

    public List<LineaTrabajo> Lineas { get; set; } = [];

    /// <summary>Factura emitida de la orden, si la hay.</summary>
    public Factura? Factura { get; set; }
}
