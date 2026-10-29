using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Taller.Api.Integraciones;

/// <summary>
/// Vinalfa (vinalfa.com): catálogos originales de despieces por bastidor, API de servidor V2. Sección <c>Vinalfa</c>:
/// Token (token de API de la suscripción, no el público del widget; en user-secrets o variables de entorno) y Url (pruebas).
/// Cada bastidor cuenta una vez por día natural en el límite de la suscripción; navegar por su catálogo no vuelve a contar.
/// </summary>
public class OpcionesVinalfa
{
    public string? Token { get; set; }
    public string Url { get; set; } = "https://api.vinalfa.com/oem/v2";

    public bool Configurado => !string.IsNullOrWhiteSpace(Token);
}

public class ErrorVinalfa(HttpStatusCode estado, string mensaje) : Exception(mensaje)
{
    public HttpStatusCode Estado { get; } = estado;
}

/// <summary>
/// Cliente de la API de Vinalfa. Devuelve el objeto <c>data</c> de cada respuesta tal cual: la API no publica el
/// formato detallado de sus datos y el visor y el asistente los interpretan.
/// </summary>
public partial class ClienteVinalfa(HttpClient http, OpcionesVinalfa opciones)
{
    [GeneratedRegex("^[a-fA-F0-9]{32}$")]
    private static partial Regex HashValido();

    /// <summary>Los hash de vehículo y sección son opacos, pero siempre 32 caracteres hexadecimales (así no se puede inyectar ruta).</summary>
    public static bool EsHash(string? hash) => hash is not null && HashValido().IsMatch(hash);

    public Task<JsonElement> ResolverVehiculoAsync(string identificador, CancellationToken ct) =>
        EnviarAsync(HttpMethod.Post, "/vehicles/resolve", new { identifier = identificador }, ct);

    public Task<JsonElement> GruposAsync(string vehiculo, CancellationToken ct) =>
        EnviarAsync(HttpMethod.Get, $"/vehicles/{Hash(vehiculo)}/groups", null, ct);

    public Task<JsonElement> SubseccionesAsync(string seccion, CancellationToken ct) =>
        EnviarAsync(HttpMethod.Get, $"/sections/{Hash(seccion)}/children", null, ct);

    public Task<JsonElement> PiezasAsync(string seccion, string? vehiculo, CancellationToken ct) =>
        EnviarAsync(HttpMethod.Get, $"/sections/{Hash(seccion)}/parts" + (vehiculo is null ? "" : $"?vehicle_hash={Hash(vehiculo)}"), null, ct);

    public Task<JsonElement> BuscarAsync(string vehiculo, string texto, CancellationToken ct) =>
        EnviarAsync(HttpMethod.Get, $"/vehicles/{Hash(vehiculo)}/search?q={Uri.EscapeDataString(texto)}", null, ct);

    /// <summary>
    /// Hash de vehículo dentro de la respuesta de resolve (su formato no está documentado): primero los campos
    /// "vehicle_hash" y luego cualquier "hash", recorriendo el JSON en orden.
    /// </summary>
    public static List<string> HashesVehiculo(JsonElement datos)
    {
        var preferidos = new List<string>();
        var otros = new List<string>();
        void Recorrer(JsonElement e)
        {
            if (e.ValueKind == JsonValueKind.Object)
            {
                foreach (var p in e.EnumerateObject())
                {
                    if (p.Value.ValueKind == JsonValueKind.String && EsHash(p.Value.GetString()))
                    {
                        (p.Name.Equals("vehicle_hash", StringComparison.OrdinalIgnoreCase) ? preferidos : p.Name.Contains("hash", StringComparison.OrdinalIgnoreCase) ? otros : null)
                            ?.Add(p.Value.GetString()!.ToLowerInvariant());
                    }
                    Recorrer(p.Value);
                }
            }
            else if (e.ValueKind == JsonValueKind.Array)
            {
                foreach (var x in e.EnumerateArray()) Recorrer(x);
            }
        }
        Recorrer(datos);
        return preferidos.Concat(otros).Distinct().ToList();
    }

    private static string Hash(string h) => EsHash(h) ? h.ToLowerInvariant() : throw new ErrorVinalfa(HttpStatusCode.BadRequest, "Identificador de catálogo no válido.");

    private async Task<JsonElement> EnviarAsync(HttpMethod metodo, string ruta, object? cuerpo, CancellationToken ct)
    {
        using var peticion = new HttpRequestMessage(metodo, opciones.Url.TrimEnd('/') + ruta);
        peticion.Headers.Authorization = new AuthenticationHeaderValue("Bearer", opciones.Token);
        peticion.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        peticion.Headers.AcceptLanguage.Add(new StringWithQualityHeaderValue("es"));
        if (cuerpo is not null)
        {
            peticion.Content = new StringContent(JsonSerializer.Serialize(cuerpo), Encoding.UTF8, "application/json");
        }

        HttpResponseMessage respuesta;
        try
        {
            respuesta = await http.SendAsync(peticion, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new ErrorVinalfa(HttpStatusCode.BadGateway, "No se ha podido contactar con Vinalfa. Inténtalo más tarde.");
        }

        using (respuesta)
        {
            var texto = await respuesta.Content.ReadAsStringAsync(ct);
            JsonDocument? json = null;
            try { json = JsonDocument.Parse(texto); } catch (JsonException) { }
            using (json)
            {
                if (respuesta.IsSuccessStatusCode && json?.RootElement.TryGetProperty("data", out var data) == true)
                {
                    return data.Clone();
                }
                var codigo = json is not null && json.RootElement.TryGetProperty("error", out var e) && e.TryGetProperty("code", out var c) ? c.GetString() : null;
                throw Traducir(respuesta.StatusCode, codigo);
            }
        }
    }

    /// <summary>Errores de Vinalfa en lenguaje del taller (sin reenviar su texto, que puede venir en otro idioma).</summary>
    private static ErrorVinalfa Traducir(HttpStatusCode estado, string? codigo) => (estado, codigo) switch
    {
        (HttpStatusCode.Unauthorized, _) or (_, "unauthorized") =>
            new(HttpStatusCode.BadGateway, "El token de Vinalfa no es válido o ha caducado. Revisa Vinalfa:Token (es el token de API, no el del widget)."),
        (HttpStatusCode.Forbidden, _) or (_, "subscription_inactive" or "forbidden" or "catalog_unavailable") =>
            new(HttpStatusCode.BadGateway, "La suscripción de Vinalfa no está activa o no incluye este catálogo."),
        (HttpStatusCode.TooManyRequests, _) or (_, "rate_limited" or "limit_exceeded" or "quota_exceeded") =>
            new(HttpStatusCode.TooManyRequests, "Se ha alcanzado el límite de la suscripción de Vinalfa (bastidores del mes o peticiones por minuto)."),
        (HttpStatusCode.NotFound, _) or (_, "not_found" or "vehicle_not_found" or "vin_not_found") =>
            new(HttpStatusCode.NotFound, "Vinalfa no ha encontrado este vehículo o esta sección en sus catálogos."),
        (HttpStatusCode.BadRequest or HttpStatusCode.UnprocessableEntity, _) =>
            new(HttpStatusCode.BadRequest, "Vinalfa no acepta este bastidor o esta búsqueda. Revisa el bastidor."),
        _ => new(HttpStatusCode.BadGateway, "Vinalfa no ha podido responder. Inténtalo más tarde.")
    };
}
