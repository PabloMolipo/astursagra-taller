using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Integraciones;

/// <summary>
/// Árbol de carpetas de una biblioteca, guardado por id. Las consultas delta de Graph no traen la ruta de cada
/// elemento (y al renombrar una carpeta no devuelven su contenido), así que la ruta se reconstruye subiendo por los
/// padres. Si falta una carpeta, se pide a Graph.
/// </summary>
public class ArbolSharePoint(TallerDbContext db, ClienteGraph graph)
{
    private readonly Dictionary<string, CarpetaSharePoint> carpetas = [];
    private string? driveCargado;

    public async Task CargarAsync(string driveId, CancellationToken ct)
    {
        carpetas.Clear();
        foreach (var c in await db.CarpetasSharePoint.Where(c => c.DriveId == driveId).ToListAsync(ct))
        {
            carpetas[c.ItemId] = c;
        }
        driveCargado = driveId;
    }

    /// <summary>Registra la raíz o una carpeta que llega en la consulta delta (alta, cambio de nombre o movimiento).</summary>
    public void Registrar(string driveId, JsonElement item)
    {
        Comprobar(driveId);
        var id = item.GetProperty("id").GetString()!;
        var esRaiz = item.TryGetProperty("root", out _);
        if (!esRaiz && !item.TryGetProperty("folder", out _))
        {
            return;
        }
        var nombre = item.TryGetProperty("name", out var n) ? n.GetString() ?? "" : "";
        var padre = item.TryGetProperty("parentReference", out var p) && p.TryGetProperty("id", out var pid) ? pid.GetString() : null;
        if (!carpetas.TryGetValue(id, out var carpeta))
        {
            carpeta = new CarpetaSharePoint { DriveId = driveId, ItemId = id, Nombre = nombre };
            db.CarpetasSharePoint.Add(carpeta);
            carpetas[id] = carpeta;
        }
        carpeta.Nombre = nombre;
        carpeta.EsRaiz = esRaiz;
        carpeta.PadreId = esRaiz ? null : padre;
    }

    public void Eliminar(string driveId, string itemId)
    {
        Comprobar(driveId);
        if (carpetas.Remove(itemId, out var carpeta))
        {
            db.CarpetasSharePoint.Remove(carpeta);
        }
    }

    public bool EsCarpeta(string itemId) => carpetas.ContainsKey(itemId);

    /// <summary>
    /// Carpetas desde la raíz de la biblioteca (sin incluirla) hasta <paramref name="carpetaId"/>, incluida.
    /// Vacío si es la raíz; null si no se puede reconstruir.
    /// </summary>
    public async Task<List<CarpetaSharePoint>?> CadenaAsync(string driveId, string? carpetaId, CancellationToken ct)
    {
        Comprobar(driveId);
        var cadena = new List<CarpetaSharePoint>();
        var actual = carpetaId;
        for (var vuelta = 0; actual is not null; vuelta++)
        {
            if (vuelta > 64)
            {
                return null;
            }
            if (!carpetas.TryGetValue(actual, out var carpeta))
            {
                using var doc = await graph.GetAsync($"drives/{driveId}/items/{actual}?$select=id,name,parentReference,root,folder", ct);
                Registrar(driveId, doc.RootElement);
                if (!carpetas.TryGetValue(actual, out carpeta))
                {
                    return null;
                }
            }
            if (carpeta.EsRaiz)
            {
                break;
            }
            cadena.Add(carpeta);
            actual = carpeta.PadreId;
        }
        cadena.Reverse();
        return cadena;
    }

    /// <summary>Id de la carpeta padre de un elemento de la consulta delta.</summary>
    public static string? Padre(JsonElement item) =>
        item.TryGetProperty("parentReference", out var p) && p.TryGetProperty("id", out var id) ? id.GetString() : null;

    private void Comprobar(string driveId)
    {
        if (driveCargado != driveId)
        {
            throw new InvalidOperationException("El árbol de carpetas no está cargado para esta biblioteca.");
        }
    }
}
