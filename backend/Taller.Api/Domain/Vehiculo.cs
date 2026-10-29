namespace Taller.Api.Domain;

public class Vehiculo
{
    public int Id { get; set; }
    public int ClienteId { get; set; }
    public Cliente Cliente { get; set; } = null!;

    public TipoVehiculo Tipo { get; set; }

    /// <summary>Opcional: hay vehículos agrícolas sin matrícula; en ese caso se identifica por bastidor.</summary>
    public string? Matricula { get; set; }
    public string? Bastidor { get; set; }
    public required string Marca { get; set; }
    public string? Modelo { get; set; }

    /// <summary>Código de motor (p. ej. "BKC"): sirve para encontrar documentación y valores de referencia.</summary>
    public string? Motor { get; set; }
    public int? Anio { get; set; }

    /// <summary>Uso actual: kilómetros (vehículos de carretera) u horas (tractores y maquinaria).</summary>
    public int? Kilometros { get; set; }
    public int? Horas { get; set; }
    public string? Notas { get; set; }

    /// <summary>Color de la carrocería, en texto libre ("Gris plata", "Rojo"…). Se usa también para la imagen generada.</summary>
    public string? Color { get; set; }

    /// <summary>Imagen orientativa (generada con Gemini o una foto subida), en el almacén privado.</summary>
    public string? Imagen { get; set; }
    public DateTimeOffset? ImagenFecha { get; set; }
    /// <summary>La imagen la ha generado la IA (no es una foto real del vehículo).</summary>
    public bool ImagenGenerada { get; set; }

    public List<OrdenTrabajo> Ordenes { get; set; } = [];
}
