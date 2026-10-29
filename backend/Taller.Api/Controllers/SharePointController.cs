using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

public record EstadoRepro(string Biblioteca, DateTimeOffset? UltimaSincronizacion, string? UltimoResultado, bool UltimaConError, int Reprogramaciones, int SinVincular);

public record EstadoSharePoint(
    bool Configurado, string? SiteUrl, string? Biblioteca, string? Carpeta, int IntervaloMinutos,
    bool EnCurso, string? Progreso, DateTimeOffset? UltimaSincronizacion, string? UltimoResultado, bool UltimaConError, int Documentos,
    EstadoRepro? Repro);

/// <summary>Estado de la sincronización con SharePoint y sincronización manual.</summary>
[ApiController]
[Route("api/sharepoint")]
[Authorize(Roles = Roles.Taller)]
public class SharePointController(TallerDbContext db, OpcionesSharePoint opciones, ServicioSincronizacion servicio) : ControllerBase
{
    [HttpGet("estado")]
    public async Task<EstadoSharePoint> Estado(CancellationToken ct)
    {
        var estados = await db.EstadoSincronizacion.AsNoTracking().ToListAsync(ct);
        var estado = estados.FirstOrDefault(e => e.Id == Domain.EstadoSincronizacion.IdDocumentacion);
        var documentos = await db.DocumentosTecnicos.CountAsync(d => d.SharePointId != null && !d.EliminadoEnSharePoint, ct);
        EstadoRepro? repro = null;
        if (!string.IsNullOrWhiteSpace(opciones.BibliotecaRepro))
        {
            var er = estados.FirstOrDefault(e => e.Id == Domain.EstadoSincronizacion.IdRepro);
            repro = new EstadoRepro(opciones.BibliotecaRepro, er?.UltimaSincronizacion, er?.UltimoResultado, er?.UltimaConError ?? false,
                await db.Reprogramaciones.CountAsync(ct), await db.Reprogramaciones.CountAsync(r => r.VehiculoId == null, ct));
        }
        return new EstadoSharePoint(
            opciones.Configurado, opciones.SiteUrl, opciones.Biblioteca, opciones.Carpeta, opciones.IntervaloMinutos,
            servicio.EnCurso, servicio.Progreso, estado?.UltimaSincronizacion, estado?.UltimoResultado, estado?.UltimaConError ?? false, documentos, repro);
    }

    [HttpPost("sincronizar")]
    public IActionResult Sincronizar()
    {
        if (!opciones.Configurado)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "No configurado", Detail = "SharePoint no está configurado en el servidor." });
        }
        return servicio.Solicitar()
            ? Accepted()
            : Conflict(new ProblemDetails { Status = 409, Title = "En curso", Detail = "Ya hay una sincronización en marcha." });
    }
}
