using System.Buffers.Binary;
using System.Text;
using System.Text.RegularExpressions;
using Taller.Api.Domain;

namespace Taller.Api.Centralitas;

public record IdentificacionCentralita(string? Familia, string? Hardware, string? Software, string? Referencia);

/// <summary>Mapa encontrado en el binario; <see cref="Filas"/> = 1 en las curvas (un solo eje).</summary>
public record MapaDetectado(int Direccion, int Columnas, int Filas, bool BigEndian, bool ConSigno, bool PorColumnas, int EjeXDireccion, int? EjeYDireccion);

/// <summary>
/// Análisis de un volcado de centralita sin archivo de definición (A2L, XDF…): identificación por las cadenas de texto
/// y búsqueda de mapas con la estructura habitual de Bosch (EDC15/16/17, MED9/17, MD1, MG1): número de puntos de cada
/// eje en 16 bits (juntos al principio, o cada uno delante de su eje), los ejes (estrictamente crecientes) y a
/// continuación los valores, por filas o por columnas. Se prueban los dos órdenes de
/// bytes (Tricore guarda en little endian; PowerPC y C167 en big endian). Los valores salen en bruto: sin definición
/// no se sabe su nombre, unidad ni factor.
/// </summary>
public static partial class AnalizadorBinario
{
    public const int MaximoMapas = 5000;
    private const int MaximoPuntos = 32;

    // Números de Bosch: hardware 0 281 / 0 261 xxx xxx (diésel / gasolina) y software 1037 / 1039 xxxxxx.
    [GeneratedRegex(@"(?<![0-9])0 ?2[68]1 ?[0-9]{3} ?[0-9]{3}(?![0-9])")]
    private static partial Regex HardwareBosch();

    [GeneratedRegex(@"(?<![0-9])10[34][79][0-9]{6}(?![0-9])")]
    private static partial Regex SoftwareBosch();

    [GeneratedRegex(@"\b(EDC1[5-7][A-Z]{0,2}[0-9]{0,3}|MEDC17[0-9.]*|MEVD17[0-9.]*|MED?1[5-7][0-9.]*[A-Z0-9]*|ME7[0-9.]+[A-Z0-9]*|M[DG]1C[PS][0-9]{3}|SIMOS ?[0-9]{1,2}(?:\.[0-9]+)?|SID ?[0-9]{3}|PCR ?2\.1|DCM ?[0-9]\.[0-9]+[A-Z]?|EMS ?[0-9]{4})\b", RegexOptions.IgnoreCase)]
    private static partial Regex Familia();

    // Referencia de pieza del grupo VAG: 03L906018JL, 8E0907401, 04L907309…
    [GeneratedRegex(@"\b[0-9][0-9A-Z]{2} ?9(?:06|07|27) ?[0-9]{3} ?[A-Z]{0,3}\b")]
    private static partial Regex ReferenciaVag();

    /// <summary>Cadenas de texto legibles (ASCII imprimible) de al menos <paramref name="minimo"/> caracteres.</summary>
    public static IReadOnlyList<(int Direccion, string Texto)> Cadenas(ReadOnlySpan<byte> datos, int minimo = 6, int maximo = 2000)
    {
        var cadenas = new List<(int, string)>();
        var inicio = -1;
        for (var i = 0; i <= datos.Length && cadenas.Count < maximo; i++)
        {
            var imprimible = i < datos.Length && datos[i] is >= 0x20 and < 0x7F;
            if (imprimible)
            {
                if (inicio < 0) inicio = i;
                continue;
            }
            if (inicio >= 0 && i - inicio >= minimo)
            {
                var texto = Encoding.ASCII.GetString(datos[inicio..Math.Min(i, inicio + 200)]).Trim();
                // Descarta rellenos ("        ", "UUUUUU") y ruido sin letras ni cifras.
                if (texto.Length >= minimo && texto.Distinct().Count() > 2 && texto.Any(char.IsLetterOrDigit))
                {
                    cadenas.Add((inicio, texto));
                }
            }
            inicio = -1;
        }
        return cadenas;
    }

    public static IdentificacionCentralita Identificar(ReadOnlySpan<byte> datos)
    {
        string? familia = null, hardware = null, software = null, referencia = null;
        foreach (var (_, texto) in Cadenas(datos, 5, 20000))
        {
            familia ??= Familia().Match(texto) is { Success: true } f ? f.Value.ToUpperInvariant().Replace(" ", "") : null;
            hardware ??= HardwareBosch().Match(texto) is { Success: true } h ? h.Value.Replace(" ", "") : null;
            software ??= SoftwareBosch().Match(texto) is { Success: true } s ? s.Value : null;
            referencia ??= ReferenciaVag().Match(texto) is { Success: true } r ? r.Value.Replace(" ", "") : null;
            if (familia is not null && hardware is not null && software is not null && referencia is not null)
            {
                break;
            }
        }
        return new(familia, hardware, software, referencia);
    }

    public static IReadOnlyList<MapaDetectado> DetectarMapas(ReadOnlySpan<byte> datos)
    {
        var mapas = new List<MapaDetectado>();
        var i = 0;
        while (i + 8 <= datos.Length && mapas.Count < MaximoMapas)
        {
            var mapa = Mapa(datos, i, bigEndian: false) ?? Mapa(datos, i, bigEndian: true)
                ?? MapaIntercalado(datos, i, bigEndian: false) ?? MapaIntercalado(datos, i, bigEndian: true)
                ?? Curva(datos, i, bigEndian: false) ?? Curva(datos, i, bigEndian: true);
            if (mapa is null)
            {
                i += 2;
                continue;
            }
            mapas.Add(mapa);
            i = mapa.Direccion + mapa.Columnas * mapa.Filas * 2;
        }
        return mapas;
    }

    private static int Leer(ReadOnlySpan<byte> d, int i, bool be) =>
        be ? BinaryPrimitives.ReadUInt16BigEndian(d[i..]) : BinaryPrimitives.ReadUInt16LittleEndian(d[i..]);

    /// <summary>[nx][ny][eje X: nx][eje Y: ny][valores: ny filas × nx columnas], todo en 16 bits.</summary>
    private static MapaDetectado? Mapa(ReadOnlySpan<byte> d, int i, bool bigEndian)
    {
        var nx = Leer(d, i, bigEndian);
        var ny = Leer(d, i + 2, bigEndian);
        if (nx is < 3 or > MaximoPuntos || ny is < 3 or > MaximoPuntos)
        {
            return null;
        }
        var ejeX = i + 4;
        var ejeY = ejeX + nx * 2;
        var valores = ejeY + ny * 2;
        if (valores + nx * ny * 2 > d.Length || !EjeValido(d, ejeX, nx, bigEndian) || !EjeValido(d, ejeY, ny, bigEndian)
            || TipoValores(d, valores, nx, ny, bigEndian) is not { } lectura)
        {
            return null;
        }
        return new(valores, nx, ny, bigEndian, lectura.ConSigno, lectura.PorColumnas, ejeX, ejeY);
    }

    /// <summary>[nx][eje X: nx][ny][eje Y: ny][valores] (EDC15 y algunas EDC16): cada eje lleva delante su número de puntos.</summary>
    private static MapaDetectado? MapaIntercalado(ReadOnlySpan<byte> d, int i, bool bigEndian)
    {
        var nx = Leer(d, i, bigEndian);
        if (nx is < 3 or > MaximoPuntos || i + 4 + nx * 2 > d.Length)
        {
            return null;
        }
        var ejeX = i + 2;
        var ny = Leer(d, ejeX + nx * 2, bigEndian);
        if (ny is < 3 or > MaximoPuntos)
        {
            return null;
        }
        var ejeY = ejeX + nx * 2 + 2;
        var valores = ejeY + ny * 2;
        if (valores + nx * ny * 2 > d.Length || !EjeValido(d, ejeX, nx, bigEndian) || !EjeValido(d, ejeY, ny, bigEndian)
            || TipoValores(d, valores, nx, ny, bigEndian) is not { } lectura)
        {
            return null;
        }
        return new(valores, nx, ny, bigEndian, lectura.ConSigno, lectura.PorColumnas, ejeX, ejeY);
    }

    /// <summary>[n][eje: n][valores: n]. Más exigente que los mapas (las curvas cortas aparecen por casualidad).</summary>
    private static MapaDetectado? Curva(ReadOnlySpan<byte> d, int i, bool bigEndian)
    {
        var n = Leer(d, i, bigEndian);
        if (n is < 5 or > MaximoPuntos)
        {
            return null;
        }
        var eje = i + 2;
        var valores = eje + n * 2;
        if (valores + n * 2 > d.Length || !EjeValido(d, eje, n, bigEndian) || TipoValores(d, valores, n, 1, bigEndian) is not { } lectura)
        {
            return null;
        }
        return new(valores, n, 1, bigEndian, lectura.ConSigno, false, eje, null);
    }

    /// <summary>
    /// Estrictamente creciente (sin signo, o con signo: temperaturas bajo cero) y que no sea una simple numeración
    /// (0, 1, 2…), que aparece mucho en el código.
    /// </summary>
    private static bool EjeValido(ReadOnlySpan<byte> d, int inicio, int n, bool be)
    {
        bool creciente = true, crecienteConSigno = true;
        var anterior = Leer(d, inicio, be);
        for (var k = 1; k < n; k++)
        {
            var v = Leer(d, inicio + k * 2, be);
            creciente &= v > anterior;
            crecienteConSigno &= (short)v > (short)anterior;
            if (!creciente && !crecienteConSigno)
            {
                return false;
            }
            anterior = v;
        }
        var primero = Leer(d, inicio, be);
        var ultimo = Leer(d, inicio + (n - 1) * 2, be);
        var numeracion = creciente && ultimo - primero == n - 1;
        return !numeracion;
    }

    /// <summary>
    /// Cómo se leen los valores si parecen datos de un mapa; null si no lo parecen. Deben no ser constantes ni casi todo
    /// relleno (0x0000 / 0xFFFF) y ser suaves: poca diferencia entre celdas vecinas respecto al rango de valores (los
    /// datos al azar o el código no lo son). Se prueba con y sin signo (con signo son suaves los valores que cruzan el
    /// cero, como las correcciones) y guardados por filas o por columnas (cada punto del eje X con todos los de Y, como
    /// muchos mapas de EDC17); se queda la lectura más suave.
    /// </summary>
    private static (bool ConSigno, bool PorColumnas)? TipoValores(ReadOnlySpan<byte> d, int inicio, int columnas, int filas, bool be)
    {
        (bool, bool)? mejor = null;
        var minima = 0.2;
        foreach (var porColumnas in filas == 1 ? new[] { false } : new[] { false, true })
        {
            foreach (var conSigno in new[] { false, true })
            {
                if (Rugosidad(d, inicio, columnas, filas, be, conSigno, porColumnas) is { } r && r < minima)
                {
                    (mejor, minima) = ((conSigno, porColumnas), r);
                }
            }
        }
        return mejor;
    }

    /// <summary>Diferencia media entre celdas vecinas dividida por el rango; null si son constantes o casi todo relleno.</summary>
    private static double? Rugosidad(ReadOnlySpan<byte> d, int inicio, int columnas, int filas, bool be, bool conSigno, bool porColumnas)
    {
        int minimo = int.MaxValue, maximo = int.MinValue, relleno = 0;
        long saltos = 0;
        var comparaciones = 0;
        int Celda(ReadOnlySpan<byte> d, int f, int c, out bool esRelleno)
        {
            var bruto = Leer(d, inicio + (porColumnas ? c * filas + f : f * columnas + c) * 2, be);
            esRelleno = bruto is 0 or 0xFFFF;
            return conSigno ? (short)bruto : bruto;
        }
        for (var f = 0; f < filas; f++)
        {
            for (var c = 0; c < columnas; c++)
            {
                var v = Celda(d, f, c, out var esRelleno);
                minimo = Math.Min(minimo, v);
                maximo = Math.Max(maximo, v);
                if (esRelleno) relleno++;
                if (c > 0)
                {
                    saltos += Math.Abs(v - Celda(d, f, c - 1, out _));
                    comparaciones++;
                }
                if (f > 0)
                {
                    saltos += Math.Abs(v - Celda(d, f - 1, c, out _));
                    comparaciones++;
                }
            }
        }
        var rango = maximo - minimo;
        if (rango == 0 || relleno * 4 > columnas * filas * 3)
        {
            return null;
        }
        return saltos / (double)comparaciones / rango;
    }

    /// <summary>Nombre provisional de un mapa detectado: «Mapa 16×16 @ 0x1C2A40».</summary>
    public static string NombreProvisional(MapaDetectado m) =>
        $"{(m.Filas == 1 ? "Curva" : "Mapa")} {(m.Filas == 1 ? $"{m.Columnas}" : $"{m.Columnas}×{m.Filas}")} @ 0x{m.Direccion:X6}";

    public static MapaCentralita ToEntidad(MapaDetectado m) => new()
    {
        Nombre = NombreProvisional(m),
        Origen = OrigenMapa.Detectado,
        Direccion = m.Direccion,
        Columnas = m.Columnas,
        Filas = m.Filas,
        TipoDato = m.ConSigno ? TipoDatoMapa.I16 : TipoDatoMapa.U16,
        BigEndian = m.BigEndian,
        PorColumnas = m.PorColumnas,
        EjeXDireccion = m.EjeXDireccion,
        EjeXTipo = TipoDatoMapa.U16,
        EjeYDireccion = m.EjeYDireccion,
        EjeYTipo = TipoDatoMapa.U16
    };

    /// <summary>Bytes que ocupa cada valor.</summary>
    public static int Tamano(TipoDatoMapa tipo) => tipo switch
    {
        TipoDatoMapa.U8 or TipoDatoMapa.I8 => 1,
        TipoDatoMapa.U16 or TipoDatoMapa.I16 => 2,
        _ => 4
    };
}
