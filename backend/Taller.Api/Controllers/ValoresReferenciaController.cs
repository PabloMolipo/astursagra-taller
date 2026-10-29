using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Valores de referencia para comparar mediciones (genéricos orientativos y los del taller).</summary>
[ApiController]
[Route("api/valores-referencia")]
[Authorize(Roles = Roles.Taller)]
public class ValoresReferenciaController(TallerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<ValorReferenciaDto>> Listar(
        [FromQuery] string? q, [FromQuery] string? categoria, [FromQuery] Combustible? combustible, CancellationToken ct)
    {
        var query = db.ValoresReferencia.AsNoTracking();
        if (!string.IsNullOrWhiteSpace(categoria))
        {
            query = query.Where(v => v.Categoria == categoria);
        }
        if (combustible is { } c && c != Combustible.Todos)
        {
            query = query.Where(v => v.Combustible == c || v.Combustible == Combustible.Todos);
        }
        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            query = query.Where(v =>
                EF.Functions.ILike(v.Parametro, patron) || EF.Functions.ILike(v.Condicion!, patron) ||
                EF.Functions.ILike(v.Aplicacion!, patron) || EF.Functions.ILike(v.Notas!, patron) || EF.Functions.ILike(v.Categoria, patron));
        }

        return (await query.OrderBy(v => v.Categoria).ThenBy(v => v.Parametro).ThenBy(v => v.Aplicacion).ToListAsync(ct))
            .Select(ToDto).ToList();
    }

    [HttpGet("categorias")]
    public async Task<IReadOnlyList<string>> Categorias(CancellationToken ct) =>
        await db.ValoresReferencia.AsNoTracking().Select(v => v.Categoria).Distinct().OrderBy(c => c).ToListAsync(ct);

    [HttpPost]
    public async Task<ActionResult<ValorReferenciaDto>> Crear(ValorReferenciaRequest req, CancellationToken ct)
    {
        if (Validar(req) is { } error)
        {
            return error;
        }
        var valor = new ValorReferencia { Parametro = "", Categoria = "", Unidad = "", EsPropio = true };
        Aplicar(valor, req);
        db.ValoresReferencia.Add(valor);
        await db.SaveChangesAsync(ct);
        return ToDto(valor);
    }

    /// <summary>También se pueden corregir los genéricos (rango, aplicación, notas…).</summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<ValorReferenciaDto>> Actualizar(int id, ValorReferenciaRequest req, CancellationToken ct)
    {
        if (Validar(req) is { } error)
        {
            return error;
        }
        var valor = await db.ValoresReferencia.FindAsync([id], ct);
        if (valor is null)
        {
            return NotFound();
        }
        Aplicar(valor, req);
        await db.SaveChangesAsync(ct);
        return ToDto(valor);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var valor = await db.ValoresReferencia.FindAsync([id], ct);
        if (valor is null)
        {
            return NotFound();
        }
        if (!valor.EsPropio)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Conflicto", Detail = "Los valores genéricos no se borran, pero puedes corregirlos." });
        }
        db.ValoresReferencia.Remove(valor);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    private ActionResult? Validar(ValorReferenciaRequest req)
    {
        if (req.Minimo is null && req.Maximo is null)
        {
            ModelState.AddModelError(nameof(req.Minimo), "Indica al menos un mínimo o un máximo.");
        }
        else if (req.Minimo > req.Maximo)
        {
            ModelState.AddModelError(nameof(req.Minimo), "El mínimo no puede ser mayor que el máximo.");
        }
        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    private static void Aplicar(ValorReferencia v, ValorReferenciaRequest req)
    {
        v.Parametro = req.Parametro.Trim();
        v.Categoria = req.Categoria.Trim();
        v.Condicion = Normalizar.Texto(req.Condicion);
        v.Minimo = req.Minimo;
        v.Maximo = req.Maximo;
        v.Unidad = req.Unidad.Trim();
        v.Combustible = req.Combustible;
        v.Aplicacion = Normalizar.Texto(req.Aplicacion);
        v.PidObd = Normalizar.Texto(req.PidObd)?.ToUpperInvariant();
        v.Notas = Normalizar.Texto(req.Notas);
    }

    public static ValorReferenciaDto ToDto(ValorReferencia v) => new(
        v.Id, v.Parametro, v.Categoria, v.Condicion, v.Minimo, v.Maximo, v.Unidad, v.Combustible, v.Aplicacion, v.PidObd, v.Notas, v.EsPropio);
}
