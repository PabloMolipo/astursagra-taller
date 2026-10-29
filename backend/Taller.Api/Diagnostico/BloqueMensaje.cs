using System.Text.Json;
using System.Text.Json.Serialization;

namespace Taller.Api.Diagnostico;

/// <summary>
/// Un bloque de un mensaje del asistente tal como se envía a la API (texto, razonamiento con su firma,
/// llamada a herramienta o resultado). Se guarda en <c>MensajeAsistente.BloquesJson</c> y se reenvía sin cambios.
/// </summary>
public record BloqueMensaje
{
    public const string TipoTexto = "text";
    public const string TipoRazonamiento = "thinking";
    public const string TipoRazonamientoOculto = "redacted_thinking";
    public const string TipoUsoHerramienta = "tool_use";
    public const string TipoResultado = "tool_result";
    /// <summary>Documento de la biblioteca adjunto (PDF o imagen); el archivo se lee al enviar.</summary>
    public const string TipoDocumento = "documento";

    public required string Tipo { get; init; }
    public string? Texto { get; init; }
    public string? Firma { get; init; }
    public string? Datos { get; init; }
    public string? Id { get; init; }
    public string? Nombre { get; init; }

    /// <summary>Entrada de la herramienta (JSON) o resultado devuelto (JSON o texto).</summary>
    public string? Contenido { get; init; }
    public bool EsError { get; init; }

    /// <summary>Documento de la biblioteca: el adjunto o el que devuelve la herramienta ver_documento.</summary>
    public int? DocumentoId { get; init; }

    /// <summary>Texto generado por el sistema (la ficha de la orden), no escrito por el mecánico. Se envía, pero la UI lo resume.</summary>
    public bool Interno { get; init; }

    private static readonly JsonSerializerOptions Opciones = new()
    {
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    public static string Serializar(IReadOnlyList<BloqueMensaje> bloques) => JsonSerializer.Serialize(bloques, Opciones);

    public static List<BloqueMensaje> Deserializar(string json) => JsonSerializer.Deserialize<List<BloqueMensaje>>(json, Opciones) ?? [];
}
