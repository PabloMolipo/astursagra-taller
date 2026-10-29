using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Integraciones;

namespace Taller.Api.Contracts;

/// <summary>Cálculos de la visión 360 que comparten la ficha del taller y el área del cliente.</summary>
public static class ResumenVehiculo
{
    /// <summary>Datos técnicos de la última consulta de la matrícula que se haya hecho (MatriculaAPI), si la hay.</summary>
    public static async Task<DatosTecnicosVehiculo?> TecnicosAsync(TallerDbContext db, string? matricula, CancellationToken ct)
    {
        if (matricula is null)
        {
            return null;
        }
        var consulta = await db.ConsultasMatricula.AsNoTracking()
            .Where(c => c.Matricula == matricula).OrderByDescending(c => c.Fecha).FirstOrDefaultAsync(ct);
        if (consulta is null)
        {
            return null;
        }
        var d = ClienteMatriculaApi.Interpretar(consulta.Respuesta);
        return new DatosTecnicosVehiculo(d.Variante ?? d.Descripcion, d.Combustible, d.Cilindrada, d.PotenciaCv, d.FechaMatriculacion, consulta.Fecha);
    }

    /// <summary>Lecturas de kilómetros (u horas, en tractores y maquinaria) de cada visita y el uso anual estimado.</summary>
    public static UsoResumen Uso(Vehiculo v, IReadOnlyList<OrdenTrabajo> ordenes)
    {
        var horas = v.Tipo is TipoVehiculo.Tractor or TipoVehiculo.MaquinariaAgricola;
        var puntos = ordenes
            .Select(o => (o.FechaEntrada, Valor: horas ? o.HorasEntrada : o.KilometrosEntrada))
            .Where(p => p.Valor is > 0)
            .Select(p => new PuntoUso(p.FechaEntrada, p.Valor!.Value))
            .ToList();
        var actual = horas ? v.Horas : v.Kilometros;
        if (actual is > 0 && (puntos.Count == 0 || actual > puntos[^1].Valor))
        {
            puntos.Add(new PuntoUso(DateTimeOffset.UtcNow, actual.Value));
        }

        int? porAnio = null;
        if (puntos.Count >= 2)
        {
            var anios = (puntos[^1].Fecha - puntos[0].Fecha).TotalDays / 365.25;
            var diferencia = puntos[^1].Valor - puntos[0].Valor;
            var redondeo = horas ? 10 : 500;
            if (anios >= 0.25 && diferencia > 0)
            {
                porAnio = (int)Math.Round(diferencia / anios / redondeo) * redondeo;
            }
        }
        return new UsoResumen(horas, actual ?? puntos.LastOrDefault()?.Valor, puntos, porAnio);
    }
}
