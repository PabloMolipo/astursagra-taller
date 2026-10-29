using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Integraciones;

public record ResultadoSincronizacion(int Nuevos, int Actualizados, int Eliminados, int Omitidos)
{
    public override string ToString() =>
        $"{Nuevos} nuevos, {Actualizados} actualizados, {Eliminados} eliminados" +
        (Omitidos > 0 ? $", {Omitidos} omitidos (no son PDF ni imagen, o pesan más de 25 MB)" : "");
}

/// <summary>
/// Copia los PDF e imágenes de la biblioteca de documentación de SharePoint a la biblioteca técnica del taller.
/// Si la primera carpeta empieza por una marca ("Seat Ibiza 6J", "VW Golf V"), los documentos son de esa marca y
/// modelo; si no ("Common Rail"), son genéricos de esa temática. Usa la consulta delta de Graph para traer solo los
/// cambios desde la vez anterior. Los datos editados a mano en la aplicación no se sobrescriben.
/// </summary>
public class SincronizadorSharePoint(
    TallerDbContext db, ClienteGraph graph, ArbolSharePoint arbol, AlmacenPrivado almacen, OpcionesSharePoint opciones, ILogger<SincronizadorSharePoint> log)
{
    private List<string> marcasTaller = [];

    private static readonly HashSet<string> Extensiones = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

    public async Task<ResultadoSincronizacion> SincronizarAsync(Action<string> progreso, CancellationToken ct)
    {
        var estado = await db.EstadoSincronizacion.FindAsync([EstadoSincronizacion.IdDocumentacion], ct)
                     ?? db.EstadoSincronizacion.Add(new EstadoSincronizacion { Id = EstadoSincronizacion.IdDocumentacion }).Entity;
        marcasTaller = await db.Vehiculos.Select(v => v.Marca).Distinct().ToListAsync(ct);
        var origen = $"{opciones.SiteUrl}|{opciones.Biblioteca}|{opciones.Carpeta}".ToLowerInvariant();

        // 1. Site y biblioteca.
        progreso("Conectando con SharePoint…");
        var sitio = new Uri(opciones.SiteUrl!);
        string siteId, driveId;
        using (var site = await graph.GetAsync($"sites/{sitio.Host}:{sitio.AbsolutePath.TrimEnd('/')}", ct))
        {
            siteId = site.RootElement.GetProperty("id").GetString()!;
        }
        driveId = await BibliotecaAsync(siteId, opciones.Biblioteca, graph, ct);
        estado.DriveId = driveId;

        // 2. Cambios: desde el último enlace delta, o todo si es la primera vez (o ha cambiado la configuración).
        var completa = estado.EnlaceDelta is null || estado.Origen != origen;
        if (completa)
        {
            await db.CarpetasSharePoint.Where(c => c.DriveId == driveId).ExecuteDeleteAsync(ct);
        }
        await arbol.CargarAsync(driveId, ct);
        var url = completa ? $"drives/{driveId}/root/delta" : estado.EnlaceDelta!;
        var vistos = new HashSet<string>();
        int nuevos = 0, actualizados = 0, eliminados = 0, omitidos = 0;
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
                // El enlace delta puede caducar: se repite desde cero.
                log.LogWarning("El enlace delta de SharePoint ha dejado de valer; se sincroniza todo de nuevo.");
                completa = true;
                url = $"drives/{driveId}/root/delta";
                continue;
            }

            using (pagina)
            {
                var elementos = pagina.RootElement.GetProperty("value").EnumerateArray().ToList();
                // Primero las carpetas de la página, para poder reconstruir la ruta de los archivos.
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
                        else eliminados += await EliminarAsync(id, ct) ? 1 : 0;
                        continue;
                    }
                    if (!item.TryGetProperty("file", out _))
                    {
                        continue; // Carpetas y la propia raíz.
                    }

                    var cadena = await arbol.CadenaAsync(driveId, ArbolSharePoint.Padre(item), ct);
                    var carpeta = cadena is null ? null : CarpetaRelativa(string.Join('/', cadena.Select(c => c.Nombre)));
                    if (carpeta is null)
                    {
                        // Fuera de la carpeta configurada: si estaba sincronizado (se ha movido), se quita.
                        eliminados += await EliminarAsync(id, ct) ? 1 : 0;
                        continue;
                    }

                    var nombre = item.GetProperty("name").GetString()!;
                    var tamano = item.TryGetProperty("size", out var t) ? t.GetInt64() : 0;
                    if (!Extensiones.Contains(Path.GetExtension(nombre).ToLowerInvariant()) || tamano > AlmacenPrivado.Maximo)
                    {
                        omitidos++;
                        continue;
                    }

                    vistos.Add(id);
                    var version = item.TryGetProperty("cTag", out var ctag) ? ctag.GetString() : item.TryGetProperty("eTag", out var etag) ? etag.GetString() : null;
                    progreso($"Revisando {carpeta}/{nombre}…");
                    switch (await GuardarAsync(driveId, id, nombre, carpeta, tamano, version, ct))
                    {
                        case Cambio.Nuevo: nuevos++; break;
                        case Cambio.Actualizado: actualizados++; break;
                        case Cambio.Omitido: omitidos++; break;
                    }
                }
                await db.SaveChangesAsync(ct);

                url = pagina.RootElement.TryGetProperty("@odata.nextLink", out var siguiente) ? siguiente.GetString() : null;
                if (pagina.RootElement.TryGetProperty("@odata.deltaLink", out var delta))
                {
                    enlaceDelta = delta.GetString();
                }
            }
        }

        // 3. En una sincronización completa, lo que ya no está en SharePoint se quita.
        if (completa)
        {
            var huerfanos = await db.DocumentosTecnicos
                .Where(d => d.SharePointId != null && !d.EliminadoEnSharePoint)
                .Select(d => d.SharePointId!)
                .ToListAsync(ct);
            foreach (var id in huerfanos.Where(h => !vistos.Contains(h)))
            {
                eliminados += await EliminarAsync(id, ct) ? 1 : 0;
            }
        }

        var resultado = new ResultadoSincronizacion(nuevos, actualizados, eliminados, omitidos);
        estado.EnlaceDelta = enlaceDelta;
        estado.Origen = origen;
        estado.UltimaSincronizacion = DateTimeOffset.UtcNow;
        estado.UltimoResultado = resultado.ToString();
        estado.UltimaConError = false;
        await db.SaveChangesAsync(ct);
        return resultado;
    }

    /// <summary>Id de una biblioteca del site por su nombre (sin nombre: la biblioteca principal).</summary>
    public static async Task<string> BibliotecaAsync(string siteId, string? nombre, ClienteGraph graph, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(nombre))
        {
            using var principal = await graph.GetAsync($"sites/{siteId}/drive", ct);
            return principal.RootElement.GetProperty("id").GetString()!;
        }

        using var bibliotecas = await graph.GetAsync($"sites/{siteId}/drives", ct);
        foreach (var d in bibliotecas.RootElement.GetProperty("value").EnumerateArray())
        {
            if (string.Equals(d.GetProperty("name").GetString(), nombre, StringComparison.OrdinalIgnoreCase))
            {
                return d.GetProperty("id").GetString()!;
            }
        }
        throw new ErrorGraph($"No existe la biblioteca «{nombre}» en el site.");
    }

    /// <summary>
    /// Carpeta del archivo relativa a la configurada ("Seat Ibiza 6J/Inyección"), "" si está en la raíz,
    /// o null si queda fuera de la carpeta configurada.
    /// </summary>
    private string? CarpetaRelativa(string carpeta)
    {

        var base_ = (opciones.Carpeta ?? "").Trim('/');
        if (base_.Length == 0)
        {
            return carpeta;
        }
        if (carpeta.Equals(base_, StringComparison.OrdinalIgnoreCase))
        {
            return "";
        }
        return carpeta.StartsWith(base_ + "/", StringComparison.OrdinalIgnoreCase) ? carpeta[(base_.Length + 1)..] : null;
    }

    private enum Cambio { Ninguno, Nuevo, Actualizado, Omitido }

    private async Task<Cambio> GuardarAsync(string driveId, string id, string nombre, string carpeta, long tamano, string? version, CancellationToken ct)
    {
        var documento = await db.DocumentosTecnicos.FirstOrDefaultAsync(d => d.SharePointId == id, ct);
        if (documento is not null && documento.SharePointVersion == version && !documento.EliminadoEnSharePoint)
        {
            documento.SharePointRuta = carpeta;
            documento.NombreOriginal = nombre;
            return Cambio.Ninguno;
        }

        using var descarga = await graph.DescargarAsync(driveId, id, ct);
        await using var contenido = await descarga.Content.ReadAsStreamAsync(ct);
        var guardado = await almacen.GuardarAsync(contenido, tamano > 0 ? tamano : descarga.Content.Headers.ContentLength ?? 1, ct);
        if (guardado is null)
        {
            return Cambio.Omitido; // La extensión engañaba: no es un PDF ni una imagen de verdad.
        }

        if (documento is null)
        {
            var (marca, modelo, sistema) = InterpretarCarpeta(carpeta, marcasTaller);
            db.DocumentosTecnicos.Add(new DocumentoTecnico
            {
                Titulo = Path.GetFileNameWithoutExtension(nombre),
                Tipo = TipoPorNombre(nombre),
                Marca = marca,
                Modelo = modelo,
                Sistema = sistema,
                Archivo = guardado.Value.Nombre,
                NombreOriginal = nombre,
                TipoContenido = guardado.Value.Tipo.TipoContenido,
                Tamano = tamano,
                FechaAlta = DateTimeOffset.UtcNow,
                SharePointId = id,
                SharePointVersion = version,
                SharePointRuta = carpeta
            });
            return Cambio.Nuevo;
        }

        // Contenido nuevo en SharePoint: se cambia el archivo, se respetan los datos editados en la aplicación.
        var anterior = documento.Archivo;
        documento.Archivo = guardado.Value.Nombre;
        documento.TipoContenido = guardado.Value.Tipo.TipoContenido;
        documento.Tamano = tamano;
        documento.NombreOriginal = nombre;
        documento.SharePointVersion = version;
        documento.SharePointRuta = carpeta;
        documento.EliminadoEnSharePoint = false;
        await db.SaveChangesAsync(ct);
        almacen.Borrar(anterior);
        return Cambio.Actualizado;
    }

    /// <summary>Borrado en SharePoint: se elimina aquí, salvo que lo use alguna consulta del asistente (entonces se marca).</summary>
    private async Task<bool> EliminarAsync(string sharePointId, CancellationToken ct)
    {
        var documento = await db.DocumentosTecnicos.FirstOrDefaultAsync(d => d.SharePointId == sharePointId && !d.EliminadoEnSharePoint, ct);
        if (documento is null)
        {
            return false;
        }
        if (await db.UsosDocumentoAsistente.AnyAsync(u => u.DocumentoTecnicoId == documento.Id, ct))
        {
            documento.EliminadoEnSharePoint = true;
        }
        else
        {
            db.DocumentosTecnicos.Remove(documento);
            await db.SaveChangesAsync(ct);
            almacen.Borrar(documento.Archivo);
        }
        return true;
    }

    private static readonly string[] CarpetasGenericas = ["genericos", "generico", "general", "generales", "comun", "comunes", "varios"];

    /// <summary>
    /// Marca, modelo y sistema según la carpeta: "Seat Ibiza 6J/Inyección" → Seat, Ibiza 6J, Inyección;
    /// "Volkswagen/Golf V" → Volkswagen, Golf V; "Common Rail/Bosch" → genérico de sistema Common Rail;
    /// "Genéricos/Climatización" → genérico de sistema Climatización.
    /// </summary>
    public static (string? Marca, string? Modelo, string? Sistema) InterpretarCarpeta(string carpeta, IEnumerable<string>? marcasTaller = null)
    {
        var partes = carpeta.Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (partes.Length == 0)
        {
            return (null, null, null);
        }
        static string? Corto(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : s.Length > max ? s[..max] : s;

        if (Marcas.Separar(partes[0], marcasTaller) is { } m)
        {
            if (m.Resto.Length > 0 && Marcas.EsTematica(m.Resto))
            {
                return (m.Marca, null, Corto(m.Resto, 100)); // «BMW Coding»: temática de la marca, sin modelo.
            }
            var modelo = m.Resto.Length > 0 ? m.Resto : partes.ElementAtOrDefault(1);
            var sistema = m.Resto.Length > 0 ? partes.ElementAtOrDefault(1) : partes.ElementAtOrDefault(2);
            return (m.Marca, Corto(modelo, 100), Corto(sistema, 100));
        }
        var generica = CarpetasGenericas.Contains(Importacion.TextoImportado.Clave(partes[0]));
        return (null, null, Corto(generica ? partes.ElementAtOrDefault(1) : partes[0], 100));
    }

    private static TipoDocumento TipoPorNombre(string nombre)
    {
        var n = nombre.ToLowerInvariant();
        if (n.Contains("esquema") || n.Contains("electric") || n.Contains("eléctric") || n.Contains("wiring") || n.Contains("cableado"))
        {
            return TipoDocumento.EsquemaElectrico;
        }
        if (n.Contains("manual"))
        {
            return TipoDocumento.Manual;
        }
        if (n.Contains("boletin") || n.Contains("boletín"))
        {
            return TipoDocumento.Boletin;
        }
        if (n.Contains("procedimiento") || n.Contains("despiece") || n.Contains("montaje"))
        {
            return TipoDocumento.Procedimiento;
        }
        return TipoDocumento.Otro;
    }
}
