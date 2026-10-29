using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Integraciones;

/// <summary>
/// Indexa la biblioteca REPRO: cada carpeta de primer nivel es una reprogramación y sus archivos (de cualquier tipo,
/// en cualquier subcarpeta) son los de esa reprogramación. No se copia nada: los archivos se leen de SharePoint al
/// verlos. Las reprogramaciones se vinculan solas con el vehículo si la matrícula o el bastidor aparecen en el nombre
/// de la carpeta (salvo que se hayan vinculado a mano).
/// </summary>
public partial class SincronizadorRepro(TallerDbContext db, ClienteGraph graph, ArbolSharePoint arbol, OpcionesSharePoint opciones, ILogger<SincronizadorRepro> log)
{
    public async Task<ResultadoSincronizacion> SincronizarAsync(Action<string> progreso, CancellationToken ct)
    {
        var estado = await db.EstadoSincronizacion.FindAsync([EstadoSincronizacion.IdRepro], ct)
                     ?? db.EstadoSincronizacion.Add(new EstadoSincronizacion { Id = EstadoSincronizacion.IdRepro }).Entity;
        var origen = $"{opciones.SiteUrl}|{opciones.BibliotecaRepro}".ToLowerInvariant();

        progreso("REPRO: conectando con SharePoint…");
        var sitio = new Uri(opciones.SiteUrl!);
        string siteId;
        using (var site = await graph.GetAsync($"sites/{sitio.Host}:{sitio.AbsolutePath.TrimEnd('/')}", ct))
        {
            siteId = site.RootElement.GetProperty("id").GetString()!;
        }
        var driveId = await SincronizadorSharePoint.BibliotecaAsync(siteId, opciones.BibliotecaRepro, graph, ct);
        estado.DriveId = driveId;

        var completa = estado.EnlaceDelta is null || estado.Origen != origen;
        if (completa)
        {
            await db.CarpetasSharePoint.Where(c => c.DriveId == driveId).ExecuteDeleteAsync(ct);
        }
        await arbol.CargarAsync(driveId, ct);

        var url = completa ? $"drives/{driveId}/root/delta" : estado.EnlaceDelta!;
        var vistas = new HashSet<string>();
        var vistos = new HashSet<string>();
        int nuevas = 0, actualizadas = 0, eliminadas = 0;
        string? enlaceDelta = null;

        while (url is not null)
        {
            JsonDocument pagina;
            try
            {
                pagina = await graph.GetAsync(url, ct);
            }
            catch (ErrorGraph) when (!completa)
            {
                log.LogWarning("El enlace delta de REPRO ha dejado de valer; se sincroniza todo de nuevo.");
                completa = true;
                await db.CarpetasSharePoint.Where(c => c.DriveId == driveId).ExecuteDeleteAsync(ct);
                await arbol.CargarAsync(driveId, ct);
                url = $"drives/{driveId}/root/delta";
                continue;
            }

            using (pagina)
            {
                var elementos = pagina.RootElement.GetProperty("value").EnumerateArray().ToList();
                foreach (var item in elementos.Where(i => !i.TryGetProperty("deleted", out _)))
                {
                    arbol.Registrar(driveId, item);
                }
                foreach (var item in elementos)
                {
                    var id = item.GetProperty("id").GetString()!;
                    if (item.TryGetProperty("deleted", out _))
                    {
                        if (arbol.EsCarpeta(id)) arbol.Eliminar(driveId, id);
                        eliminadas += await EliminarAsync(id, ct);
                        continue;
                    }
                    if (item.TryGetProperty("root", out _))
                    {
                        continue;
                    }

                    var cadena = await arbol.CadenaAsync(driveId, item.TryGetProperty("folder", out _) ? id : ArbolSharePoint.Padre(item), ct);
                    if (cadena is null || cadena.Count == 0)
                    {
                        continue; // Archivos sueltos en la raíz de REPRO: no son de ninguna reprogramación.
                    }

                    var carpetaRepro = cadena[0];
                    var repro = await ReprogramacionAsync(carpetaRepro, ct);
                    vistas.Add(carpetaRepro.ItemId);

                    if (item.TryGetProperty("folder", out _))
                    {
                        if (cadena.Count == 1)
                        {
                            // La propia carpeta de la reprogramación: nombre, fechas y enlace.
                            var nueva = repro.Id == 0;
                            repro.Nombre = Corto(item.GetProperty("name").GetString() ?? repro.Nombre, 400);
                            repro.WebUrl = Texto(item, "webUrl") ?? repro.WebUrl;
                            repro.Fecha = Fecha(item, "createdDateTime") ?? repro.Fecha;
                            repro.Modificada = Fecha(item, "lastModifiedDateTime") ?? repro.Modificada;
                            if (nueva) nuevas++; else actualizadas++;
                        }
                        continue;
                    }

                    progreso($"REPRO: {carpetaRepro.Nombre}/{item.GetProperty("name").GetString()}");
                    vistos.Add(id);
                    var archivo = await db.ArchivosReprogramacion.FirstOrDefaultAsync(a => a.SharePointId == id, ct);
                    if (archivo is null)
                    {
                        archivo = new ArchivoReprogramacion { SharePointId = id, Nombre = "" };
                        repro.Archivos.Add(archivo);
                    }
                    else if (archivo.ReprogramacionId != repro.Id && repro.Id != 0)
                    {
                        archivo.ReprogramacionId = repro.Id; // Movido a otra reprogramación.
                    }
                    else if (repro.Id == 0)
                    {
                        repro.Archivos.Add(archivo);
                    }
                    archivo.Nombre = Corto(item.GetProperty("name").GetString() ?? "archivo", 400);
                    archivo.Ruta = Corto(string.Join('/', cadena.Skip(1).Select(c => c.Nombre)), 1000);
                    archivo.Tamano = item.TryGetProperty("size", out var t) ? t.GetInt64() : 0;
                    archivo.Modificado = Fecha(item, "lastModifiedDateTime") ?? DateTimeOffset.UtcNow;
                    archivo.WebUrl = Texto(item, "webUrl");
                    if (archivo.Modificado > repro.Modificada) repro.Modificada = archivo.Modificado;
                }
                await db.SaveChangesAsync(ct);

                url = pagina.RootElement.TryGetProperty("@odata.nextLink", out var siguiente) ? siguiente.GetString() : null;
                if (pagina.RootElement.TryGetProperty("@odata.deltaLink", out var delta))
                {
                    enlaceDelta = delta.GetString();
                }
            }
        }

        // En una sincronización completa, lo que ya no está en SharePoint se quita.
        if (completa)
        {
            eliminadas += await db.Reprogramaciones.Where(r => !vistas.Contains(r.SharePointId)).ExecuteDeleteAsync(ct);
            await db.ArchivosReprogramacion.Where(a => !vistos.Contains(a.SharePointId)).ExecuteDeleteAsync(ct);
        }

        progreso("REPRO: vinculando con los vehículos…");
        var vinculadas = await VincularAsync(ct);

        var resultado = new ResultadoSincronizacion(nuevas, actualizadas, eliminadas, 0);
        estado.EnlaceDelta = enlaceDelta;
        estado.Origen = origen;
        estado.UltimaSincronizacion = DateTimeOffset.UtcNow;
        estado.UltimoResultado = $"{resultado.Nuevos} reprogramaciones nuevas, {resultado.Actualizados} actualizadas, {resultado.Eliminados} eliminadas" +
                                 (vinculadas > 0 ? $"; {vinculadas} vinculadas con su vehículo" : "");
        estado.UltimaConError = false;
        await db.SaveChangesAsync(ct);
        return resultado;
    }

    /// <summary>Reprogramación de una carpeta de primer nivel (la crea si no existe).</summary>
    private async Task<Reprogramacion> ReprogramacionAsync(CarpetaSharePoint carpeta, CancellationToken ct)
    {
        var repro = db.Reprogramaciones.Local.FirstOrDefault(r => r.SharePointId == carpeta.ItemId)
                    ?? await db.Reprogramaciones.Include(r => r.Archivos).FirstOrDefaultAsync(r => r.SharePointId == carpeta.ItemId, ct);
        if (repro is null)
        {
            var ahora = DateTimeOffset.UtcNow;
            repro = new Reprogramacion { SharePointId = carpeta.ItemId, Nombre = Corto(carpeta.Nombre, 400), Fecha = ahora, Modificada = ahora };
            db.Reprogramaciones.Add(repro);
        }
        return repro;
    }

    /// <summary>Borrado en SharePoint de una carpeta de reprogramación o de un archivo.</summary>
    private async Task<int> EliminarAsync(string id, CancellationToken ct)
    {
        var repro = await db.Reprogramaciones.FirstOrDefaultAsync(r => r.SharePointId == id, ct);
        if (repro is not null)
        {
            db.Reprogramaciones.Remove(repro);
            await db.SaveChangesAsync(ct);
            return 1;
        }
        await db.ArchivosReprogramacion.Where(a => a.SharePointId == id).ExecuteDeleteAsync(ct);
        return 0;
    }

    [GeneratedRegex(@"\b(\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3}|[A-Z]{1,2}[ -]?\d{4}[ -]?[A-Z]{1,2}|E[ -]?\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3}|R[ -]?\d{4}[ -]?[BCDFGHJKLMNPRSTVWXYZ]{3})\b")]
    private static partial Regex Matricula();

    [GeneratedRegex(@"\b[A-HJ-NPR-Z0-9]{17}\b")]
    private static partial Regex Bastidor();

    /// <summary>
    /// Vincula las reprogramaciones sin vehículo (y no fijadas a mano) buscando en el nombre de la carpeta una matrícula
    /// española o un bastidor de 17 caracteres que coincida con un vehículo del taller.
    /// </summary>
    public async Task<int> VincularAsync(CancellationToken ct)
    {
        var pendientes = await db.Reprogramaciones.Where(r => r.VehiculoId == null && !r.VinculoManual).ToListAsync(ct);
        if (pendientes.Count == 0)
        {
            return 0;
        }
        static string Limpiar(string? s) => new((s ?? "").ToUpperInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());
        var vehiculos = await db.Vehiculos.AsNoTracking().Select(v => new { v.Id, v.Matricula, v.Bastidor }).ToListAsync(ct);
        var porMatricula = vehiculos.Where(v => Limpiar(v.Matricula).Length >= 5).GroupBy(v => Limpiar(v.Matricula)).ToDictionary(g => g.Key, g => g.First().Id);
        var porBastidor = vehiculos.Where(v => Limpiar(v.Bastidor).Length == 17).GroupBy(v => Limpiar(v.Bastidor)).ToDictionary(g => g.Key, g => g.First().Id);

        var vinculadas = 0;
        foreach (var r in pendientes)
        {
            var nombre = r.Nombre.ToUpperInvariant();
            int? vehiculo = null;
            foreach (Match m in Bastidor().Matches(nombre))
            {
                if (porBastidor.TryGetValue(m.Value, out var id)) { vehiculo = id; break; }
            }
            if (vehiculo is null)
            {
                foreach (Match m in Matricula().Matches(nombre))
                {
                    if (porMatricula.TryGetValue(Limpiar(m.Value), out var id)) { vehiculo = id; break; }
                }
            }
            if (vehiculo is not null)
            {
                r.VehiculoId = vehiculo;
                vinculadas++;
            }
        }
        await db.SaveChangesAsync(ct);
        return vinculadas;
    }

    private static string Corto(string s, int max) => s.Length > max ? s[..max] : s;

    private static string? Texto(JsonElement item, string propiedad) =>
        item.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static DateTimeOffset? Fecha(JsonElement item, string propiedad) =>
        Texto(item, propiedad) is { } s && DateTimeOffset.TryParse(s, System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.AssumeUniversal, out var f) ? f : null;
}
