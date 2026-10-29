using System.Net;
using MaxMind.Db;
using MaxMind.GeoIP2;

namespace Taller.Api.Infrastructure;

/// <summary>Zona aproximada de una IP: país, comunidad autónoma (código INE, solo España), ciudad y coordenadas.</summary>
public record Zona(string? Pais, string? Region, string? Ciudad, double? Latitud, double? Longitud);

/// <summary>
/// Ubica IPs con una base de datos local en formato MaxMind (DB-IP «IP to City Lite», gratuita, CC BY 4.0), sin enviar
/// las IPs a ningún servicio. Ruta en <c>GeoIp:Ruta</c> (por defecto geoip/dbip-city-lite.mmdb). Se carga en memoria en
/// segundo plano al arrancar; mientras tanto, o si no está el archivo, las visitas se guardan sin zona.
/// </summary>
public sealed class Geolocalizador : IDisposable
{
    /// <summary>Nombres (en inglés, como los da DB-IP) de las comunidades autónomas y su código INE.</summary>
    private static readonly Dictionary<string, string> Comunidades = new(StringComparer.OrdinalIgnoreCase)
    {
        ["Andalusia"] = "01", ["Aragon"] = "02", ["Asturias"] = "03", ["Balearic Islands"] = "04", ["Canary Islands"] = "05",
        ["Cantabria"] = "06", ["Castille and León"] = "07", ["Castile and León"] = "07", ["Castille-La Mancha"] = "08",
        ["Castile-La Mancha"] = "08", ["Catalonia"] = "09", ["Valencia"] = "10", ["Valencian Community"] = "10",
        ["Extremadura"] = "11", ["Galicia"] = "12", ["Madrid"] = "13", ["Murcia"] = "14", ["Navarre"] = "15",
        ["Basque Country"] = "16", ["La Rioja"] = "17", ["Ceuta"] = "18", ["Melilla"] = "19"
    };

    /// <summary>Nombres oficiales de las comunidades autónomas por código INE.</summary>
    public static readonly IReadOnlyDictionary<string, string> NombresComunidades = new Dictionary<string, string>
    {
        ["01"] = "Andalucía", ["02"] = "Aragón", ["03"] = "Asturias", ["04"] = "Illes Balears", ["05"] = "Canarias",
        ["06"] = "Cantabria", ["07"] = "Castilla y León", ["08"] = "Castilla-La Mancha", ["09"] = "Cataluña",
        ["10"] = "Comunitat Valenciana", ["11"] = "Extremadura", ["12"] = "Galicia", ["13"] = "Comunidad de Madrid",
        ["14"] = "Región de Murcia", ["15"] = "Navarra", ["16"] = "País Vasco", ["17"] = "La Rioja", ["18"] = "Ceuta",
        ["19"] = "Melilla"
    };

    private readonly ILogger<Geolocalizador> log;
    private volatile DatabaseReader? lector;

    public Geolocalizador(IConfiguration config, IWebHostEnvironment env, ILogger<Geolocalizador> log)
    {
        this.log = log;
        var ruta = config["GeoIp:Ruta"] ?? "geoip/dbip-city-lite.mmdb";
        var completa = Path.IsPathRooted(ruta) ? ruta : Path.Combine(env.ContentRootPath, ruta);
        _ = Task.Run(() => Cargar(completa));
    }

    public bool Disponible => lector is not null;

    private void Cargar(string ruta)
    {
        try
        {
            if (!File.Exists(ruta))
            {
                log.LogInformation("Sin base de datos de geolocalización en {Ruta}: las visitas se guardan sin zona.", ruta);
                return;
            }
            // En memoria: el archivo puede estar en un bucket montado, donde mapearlo no conviene.
            lector = new DatabaseReader(ruta, FileAccessMode.Memory);
            log.LogInformation("Base de datos de geolocalización cargada ({Tipo}).", lector.Metadata.DatabaseType);
        }
        catch (Exception e)
        {
            log.LogWarning(e, "No se ha podido cargar la base de datos de geolocalización {Ruta}.", ruta);
        }
    }

    public Zona? Localizar(IPAddress? ip)
    {
        var l = lector;
        if (l is null || ip is null || IPAddress.IsLoopback(ip))
        {
            return null;
        }
        try
        {
            if (!l.TryCity(ip, out var r) || r is null)
            {
                return null;
            }
            var pais = r.Country.IsoCode;
            string? region = null;
            if (pais == "ES")
            {
                foreach (var s in r.Subdivisions)
                {
                    if (s.Name is { } n && Comunidades.TryGetValue(n, out var codigo))
                    {
                        region = codigo;
                        break;
                    }
                }
            }
            double? Redondear(double? v) => v is null ? null : Math.Round(v.Value, 2);
            return new Zona(pais, region, r.City.Name, Redondear(r.Location.Latitude), Redondear(r.Location.Longitude));
        }
        catch (Exception e) when (e is MaxMind.GeoIP2.Exceptions.GeoIP2Exception or InvalidDatabaseException or ArgumentException)
        {
            return null;
        }
    }

    public void Dispose() => lector?.Dispose();
}
