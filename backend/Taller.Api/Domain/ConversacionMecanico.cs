namespace Taller.Api.Domain;

/// <summary>Conversación con el mecánico virtual (Gemini). Cada usuario del taller ve solo las suyas.</summary>
public class ConversacionMecanico
{
    public int Id { get; set; }
    public required string Titulo { get; set; }
    public required string Usuario { get; set; }

    /// <summary>Si se abrió desde una orden: cada pregunta lleva los datos actualizados de la orden y su vehículo.</summary>
    public int? OrdenTrabajoId { get; set; }
    public DateTimeOffset Creada { get; set; }
    public DateTimeOffset Actualizada { get; set; }
    public List<MensajeMecanico> Mensajes { get; set; } = [];
}

public class MensajeMecanico
{
    public int Id { get; set; }
    public int ConversacionMecanicoId { get; set; }

    /// <summary>true = lo escribió el mecánico; false = respuesta del modelo.</summary>
    public bool EsUsuario { get; set; }
    public required string Texto { get; set; }
    public DateTimeOffset Fecha { get; set; }
}
