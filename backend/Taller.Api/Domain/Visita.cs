namespace Taller.Api.Domain;

public enum TipoVisitante
{
    Publico,
    Cliente,
    Taller
}

/// <summary>
/// Página vista de la web, para las estadísticas de visitas. No se guarda la IP: solo la zona aproximada (por la IP,
/// con una base de datos local) y una huella del visitante que cambia cada día, para contar visitantes únicos sin
/// poder seguir a nadie de un día a otro.
/// </summary>
public class Visita
{
    public long Id { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public required string Ruta { get; set; }
    public TipoVisitante Tipo { get; set; }
    /// <summary>Huella diaria del visitante (HMAC de IP + navegador + día); no permite recuperar la IP.</summary>
    public required string Visitante { get; set; }
    public bool Movil { get; set; }

    /// <summary>País (ISO 3166-1, p. ej. "ES"), si se ha podido ubicar.</summary>
    public string? Pais { get; set; }
    /// <summary>Comunidad autónoma (código INE "01"…"19"), solo en España.</summary>
    public string? Region { get; set; }
    public string? Ciudad { get; set; }
    /// <summary>Coordenadas aproximadas de la ciudad (redondeadas a 2 decimales).</summary>
    public double? Latitud { get; set; }
    public double? Longitud { get; set; }

    /// <summary>Web desde la que llegó (solo el dominio), si viene de fuera.</summary>
    public string? Origen { get; set; }
}
