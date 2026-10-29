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

/// <summary>Ficha de diagnosis de cada orden y sus adjuntos privados.</summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
public class DiagnosisController(TallerDbContext db, HistorialDiagnostico historial, AlmacenPrivado almacen) : ControllerBase
{
    [HttpGet("api/ordenes/{ordenId:int}/diagnosis")]
    public async Task<ActionResult<FichaDiagnosisDto>> Obtener(int ordenId, CancellationToken ct)
    {
        if (!await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct))
        {
            return NotFound();
        }
        var ficha = await Cargar(ordenId, ct);
        return ficha is null ? FichaVacia(ordenId) : ToDto(ficha);
    }

    /// <summary>Guarda la ficha completa (las listas se sustituyen por las recibidas).</summary>
    [HttpPut("api/ordenes/{ordenId:int}/diagnosis")]
    public async Task<ActionResult<FichaDiagnosisDto>> Guardar(int ordenId, FichaDiagnosisRequest req, CancellationToken ct)
    {
        var ficha = await CargarOCrear(ordenId, ct);
        if (ficha is null)
        {
            return NotFound();
        }

        var idsReferencia = req.Mediciones.Select(m => m.ValorReferenciaId).OfType<int>().Distinct().ToList();
        var referencias = (await db.ValoresReferencia.Where(v => idsReferencia.Contains(v.Id)).Select(v => v.Id).ToListAsync(ct)).ToHashSet();

        ficha.Sintomas = Normalizar.Texto(req.Sintomas);
        ficha.Conclusion = Normalizar.Texto(req.Conclusion);
        ficha.Codigos = await CodigosAsync(req.Codigos, ct);
        ficha.Mediciones = req.Mediciones.Select(m => new Medicion
        {
            Parametro = m.Parametro.Trim(),
            Valor = m.Valor.Trim(),
            Unidad = Normalizar.Texto(m.Unidad),
            ValorEsperado = Normalizar.Texto(m.ValorEsperado),
            Resultado = m.Resultado,
            Nota = Normalizar.Texto(m.Nota),
            ValorReferenciaId = m.ValorReferenciaId is { } r && referencias.Contains(r) ? r : null
        }).ToList();
        ficha.Pruebas = req.Pruebas.Select(p => new PruebaDiagnosis
        {
            Descripcion = p.Descripcion.Trim(),
            Resultado = Normalizar.Texto(p.Resultado)
        }).ToList();
        ficha.FechaActualizacion = DateTimeOffset.UtcNow;

        await db.SaveChangesAsync(ct);
        return ToDto(ficha);
    }

    /// <summary>Añade códigos leídos (p. ej. desde el lector OBD). Si un código ya estaba, se actualiza su estado.</summary>
    [HttpPost("api/ordenes/{ordenId:int}/diagnosis/codigos")]
    public async Task<ActionResult<FichaDiagnosisDto>> AnadirCodigos(int ordenId, AnadirCodigosRequest req, CancellationToken ct)
    {
        var ficha = await CargarOCrear(ordenId, ct);
        if (ficha is null)
        {
            return NotFound();
        }

        foreach (var nuevo in await CodigosAsync(req.Codigos, ct))
        {
            var existente = ficha.Codigos.FirstOrDefault(c => c.Codigo == nuevo.Codigo);
            if (existente is null)
            {
                ficha.Codigos.Add(nuevo);
            }
            else
            {
                existente.Estado = nuevo.Estado;
            }
        }
        ficha.FechaActualizacion = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(ficha);
    }

    [HttpPost("api/ordenes/{ordenId:int}/diagnosis/adjuntos")]
    [RequestSizeLimit(AlmacenPrivado.Maximo + 64 * 1024)]
    public async Task<ActionResult<FichaDiagnosisDto>> SubirAdjunto(int ordenId, IFormFile archivo, CancellationToken ct)
    {
        var ficha = await CargarOCrear(ordenId, ct);
        if (ficha is null)
        {
            return NotFound();
        }

        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), "El adjunto debe ser PDF, JPG, PNG o WebP y pesar como mucho 25 MB.");
            return ValidationProblem(ModelState);
        }

        ficha.Adjuntos.Add(new AdjuntoDiagnosis
        {
            Archivo = guardado.Value.Nombre,
            NombreOriginal = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : "adjunto",
            TipoContenido = guardado.Value.Tipo.TipoContenido,
            Tamano = archivo.Length,
            Fecha = DateTimeOffset.UtcNow
        });
        ficha.FechaActualizacion = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(ct);
        return ToDto(ficha);
    }

    [HttpGet("api/diagnosis/adjuntos/{id:int}")]
    public async Task<IActionResult> DescargarAdjunto(int id, CancellationToken ct)
    {
        var adjunto = await db.AdjuntosDiagnosis.AsNoTracking().FirstOrDefaultAsync(a => a.Id == id, ct);
        if (adjunto is null || !System.IO.File.Exists(almacen.Ruta(adjunto.Archivo)))
        {
            return NotFound();
        }
        // PDF e imágenes se abren en el navegador; el nombre original se conserva al guardar.
        Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(adjunto.NombreOriginal)}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(almacen.Ruta(adjunto.Archivo), adjunto.TipoContenido);
    }

    /// <summary>Muestra u oculta el adjunto al cliente en su área.</summary>
    [HttpPut("api/diagnosis/adjuntos/{id:int}/visible")]
    public async Task<IActionResult> VisibleAdjunto(int id, VisibleClienteRequest req, CancellationToken ct)
    {
        var adjunto = await db.AdjuntosDiagnosis.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (adjunto is null)
        {
            return NotFound();
        }
        adjunto.VisibleCliente = req.Visible;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpDelete("api/diagnosis/adjuntos/{id:int}")]
    public async Task<IActionResult> EliminarAdjunto(int id, CancellationToken ct)
    {
        var adjunto = await db.AdjuntosDiagnosis.FirstOrDefaultAsync(a => a.Id == id, ct);
        if (adjunto is null)
        {
            return NotFound();
        }
        db.AdjuntosDiagnosis.Remove(adjunto);
        await db.SaveChangesAsync(ct);
        almacen.Borrar(adjunto.Archivo);
        return NoContent();
    }

    private Task<FichaDiagnosis?> Cargar(int ordenId, CancellationToken ct) =>
        db.FichasDiagnosis
            .Include(f => f.Codigos).Include(f => f.Mediciones).Include(f => f.Pruebas).Include(f => f.Adjuntos)
            .AsSplitQuery()
            .FirstOrDefaultAsync(f => f.OrdenTrabajoId == ordenId, ct);

    private async Task<FichaDiagnosis?> CargarOCrear(int ordenId, CancellationToken ct)
    {
        var ficha = await Cargar(ordenId, ct);
        if (ficha is not null)
        {
            return ficha;
        }
        if (!await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct))
        {
            return null;
        }
        ficha = new FichaDiagnosis { OrdenTrabajoId = ordenId, FechaActualizacion = DateTimeOffset.UtcNow };
        db.FichasDiagnosis.Add(ficha);
        return ficha;
    }

    /// <summary>Normaliza los códigos ("p 0401" → "P0401"), quita repetidos y completa la descripción desde la biblioteca.</summary>
    private async Task<List<CodigoLeido>> CodigosAsync(IEnumerable<CodigoLeidoRequest> codigos, CancellationToken ct)
    {
        var resultado = new List<CodigoLeido>();
        foreach (var c in codigos)
        {
            var codigo = DecodificadorObd.Normalizar(c.Codigo) ?? Normalizar.Codigo(c.Codigo);
            if (codigo is null || resultado.Any(r => r.Codigo == codigo))
            {
                continue;
            }
            var descripcion = Normalizar.Texto(c.Descripcion) ?? (await historial.DescribirAsync(codigo, ct)).Descripcion;
            resultado.Add(new CodigoLeido { Codigo = codigo, Descripcion = descripcion, Estado = c.Estado, Nota = Normalizar.Texto(c.Nota) });
        }
        return resultado;
    }

    private static FichaDiagnosisDto FichaVacia(int ordenId) => new(ordenId, null, null, null, [], [], [], []);

    public static FichaDiagnosisDto ToDto(FichaDiagnosis f) => new(
        f.OrdenTrabajoId, f.Sintomas, f.Conclusion, f.FechaActualizacion,
        f.Codigos.OrderBy(c => c.Id).Select(c => new CodigoLeidoDto(c.Codigo, c.Descripcion, c.Estado, c.Nota)).ToList(),
        f.Mediciones.OrderBy(m => m.Id).Select(m => new MedicionDto(m.Parametro, m.Valor, m.Unidad, m.ValorEsperado, m.Resultado, m.Nota, m.ValorReferenciaId)).ToList(),
        f.Pruebas.OrderBy(p => p.Id).Select(p => new PruebaDto(p.Descripcion, p.Resultado)).ToList(),
        f.Adjuntos.OrderBy(a => a.Id).Select(a => new AdjuntoDto(a.Id, a.NombreOriginal, a.TipoContenido, a.Tamano, a.Fecha, a.VisibleCliente)).ToList());
}
