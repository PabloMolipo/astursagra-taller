using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Gastos del taller (compras de recambios, alquiler, suministros…) con su ticket o factura adjunta.</summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/gastos")]
public class GastosController(TallerDbContext db, AlmacenPrivado almacen) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<GastoDto>> Listar(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] CategoriaGasto? categoria,
        [FromQuery] int? ordenId, [FromQuery] string? q, CancellationToken ct)
    {
        var query = db.Gastos.AsNoTracking().Include(g => g.OrdenTrabajo!).ThenInclude(o => o.Vehiculo).AsQueryable();
        if (desde is not null) query = query.Where(g => g.Fecha >= desde);
        if (hasta is not null) query = query.Where(g => g.Fecha <= hasta);
        if (categoria is not null) query = query.Where(g => g.Categoria == categoria);
        if (ordenId is not null) query = query.Where(g => g.OrdenTrabajoId == ordenId);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            query = query.Where(g => EF.Functions.ILike(g.Concepto, patron) || EF.Functions.ILike(g.Proveedor!, patron) || EF.Functions.ILike(g.Notas!, patron));
        }

        var gastos = await query.OrderByDescending(g => g.Fecha).ThenByDescending(g => g.Id).Take(1000).ToListAsync(ct);
        return gastos.Select(ToDto).ToList();
    }

    /// <summary>Proveedores ya usados, para sugerirlos al escribir.</summary>
    [HttpGet("proveedores")]
    public async Task<IReadOnlyList<string>> Proveedores(CancellationToken ct) =>
        await db.Gastos.AsNoTracking().Where(g => g.Proveedor != null).Select(g => g.Proveedor!).Distinct().OrderBy(p => p).ToListAsync(ct);

    [HttpGet("{id:int}")]
    public async Task<ActionResult<GastoDto>> Obtener(int id, CancellationToken ct)
    {
        var g = await db.Gastos.AsNoTracking().Include(x => x.OrdenTrabajo!).ThenInclude(o => o.Vehiculo).FirstOrDefaultAsync(x => x.Id == id, ct);
        return g is null ? NotFound() : ToDto(g);
    }

    [HttpPost]
    public async Task<ActionResult<GastoDto>> Crear(GastoRequest req, CancellationToken ct)
    {
        if (await OrdenNoExiste(req.OrdenTrabajoId, ct))
        {
            return OrdenInvalida();
        }
        var g = new Gasto { Concepto = "", FechaAlta = DateTimeOffset.UtcNow };
        Aplicar(g, req);
        db.Gastos.Add(g);
        await db.SaveChangesAsync(ct);
        return CreatedAtAction(nameof(Obtener), new { id = g.Id }, await Recargar(g.Id, ct));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<GastoDto>> Actualizar(int id, GastoRequest req, CancellationToken ct)
    {
        var g = await db.Gastos.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null)
        {
            return NotFound();
        }
        if (await OrdenNoExiste(req.OrdenTrabajoId, ct))
        {
            return OrdenInvalida();
        }
        Aplicar(g, req);
        await db.SaveChangesAsync(ct);
        return await Recargar(id, ct);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var g = await db.Gastos.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null)
        {
            return NotFound();
        }
        db.Gastos.Remove(g);
        await db.SaveChangesAsync(ct);
        if (g.Adjunto is not null)
        {
            almacen.Borrar(g.Adjunto);
        }
        return NoContent();
    }

    /// <summary>Adjunta el ticket o la factura del proveedor (PDF o foto, hasta 25 MB). Sustituye al anterior.</summary>
    [HttpPost("{id:int}/adjunto")]
    [RequestSizeLimit(AlmacenPrivado.Maximo + 64 * 1024)]
    public async Task<ActionResult<GastoDto>> SubirAdjunto(int id, IFormFile archivo, CancellationToken ct)
    {
        var g = await db.Gastos.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null)
        {
            return NotFound();
        }
        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), "El ticket debe ser PDF, JPG, PNG o WebP y pesar como mucho 25 MB.");
            return ValidationProblem(ModelState);
        }
        var anterior = g.Adjunto;
        g.Adjunto = guardado.Value.Nombre;
        g.AdjuntoNombre = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : "ticket";
        g.AdjuntoTipo = guardado.Value.Tipo.TipoContenido;
        await db.SaveChangesAsync(ct);
        if (anterior is not null)
        {
            almacen.Borrar(anterior);
        }
        return await Recargar(id, ct);
    }

    [HttpGet("{id:int}/adjunto")]
    public async Task<IActionResult> DescargarAdjunto(int id, CancellationToken ct)
    {
        var g = await db.Gastos.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g?.Adjunto is null || !System.IO.File.Exists(almacen.Ruta(g.Adjunto)))
        {
            return NotFound();
        }
        Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(g.AdjuntoNombre ?? "ticket")}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(almacen.Ruta(g.Adjunto), g.AdjuntoTipo ?? "application/octet-stream");
    }

    [HttpDelete("{id:int}/adjunto")]
    public async Task<ActionResult<GastoDto>> QuitarAdjunto(int id, CancellationToken ct)
    {
        var g = await db.Gastos.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (g is null)
        {
            return NotFound();
        }
        if (g.Adjunto is not null)
        {
            almacen.Borrar(g.Adjunto);
            g.Adjunto = g.AdjuntoNombre = g.AdjuntoTipo = null;
            await db.SaveChangesAsync(ct);
        }
        return await Recargar(id, ct);
    }

    private async Task<bool> OrdenNoExiste(int? ordenId, CancellationToken ct) =>
        ordenId is not null && !await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct);

    private ActionResult OrdenInvalida()
    {
        ModelState.AddModelError(nameof(GastoRequest.OrdenTrabajoId), "La orden no existe.");
        return ValidationProblem(ModelState);
    }

    private async Task<GastoDto> Recargar(int id, CancellationToken ct) =>
        ToDto(await db.Gastos.AsNoTracking().Include(x => x.OrdenTrabajo!).ThenInclude(o => o.Vehiculo).FirstAsync(x => x.Id == id, ct));

    private static void Aplicar(Gasto g, GastoRequest req)
    {
        g.Fecha = req.Fecha;
        g.Categoria = req.Categoria;
        g.Concepto = req.Concepto.Trim();
        g.Proveedor = Normalizar.Texto(req.Proveedor);
        g.Importe = Math.Round(req.Importe, 2);
        g.MetodoPago = req.MetodoPago;
        g.Notas = Normalizar.Texto(req.Notas);
        g.OrdenTrabajoId = req.OrdenTrabajoId;
    }

    private static GastoDto ToDto(Gasto g) => new(
        g.Id, g.Fecha, g.Categoria, g.Concepto, g.Proveedor, g.Importe, g.MetodoPago, g.Notas, g.OrdenTrabajoId,
        g.OrdenTrabajo?.Vehiculo.Matricula ?? g.OrdenTrabajo?.Vehiculo.Bastidor,
        g.AdjuntoNombre, g.AdjuntoTipo, g.Adjunto is null ? null : $"/api/gastos/{g.Id}/adjunto");
}
