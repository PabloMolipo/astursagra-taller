using Microsoft.EntityFrameworkCore;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Importacion;
using Taller.Api.Infrastructure;

namespace Taller.Api.Diagnostico;

/// <summary>Qué documentación, qué portales y qué catálogos de despieces corresponden a un vehículo.</summary>
public class DocumentacionTecnica(TallerDbContext db)
{
    /// <summary>
    /// Documentos de la misma marca cuyo modelo, código de motor y años (si los tienen) encajan con el vehículo.
    /// Comparación sin tildes ni mayúsculas; los documentos sin marca no se asocian a vehículos.
    /// </summary>
    public async Task<List<DocumentoTecnico>> CompatiblesAsync(Vehiculo v, CancellationToken ct)
    {
        var modelo = TextoImportado.Clave(v.Modelo ?? "");
        var motor = TextoImportado.Clave(v.Motor ?? "");

        var candidatos = await db.DocumentosTecnicos.AsNoTracking().Where(d => d.Marca != null).ToListAsync(ct);
        return candidatos
            .Where(d => Marcas.Iguales(d.Marca, v.Marca))
            .Where(d => d.Modelo is null || modelo.Contains(TextoImportado.Clave(d.Modelo)))
            .Where(d => d.Motor is null || (motor.Length > 0 && motor == TextoImportado.Clave(d.Motor)))
            .Where(d => v.Anio is null || ((d.AnioDesde ?? 0) <= v.Anio && v.Anio <= (d.AnioHasta ?? 9999)))
            // Primero lo más específico (con motor y modelo), luego por tipo y título.
            .OrderByDescending(d => (d.Motor is null ? 0 : 2) + (d.Modelo is null ? 0 : 1))
            .ThenBy(d => d.Tipo)
            .ThenBy(d => d.Titulo)
            .ToList();
    }

    /// <summary>
    /// Documentación genérica (sin marca): temáticas como "Common Rail" o "Climatización", útil para cualquier vehículo.
    /// </summary>
    public Task<List<DocumentoTecnico>> GenericosAsync(CancellationToken ct) =>
        db.DocumentosTecnicos.AsNoTracking().Where(d => d.Marca == null && !d.EliminadoEnSharePoint)
            .OrderBy(d => d.Sistema).ThenBy(d => d.Titulo).Take(80).ToListAsync(ct);

    /// <summary>Portales para el vehículo, con {vin}, {matricula}, {marca} y {modelo} sustituidos y codificados.</summary>
    public async Task<List<(string Nombre, string Url)>> PortalesAsync(Vehiculo v, CancellationToken ct)
    {
        var enlaces = await db.EnlacesPortal.AsNoTracking().OrderBy(e => e.Orden).ThenBy(e => e.Nombre).ToListAsync(ct);
        return enlaces
            .Where(e => e.Marca is null || Marcas.Iguales(e.Marca, v.Marca))
            .Select(e => (e.Nombre, Resolver(e.Url, v)))
            .ToList();
    }

    public static string Resolver(string plantilla, Vehiculo v) => plantilla
        .Replace("{vin}", Uri.EscapeDataString(v.Bastidor ?? ""), StringComparison.OrdinalIgnoreCase)
        .Replace("{matricula}", Uri.EscapeDataString(v.Matricula ?? ""), StringComparison.OrdinalIgnoreCase)
        .Replace("{marca}", Uri.EscapeDataString(v.Marca), StringComparison.OrdinalIgnoreCase)
        .Replace("{modelo}", Uri.EscapeDataString(v.Modelo ?? ""), StringComparison.OrdinalIgnoreCase);

    /// <summary>Catálogos de despieces activos que cubren la marca del vehículo, con su dirección ya resuelta.</summary>
    public async Task<List<CatalogoVehiculoDto>> CatalogosAsync(Vehiculo v, CancellationToken ct)
    {
        var catalogos = await CatalogosActivosAsync(ct);
        var vin = Vin(v.Bastidor);
        return catalogos
            .Where(c => CubreMarca(c, v.Marca))
            .Select(c =>
            {
                var falta = UsaBastidor(c.UrlVehiculo) && vin.Length < 7 ? "Falta el bastidor del vehículo" : null;
                return new CatalogoVehiculoDto(c.Id, c.Nombre, c.Descripcion, falta is null ? ResolverCatalogo(c.UrlVehiculo, c, v, null) : null, falta, c.UrlReferencia is not null);
            })
            .ToList();
    }

    /// <summary>
    /// Búsqueda de una referencia de pieza en los catálogos que lo admiten. Con vehículo, solo los que cubren su marca
    /// (y no necesitan un bastidor que falte); sin vehículo, todos.
    /// </summary>
    public async Task<List<EnlaceReferenciaDto>> BuscarReferenciaAsync(string referencia, Vehiculo? v, CancellationToken ct)
    {
        var limpia = Referencia(referencia);
        if (limpia.Length == 0)
        {
            return [];
        }
        var vin = Vin(v?.Bastidor);
        return (await CatalogosActivosAsync(ct))
            .Where(c => c.UrlReferencia is not null && (v is null || CubreMarca(c, v.Marca)))
            .Where(c => !UsaBastidor(c.UrlReferencia!) || vin.Length >= 7)
            .Select(c => new EnlaceReferenciaDto(c.Nombre, ResolverCatalogo(c.UrlReferencia!, c, v, limpia)))
            .ToList();
    }

    private Task<List<CatalogoDespiece>> CatalogosActivosAsync(CancellationToken ct) =>
        db.CatalogosDespiece.AsNoTracking().Where(c => c.Activo).OrderBy(c => c.Orden).ThenBy(c => c.Nombre).ToListAsync(ct);

    public static bool CubreMarca(CatalogoDespiece c, string marca) =>
        string.IsNullOrWhiteSpace(c.Marcas) ||
        c.Marcas.Split([',', ';'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(m => Marcas.Iguales(m, marca));

    private static bool UsaBastidor(string plantilla) =>
        plantilla.Contains("{vin}", StringComparison.OrdinalIgnoreCase) || plantilla.Contains("{vin7}", StringComparison.OrdinalIgnoreCase);

    /// <summary>Bastidor en mayúsculas y sin espacios ni guiones.</summary>
    public static string Vin(string? bastidor) => new((bastidor ?? "").ToUpperInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());

    /// <summary>Referencia sin espacios ni puntos ("11 42 7 953 129" → "11427953129"); los guiones se respetan.</summary>
    public static string Referencia(string referencia) =>
        new(referencia.Trim().Where(ch => !char.IsWhiteSpace(ch) && ch != '.').Take(40).ToArray());

    /// <summary>Nombre de la marca en la dirección de la web: alias del catálogo o, si no hay, en minúsculas con guiones.</summary>
    public static string MarcaSlug(CatalogoDespiece c, string marca)
    {
        foreach (var par in (c.AliasMarcas ?? "").Split([',', ';'], StringSplitOptions.RemoveEmptyEntries))
        {
            var partes = par.Split('=', 2, StringSplitOptions.TrimEntries);
            if (partes.Length == 2 && partes[1].Length > 0 && TextoImportado.Clave(partes[0]) == TextoImportado.Clave(marca))
            {
                return partes[1];
            }
        }
        return Slug.De(marca);
    }

    public static string ResolverCatalogo(string plantilla, CatalogoDespiece c, Vehiculo? v, string? referencia)
    {
        var vin = Vin(v?.Bastidor);
        static string E(string? s) => Uri.EscapeDataString(s ?? "");
        return plantilla
            .Replace("{vin7}", E(vin.Length >= 7 ? vin[^7..] : vin), StringComparison.OrdinalIgnoreCase)
            .Replace("{vin}", E(vin), StringComparison.OrdinalIgnoreCase)
            .Replace("{marca-slug}", E(v is null ? "" : MarcaSlug(c, v.Marca)), StringComparison.OrdinalIgnoreCase)
            .Replace("{marca}", E(v?.Marca), StringComparison.OrdinalIgnoreCase)
            .Replace("{modelo}", E(v?.Modelo), StringComparison.OrdinalIgnoreCase)
            .Replace("{matricula}", E(v?.Matricula), StringComparison.OrdinalIgnoreCase)
            .Replace("{referencia}", E(referencia), StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>Solo direcciones web normales (nada de javascript: ni similares).</summary>
    public static bool UrlValida(string url) =>
        Uri.TryCreate(url.Replace("{", "").Replace("}", ""), UriKind.Absolute, out var u) && (u.Scheme == Uri.UriSchemeHttps || u.Scheme == Uri.UriSchemeHttp);
}
