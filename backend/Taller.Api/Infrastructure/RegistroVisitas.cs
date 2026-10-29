using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading.Channels;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Infrastructure;

/// <summary>
/// Anota las páginas vistas de la web (no las llamadas a la API ni los archivos) para las estadísticas de visitas.
/// No guarda la IP: la usa para ubicar la zona y para una huella diaria del visitante. Los robots no se anotan.
/// Las visitas se guardan en segundo plano y por lotes, para no retrasar la respuesta.
/// </summary>
public sealed partial class RegistroVisitas(Geolocalizador geo, IConfiguration config, IServiceScopeFactory scopes, ILogger<RegistroVisitas> log)
    : BackgroundService
{
    private readonly Channel<Visita> cola = Channel.CreateBounded<Visita>(new BoundedChannelOptions(5000) { FullMode = BoundedChannelFullMode.DropWrite });

    /// <summary>Clave de la huella: secreta y estable (se deriva de la cadena de conexión, que solo conoce el servidor).</summary>
    private readonly byte[] clave = SHA256.HashData(Encoding.UTF8.GetBytes("visitas|" + (config.GetConnectionString("Taller") ?? "taller")));


    /// <summary>Rutas reales de la web (las de Angular). Lo demás (/.env, /wp-admin…) son escáneres buscando fallos.</summary>
    [GeneratedRegex(@"^/(servicios|contacto|acceso|cambiar-password|trabajos(/[a-z0-9-]+)?|(mi-area|gestion)(/[A-Za-z0-9/_-]*)?)?/?$", RegexOptions.IgnoreCase)]
    private static partial Regex RutasWeb();

    [GeneratedRegex(@"bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|monitor|headless|lighthouse|pingdom|uptime|curl|wget|python|go-http|java/|okhttp|httpclient|http-client|axios|node-fetch|libwww|scan|zgrab|masscan|nmap", RegexOptions.IgnoreCase)]
    private static partial Regex Robots();

    /// <summary>¿Es la carga de una página de la web (navegación del navegador)?</summary>
    public static bool EsPagina(HttpRequest r)
    {
        if (!HttpMethods.IsGet(r.Method)) return false;
        var ruta = r.Path.Value ?? "/";
        if (!RutasWeb().IsMatch(ruta)) return false;
        return r.Headers.Accept.ToString().Contains("text/html", StringComparison.OrdinalIgnoreCase);
    }

    public static bool EsRobot(string? agente) => string.IsNullOrWhiteSpace(agente) || Robots().IsMatch(agente);

    /// <summary>Huella diaria del visitante: HMAC de IP + navegador + día. Sirve para contar únicos, no para identificar.</summary>
    public static string Huella(byte[] clave, string ip, string agente, DateOnly dia) =>
        Convert.ToHexString(HMACSHA256.HashData(clave, Encoding.UTF8.GetBytes($"{ip}|{agente}|{dia:yyyy-MM-dd}")))[..16].ToLowerInvariant();

    public byte[] Clave => clave;

    /// <summary>IP del visitante: la primera de X-Forwarded-For (la que ve Google al recibir la petición).</summary>
    public static IPAddress? IpCliente(HttpContext ctx)
    {
        var reenviada = ctx.Request.Headers["X-Forwarded-For"].ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return reenviada is not null && IPAddress.TryParse(reenviada, out var ip) ? ip : ctx.Connection.RemoteIpAddress;
    }

    public void Anotar(HttpContext ctx, TipoVisitante tipo)
    {
        var agente = ctx.Request.Headers.UserAgent.ToString();
        if (EsRobot(agente)) return;

        var ip = IpCliente(ctx);
        var zona = geo.Localizar(ip);
        var ahora = DateTimeOffset.UtcNow;
        string? origen = null;
        if (Uri.TryCreate(ctx.Request.Headers.Referer.ToString(), UriKind.Absolute, out var referente) &&
            !referente.Host.Equals(ctx.Request.Host.Host, StringComparison.OrdinalIgnoreCase))
        {
            origen = referente.Host.Length > 100 ? referente.Host[..100] : referente.Host;
        }
        var ruta = ctx.Request.Path.Value ?? "/";

        cola.Writer.TryWrite(new Visita
        {
            Fecha = ahora,
            Ruta = ruta.Length > 200 ? ruta[..200] : ruta,
            Tipo = tipo,
            Visitante = Huella(clave, ip?.ToString() ?? "?", agente, HoraTaller.FechaDe(ahora)),
            Movil = agente.Contains("Mobi", StringComparison.OrdinalIgnoreCase) || agente.Contains("Android", StringComparison.OrdinalIgnoreCase),
            Pais = zona?.Pais,
            Region = zona?.Region,
            Ciudad = zona?.Ciudad is { Length: > 100 } c ? c[..100] : zona?.Ciudad,
            Latitud = zona?.Latitud,
            Longitud = zona?.Longitud,
            Origen = origen
        });
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        var lote = new List<Visita>(200);
        while (await cola.Reader.WaitToReadAsync(ct))
        {
            while (lote.Count < 200 && cola.Reader.TryRead(out var v))
            {
                lote.Add(v);
            }
            try
            {
                using var scope = scopes.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<TallerDbContext>();
                db.Visitas.AddRange(lote);
                await db.SaveChangesAsync(ct);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogWarning(e, "No se han podido guardar {N} visitas.", lote.Count);
            }
            lote.Clear();
            await Task.Delay(TimeSpan.FromSeconds(2), ct);
        }
    }
}
