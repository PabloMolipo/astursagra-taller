using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

public record MultimediaDto(
    int Id, EtapaMultimedia Etapa, string? Descripcion, bool VisibleCliente, string NombreOriginal, string TipoContenido,
    long Tamano, DateTimeOffset Fecha, string? SubidoPor, string Url);

public record MultimediaRequest(EtapaMultimedia Etapa, [MaxLength(500)] string? Descripcion, bool VisibleCliente);

/// <summary>Fotos y vídeos de las órdenes de trabajo.</summary>
[ApiController]
public class MultimediaController(TallerDbContext db, AlmacenMultimedia almacen) : ControllerBase
{
    [HttpGet("api/ordenes/{ordenId:int}/multimedia")]
    [Authorize(Roles = Roles.Taller)]
    public async Task<ActionResult<IReadOnlyList<MultimediaDto>>> Listar(int ordenId, CancellationToken ct)
    {
        if (!await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct))
        {
            return NotFound();
        }
        return (await db.MultimediaOrdenes.AsNoTracking().Where(m => m.OrdenTrabajoId == ordenId)
            .OrderBy(m => m.Etapa).ThenBy(m => m.Fecha).ToListAsync(ct)).Select(ToDto).ToList();
    }

    /// <summary>Sube una foto o un vídeo (uno por petición, para poder mostrar el progreso de cada archivo).</summary>
    [HttpPost("api/ordenes/{ordenId:int}/multimedia")]
    [Authorize(Roles = Roles.Taller)]
    [RequestSizeLimit(AlmacenMultimedia.Maximo + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = AlmacenMultimedia.Maximo + 1024 * 1024)]
    public async Task<ActionResult<MultimediaDto>> Subir(
        int ordenId, IFormFile archivo, [FromForm] EtapaMultimedia etapa, [FromForm] string? descripcion, [FromForm] bool visibleCliente, CancellationToken ct)
    {
        if (!await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct))
        {
            return NotFound();
        }

        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), await EsHeicAsync(archivo)
                ? "Las fotos HEIC del iPhone no se pueden mostrar en el navegador. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible»."
                : "Solo fotos JPG, PNG o WebP y vídeos MP4, MOV o WebM, de hasta 300 MB.");
            return ValidationProblem(ModelState);
        }

        var multimedia = new MultimediaOrden
        {
            OrdenTrabajoId = ordenId,
            Etapa = etapa,
            Descripcion = Normalizar.Texto(descripcion),
            VisibleCliente = visibleCliente,
            Archivo = guardado.Value.Nombre,
            NombreOriginal = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : "archivo",
            TipoContenido = guardado.Value.Tipo.TipoContenido,
            Tamano = archivo.Length,
            Fecha = DateTimeOffset.UtcNow,
            SubidoPor = User.Identity?.Name
        };
        db.MultimediaOrdenes.Add(multimedia);
        await db.SaveChangesAsync(ct);
        return ToDto(multimedia);
    }

    [HttpPut("api/multimedia/{id:int}")]
    [Authorize(Roles = Roles.Taller)]
    public async Task<ActionResult<MultimediaDto>> Actualizar(int id, MultimediaRequest req, CancellationToken ct)
    {
        var m = await db.MultimediaOrdenes.FindAsync([id], ct);
        if (m is null)
        {
            return NotFound();
        }
        m.Etapa = req.Etapa;
        m.Descripcion = Normalizar.Texto(req.Descripcion);
        m.VisibleCliente = req.VisibleCliente;
        await db.SaveChangesAsync(ct);
        return ToDto(m);
    }

    [HttpDelete("api/multimedia/{id:int}")]
    [Authorize(Roles = Roles.Taller)]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var m = await db.MultimediaOrdenes.FindAsync([id], ct);
        if (m is null)
        {
            return NotFound();
        }
        db.MultimediaOrdenes.Remove(m);
        await db.SaveChangesAsync(ct);
        almacen.Borrar(m.Archivo);
        return NoContent();
    }

    /// <summary>
    /// Descarga o reproducción. El taller ve todo; un cliente solo lo marcado como visible de sus propias órdenes
    /// (si no, 404 para no revelar que existe). Admite rangos para poder avanzar en los vídeos.
    /// </summary>
    [HttpGet("api/multimedia/{id:int}/archivo")]
    [Authorize]
    public async Task<IActionResult> Archivo(int id, CancellationToken ct)
    {
        var m = await db.MultimediaOrdenes.AsNoTracking()
            .Where(x => x.Id == id)
            .Select(x => new { x.Archivo, x.NombreOriginal, x.TipoContenido, x.VisibleCliente, x.OrdenTrabajo.Vehiculo.ClienteId })
            .FirstOrDefaultAsync(ct);
        if (m is null)
        {
            return NotFound();
        }
        if (!User.IsInRole(Roles.Taller) && !(m.VisibleCliente && User.ClienteId() == m.ClienteId))
        {
            return NotFound();
        }
        var ruta = almacen.Ruta(m.Archivo);
        if (!System.IO.File.Exists(ruta))
        {
            return NotFound();
        }
        Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(m.NombreOriginal)}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(ruta, m.TipoContenido, enableRangeProcessing: true);
    }

    private static async Task<bool> EsHeicAsync(IFormFile archivo)
    {
        var cabecera = new byte[12];
        await using var lectura = archivo.OpenReadStream();
        var leidos = await lectura.ReadAtLeastAsync(cabecera, cabecera.Length, throwOnEndOfStream: false);
        return leidos == 12 && AlmacenMultimedia.EsHeic(cabecera);
    }

    public static MultimediaDto ToDto(MultimediaOrden m) => new(
        m.Id, m.Etapa, m.Descripcion, m.VisibleCliente, m.NombreOriginal, m.TipoContenido, m.Tamano, m.Fecha, m.SubidoPor,
        $"/api/multimedia/{m.Id}/archivo");
}
