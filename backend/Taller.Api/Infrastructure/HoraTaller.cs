namespace Taller.Api.Infrastructure;

/// <summary>Fechas en la hora del taller (España peninsular), aunque el servidor esté en UTC.</summary>
public static class HoraTaller
{
    public static readonly TimeZoneInfo Zona = TimeZoneInfo.FindSystemTimeZoneById("Europe/Madrid");

    public static DateOnly Hoy() => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, Zona).DateTime);

    /// <summary>Instante (UTC) en que empieza ese día en la hora del taller.</summary>
    public static DateTimeOffset InicioDe(DateOnly fecha)
    {
        var local = fecha.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        return new DateTimeOffset(local, Zona.GetUtcOffset(local)).ToUniversalTime();
    }

    public static DateOnly FechaDe(DateTimeOffset instante) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instante, Zona).DateTime);

    /// <summary>
    /// El día indicado con la hora de <paramref name="referencia"/> (o la actual): así una entrada con fecha corregida
    /// conserva un orden razonable entre las del mismo día.
    /// </summary>
    public static DateTimeOffset ConFecha(DateOnly fecha, DateTimeOffset? referencia = null)
    {
        var hora = TimeZoneInfo.ConvertTime(referencia ?? DateTimeOffset.UtcNow, Zona).TimeOfDay;
        var local = fecha.ToDateTime(TimeOnly.FromTimeSpan(hora), DateTimeKind.Unspecified);
        return new DateTimeOffset(local, Zona.GetUtcOffset(local)).ToUniversalTime();
    }
}
