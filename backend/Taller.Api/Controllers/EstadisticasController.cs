using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

public record ResumenVisitas(
    DateOnly Desde, DateOnly Hasta, int Paginas, int Visitantes, int VisitantesEspana, double PorcentajeMovil, bool Geolocalizacion,
    IReadOnlyList<VisitasComunidad> Comunidades, IReadOnlyList<VisitasCiudad> Ciudades, IReadOnlyList<VisitasPais> Paises,
    IReadOnlyList<VisitasDia> Dias, IReadOnlyList<VisitasPagina> PaginasMasVistas, IReadOnlyList<VisitasOrigen> Origenes);

public record VisitasComunidad(string Codigo, string Nombre, int Visitantes, int Paginas);
public record VisitasCiudad(string Ciudad, string? Region, double Latitud, double Longitud, int Visitantes, int Paginas);
public record VisitasPais(string Pais, int Visitantes);
public record VisitasDia(DateOnly Fecha, int Visitantes, int Paginas);
public record VisitasPagina(string Ruta, int Paginas);
public record VisitasOrigen(string Origen, int Visitantes);

/// <summary>Estadísticas de visitas a la web (sin datos personales: zona aproximada y huella diaria).</summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/estadisticas")]
public class EstadisticasController(TallerDbContext db, Geolocalizador geo) : ControllerBase
{
    /// <summary>
    /// Visitas del periodo (por defecto, los últimos 30 días). tipo: Publico (por defecto: visitantes sin sesión),
    /// Cliente, Taller o todos. Un visitante único es una huella distinta en un día.
    /// </summary>
    [HttpGet("visitas")]
    public async Task<ActionResult<ResumenVisitas>> Visitas([FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] string? tipo, CancellationToken ct)
    {
        var h = hasta ?? HoraTaller.Hoy();
        var d = desde ?? h.AddDays(-29);
        if (h < d)
        {
            ModelState.AddModelError(nameof(hasta), "La fecha final no puede ser anterior a la inicial.");
            return ValidationProblem(ModelState);
        }
        var query = db.Visitas.AsNoTracking().Where(v => v.Fecha >= HoraTaller.InicioDe(d) && v.Fecha < HoraTaller.InicioDe(h.AddDays(1)));
        if (!string.Equals(tipo, "todos", StringComparison.OrdinalIgnoreCase))
        {
            var t = Enum.TryParse<TipoVisitante>(tipo, true, out var elegido) ? elegido : TipoVisitante.Publico;
            query = query.Where(v => v.Tipo == t);
        }
        var visitas = await query.Select(v => new { v.Fecha, v.Ruta, v.Visitante, v.Movil, v.Pais, v.Region, v.Ciudad, v.Latitud, v.Longitud, v.Origen })
            .ToListAsync(ct);

        // Un visitante = una huella en un día (la huella cambia cada día).
        var conDia = visitas.Select(v => new { v, Dia = HoraTaller.FechaDe(v.Fecha), Clave = $"{HoraTaller.FechaDe(v.Fecha):yyyyMMdd}|{v.Visitante}" }).ToList();
        int Unicos<T>(IEnumerable<T> xs, Func<T, string> clave) => xs.Select(clave).Distinct().Count();

        var espana = conDia.Where(x => x.v.Pais == "ES").ToList();
        var comunidades = espana.Where(x => x.v.Region is not null)
            .GroupBy(x => x.v.Region!)
            .Select(g => new VisitasComunidad(g.Key, Geolocalizador.NombresComunidades.GetValueOrDefault(g.Key, g.Key), Unicos(g, x => x.Clave), g.Count()))
            .OrderByDescending(x => x.Visitantes).ToList();
        var ciudades = espana.Where(x => x.v.Ciudad is not null && x.v.Latitud is not null && x.v.Longitud is not null)
            .GroupBy(x => (x.v.Ciudad!, x.v.Region))
            .Select(g => new VisitasCiudad(g.Key.Item1, g.Key.Region, g.Average(x => x.v.Latitud!.Value), g.Average(x => x.v.Longitud!.Value), Unicos(g, x => x.Clave), g.Count()))
            .OrderByDescending(x => x.Visitantes).Take(40).ToList();
        var paises = conDia.GroupBy(x => x.v.Pais ?? "??")
            .Select(g => new VisitasPais(g.Key, Unicos(g, x => x.Clave)))
            .OrderByDescending(x => x.Visitantes).Take(15).ToList();
        var dias = Enumerable.Range(0, h.DayNumber - d.DayNumber + 1).Select(i => d.AddDays(i))
            .Select(dia => { var del = conDia.Where(x => x.Dia == dia).ToList(); return new VisitasDia(dia, Unicos(del, x => x.Clave), del.Count); })
            .ToList();
        var paginas = conDia.GroupBy(x => x.v.Ruta).Select(g => new VisitasPagina(g.Key, g.Count())).OrderByDescending(x => x.Paginas).Take(10).ToList();
        var origenes = conDia.Where(x => x.v.Origen is not null).GroupBy(x => x.v.Origen!)
            .Select(g => new VisitasOrigen(g.Key, Unicos(g, x => x.Clave))).OrderByDescending(x => x.Visitantes).Take(10).ToList();
        var unicos = conDia.GroupBy(x => x.Clave).Select(g => g.First()).ToList();

        return new ResumenVisitas(
            d, h, visitas.Count, unicos.Count, Unicos(espana, x => x.Clave),
            unicos.Count == 0 ? 0 : Math.Round(100.0 * unicos.Count(x => x.v.Movil) / unicos.Count, 1),
            geo.Disponible, comunidades, ciudades, paises, dias, paginas, origenes);
    }
}
