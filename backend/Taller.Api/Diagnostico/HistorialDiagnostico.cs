using Microsoft.EntityFrameworkCore;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Diagnostico;

/// <summary>
/// Consultas sobre la experiencia acumulada del taller: casos por código y casos parecidos.
/// La usan la biblioteca de códigos y las herramientas del asistente. Nunca devuelve datos del cliente.
/// </summary>
public class HistorialDiagnostico(TallerDbContext db)
{
    /// <summary>Descripción de un código: la de la biblioteca o, si no está, la interpretación estructural.</summary>
    public async Task<(string Descripcion, string? Sistema, CodigoAveria? Entrada)> DescribirAsync(string codigo, CancellationToken ct)
    {
        var entrada = await db.CodigosAveria.AsNoTracking().FirstOrDefaultAsync(c => c.Codigo == codigo, ct);
        if (entrada is not null)
        {
            return (entrada.Descripcion, entrada.Sistema, entrada);
        }
        var estructura = DecodificadorObd.Interpretar(codigo);
        return (estructura?.Descripcion ?? "Código desconocido", estructura?.Sistema, null);
    }

    public async Task<IReadOnlyList<CasoTaller>> CasosPorCodigoAsync(string codigo, int maximo, CancellationToken ct)
    {
        var ordenes = await db.CodigosLeidos.AsNoTracking()
            .Where(c => c.Codigo == codigo)
            .Join(db.FichasDiagnosis, c => c.FichaDiagnosisId, f => f.Id, (c, f) => f.OrdenTrabajoId)
            .Distinct()
            .ToListAsync(ct);

        return await CasosAsync(db.OrdenesTrabajo.Where(o => ordenes.Contains(o.Id)), maximo, ct);
    }

    /// <summary>
    /// Casos parecidos: comparten algún código, o el motivo/diagnóstico/conclusión contiene alguna de las palabras clave.
    /// Los de la misma marca o tipo de vehículo salen primero.
    /// </summary>
    public async Task<IReadOnlyList<CasoTaller>> CasosSimilaresAsync(
        IReadOnlyList<string> palabras, IReadOnlyList<string> codigos, string? marca, TipoVehiculo? tipo, int? excluirOrdenId, int maximo, CancellationToken ct)
    {
        var porCodigo = codigos.Count == 0
            ? []
            : await db.CodigosLeidos.AsNoTracking()
                .Where(c => codigos.Contains(c.Codigo))
                .Join(db.FichasDiagnosis, c => c.FichaDiagnosisId, f => f.Id, (c, f) => f.OrdenTrabajoId)
                .Distinct()
                .ToListAsync(ct);

        var query = db.OrdenesTrabajo.AsNoTracking().Where(o => o.Id != excluirOrdenId);
        var patrones = palabras.Where(p => p.Length >= 3).Select(p => $"%{p.Trim()}%").Take(8).ToList();

        // (código coincidente) OR (alguna palabra en motivo o diagnóstico)
        var candidatas = await query
            .Where(o => porCodigo.Contains(o.Id) || patrones.Any(p =>
                EF.Functions.ILike(o.MotivoEntrada, p) || EF.Functions.ILike(o.Diagnostico!, p)))
            .Select(o => new { o.Id, o.Vehiculo.Marca, o.Vehiculo.Tipo, o.FechaEntrada })
            .ToListAsync(ct);

        var ordenadas = candidatas
            .OrderByDescending(c => porCodigo.Contains(c.Id))
            .ThenByDescending(c => marca is not null && string.Equals(c.Marca, marca, StringComparison.OrdinalIgnoreCase))
            .ThenByDescending(c => tipo is not null && c.Tipo == tipo)
            .ThenByDescending(c => c.FechaEntrada)
            .Take(maximo)
            .Select(c => c.Id)
            .ToList();

        var casos = await CasosAsync(db.OrdenesTrabajo.Where(o => ordenadas.Contains(o.Id)), maximo, ct);
        return casos.OrderBy(c => ordenadas.IndexOf(c.OrdenId)).ToList();
    }

    private async Task<IReadOnlyList<CasoTaller>> CasosAsync(IQueryable<OrdenTrabajo> ordenes, int maximo, CancellationToken ct)
    {
        var datos = await ordenes.AsNoTracking()
            .OrderByDescending(o => o.FechaEntrada)
            .Take(maximo)
            .Select(o => new
            {
                o.Id,
                o.FechaEntrada,
                o.Vehiculo.Marca,
                o.Vehiculo.Modelo,
                o.Vehiculo.Tipo,
                o.Estado,
                o.MotivoEntrada,
                o.Diagnostico,
                Trabajos = o.Lineas.OrderBy(l => l.Id).Select(l => l.Descripcion).ToList()
            })
            .ToListAsync(ct);

        var ids = datos.Select(d => d.Id).ToList();
        var fichas = await db.FichasDiagnosis.AsNoTracking()
            .Where(f => ids.Contains(f.OrdenTrabajoId))
            .Select(f => new { f.OrdenTrabajoId, f.Conclusion, Codigos = f.Codigos.Select(c => c.Codigo).ToList() })
            .ToDictionaryAsync(f => f.OrdenTrabajoId, ct);

        return datos.Select(d =>
        {
            fichas.TryGetValue(d.Id, out var f);
            return new CasoTaller(
                d.Id, d.FechaEntrada, $"{d.Marca} {d.Modelo}".Trim(), d.Tipo, d.Estado, d.MotivoEntrada, d.Diagnostico,
                f?.Conclusion, f?.Codigos ?? [], d.Trabajos);
        }).ToList();
    }
}
