using System.Linq.Expressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Centralitas;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>
/// Biblioteca de mapas por software: lo que se ha nombrado o importado (XDF) para cada software, con el registro de
/// importaciones y las lecturas de ese software. Se puede corregir sin abrir ninguna lectura y volver a aplicar.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/centralitas/biblioteca")]
public class BibliotecaController(TallerDbContext db, AlmacenCentralitas almacen) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<BibliotecaListItem>> Listar([FromQuery] string? q, CancellationToken ct)
    {
        var query = db.BibliotecasSoftware.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            query = query.Where(b => EF.Functions.ILike(b.Clave, patron) || EF.Functions.ILike(b.Familia!, patron)
                || b.Mapas.Any(m => EF.Functions.ILike(m.Nombre, patron)));
        }
        return await query.OrderByDescending(b => b.Modificada)
            .Select(b => new BibliotecaListItem(b.Id, b.Clave, b.Familia, b.Software, b.Referencia, b.Tamano, b.Mapas.Count,
                db.ImportacionesXdf.Count(i => i.BibliotecaSoftwareId == b.Id),
                db.Centralitas.Count(c => (c.Software ?? c.Referencia) == (b.Software ?? b.Referencia) && c.Tamano == b.Tamano),
                b.Modificada))
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<BibliotecaDetalle>> Obtener(int id, CancellationToken ct)
    {
        var b = await db.BibliotecasSoftware.AsNoTracking().Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b is null)
        {
            return NotFound();
        }
        var importaciones = await db.ImportacionesXdf.AsNoTracking().Where(i => i.BibliotecaSoftwareId == id).OrderByDescending(i => i.Fecha).ToListAsync(ct);
        var lecturas = await db.Centralitas.AsNoTracking().Where(DelSoftware(b)).OrderByDescending(c => c.FechaAlta)
            .Select(c => new LecturaBiblioteca(c.Id, c.Tipo, c.Nombre, c.NombreArchivo,
                c.Vehiculo == null ? null : (c.Vehiculo.Marca + " " + c.Vehiculo.Modelo).Trim(),
                c.Vehiculo == null ? null : c.Vehiculo.Matricula ?? c.Vehiculo.Bastidor, c.FechaAlta))
            .ToListAsync(ct);
        return new BibliotecaDetalle(b.Id, b.Clave, b.Familia, b.Software, b.Referencia, b.Tamano, b.FechaAlta, b.Modificada,
            b.Mapas.OrderBy(m => m.Grupo == null).ThenBy(m => m.Grupo).ThenBy(m => m.Nombre).Select(m => MapeoMapas.ToDto(m, m.Id, OrigenMapa.Manual)).ToList(),
            importaciones.Select(i => new ImportacionXdfDto(i.Id, i.Titulo, i.NombreArchivo, i.Tamano, i.Importados, i.Omitidos,
                i.Avisos?.Split('\n') ?? [], i.CentralitaId, i.Fecha)).ToList(),
            lecturas);
    }

    /// <summary>Corrige un mapa de la biblioteca. No cambia las lecturas ya subidas: para eso, «aplicar».</summary>
    [HttpPut("{id:int}/mapas/{mapaId:int}")]
    public async Task<ActionResult<MapaDto>> ActualizarMapa(int id, int mapaId, MapaRequest req, CancellationToken ct)
    {
        var b = await db.BibliotecasSoftware.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        var m = b?.Mapas.FirstOrDefault(x => x.Id == mapaId);
        if (b is null || m is null)
        {
            return NotFound();
        }
        foreach (var (campo, error) in MapeoMapas.Errores(req, b.Tamano))
        {
            ModelState.AddModelError(campo, error);
        }
        if (b.Mapas.Any(x => x.Id != mapaId && x.Direccion == req.Direccion))
        {
            ModelState.AddModelError(nameof(req.Direccion), "Ya hay otro mapa en esa dirección en la biblioteca.");
        }
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }
        MapeoMapas.Aplicar(m, req);
        b.Modificada = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return MapeoMapas.ToDto(m, m.Id, OrigenMapa.Manual);
    }

    [HttpDelete("{id:int}/mapas/{mapaId:int}")]
    public async Task<IActionResult> EliminarMapa(int id, int mapaId, CancellationToken ct)
    {
        var b = await db.BibliotecasSoftware.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        var m = b?.Mapas.FirstOrDefault(x => x.Id == mapaId);
        if (b is null || m is null)
        {
            return NotFound();
        }
        b.Mapas.Remove(m);
        b.Modificada = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Aplica la biblioteca a todas las lecturas de su software: sobrescribe los mapas en la misma dirección y tamaño
    /// (también los que ya tenían nombre) y añade los que falten.
    /// </summary>
    [HttpPost("{id:int}/aplicar")]
    public async Task<ActionResult<AplicarBibliotecaResultado>> Aplicar(int id, CancellationToken ct)
    {
        var b = await db.BibliotecasSoftware.AsNoTracking().Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b is null)
        {
            return NotFound();
        }
        var lecturas = await db.Centralitas.Where(DelSoftware(b)).Include(c => c.Mapas).ToListAsync(ct);
        var mapas = lecturas.Sum(c => Biblioteca.Sobrescribir(b.Mapas, c));
        await db.SaveChangesAsync(ct);
        return new AplicarBibliotecaResultado(lecturas.Count, mapas);
    }

    /// <summary>Borra la biblioteca de un software con sus importaciones de XDF; las lecturas conservan sus mapas.</summary>
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var b = await db.BibliotecasSoftware.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (b is null)
        {
            return NotFound();
        }
        var archivos = await db.ImportacionesXdf.Where(i => i.BibliotecaSoftwareId == id).Select(i => i.Archivo).ToListAsync(ct);
        db.BibliotecasSoftware.Remove(b);
        await db.SaveChangesAsync(ct);
        archivos.ForEach(almacen.Borrar);
        return NoContent();
    }

    /// <summary>Descarga el XDF importado, con su nombre original.</summary>
    [HttpGet("importaciones/{id:int}/archivo")]
    public async Task<IActionResult> ArchivoXdf(int id, CancellationToken ct)
    {
        var i = await db.ImportacionesXdf.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (i is null || !System.IO.File.Exists(almacen.Ruta(i.Archivo)))
        {
            return NotFound();
        }
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        Response.Headers.ContentDisposition = $"attachment; filename*=UTF-8''{Uri.EscapeDataString(i.NombreArchivo)}";
        return PhysicalFile(almacen.Ruta(i.Archivo), "application/octet-stream");
    }

    /// <summary>Lecturas con la misma clave que la biblioteca (ver <see cref="Biblioteca.Clave"/>).</summary>
    private static Expression<Func<Centralita, bool>> DelSoftware(BibliotecaSoftware b)
    {
        var software = b.Software ?? b.Referencia;
        var tamano = b.Tamano;
        return c => (c.Software ?? c.Referencia) == software && c.Tamano == tamano;
    }
}
