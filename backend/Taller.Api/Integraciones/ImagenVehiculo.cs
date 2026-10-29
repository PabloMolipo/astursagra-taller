using Google.GenAI;
using Google.GenAI.Types;
using Taller.Api.Domain;

namespace Taller.Api.Integraciones;

/// <summary>Error al generar la imagen, con un mensaje para el taller.</summary>
public class ErrorImagen(string mensaje) : Exception(mensaje);

/// <summary>
/// Imagen orientativa de un vehículo generada con Gemini (<c>Gemini:ModeloImagen</c>) a partir de su tipo, marca, modelo
/// y año: perfil lateral sobre fondo negro con el filo lima del portal. Se genera una vez y se guarda.
/// </summary>
public class GeneradorImagenVehiculo(OpcionesGemini opciones)
{
    private Client? cliente;

    public bool Configurado => opciones.Configurado;

    private Client Cliente => cliente ??= new Client(
        apiKey: opciones.ApiKey,
        httpOptions: string.IsNullOrWhiteSpace(opciones.BaseUrl) ? null : new HttpOptions { BaseUrl = opciones.BaseUrl });

    /// <summary>Instrucciones para el modelo (en inglés: los modelos de imagen las siguen mejor).</summary>
    public static string Prompt(Vehiculo v)
    {
        var clase = v.Tipo switch
        {
            TipoVehiculo.Moto => "motorcycle",
            TipoVehiculo.Furgoneta => "van",
            TipoVehiculo.Camion => "truck",
            TipoVehiculo.Tractor => "agricultural tractor",
            TipoVehiculo.MaquinariaAgricola => "agricultural machine",
            TipoVehiculo.Otro => "vehicle",
            _ => "car"
        };
        var descripcion = string.Join(' ', new[] { v.Anio?.ToString(), v.Marca, v.Modelo, clase }.Where(t => !string.IsNullOrWhiteSpace(t)));
        var pintura = string.IsNullOrWhiteSpace(v.Color) || !ColorValido(v.Color) ? "dark graphite" : ColorEnIngles(v.Color);
        return $"""
            Side profile view of a {descripcion}, facing left, the whole vehicle visible and centered with some margin around it.
            Stylized technical illustration with realistic proportions and the details of that exact model and generation:
            {pintura} paint (the body color must clearly be {pintura}), a subtle lime-green (#c6ff00) rim light outlining the silhouette, soft reflection on the floor.
            Plain solid near-black background (#0a0a0a), no scenery.
            No text, no logos or badges, no license plate, no watermark, no people.
            """;
    }

    /// <summary>Colores habituales en español y cómo se piden al modelo; si no está en la lista, se envía tal cual.</summary>
    private static readonly Dictionary<string, string> Colores = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Negro"] = "glossy black",
        ["Blanco"] = "white",
        ["Gris plata"] = "metallic silver",
        ["Gris"] = "medium grey",
        ["Gris oscuro"] = "dark graphite grey",
        ["Azul"] = "medium blue",
        ["Azul oscuro"] = "dark navy blue",
        ["Rojo"] = "red",
        ["Granate"] = "burgundy",
        ["Verde"] = "green",
        ["Verde oscuro"] = "dark green",
        ["Beige"] = "champagne beige",
        ["Marrón"] = "brown",
        ["Amarillo"] = "yellow",
        ["Naranja"] = "orange"
    };

    /// <summary>Solo letras, espacios y guiones (va dentro de las instrucciones del modelo).</summary>
    public static bool ColorValido(string color) =>
        color.Length <= 40 && color.All(c => char.IsLetter(c) || c is ' ' or '-');

    public static string ColorEnIngles(string color) => Colores.TryGetValue(color.Trim(), out var ingles) ? ingles : color.Trim();

    /// <summary>Genera la imagen y devuelve sus bytes (PNG o JPEG, según el modelo).</summary>
    public async Task<byte[]> GenerarAsync(Vehiculo v, CancellationToken ct)
    {
        var config = new GenerateContentConfig
        {
            ResponseModalities = ["IMAGE"],
            ImageConfig = new ImageConfig { AspectRatio = "16:9" }
        };
        var contenido = new List<Content> { new() { Role = "user", Parts = [new Part { Text = Prompt(v) }] } };

        GenerateContentResponse respuesta;
        try
        {
            respuesta = await Cliente.Models.GenerateContentAsync(opciones.ModeloImagen, contenido, config, ct);
        }
        catch (ClientError e)
        {
            throw new ErrorImagen(Mensaje(e));
        }
        catch (Exception e) when (e is ServerError or ApiException or HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new ErrorImagen("El servicio de Gemini no está disponible ahora mismo. Inténtalo en unos minutos.");
        }

        var datos = respuesta.Candidates?.FirstOrDefault()?.Content?.Parts?
            .Select(p => p.InlineData?.Data)
            .FirstOrDefault(d => d is { Length: > 0 });
        return datos ?? throw new ErrorImagen("Gemini no ha devuelto ninguna imagen. Vuelve a intentarlo.");
    }

    /// <summary>Errores 4xx de Gemini en lenguaje del taller (sin reenviar su texto).</summary>
    private string Mensaje(ClientError e)
    {
        var t = e.Message.ToLowerInvariant();
        if (t.Contains("free_tier") || t.Contains("limit: 0"))
            return "Tu clave de Gemini es del nivel gratuito, que no permite generar imágenes. Activa la facturación del proyecto en Google AI Studio.";
        if (t.Contains("quota") || t.Contains("resource_exhausted") || t.Contains("429") || t.Contains("rate"))
            return "Se ha alcanzado el límite de Gemini. Espera un momento y vuelve a intentarlo.";
        if (t.Contains("api key") || t.Contains("api_key") || t.Contains("permission") || t.Contains("unauthenticated") || t.Contains("403") || t.Contains("401"))
            return "La clave de Gemini no es válida o no tiene permiso. Revisa Gemini:ApiKey.";
        if (t.Contains("not found") || t.Contains("404") || t.Contains("model"))
            return $"El modelo de imagen configurado ({opciones.ModeloImagen}) no está disponible. Revisa Gemini:ModeloImagen.";
        return "Gemini no ha aceptado la petición de imagen (puede que haya saltado un filtro). Vuelve a intentarlo.";
    }
}
