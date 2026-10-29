namespace Taller.Api.Domain;

public enum EtapaMultimedia
{
    /// <summary>Estado del vehículo al entrar (golpes y daños previos).</summary>
    Recepcion,
    Diagnostico,
    Reparacion,
    Entrega,
    Otro
}

/// <summary>Foto o vídeo de una orden de trabajo. Privado salvo que se marque como visible para el cliente.</summary>
public class MultimediaOrden
{
    public int Id { get; set; }
    public int OrdenTrabajoId { get; set; }
    public OrdenTrabajo OrdenTrabajo { get; set; } = null!;

    public EtapaMultimedia Etapa { get; set; }
    public string? Descripcion { get; set; }

    /// <summary>Se muestra al cliente en "Mi área".</summary>
    public bool VisibleCliente { get; set; }

    public required string Archivo { get; set; }
    public required string NombreOriginal { get; set; }
    public required string TipoContenido { get; set; }
    public long Tamano { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public string? SubidoPor { get; set; }
}
