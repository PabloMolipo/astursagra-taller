namespace Taller.Api.Domain;

/// <summary>
/// Respuesta guardada de MatriculaAPI. Cada consulta cuesta dinero: si ya se consultó una matrícula, se reutiliza
/// salvo que se pida repetir.
/// </summary>
public class ConsultaMatricula
{
    public int Id { get; set; }

    /// <summary>Matrícula normalizada (mayúsculas, sin espacios ni guiones).</summary>
    public required string Matricula { get; set; }
    public bool Moto { get; set; }

    /// <summary>JSON del vehículo tal como lo devuelve el servicio.</summary>
    public required string Respuesta { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public string? Usuario { get; set; }
}
