namespace Taller.Api.Domain;

public enum Combustible
{
    Todos,
    Gasolina,
    Diesel
}

/// <summary>
/// Valor de referencia para comparar mediciones: p. ej. masa de aire al ralentí, presión de turbo a plena carga.
/// Los genéricos son orientativos; el taller añade los suyos por marca o motor.
/// </summary>
public class ValorReferencia
{
    public int Id { get; set; }
    public required string Parametro { get; set; }

    /// <summary>Admisión, Sobrealimentación, Combustible, Eléctrico…</summary>
    public required string Categoria { get; set; }

    /// <summary>Cómo se mide: "Ralentí, motor caliente", "Plena carga a 3000 rpm"…</summary>
    public string? Condicion { get; set; }

    public decimal? Minimo { get; set; }
    public decimal? Maximo { get; set; }
    public required string Unidad { get; set; }
    public Combustible Combustible { get; set; }

    /// <summary>A qué vehículos aplica: "Turismos en general", "VAG 1.9 TDI"…</summary>
    public string? Aplicacion { get; set; }

    /// <summary>PID OBD (modo 01) con el que se puede comparar en datos en vivo, p. ej. "10" para el caudalímetro.</summary>
    public string? PidObd { get; set; }
    public string? Notas { get; set; }

    /// <summary>Añadido por el taller; los genéricos no se borran (se pueden corregir).</summary>
    public bool EsPropio { get; set; }
}
