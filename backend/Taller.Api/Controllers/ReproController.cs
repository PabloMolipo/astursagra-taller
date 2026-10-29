using System.ComponentModel.DataAnnotations;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

public record ReproVehiculoDto(int Id, string Marca, string? Modelo, string? Matricula, string? Bastidor, int ClienteId, string ClienteNombre);
public record ReproListItem(int Id, string Nombre, DateTimeOffset Fecha, DateTimeOffset Modificada, int Archivos, ReproVehiculoDto? Vehiculo, bool VinculoManual);
public record ArchivoReproDto(int Id, string Nombre, string Ruta, long Tamano, DateTimeOffset Modificado, string Visor, string? WebUrl);
public record ReproDetalle(
    int Id, string Nombre, DateTimeOffset Fecha, DateTimeOffset Modificada, string? WebUrl, string? Notas,
    ReproVehiculoDto? Vehiculo, bool VinculoManual, IReadOnlyList<ArchivoReproDto> Archivos);
public record VincularReproRequest(int? VehiculoId);
public record NotasReproRequest([MaxLength(2000)] string? Notas);

/// <summary>
/// Reprogramaciones (biblioteca REPRO de SharePoint): listado, detalle, vinculación con el vehículo y lectura de los
/// archivos, que se sirven desde SharePoint en el momento (enteros o por tramos), sin copias.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
public class ReproController(TallerDbContext db, ClienteGraph graph, OpcionesSharePoint opciones, ILogger<ReproController> log) : ControllerBase
{
    private static readonly HashSet<string> Imagenes = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"];
    private static readonly HashSet<string> Textos = [".txt", ".log", ".csv", ".xml", ".ini", ".json", ".md", ".hex", ".s19", ".mot", ".a2l", ".cfg", ".nfo"];
    private static readonly HashSet<string> Office = [".doc", ".docx", ".xls", ".xlsx", ".xlsm", ".ppt", ".pptx", ".one", ".onetoc2"];
    private static readonly HashSet<string> Videos = [".mp4", ".mov", ".webm"];

    /// <summary>Cómo se ve cada archivo: pdf, imagen, video, texto, office o binario (visor hexadecimal, para el resto).</summary>
    public static string Visor(string nombre)
    {
        var e = Path.GetExtension(nombre).ToLowerInvariant();
        return e == ".pdf" ? "pdf" : Imagenes.Contains(e) ? "imagen" : Videos.Contains(e) ? "video" : Textos.Contains(e) ? "texto" : Office.Contains(e) ? "office" : "binario";
    }

    private static string TipoContenido(string nombre) => Path.GetExtension(nombre).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".png" => "image/png",
        ".webp" => "image/webp",
        ".gif" => "image/gif",
        ".bmp" => "image/bmp",
        ".mp4" => "video/mp4",
        ".mov" => "video/quicktime",
        ".webm" => "video/webm",
        var e when Textos.Contains(e) => "text/plain; charset=utf-8",
        _ => "application/octet-stream"
    };

    [HttpGet("api/repro")]
    public async Task<IReadOnlyList<ReproListItem>> Listar([FromQuery] string? q, [FromQuery] bool sinVincular, CancellationToken ct)
    {
        var query = db.Reprogramaciones.AsNoTracking();
        if (sinVincular)
        {
            query = query.Where(r => r.VehiculoId == null);
        }
        if (!string.IsNullOrWhiteSpace(q))
        {
            foreach (var palabra in q.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5))
            {
                var p = $"%{palabra}%";
                query = query.Where(r => EF.Functions.ILike(r.Nombre, p) || EF.Functions.ILike(r.Notas!, p) ||
                                         (r.Vehiculo != null && (EF.Functions.ILike(r.Vehiculo.Matricula!, p) || EF.Functions.ILike(r.Vehiculo.Bastidor!, p) ||
                                                                 EF.Functions.ILike(r.Vehiculo.Marca, p) || EF.Functions.ILike(r.Vehiculo.Modelo!, p) ||
                                                                 EF.Functions.ILike(r.Vehiculo.Cliente.Nombre, p))));
            }
        }
        return await query.OrderByDescending(r => r.Fecha).Take(500).Select(r => new ReproListItem(
            r.Id, r.Nombre, r.Fecha, r.Modificada, r.Archivos.Count,
            r.Vehiculo == null ? null : new ReproVehiculoDto(r.Vehiculo.Id, r.Vehiculo.Marca, r.Vehiculo.Modelo, r.Vehiculo.Matricula, r.Vehiculo.Bastidor, r.Vehiculo.ClienteId, r.Vehiculo.Cliente.Nombre),
            r.VinculoManual)).ToListAsync(ct);
    }

    [HttpGet("api/vehiculos/{vehiculoId:int}/repro")]
    public async Task<IReadOnlyList<ReproListItem>> DeVehiculo(int vehiculoId, CancellationToken ct) =>
        await db.Reprogramaciones.AsNoTracking().Where(r => r.VehiculoId == vehiculoId).OrderByDescending(r => r.Fecha)
            .Select(r => new ReproListItem(r.Id, r.Nombre, r.Fecha, r.Modificada, r.Archivos.Count, null, r.VinculoManual)).ToListAsync(ct);

    [HttpGet("api/repro/{id:int}")]
    public async Task<ActionResult<ReproDetalle>> Obtener(int id, CancellationToken ct)
    {
        var r = await db.Reprogramaciones.AsNoTracking().Include(x => x.Archivos).Include(x => x.Vehiculo).ThenInclude(v => v!.Cliente)
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (r is null)
        {
            return NotFound();
        }
        var v = r.Vehiculo;
        return new ReproDetalle(
            r.Id, r.Nombre, r.Fecha, r.Modificada, r.WebUrl, r.Notas,
            v is null ? null : new ReproVehiculoDto(v.Id, v.Marca, v.Modelo, v.Matricula, v.Bastidor, v.ClienteId, v.Cliente.Nombre),
            r.VinculoManual,
            r.Archivos.OrderBy(a => a.Ruta).ThenBy(a => a.Nombre)
                .Select(a => new ArchivoReproDto(a.Id, a.Nombre, a.Ruta, a.Tamano, a.Modificado, Visor(a.Nombre), a.WebUrl)).ToList());
    }

    /// <summary>Vincula a mano con un vehículo (o lo quita con null). La sincronización ya no la cambia.</summary>
    [HttpPut("api/repro/{id:int}/vehiculo")]
    public async Task<IActionResult> Vincular(int id, VincularReproRequest req, CancellationToken ct)
    {
        var r = await db.Reprogramaciones.FindAsync([id], ct);
        if (r is null)
        {
            return NotFound();
        }
        if (req.VehiculoId is { } vid && !await db.Vehiculos.AnyAsync(v => v.Id == vid, ct))
        {
            ModelState.AddModelError(nameof(req.VehiculoId), "El vehículo no existe.");
            return ValidationProblem(ModelState);
        }
        r.VehiculoId = req.VehiculoId;
        r.VinculoManual = true;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPut("api/repro/{id:int}/notas")]
    public async Task<IActionResult> Notas(int id, NotasReproRequest req, CancellationToken ct)
    {
        var r = await db.Reprogramaciones.FindAsync([id], ct);
        if (r is null)
        {
            return NotFound();
        }
        r.Notas = string.IsNullOrWhiteSpace(req.Notas) ? null : req.Notas.Trim();
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Contenido de un archivo, leído de SharePoint en el momento. Admite Range (un solo tramo) para que el visor
    /// hexadecimal y los vídeos pidan solo lo que muestran. ?descargar=true lo sirve como descarga.
    /// </summary>
    [HttpGet("api/repro/archivos/{id:int}/contenido")]
    public async Task Contenido(int id, [FromQuery] bool descargar, CancellationToken ct)
    {
        var archivo = await db.ArchivosReprogramacion.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        var driveId = await db.EstadoSincronizacion.AsNoTracking().Where(e => e.Id == EstadoSincronizacion.IdRepro).Select(e => e.DriveId).FirstOrDefaultAsync(ct);
        if (archivo is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        if (!opciones.Configurado || driveId is null)
        {
            await Problema(503, "SharePoint no está configurado o REPRO aún no se ha sincronizado.", ct);
            return;
        }

        RangeHeaderValue? rango = null;
        if (RangeHeaderValue.TryParse(Request.Headers.Range.ToString(), out var r) && r.Unit == "bytes" && r.Ranges.Count == 1)
        {
            rango = r;
        }

        HttpResponseMessage respuesta;
        try
        {
            respuesta = await graph.DescargarAsync(driveId, archivo.SharePointId, ct, rango);
        }
        catch (ErrorGraph e)
        {
            log.LogWarning(e, "No se ha podido leer de SharePoint el archivo {Id}", id);
            await Problema(502, "No se ha podido leer el archivo de SharePoint. Puede que se haya movido o borrado: sincroniza de nuevo.", ct);
            return;
        }

        using var _ = respuesta;
        var visor = Visor(archivo.Nombre);
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (visor != "pdf")
        {
            // Lo que se abre en el navegador no puede ejecutar nada (por si un archivo se hiciera pasar por otro tipo).
            // A los PDF no se les aplica: el visor de PDF de Chrome no funciona dentro de un sandbox.
            Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'";
        }
        Response.Headers.ContentDisposition = $"{(descargar ? "attachment" : "inline")}; filename*=UTF-8''{Uri.EscapeDataString(archivo.Nombre)}";
        Response.Headers.AcceptRanges = "bytes";
        Response.Headers.CacheControl = "private, max-age=300";
        if (respuesta.Content.Headers.ContentRange is { } contentRange)
        {
            Response.StatusCode = StatusCodes.Status206PartialContent;
            Response.Headers.ContentRange = contentRange.ToString();
        }
        if (respuesta.Content.Headers.ContentLength is { } largo)
        {
            Response.ContentLength = largo;
        }
        Response.ContentType = descargar ? "application/octet-stream" : TipoContenido(archivo.Nombre);
        await using var contenido = await respuesta.Content.ReadAsStreamAsync(ct);
        await contenido.CopyToAsync(Response.Body, ct);
    }

    private async Task Problema(int status, string detalle, CancellationToken ct)
    {
        Response.StatusCode = status;
        await Response.WriteAsJsonAsync(new ProblemDetails { Status = status, Title = "Error", Detail = detalle }, ct);
    }
}
