using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Controllers;

/// <summary>Web pública: solo lectura y solo lo marcado como publicado.</summary>
[ApiController]
[Route("api/publico")]
[AllowAnonymous]
public class PublicoController(TallerDbContext db) : ControllerBase
{
    private const int MaxDestacados = 6;

    [HttpGet("inicio")]
    public async Task<InicioPublico> Inicio(CancellationToken ct)
    {
        var destacados = await Publicados()
            .OrderByDescending(t => t.Destacado).ThenByDescending(t => t.Fecha)
            .Take(MaxDestacados)
            .ToListAsync(ct);

        return new InicioPublico(await Datos(ct), await ServiciosPublicados(ct), destacados.Select(t => t.ToListItem()).ToList());
    }

    [HttpGet("datos")]
    public Task<DatosTallerDto> DatosTaller(CancellationToken ct) => Datos(ct);

    [HttpGet("servicios")]
    public Task<List<ServicioDto>> Servicios(CancellationToken ct) => ServiciosPublicados(ct);

    [HttpGet("trabajos")]
    public async Task<IReadOnlyList<TrabajoListItem>> Trabajos([FromQuery] TipoServicio? servicio, CancellationToken ct)
    {
        var query = Publicados();
        if (servicio is not null)
        {
            query = query.Where(t => t.Servicios.Contains(servicio.Value));
        }
        var trabajos = await query.OrderByDescending(t => t.Fecha).ThenByDescending(t => t.Id).ToListAsync(ct);
        return trabajos.Select(t => t.ToListItem()).ToList();
    }

    [HttpGet("trabajos/{slug}")]
    public async Task<ActionResult<TrabajoDetalle>> Trabajo(string slug, CancellationToken ct)
    {
        var trabajo = await Publicados().FirstOrDefaultAsync(t => t.Slug == slug, ct);
        return trabajo is null ? NotFound() : trabajo.ToDetalle();
    }

    private IQueryable<TrabajoRealizado> Publicados() =>
        db.TrabajosRealizados.AsNoTracking().Include(t => t.Fotos).Where(t => t.Publicado);

    private Task<List<ServicioDto>> ServiciosPublicados(CancellationToken ct) =>
        db.Servicios.AsNoTracking()
            .Where(s => s.Publicado)
            .OrderBy(s => s.Orden).ThenBy(s => s.Titulo)
            .Select(s => new ServicioDto(s.Id, s.Slug, s.Titulo, s.Resumen, s.Descripcion, s.Icono, s.Orden, s.Publicado))
            .ToListAsync(ct);

    private async Task<DatosTallerDto> Datos(CancellationToken ct)
    {
        var datos = await db.DatosTaller.AsNoTracking().FirstOrDefaultAsync(ct);
        return (datos ?? ContenidoInicial.Datos()).ToDto();
    }
}
