using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Taller.Api.Domain;

namespace Taller.Api.Centralitas;

public record ResultadoDefinicion(string? Titulo, long? TamanoEsperado, IReadOnlyList<MapaCentralita> Mapas, IReadOnlyList<string> Avisos);

/// <summary>
/// Lee un archivo de definición de TunerPro (XDF, XML): sus tablas (mapas y curvas) y constantes con dirección, tamaño,
/// tipo de dato, orden de bytes, fórmula, unidades y ejes (en el binario o con valores fijos). Solo se pueden guardar
/// las fórmulas lineales (factor y desplazamiento); las demás se dejan en las notas del mapa.
/// </summary>
public static partial class ImportadorXdf
{
    private const int MaximoMapas = 10000;

    // Indicadores de TunerPro (mmedtypeflags).
    private const int ConSigno = 0x01;
    private const int LsbPrimero = 0x02;
    private const int PorColumnas = 0x04;
    private const int ComaFlotante = 0x10000;

    public static ResultadoDefinicion Leer(Stream contenido)
    {
        // Sin DTD ni entidades externas: el archivo viene del usuario.
        using var lector = XmlReader.Create(contenido, new XmlReaderSettings { DtdProcessing = DtdProcessing.Prohibit, XmlResolver = null });
        var raiz = XDocument.Load(lector).Root;
        if (raiz is null || raiz.Name.LocalName != "XDFFORMAT")
        {
            throw new FormatException("No es un archivo XDF de TunerPro.");
        }

        var cabecera = raiz.Element("XDFHEADER");
        var defecto = cabecera?.Element("DEFAULTS");
        var base_ = BaseOffset(cabecera);
        var categorias = cabecera?.Elements("CATEGORY")
            .Select(c => (Indice: Entero(c.Attribute("index")?.Value), Nombre: c.Attribute("name")?.Value ?? ""))
            .Where(c => c.Indice is not null)
            .GroupBy(c => c.Indice!.Value).ToDictionary(g => g.Key, g => g.First().Nombre) ?? [];
        var predeterminado = new Formato(
            (int)(Entero(defecto?.Attribute("datasizeinbits")?.Value) ?? 8),
            defecto?.Attribute("signed")?.Value == "1",
            defecto?.Attribute("lsbfirst")?.Value == "1",
            defecto?.Attribute("float")?.Value == "1");

        var mapas = new List<MapaCentralita>();
        var avisos = new List<string>();
        foreach (var t in raiz.Elements("XDFTABLE").Concat(raiz.Elements("XDFCONSTANT")).Take(MaximoMapas))
        {
            var titulo = Normalizar(t.Element("title")?.Value) ?? "Sin nombre";
            var categoria = t.Elements("CATEGORYMEM").Select(c => Entero(c.Attribute("category")?.Value)).FirstOrDefault(c => c is not null);
            // En CATEGORYMEM la categoría va contando desde 1; en CATEGORY, desde 0.
            var nombreCategoria = categoria is { } n && categorias.TryGetValue(n - 1, out var nc) ? nc : null;
            try
            {
                var mapa = t.Name.LocalName == "XDFTABLE"
                    ? Tabla(t, titulo, base_, predeterminado, avisos)
                    : Constante(t, titulo, base_, predeterminado, avisos);
                if (mapa is null)
                {
                    continue;
                }
                mapa.Grupo = ClasificadorGrupos.Grupo($"{titulo} {nombreCategoria}");
                mapa.Notas = Unir(Normalizar(t.Element("description")?.Value), mapa.Notas, nombreCategoria is null ? null : $"Categoría XDF: {nombreCategoria}");
                mapas.Add(mapa);
            }
            catch (FormatException e)
            {
                avisos.Add($"«{titulo}»: {e.Message}");
            }
        }

        return new(Normalizar(cabecera?.Element("deftitle")?.Value),
            Entero(cabecera?.Elements("REGION").FirstOrDefault()?.Attribute("size")?.Value), mapas, avisos);
    }

    private record Formato(int Bits, bool ConSigno, bool LsbPrimero, bool ComaFlotante);

    private static MapaCentralita? Tabla(XElement t, string titulo, long base_, Formato defecto, List<string> avisos)
    {
        var ejes = t.Elements("XDFAXIS").ToDictionary(e => e.Attribute("id")?.Value ?? "", e => e);
        if (!ejes.TryGetValue("z", out var z) || z.Element("EMBEDDEDDATA") is not { } datos)
        {
            return null;
        }
        var filas = (int)(Entero(datos.Attribute("mmedrowcount")?.Value) ?? 1);
        var columnas = (int)(Entero(datos.Attribute("mmedcolcount")?.Value) ?? 1);
        if (filas is < 1 or > 256 || columnas is < 1 or > 256)
        {
            avisos.Add($"«{titulo}»: tamaño {columnas}×{filas} no admitido.");
            return null;
        }
        var (tipo, bigEndian, flags) = TipoDato(datos, defecto);
        var (factor, desplazamiento, nota) = Formula(z, titulo, avisos);
        var mapa = new MapaCentralita
        {
            Nombre = titulo[..Math.Min(titulo.Length, 200)],
            Origen = OrigenMapa.Manual,
            Direccion = Direccion(datos, base_),
            Columnas = columnas,
            Filas = filas,
            TipoDato = tipo,
            BigEndian = bigEndian,
            PorColumnas = filas > 1 && (flags & PorColumnas) != 0,
            Factor = factor,
            Desplazamiento = desplazamiento,
            Unidad = Unidad(z),
            Notas = nota
        };
        if (ejes.TryGetValue("x", out var x))
        {
            (mapa.EjeXDireccion, mapa.EjeXTipo, mapa.EjeXFactor, mapa.EjeXDesplazamiento, mapa.EjeXValores) = Eje(x, columnas, base_, defecto, titulo, avisos);
            mapa.EjeXUnidad = Unidad(x);
        }
        if (filas > 1 && ejes.TryGetValue("y", out var y))
        {
            (mapa.EjeYDireccion, mapa.EjeYTipo, mapa.EjeYFactor, mapa.EjeYDesplazamiento, mapa.EjeYValores) = Eje(y, filas, base_, defecto, titulo, avisos);
            mapa.EjeYUnidad = Unidad(y);
        }
        return mapa;
    }

    private static MapaCentralita? Constante(XElement t, string titulo, long base_, Formato defecto, List<string> avisos)
    {
        if (t.Element("EMBEDDEDDATA") is not { } datos)
        {
            return null;
        }
        var (tipo, bigEndian, _) = TipoDato(datos, defecto);
        var (factor, desplazamiento, nota) = Formula(t, titulo, avisos);
        return new MapaCentralita
        {
            Nombre = titulo[..Math.Min(titulo.Length, 200)],
            Origen = OrigenMapa.Manual,
            Direccion = Direccion(datos, base_),
            Columnas = 1,
            Filas = 1,
            TipoDato = tipo,
            BigEndian = bigEndian,
            Factor = factor,
            Desplazamiento = desplazamiento,
            Unidad = Unidad(t),
            Notas = nota
        };
    }

    /// <summary>Eje en el binario (dirección) o con valores fijos (LABEL); si no tiene ninguno, se numera 0, 1, 2…</summary>
    private static (int?, TipoDatoMapa, double, double, string?) Eje(XElement eje, int puntos, long base_, Formato defecto, string titulo, List<string> avisos)
    {
        var datos = eje.Element("EMBEDDEDDATA");
        var (tipo, _, _) = datos is null ? (TipoDatoMapa.U16, false, 0) : TipoDato(datos, defecto);
        if (datos?.Attribute("mmedaddress") is not null)
        {
            var (factor, desplazamiento, _) = Formula(eje, titulo, avisos);
            return (Direccion(datos, base_), tipo, factor, desplazamiento, null);
        }
        var etiquetas = eje.Elements("LABEL")
            .Select(l => (Indice: Entero(l.Attribute("index")?.Value) ?? -1, Valor: l.Attribute("value")?.Value?.Trim()))
            .Where(l => l.Indice >= 0 && l.Indice < puntos && !string.IsNullOrEmpty(l.Valor))
            .OrderBy(l => l.Indice).Select(l => l.Valor!.Replace(';', ',')).ToList();
        var valores = etiquetas.Count == puntos ? string.Join(';', etiquetas) : null;
        return (null, tipo, 1, 0, valores is { Length: <= 4000 } ? valores : null);
    }

    private static (TipoDatoMapa Tipo, bool BigEndian, long Flags) TipoDato(XElement datos, Formato defecto)
    {
        var bits = (int)(Entero(datos.Attribute("mmedelementsizebits")?.Value) ?? defecto.Bits);
        var flags = Entero(datos.Attribute("mmedtypeflags")?.Value)
            ?? ((defecto.ConSigno ? ConSigno : 0) | (defecto.LsbPrimero ? LsbPrimero : 0) | (defecto.ComaFlotante ? ComaFlotante : 0));
        var signo = (flags & ConSigno) != 0;
        var tipo = bits switch
        {
            8 => signo ? TipoDatoMapa.I8 : TipoDatoMapa.U8,
            16 => signo ? TipoDatoMapa.I16 : TipoDatoMapa.U16,
            32 when (flags & ComaFlotante) != 0 => TipoDatoMapa.F32,
            32 => signo ? TipoDatoMapa.I32 : TipoDatoMapa.U32,
            _ => throw new FormatException($"tamaño de dato de {bits} bits no admitido.")
        };
        return (tipo, (flags & LsbPrimero) == 0, flags);
    }

    private static int Direccion(XElement datos, long base_)
    {
        var direccion = (Entero(datos.Attribute("mmedaddress")?.Value) ?? 0) + base_;
        return direccion is >= 0 and <= int.MaxValue ? (int)direccion : throw new FormatException("dirección fuera de rango.");
    }

    /// <summary>Desplazamiento de las direcciones: &lt;BASEOFFSET offset subtract&gt; o &lt;baseoffset&gt; (versiones antiguas).</summary>
    private static long BaseOffset(XElement? cabecera)
    {
        if (cabecera?.Element("BASEOFFSET") is { } b)
        {
            var offset = Entero(b.Attribute("offset")?.Value) ?? 0;
            return b.Attribute("subtract")?.Value == "1" ? -offset : offset;
        }
        return Entero(cabecera?.Element("baseoffset")?.Value) ?? 0;
    }

    private static string? Unidad(XElement e) => Normalizar(e.Element("units")?.Value) is { } u ? u[..Math.Min(u.Length, 30)] : null;

    /// <summary>Factor y desplazamiento de la fórmula (MATH equation) si es lineal en X; si no, 1 y 0 con una nota.</summary>
    private static (double Factor, double Desplazamiento, string? Nota) Formula(XElement e, string titulo, List<string> avisos)
    {
        var ecuacion = e.Element("MATH")?.Attribute("equation")?.Value?.Trim();
        if (string.IsNullOrEmpty(ecuacion) || ecuacion == "X")
        {
            return (1, 0, null);
        }
        if (Formulas.Lineal(ecuacion) is { } lineal && lineal.Factor != 0)
        {
            return (lineal.Factor, lineal.Desplazamiento, null);
        }
        avisos.Add($"«{titulo}»: fórmula no lineal ({ecuacion}); se muestran los valores en bruto.");
        return (1, 0, $"Fórmula XDF (no lineal): {ecuacion}");
    }

    private static long? Entero(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto)) return null;
        var t = texto.Trim();
        return t.StartsWith("0x", StringComparison.OrdinalIgnoreCase)
            ? long.TryParse(t[2..], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var h) ? h : null
            : long.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d) ? d : null;
    }

    [GeneratedRegex(@"\s+")]
    private static partial Regex Espacios();

    private static string? Normalizar(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : Espacios().Replace(texto, " ").Trim();

    private static string? Unir(params string?[] partes)
    {
        var texto = string.Join("\n", partes.Where(p => !string.IsNullOrWhiteSpace(p)));
        return texto.Length == 0 ? null : texto[..Math.Min(texto.Length, 2000)];
    }
}

/// <summary>Fórmulas de conversión: reconoce las lineales (a·X + b) evaluándolas.</summary>
public static class Formulas
{
    /// <summary>Factor y desplazamiento si la expresión en X es lineal (+, −, ×, ÷, paréntesis, números); null si no.</summary>
    public static (double Factor, double Desplazamiento)? Lineal(string expresion)
    {
        double? F(double x) => Evaluar(expresion, x);
        if (F(0) is not { } f0 || F(1) is not { } f1 || F(2) is not { } f2 || F(1000) is not { } f1000)
        {
            return null;
        }
        var factor = f1 - f0;
        bool Cerca(double a, double b) => Math.Abs(a - b) <= 1e-9 * Math.Max(1, Math.Max(Math.Abs(a), Math.Abs(b)));
        return Cerca(f2, f0 + 2 * factor) && Cerca(f1000, f0 + 1000 * factor) ? (factor, f0) : null;
    }

    /// <summary>Evalúa la expresión con X = <paramref name="x"/>; null si tiene otras variables o no es válida.</summary>
    public static double? Evaluar(string expresion, double x)
    {
        var p = new Analizador(expresion, x);
        try
        {
            var v = p.Suma();
            return p.Fin && double.IsFinite(v) ? v : null;
        }
        catch (FormatException)
        {
            return null;
        }
    }

    private sealed class Analizador(string texto, double x)
    {
        private int i;

        public bool Fin
        {
            get
            {
                Saltar();
                return i >= texto.Length;
            }
        }

        public double Suma()
        {
            var v = Producto();
            while (true)
            {
                Saltar();
                if (Toma('+')) v += Producto();
                else if (Toma('-')) v -= Producto();
                else return v;
            }
        }

        private double Producto()
        {
            var v = Unario();
            while (true)
            {
                Saltar();
                if (Toma('*')) v *= Unario();
                else if (Toma('/')) v /= Unario();
                else return v;
            }
        }

        private double Unario()
        {
            Saltar();
            if (Toma('-')) return -Unario();
            if (Toma('+')) return Unario();
            if (Toma('('))
            {
                var v = Suma();
                Saltar();
                return Toma(')') ? v : throw new FormatException();
            }
            if (i < texto.Length && (texto[i] == 'X' || texto[i] == 'x') && (i + 1 >= texto.Length || !char.IsLetterOrDigit(texto[i + 1])))
            {
                i++;
                return x;
            }
            var inicio = i;
            while (i < texto.Length && (char.IsDigit(texto[i]) || texto[i] == '.' || ((texto[i] == 'e' || texto[i] == 'E') && i > inicio)))
            {
                // Exponente con signo: 1.5e-005.
                i += (texto[i] == 'e' || texto[i] == 'E') && i + 1 < texto.Length && (texto[i + 1] == '-' || texto[i + 1] == '+') ? 2 : 1;
            }
            return i > inicio && double.TryParse(texto[inicio..i], NumberStyles.Float, CultureInfo.InvariantCulture, out var n) ? n : throw new FormatException();
        }

        private bool Toma(char c)
        {
            if (i < texto.Length && texto[i] == c)
            {
                i++;
                return true;
            }
            return false;
        }

        private void Saltar()
        {
            while (i < texto.Length && char.IsWhiteSpace(texto[i])) i++;
        }
    }
}

/// <summary>
/// Grupo de un mapa por palabras clave de su nombre (español, inglés y abreviaturas de Bosch en alemán). Las claves de
/// hasta 3 letras solo cuentan al principio de una palabra (si no, «egr» estaría dentro de «integral»), y las marcadas con
/// «=» solo como palabra completa («par», pero no «park»). El orden importa: gana la primera regla que coincide.
/// </summary>
public static partial class ClasificadorGrupos
{
    private static readonly (GrupoMapa Grupo, string[] Claves)[] Reglas =
    [
        (GrupoMapa.Rail, ["rail", "mprop", "fuel pressure", "presión de combustible"]),
        (GrupoMapa.Turbo, ["turbo", "pcr", "boost", "ladedruck", "ldr", "wastegate", "vnt", "vgt", "n75", "charge pressure", "sobrealimenta"]),
        (GrupoMapa.Dpf, ["dpf", "fap", "soot", "russ", "regenera", "partikel", "hollín"]),
        (GrupoMapa.Egr, ["egr", "agr", "exhaust gas recirc"]),
        (GrupoMapa.Avance, ["spark", "ignition", "zünd", "zuend", "timing", "knock", "advance", "avance", "encendido", "picado"]),
        (GrupoMapa.Lambda, ["lambda", "afr", "air/fuel", "air fuel", "o2", "blm", "enrich", "enriquec", "mezcla"]),
        (GrupoMapa.Par, ["torque", "drehmoment", "trq", "=nm", "=par"]),
        (GrupoMapa.Limitadores, ["limit", "begrenz", "=rev", "vmax", "cutoff", "cut-off", "corte"]),
        (GrupoMapa.Inyeccion, ["inject", "inj", "fuel", "smoke", "rauch", "menge", "iq", "inyec", "humo", "soi", "pilot"])
    ];

    [GeneratedRegex(@"[^\p{L}\p{N}]+")]
    private static partial Regex Separadores();

    public static GrupoMapa? Grupo(string texto)
    {
        var t = texto.ToLowerInvariant();
        var palabras = Separadores().Split(t).Where(p => p.Length > 0).ToArray();
        foreach (var (grupo, claves) in Reglas)
        {
            if (claves.Any(c => Coincide(c, t, palabras)))
            {
                return grupo;
            }
        }
        return null;
    }

    private static bool Coincide(string clave, string texto, string[] palabras) => clave switch
    {
        ['=', .. var exacta] => palabras.Contains(exacta),
        { Length: <= 3 } => palabras.Any(p => p.StartsWith(clave, StringComparison.Ordinal)),
        _ => texto.Contains(clave, StringComparison.Ordinal)
    };
}
