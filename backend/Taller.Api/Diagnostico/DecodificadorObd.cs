using System.Text.RegularExpressions;

namespace Taller.Api.Diagnostico;

/// <summary>
/// Interpreta cualquier código OBD-II por su estructura (SAE J2012): letra = sistema, primer dígito = genérico o de
/// fabricante, segundo dígito = subsistema. Sirve cuando el código no está en la biblioteca.
/// </summary>
public static partial class DecodificadorObd
{
    [GeneratedRegex("^[PCBU][0-3][0-9A-F]{3}$")]
    private static partial Regex Formato();

    public record Estructura(string Codigo, string Sistema, string Origen, string? Subsistema)
    {
        public string Descripcion => Subsistema is null ? $"{Sistema} ({Origen})" : $"{Sistema} · {Subsistema} ({Origen})";
    }

    /// <summary>"p 0401" → "P0401". Devuelve null si no tiene formato de código OBD.</summary>
    public static string? Normalizar(string? texto)
    {
        var codigo = new string((texto ?? "").Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
        return Formato().IsMatch(codigo) ? codigo : null;
    }

    public static Estructura? Interpretar(string? texto)
    {
        var codigo = Normalizar(texto);
        if (codigo is null)
        {
            return null;
        }

        var letra = codigo[0];
        var tipo = codigo[1];
        var sub = codigo[2];

        var sistema = letra switch
        {
            'P' => "Motor y transmisión",
            'C' => "Chasis",
            'B' => "Carrocería",
            _ => "Red de comunicaciones"
        };

        var origen = (letra, tipo) switch
        {
            ('P', '0') or ('P', '2') => "genérico",
            ('P', '1') => "de fabricante",
            ('P', '3') => "genérico o de fabricante",
            (_, '0') or (_, '3') => "genérico",
            _ => "de fabricante"
        };

        string? subsistema = letra == 'P' && tipo is '0' or '2'
            ? sub switch
            {
                '0' => "Aire y combustible, distribución variable y sobrealimentación",
                '1' or '2' => "Medición de aire y combustible",
                '3' => "Encendido y fallos de encendido",
                '4' => "Control auxiliar de emisiones (EGR, catalizador, EVAP, FAP)",
                '5' => "Velocidad, ralentí y entradas auxiliares",
                '6' => "Centralita y salidas auxiliares",
                '7' or '8' or '9' => "Transmisión",
                'A' => "Propulsión híbrida / eléctrica",
                _ => null
            }
            : null;

        return new Estructura(codigo, sistema, origen, subsistema);
    }
}
