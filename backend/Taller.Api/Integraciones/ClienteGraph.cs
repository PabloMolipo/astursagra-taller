using System.Net.Http.Headers;
using System.Text.Json;

namespace Taller.Api.Integraciones;

/// <summary>
/// Configuración de SharePoint (sección <c>SharePoint</c>, credenciales en user-secrets o variables de entorno):
/// TenantId, ClientId, ClientSecret y SiteUrl (p. ej. https://palvarez.sharepoint.com/sites/Taller).
/// Opcionales: Biblioteca (nombre de la biblioteca de documentación; por defecto la principal del site),
/// BibliotecaRepro (nombre de la biblioteca de reprogramaciones, p. ej. "REPRO"; vacía = no se indexa),
/// Carpeta (subcarpeta a sincronizar) e IntervaloMinutos (30). GraphUrl y LoginUrl sirven para pruebas.
/// </summary>
public class OpcionesSharePoint
{
    public string? TenantId { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? SiteUrl { get; set; }
    public string? Biblioteca { get; set; }
    public string? BibliotecaRepro { get; set; }
    public string? Carpeta { get; set; }
    public int IntervaloMinutos { get; set; } = 30;

    /// <summary>Sincronización periódica dentro del propio servicio. En Cloud Run se desactiva y la hace un trabajo programado.</summary>
    public bool Automatica { get; set; } = true;
    public string GraphUrl { get; set; } = "https://graph.microsoft.com/v1.0";
    public string LoginUrl { get; set; } = "https://login.microsoftonline.com";

    public bool Configurado =>
        !string.IsNullOrWhiteSpace(TenantId) && !string.IsNullOrWhiteSpace(ClientId) &&
        !string.IsNullOrWhiteSpace(ClientSecret) && Uri.TryCreate(SiteUrl, UriKind.Absolute, out _);
}

public class ErrorGraph(string mensaje) : Exception(mensaje);

/// <summary>
/// Cliente mínimo de Microsoft Graph con credenciales de aplicación (client credentials). Solo lectura.
/// </summary>
public class ClienteGraph(HttpClient http, OpcionesSharePoint opciones)
{
    private string? token;
    private DateTimeOffset caduca;

    private async Task<string> TokenAsync(CancellationToken ct)
    {
        if (token is not null && DateTimeOffset.UtcNow < caduca)
        {
            return token;
        }

        using var respuesta = await http.PostAsync($"{opciones.LoginUrl.TrimEnd('/')}/{opciones.TenantId}/oauth2/v2.0/token",
            new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["grant_type"] = "client_credentials",
                ["client_id"] = opciones.ClientId!,
                ["client_secret"] = opciones.ClientSecret!,
                ["scope"] = "https://graph.microsoft.com/.default"
            }), ct);

        var cuerpo = await respuesta.Content.ReadAsStringAsync(ct);
        if (!respuesta.IsSuccessStatusCode)
        {
            throw new ErrorGraph($"No se ha podido iniciar sesión en Microsoft 365 ({(int)respuesta.StatusCode}). Revisa TenantId, ClientId y ClientSecret.");
        }
        using var json = JsonDocument.Parse(cuerpo);
        token = json.RootElement.GetProperty("access_token").GetString();
        // Se renueva un minuto antes de que caduque.
        caduca = DateTimeOffset.UtcNow.AddSeconds(json.RootElement.GetProperty("expires_in").GetInt32() - 60);
        return token!;
    }

    private async Task<HttpRequestMessage> PeticionAsync(string url, CancellationToken ct)
    {
        var absoluta = url.StartsWith("http", StringComparison.OrdinalIgnoreCase) ? url : $"{opciones.GraphUrl.TrimEnd('/')}/{url.TrimStart('/')}";
        var peticion = new HttpRequestMessage(HttpMethod.Get, absoluta);
        peticion.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await TokenAsync(ct));
        return peticion;
    }

    public async Task<JsonDocument> GetAsync(string url, CancellationToken ct)
    {
        using var peticion = await PeticionAsync(url, ct);
        using var respuesta = await http.SendAsync(peticion, ct);
        var cuerpo = await respuesta.Content.ReadAsStringAsync(ct);
        if (!respuesta.IsSuccessStatusCode)
        {
            throw new ErrorGraph(respuesta.StatusCode switch
            {
                System.Net.HttpStatusCode.Forbidden or System.Net.HttpStatusCode.Unauthorized =>
                    "Microsoft 365 deniega el acceso al site. Revisa que la aplicación tenga permiso sobre él (Sites.Selected concedido al site).",
                System.Net.HttpStatusCode.NotFound => "No se encuentra el site o la biblioteca en SharePoint. Revisa SiteUrl, Biblioteca y Carpeta.",
                System.Net.HttpStatusCode.Gone => "El enlace de cambios ha caducado.",
                _ => $"Error de Microsoft Graph ({(int)respuesta.StatusCode})."
            });
        }
        return JsonDocument.Parse(cuerpo);
    }

    /// <summary>
    /// Descarga el contenido de un archivo, entero o un tramo (Range: "bytes=0-4095"). Graph redirige a la URL de
    /// descarga y HttpClient la sigue (sin la cabecera de autorización, que esa URL no necesita).
    /// </summary>
    public async Task<HttpResponseMessage> DescargarAsync(string driveId, string itemId, CancellationToken ct, System.Net.Http.Headers.RangeHeaderValue? rango = null)
    {
        using var peticion = await PeticionAsync($"drives/{driveId}/items/{itemId}/content", ct);
        peticion.Headers.Range = rango;
        var respuesta = await http.SendAsync(peticion, HttpCompletionOption.ResponseHeadersRead, ct);
        if (!respuesta.IsSuccessStatusCode)
        {
            respuesta.Dispose();
            throw new ErrorGraph($"No se ha podido descargar un archivo de SharePoint ({(int)respuesta.StatusCode}).");
        }
        return respuesta;
    }
}
