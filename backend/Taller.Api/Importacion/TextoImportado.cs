using System.Globalization;
using System.Text;
using Taller.Api.Domain;

namespace Taller.Api.Importacion;

public static class TextoImportado
{
    /// <summary>Clave de comparación: minúsculas, sin tildes y con los espacios normalizados.</summary>
    public static string Clave(string texto)
    {
        var sinTildes = new StringBuilder();
        foreach (var c in texto.Normalize(NormalizationForm.FormD))
        {
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
            {
                sinTildes.Append(c);
            }
        }
        return string.Join(' ', sinTildes.ToString().ToLowerInvariant().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    /// <summary>"padre ruben" → "Padre ruben" (solo la primera letra, para no estropear siglas).</summary>
    public static string Capitalizar(string texto)
    {
        var limpio = string.Join(' ', texto.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
        return limpio.Length == 0 ? limpio : char.ToUpper(limpio[0], CultureInfo.GetCultureInfo("es-ES")) + limpio[1..];
    }

    public static int Distancia(string a, string b)
    {
        var d = new int[a.Length + 1, b.Length + 1];
        for (var i = 0; i <= a.Length; i++) d[i, 0] = i;
        for (var j = 0; j <= b.Length; j++) d[0, j] = j;
        for (var i = 1; i <= a.Length; i++)
        {
            for (var j = 1; j <= b.Length; j++)
            {
                var coste = a[i - 1] == b[j - 1] ? 0 : 1;
                d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + coste);
            }
        }
        return d[a.Length, b.Length];
    }

    private static readonly (TipoServicio Servicio, string[] Claves)[] PalabrasServicio =
    [
        (TipoServicio.Programacion, ["repro", "program", "centralita", "codific", "anula", "calibra", "adblue", "stage", "st1"]),
        (TipoServicio.Diagnosis, ["diagnos", "comprob", "evalua", "revisar", "revision ruido"]),
        (TipoServicio.Electromecanica, ["electric", "electron", "sensor", "luces", "luz", "bombill", "alternador", "arranque",
            "bateria", "rele", "cable", "modulo", "calentador", "inyecc", "nox", "elevaluna", "cierre", "optica", "faro",
            "motor maletero", "caudalimetro", "corriente"]),
        (TipoServicio.ChapaPintura, ["chapa", "pintura", "golpe", "parachoques", "aleta", "abolladura", "pulido", "parrilla"]),
        (TipoServicio.Mantenimiento, ["mantenimiento", "aceite", "filtro", "itv", "anticongelante", "escobilla"]),
        (TipoServicio.Mecanica, ["distribucion", "embrague", "freno", "pastilla", "disco", "culata", "bomba", "cardan",
            "rodamiento", "amortigu", "palier", "direccion", "turbo", "caja", "diferencial", "escape", "junta", "soporte",
            "taco", "correa", "radiador", "termostato", "suspension", "motor", "copela", "silemblock", "dpf", "fap", "egr",
            "transfer", "manguito", "fuga", "convertidor", "trapecio", "trapezio", "rotula", "volante", "cojinete", "buje",
            "enfriador", "compresor", "regulador", "cadena", "biela", "colector", "colecor", "racor"])
    ];

    /// <summary>Deduce los tipos de servicio por palabras clave del concepto. Si no encaja nada, Mecánica.</summary>
    public static List<TipoServicio> Servicios(string concepto)
    {
        var clave = Clave(concepto);
        var servicios = PalabrasServicio
            .Where(p => p.Claves.Any(clave.Contains))
            .Select(p => p.Servicio)
            .ToList();
        return servicios.Count > 0 ? servicios : [TipoServicio.Mecanica];
    }
}
