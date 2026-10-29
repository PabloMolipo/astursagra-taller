namespace Taller.Api.Domain;

/// <summary>
/// Reprogramación hecha a un vehículo: una carpeta de primer nivel de la biblioteca REPRO de SharePoint. Los archivos
/// no se copian; se leen de SharePoint al verlos.
/// </summary>
public class Reprogramacion
{
    public int Id { get; set; }

    /// <summary>Id de la carpeta en SharePoint (estable aunque se renombre).</summary>
    public required string SharePointId { get; set; }
    public required string Nombre { get; set; }
    public string? WebUrl { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public DateTimeOffset Modificada { get; set; }

    public int? VehiculoId { get; set; }
    public Vehiculo? Vehiculo { get; set; }

    /// <summary>Vinculada (o desvinculada) a mano: la sincronización ya no la cambia.</summary>
    public bool VinculoManual { get; set; }
    public string? Notas { get; set; }

    public List<ArchivoReprogramacion> Archivos { get; set; } = [];
}

public class ArchivoReprogramacion
{
    public int Id { get; set; }
    public int ReprogramacionId { get; set; }
    public required string SharePointId { get; set; }
    public required string Nombre { get; set; }

    /// <summary>Subcarpeta dentro de la reprogramación ("" si está en su raíz), p. ej. "Original".</summary>
    public string Ruta { get; set; } = "";
    public long Tamano { get; set; }
    public DateTimeOffset Modificado { get; set; }
    public string? WebUrl { get; set; }
}

/// <summary>
/// Carpeta de una biblioteca de SharePoint. Las consultas delta de Graph no devuelven la ruta de cada elemento, así
/// que el árbol se guarda por id y la ruta se reconstruye subiendo por los padres.
/// </summary>
public class CarpetaSharePoint
{
    public required string DriveId { get; set; }
    public required string ItemId { get; set; }
    public required string Nombre { get; set; }

    /// <summary>Id de la carpeta padre; null en la raíz de la biblioteca.</summary>
    public string? PadreId { get; set; }
    public bool EsRaiz { get; set; }
}
