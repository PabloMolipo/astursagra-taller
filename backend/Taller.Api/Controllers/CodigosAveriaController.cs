using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Biblioteca de códigos de avería con los casos del propio taller.</summary>
[ApiController]
[Route("api/codigos-averia")]
[Authorize(Roles = Roles.Taller)]
public class CodigosAveriaController(TallerDbContext db, HistorialDiagnostico historial) : ControllerBase
{
    private const int MaxCasos = 30;

    [HttpGet]
    public async Task<IReadOnlyList<CodigoAveriaListItem>> Buscar([FromQuery] string? q, [FromQuery] bool soloConCasos, CancellationToken ct)
    {
        var query = db.CodigosAveria.AsNoTracking();
        var texto = q?.Trim();
        if (!string.IsNullOrEmpty(texto))
        {
            var codigo = new string(texto.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
            var patron = $"%{texto}%";
            query = query.Where(c =>
                (codigo.Length > 0 && c.Codigo.StartsWith(codigo)) ||
                EF.Functions.ILike(c.Descripcion, patron) ||
                EF.Functions.ILike(c.Sistema!, patron) ||
                EF.Functions.ILike(c.Notas!, patron));
        }

        var casosPorCodigo = await db.CodigosLeidos.AsNoTracking()
            .GroupBy(c => c.Codigo)
            .Select(g => new { Codigo = g.Key, Casos = g.Select(c => c.FichaDiagnosisId).Distinct().Count() })
            .ToDictionaryAsync(x => x.Codigo, x => x.Casos, ct);

        var lista = await query.OrderBy(c => c.Codigo).Take(300).ToListAsync(ct);
        var resultado = lista
            .Select(c => new CodigoAveriaListItem(c.Codigo, c.Descripcion, c.Sistema, c.EsPropio, c.Notas is not null, casosPorCodigo.GetValueOrDefault(c.Codigo)))
            .Where(c => !soloConCasos || c.NumCasos > 0)
            .ToList();

        // Un código válido que no está en la biblioteca también se ofrece, interpretado por su estructura.
        var buscado = DecodificadorObd.Interpretar(texto);
        if (buscado is not null && resultado.All(r => r.Codigo != buscado.Codigo))
        {
            resultado.Insert(0, new CodigoAveriaListItem(buscado.Codigo, buscado.Descripcion, buscado.Sistema, false, false, casosPorCodigo.GetValueOrDefault(buscado.Codigo)));
        }
        return resultado;
    }

    [HttpGet("{codigo}")]
    public async Task<ActionResult<CodigoAveriaDetalle>> Obtener(string codigo, CancellationToken ct)
    {
        var normalizado = DecodificadorObd.Normalizar(codigo) ?? codigo.Trim().ToUpperInvariant();
        var entrada = await db.CodigosAveria.AsNoTracking().FirstOrDefaultAsync(c => c.Codigo == normalizado, ct);
        var estructura = DecodificadorObd.Interpretar(normalizado);
        if (entrada is null && estructura is null)
        {
            return NotFound();
        }

        return new CodigoAveriaDetalle(
            normalizado,
            entrada?.Descripcion ?? estructura!.Descripcion,
            entrada?.Sistema ?? estructura?.Sistema,
            entrada?.Notas,
            entrada?.EsPropio ?? false,
            entrada is not null,
            estructura?.Descripcion,
            await historial.CasosPorCodigoAsync(normalizado, MaxCasos, ct));
    }

    /// <summary>Crea un código propio (p. ej. de fabricante) o actualiza descripción y notas de uno existente.</summary>
    [HttpPut("{codigo}")]
    public async Task<ActionResult<CodigoAveriaDetalle>> Guardar(string codigo, CodigoAveriaRequest req, CancellationToken ct)
    {
        var normalizado = Normalizar.Codigo(codigo);
        if (normalizado is null || normalizado.Length is < 4 or > 10)
        {
            ModelState.AddModelError(nameof(codigo), "El código debe tener entre 4 y 10 letras o números.");
            return ValidationProblem(ModelState);
        }

        var entrada = await db.CodigosAveria.FirstOrDefaultAsync(c => c.Codigo == normalizado, ct);
        if (entrada is null)
        {
            entrada = new CodigoAveria { Codigo = normalizado, Descripcion = "", EsPropio = true };
            db.CodigosAveria.Add(entrada);
        }
        entrada.Descripcion = req.Descripcion.Trim();
        entrada.Sistema = Normalizar.Texto(req.Sistema);
        entrada.Notas = Normalizar.Texto(req.Notas);
        await db.SaveChangesAsync(ct);

        return (await Obtener(normalizado, ct)).Value!;
    }

    /// <summary>Solo se pueden borrar los códigos añadidos por el taller.</summary>
    [HttpDelete("{codigo}")]
    public async Task<IActionResult> Eliminar(string codigo, CancellationToken ct)
    {
        var entrada = await db.CodigosAveria.FirstOrDefaultAsync(c => c.Codigo == codigo.ToUpperInvariant(), ct);
        if (entrada is null)
        {
            return NotFound();
        }
        if (!entrada.EsPropio)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Conflicto", Detail = "Los códigos genéricos no se borran; puedes dejar sus notas vacías." });
        }
        db.CodigosAveria.Remove(entrada);
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}
