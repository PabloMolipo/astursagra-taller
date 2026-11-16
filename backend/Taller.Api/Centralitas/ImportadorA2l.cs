using System.Buffers.Binary;
using System.Globalization;
using System.Text;
using Taller.Api.Domain;

namespace Taller.Api.Centralitas;

/// <summary>
/// Lee un archivo de descripción ASAP2 (A2L, estándar ASAM MCD-2 MC) y sitúa sus parámetros de calibración
/// (CHARACTERISTIC: mapas, curvas, valores y bloques) en un binario leído de la centralita.
/// <para>
/// Las direcciones del A2L son de la memoria de la centralita (p. ej. 0x80049E6C) y el binario empieza en otra: la base
/// se busca con el EPK (texto de identificación que el A2L dice dónde está) o, si no, probando los segmentos de memoria
/// y quedándose con la base en la que más ejes salen crecientes. Los ejes y los tamaños se leen del propio binario cuando
/// están en él (NO_AXIS_PTS), como hace el programa de calibración.
/// </para>
/// </summary>
public static class ImportadorA2l
{
    private const int MaximoMapas = 10000;
    private const int MaximoPuntos = 256;

    public static ResultadoDefinicion Leer(byte[] a2l, byte[] binario)
    {
        var modulo = Modulo.Leer(Texto(a2l));
        if (modulo.Caracteristicas.Count == 0)
        {
            throw new FormatException("No es un archivo A2L o no tiene parámetros (CHARACTERISTIC).");
        }

        var avisos = new List<string>(modulo.Avisos);
        var (base_, invertir, explicacion) = Base(modulo, binario);
        avisos.Insert(0, explicacion);

        var lector = new Lector(modulo, binario, base_, invertir);
        var mapas = new List<MapaCentralita>();
        var fuera = 0;
        var noAdmitidos = 0;
        var dudosos = 0;
        var funciones = new Dictionary<MapaCentralita, string>();
        // Primero los mapas, luego curvas, bloques y valores sueltos: si hay que recortar, se quedan fuera los valores.
        foreach (var c in modulo.Caracteristicas.OrderBy(c => Prioridad(c.Tipo)))
        {
            if (mapas.Count >= MaximoMapas)
            {
                avisos.Add($"Solo se importan los {MaximoMapas:N0} primeros parámetros (mapas y curvas primero): se quedan fuera {modulo.Caracteristicas.Count - mapas.Count - fuera - noAdmitidos:N0}.");
                break;
            }
            try
            {
                var mapa = lector.Mapa(c);
                if (mapa is null)
                {
                    fuera++;
                    continue;
                }
                if (!EjesCrecientes(binario, mapa))
                {
                    dudosos++;
                    mapa.Notas = $"⚠ Eje no creciente en este binario: el mapa puede estar sin usar o mal situado (A2L de otra versión).\n{mapa.Notas}".TrimEnd();
                    mapa.Notas = mapa.Notas[..Math.Min(mapa.Notas.Length, 2000)];
                }
                mapas.Add(mapa);
                if (modulo.Funciones.GetValueOrDefault(c.Nombre) is { } funcion)
                {
                    funciones[mapa] = funcion;
                }
            }
            catch (FormatException e)
            {
                noAdmitidos++;
                if (noAdmitidos <= 200)
                {
                    avisos.Add($"«{c.Nombre}»: {e.Message}");
                }
            }
        }
        if (fuera > 0)
        {
            avisos.Add($"{fuera:N0} parámetros están en direcciones que no entran en este binario (otra zona de memoria).");
        }
        if (noAdmitidos > 200)
        {
            avisos.Add($"… y otros {noAdmitidos - 200:N0} parámetros no admitidos.");
        }
        AgruparPorFuncion(funciones);
        var conEje = mapas.Count(m => m.EjeXDireccion is not null && m.Columnas >= 3);
        if (dudosos > 0)
        {
            // Unos pocos suelen ser mapas sin usar (ejes a cero); muchos, que el A2L es de otra versión.
            avisos.Insert(1, $"{dudosos:N0} de {conEje:N0} mapas y curvas tienen un eje que no sale creciente en este binario (marcados con ⚠ en sus notas)."
                + (dudosos > conEje * 0.05 ? " Son demasiados: comprueba que el A2L es de este número de software exacto." : ""));
        }
        return new(modulo.Titulo, null, mapas, avisos);
    }

    /// <summary>
    /// Los parámetros de una misma función de Bosch tratan de lo mismo: los que se quedaron sin grupo por su nombre toman
    /// el de su función si está claro, es decir, si al menos el 30 % de la función ya tiene grupo y dos tercios de esos
    /// coinciden. Las funciones grandes y variadas (diagnóstico, coordinación…) no lo cumplen y no contagian a nadie.
    /// </summary>
    private static void AgruparPorFuncion(Dictionary<MapaCentralita, string> funciones)
    {
        foreach (var funcion in funciones.GroupBy(f => f.Value, f => f.Key))
        {
            var votos = funcion.Where(m => m.Grupo is not null).GroupBy(m => m.Grupo!.Value).Select(g => (Grupo: g.Key, Votos: g.Count())).ToList();
            if (votos.Count == 0)
            {
                continue;
            }
            var (grupo, n) = votos.MaxBy(v => v.Votos);
            var conGrupo = votos.Sum(v => v.Votos);
            if (n >= 2 && n * 3 >= conGrupo * 2 && conGrupo * 10 >= funcion.Count() * 3)
            {
                foreach (var m in funcion.Where(m => m.Grupo is null))
                {
                    m.Grupo = grupo;
                }
            }
        }
    }

    /// <summary>Los ejes que están en el binario, con 3 puntos o más, salen crecientes (los de valores fijos no se miran).</summary>
    private static bool EjesCrecientes(byte[] binario, MapaCentralita m) =>
        (m.EjeXDireccion is not { } x || m.Columnas < 3 || Creciente(binario, x, m.Columnas, m.EjeXTipo, m.BigEndian))
        && (m.EjeYDireccion is not { } y || m.Filas < 3 || Creciente(binario, y, m.Filas, m.EjeYTipo, m.BigEndian));

    private static int Prioridad(string tipo) => tipo switch { "MAP" => 0, "CURVE" => 1, "VAL_BLK" => 2, _ => 3 };

    /// <summary>Los A2L suelen estar en Latin-1 (comentarios en alemán); si es UTF-8 válido, se lee como UTF-8.</summary>
    private static string Texto(byte[] a2l)
    {
        try
        {
            return new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(a2l).TrimStart('﻿');
        }
        catch (DecoderFallbackException)
        {
            return Encoding.Latin1.GetString(a2l);
        }
    }

    // ── Base de direcciones ───────────────────────────────────────────────────────────────────────────────────────

    /// <summary>Por debajo de esta proporción de ejes correctos, el A2L no es de este binario (otra versión de software).</summary>
    private const double MinimoCorrectos = 0.6;

    /// <summary>
    /// Prueba como base cada sitio donde está el EPK en el binario, las direcciones de inicio de los segmentos de memoria y
    /// las bases habituales, y se queda con la que da más ejes correctos (con un número de puntos posible y crecientes)
    /// en una muestra de mapas y curvas. Si ni la mejor base da suficientes, el A2L es de otra versión de software y no se
    /// importa: con las direcciones desplazadas, los mapas saldrían con datos sin sentido.
    /// </summary>
    private static (long Base, bool Invertir, string Explicacion) Base(Modulo m, byte[] binario)
    {
        var direcciones = m.Caracteristicas.Select(c => c.Direccion).Where(d => d > 0).ToList();
        if (direcciones.Count == 0)
        {
            throw new FormatException("El A2L no tiene direcciones.");
        }

        var conEpk = new HashSet<long>();
        if (m.Epk is { Length: >= 6 } epk && m.DireccionEpk is { } direccionEpk)
        {
            var bytes = Encoding.Latin1.GetBytes(epk);
            for (int desde = 0, encontradas = 0; encontradas < 5 && binario.AsSpan(desde).IndexOf(bytes) is var p and >= 0; encontradas++)
            {
                conEpk.Add(direccionEpk - (desde + p));
                desde += p + 1;
            }
        }

        var minima = direcciones.Min();
        var candidatas = new HashSet<long>(conEpk) { 0, 0x80000000, 0xA0000000, 0x800000, 0x400000, 0x100000 };
        candidatas.UnionWith(m.Segmentos);
        for (var bloque = 0x1000L; bloque <= 0x1000000; bloque <<= 1)
        {
            candidatas.Add(minima & ~(bloque - 1));
        }
        // Lecturas parciales (solo la zona de calibración): el principio de las zonas donde se concentran las direcciones.
        foreach (var zona in direcciones.GroupBy(d => d >> 16).OrderByDescending(g => g.Count()).Take(3))
        {
            var inicio = zona.Min();
            candidatas.UnionWith([inicio & ~0xFFL, inicio & ~0xFFFL, inicio & ~0xFFFFL]);
        }
        var puntuadas = candidatas
            .Where(b => b >= 0)
            .Select(b => (Base: b, Dentro: direcciones.Count(d => d - b >= 0 && d - b < binario.Length)))
            .Where(x => x.Dentro > 0)
            .ToList();
        if (puntuadas.Count == 0)
        {
            throw new FormatException("Ninguna dirección del A2L cae dentro de este binario: no corresponde a esta lectura.");
        }
        var mejorDentro = puntuadas.Max(x => x.Dentro);
        // Cada base se prueba también con el orden de bytes al revés: hay A2L que lo declaran mal.
        var (base_, invertir, correctos, probados) = puntuadas
            .Where(x => x.Dentro >= mejorDentro * 0.5 || conEpk.Contains(x.Base))
            .SelectMany(x => new[] { Ejes(m, binario, x.Base, false), Ejes(m, binario, x.Base, true) })
            .OrderByDescending(x => x.Correctos).ThenBy(x => x.Invertir).ThenByDescending(x => conEpk.Contains(x.Base)).ThenBy(x => x.Base)
            .First();

        var epkTexto = m.Epk is { Length: > 0 } e ? $"«{e}»" : null;
        if (probados >= 10 && correctos < probados * MinimoCorrectos)
        {
            var version = EpkDelBinario(m, binario) is { } delBinario && delBinario != m.Epk ? $" y el binario de «{delBinario}»" : "";
            throw new FormatException($"El A2L no corresponde a este binario: con la mejor base posible (0x{base_:X}) solo salen bien {correctos} de {probados} ejes de prueba. "
                + "Seguramente es de otra versión de software" + (epkTexto is null ? "." : $" (el A2L es de {epkTexto}{version}).")
                + " Hace falta el A2L de este número de software exacto.");
        }
        var calidad = probados == 0 ? "sin ejes para comprobarla" : $"{correctos} de {probados} ejes de prueba salen bien";
        var origen = conEpk.Contains(base_)
            ? $": el EPK del A2L ({epkTexto}) está en el binario, así que el A2L es de este software ({calidad})."
            : $" deducida ({calidad})." + (epkTexto is null ? "" : $" El EPK del A2L ({epkTexto}) no está en el binario: comprueba que es de este software.");
        var orden = invertir ? $" El A2L declara los datos {(m.BigEndian ? "big-endian" : "little-endian")} pero están al revés en el binario: se leen como {(m.BigEndian ? "little-endian" : "big-endian")}." : "";
        return (base_, invertir, $"Base de direcciones 0x{base_:X}{origen}{orden}");
    }

    /// <summary>
    /// El EPK del binario con el mismo principio que el del A2L (p. ej. «33/1/EDC17_CP02/11/…»), para decir de qué versión
    /// es cuando no coinciden.
    /// </summary>
    private static string? EpkDelBinario(Modulo m, byte[] binario)
    {
        if (m.Epk is not { } epk || epk.Split('/') is not { Length: >= 5 } partes)
        {
            return null;
        }
        var prefijo = Encoding.Latin1.GetBytes(string.Join('/', partes.Take(4)) + "/");
        var p = binario.AsSpan().IndexOf(prefijo);
        if (p < 0)
        {
            return null;
        }
        var fin = p;
        while (fin < binario.Length && fin - p < 100 && binario[fin] is >= 0x20 and < 0x7F)
        {
            fin++;
        }
        return Encoding.Latin1.GetString(binario, p, fin - p).Trim();
    }

    /// <summary>
    /// Con esta base, de una muestra de mapas y curvas con eje en el binario, cuántos salen bien: con un número de puntos
    /// posible y el eje X creciente.
    /// </summary>
    private static (long Base, bool Invertir, int Correctos, int Probados) Ejes(Modulo m, byte[] binario, long base_, bool invertir)
    {
        var lector = new Lector(m, binario, base_, invertir);
        int correctos = 0, probados = 0;
        var muestra = m.Caracteristicas
            .Where(c => c.Tipo is "MAP" or "CURVE" && c.Ejes.Count > 0 && c.Ejes[0].Atributo is "STD_AXIS" or "COM_AXIS" && c.Ejes[0].Maximo >= 3)
            .Where(c => c.Direccion - base_ >= 0 && c.Direccion - base_ < binario.Length);
        foreach (var c in muestra.Take(400))
        {
            probados++;
            try
            {
                if (lector.Mapa(c) is { EjeXDireccion: { } eje } mapa
                    && (mapa.Columnas < 3 || Creciente(binario, eje, mapa.Columnas, mapa.EjeXTipo, mapa.BigEndian)))
                {
                    correctos++;
                }
            }
            catch (FormatException)
            {
            }
        }
        return (base_, invertir, correctos, probados);
    }

    private static bool Creciente(byte[] binario, int direccion, int puntos, TipoDatoMapa tipo, bool bigEndian)
    {
        var anterior = double.NegativeInfinity;
        for (var i = 0; i < puntos; i++)
        {
            if (Valor(binario, direccion + i * Tamano(tipo), tipo, bigEndian) is not { } v || v <= anterior)
            {
                return false;
            }
            anterior = v;
        }
        return true;
    }

    // ── Tipos de dato ─────────────────────────────────────────────────────────────────────────────────────────────

    private static TipoDatoMapa Tipo(string tipo) => tipo switch
    {
        "UBYTE" => TipoDatoMapa.U8,
        "SBYTE" => TipoDatoMapa.I8,
        "UWORD" => TipoDatoMapa.U16,
        "SWORD" => TipoDatoMapa.I16,
        "ULONG" => TipoDatoMapa.U32,
        "SLONG" => TipoDatoMapa.I32,
        "FLOAT32_IEEE" => TipoDatoMapa.F32,
        _ => throw new FormatException($"tipo de dato {tipo} no admitido.")
    };

    private static int Tamano(TipoDatoMapa t) => t switch
    {
        TipoDatoMapa.U8 or TipoDatoMapa.I8 => 1,
        TipoDatoMapa.U16 or TipoDatoMapa.I16 => 2,
        _ => 4
    };

    private static double? Valor(byte[] b, long posicion, TipoDatoMapa t, bool bigEndian)
    {
        var n = Tamano(t);
        if (posicion < 0 || posicion + n > b.Length)
        {
            return null;
        }
        var s = b.AsSpan((int)posicion, n);
        return t switch
        {
            TipoDatoMapa.U8 => s[0],
            TipoDatoMapa.I8 => (sbyte)s[0],
            TipoDatoMapa.U16 => bigEndian ? BinaryPrimitives.ReadUInt16BigEndian(s) : BinaryPrimitives.ReadUInt16LittleEndian(s),
            TipoDatoMapa.I16 => bigEndian ? BinaryPrimitives.ReadInt16BigEndian(s) : BinaryPrimitives.ReadInt16LittleEndian(s),
            TipoDatoMapa.U32 => bigEndian ? BinaryPrimitives.ReadUInt32BigEndian(s) : BinaryPrimitives.ReadUInt32LittleEndian(s),
            TipoDatoMapa.I32 => bigEndian ? BinaryPrimitives.ReadInt32BigEndian(s) : BinaryPrimitives.ReadInt32LittleEndian(s),
            _ => bigEndian ? BinaryPrimitives.ReadSingleBigEndian(s) : BinaryPrimitives.ReadSingleLittleEndian(s)
        };
    }

    /// <summary>
    /// MSB_FIRST es big-endian y MSB_LAST little-endian. BIG_ENDIAN y LITTLE_ENDIAN (ASAP2 1.6) están definidos al revés
    /// de lo que dicen por una errata histórica del estándar: BIG_ENDIAN equivale a MSB_LAST. Igualmente se comprueba con
    /// los datos (ver <see cref="Base"/>).
    /// </summary>
    private static bool? BigEndian(string? orden) => orden switch
    {
        "MSB_FIRST" or "LITTLE_ENDIAN" => true,
        "MSB_LAST" or "BIG_ENDIAN" => false,
        _ => null
    };

    // ── Situar un parámetro en el binario ─────────────────────────────────────────────────────────────────────────

    /// <summary>Calcula, con una base dada, dónde está cada parte de un parámetro y lo convierte en un mapa.</summary>
    private sealed class Lector(Modulo m, byte[] binario, long base_, bool invertir)
    {
        /// <summary>El mapa, o null si su dirección no entra en el binario; FormatException si no se puede representar.</summary>
        public MapaCentralita? Mapa(Caracteristica c)
        {
            if (c.Tipo is "ASCII" or "CUBOID" or "CUBE_4" or "CUBE_5")
            {
                throw new FormatException($"tipo {c.Tipo} no admitido.");
            }
            if (!m.Disposiciones.TryGetValue(c.Disposicion, out var disposicion))
            {
                throw new FormatException($"falta el RECORD_LAYOUT {c.Disposicion}.");
            }
            var inicio = c.Direccion - base_;
            if (inicio < 0 || inicio >= binario.Length)
            {
                return null;
            }
            var bigEndian = (BigEndian(c.OrdenBytes) ?? m.BigEndian) ^ invertir;
            var conversion = m.Convertir(c.Conversion);
            var nota = new List<string>();
            var descripcion = GlosarioBosch.Traducir(c.LongId);
            if (c.LongId is { Length: > 0 } original && original != descripcion)
            {
                nota.Add($"Descripción original: {original}");
            }
            var funcion = m.Funciones.GetValueOrDefault(c.Nombre);
            if (funcion is not null)
            {
                nota.Add($"Función de Bosch: {funcion}");
            }

            // Puntos de cada eje: los de los ejes comunes y fijos se saben antes; los de los propios (STD_AXIS) se leen
            // de la disposición del parámetro (NO_AXIS_PTS), y si no están, son el máximo del A2L.
            var ejes = new EjeLeido?[2];
            var conocidos = new Dictionary<char, int>();
            var maximos = new Dictionary<char, int>();
            for (var i = 0; i < Math.Min(2, c.Ejes.Count); i++)
            {
                var letra = i == 0 ? 'X' : 'Y';
                var e = c.Ejes[i];
                maximos[letra] = e.Maximo;
                ejes[i] = EjeFuera(e, letra, disposicion, nota);
                if (ejes[i] is { Puntos: var p })
                {
                    conocidos[letra] = p;
                }
            }
            if (c.Ejes.Count > 2)
            {
                throw new FormatException("más de dos ejes.");
            }

            var (columnas, filas) = c.Tipo switch
            {
                "VALUE" => (1, 1),
                "VAL_BLK" => c.Dimensiones is { } d ? d : throw new FormatException("bloque sin NUMBER ni MATRIX_DIM."),
                _ => (-1, -1)
            };
            var partes = Partes(disposicion, inicio, bigEndian, conocidos, maximos, c.Tipo is "VALUE" or "VAL_BLK" ? (columnas, filas) : null);
            if (!partes.TryGetValue("FNC_VALUES", out var valores))
            {
                throw new FormatException($"el RECORD_LAYOUT {c.Disposicion} no tiene FNC_VALUES.");
            }
            if (c.Tipo is "MAP" or "CURVE")
            {
                columnas = partes.Puntos('X');
                filas = c.Tipo == "MAP" ? partes.Puntos('Y') : 1;
                if (c.Ejes.Count < (c.Tipo == "MAP" ? 2 : 1))
                {
                    throw new FormatException("faltan ejes.");
                }
            }
            if (columnas is < 1 or > MaximoPuntos || filas is < 1 or > MaximoPuntos)
            {
                throw new FormatException($"tamaño {columnas}×{filas} no admitido.");
            }
            if (valores.Direccion + (long)columnas * filas * Tamano(valores.Tipo) > binario.Length)
            {
                return null;
            }

            var mapa = new MapaCentralita
            {
                Nombre = c.Nombre[..Math.Min(c.Nombre.Length, 200)],
                Descripcion = descripcion,
                Origen = OrigenMapa.Manual,
                Direccion = (int)valores.Direccion,
                Columnas = columnas,
                Filas = filas,
                TipoDato = valores.Tipo,
                BigEndian = bigEndian,
                PorColumnas = filas > 1 && valores.PorColumnas,
                Factor = conversion.Factor,
                Desplazamiento = conversion.Desplazamiento,
                Unidad = Corta(c.Unidad ?? conversion.Unidad),
                Grupo = ClasificadorGrupos.Grupo($"{c.Nombre} {c.LongId} {descripcion} {funcion}")
            };
            if (conversion.Nota is { } n)
            {
                nota.Add(n);
            }

            for (var i = 0; i < Math.Min(2, c.Ejes.Count); i++)
            {
                var letra = i == 0 ? 'X' : 'Y';
                var e = c.Ejes[i];
                var leido = ejes[i] ?? (partes.TryGetValue($"AXIS_PTS_{letra}", out var propio) && e.Atributo == "STD_AXIS"
                    ? new EjeLeido(propio.Direccion, propio.Tipo, propio.Puntos, m.Convertir(e.Conversion), null, propio.Decreciente)
                    : null);
                if (leido is null)
                {
                    nota.Add($"Eje {letra} ({e.Atributo}) no admitido: se numera 0, 1, 2…");
                    continue;
                }
                if (leido.Decreciente)
                {
                    nota.Add($"Eje {letra} guardado en orden decreciente: se numera 0, 1, 2…");
                    continue;
                }
                var unidad = Corta(e.Unidad ?? leido.Conversion.Unidad);
                var magnitud = GlosarioBosch.Magnitud(e.Atributo == "COM_AXIS" && e.Referencia is { } r && m.EjesComunes.TryGetValue(r, out var comun)
                    ? comun.Magnitud is null or "NO_INPUT_QUANTITY" ? e.Magnitud : comun.Magnitud
                    : e.Magnitud);
                if (leido.Conversion.Nota is { } notaEje)
                {
                    nota.Add($"Eje {letra}: {notaEje}");
                }
                if (letra == 'X')
                {
                    mapa.EjeXDireccion = leido.Direccion is { } dx ? (int)dx : null;
                    mapa.EjeXTipo = leido.Tipo;
                    mapa.EjeXFactor = leido.Conversion.Factor;
                    mapa.EjeXDesplazamiento = leido.Conversion.Desplazamiento;
                    mapa.EjeXValores = leido.Valores;
                    mapa.EjeXUnidad = unidad;
                    mapa.EjeXNombre = magnitud;
                }
                else if (filas > 1)
                {
                    mapa.EjeYDireccion = leido.Direccion is { } dy ? (int)dy : null;
                    mapa.EjeYTipo = leido.Tipo;
                    mapa.EjeYFactor = leido.Conversion.Factor;
                    mapa.EjeYDesplazamiento = leido.Conversion.Desplazamiento;
                    mapa.EjeYValores = leido.Valores;
                    mapa.EjeYUnidad = unidad;
                    mapa.EjeYNombre = magnitud;
                }
            }
            var notas = string.Join("\n", nota);
            mapa.Notas = notas.Length == 0 ? null : notas[..Math.Min(notas.Length, 2000)];
            return mapa;
        }

        private sealed record EjeLeido(long? Direccion, TipoDatoMapa Tipo, int Puntos, Conversion Conversion, string? Valores, bool Decreciente);

        /// <summary>Ejes que no están dentro del propio parámetro: comunes (AXIS_PTS) y fijos. Null para los propios.</summary>
        private EjeLeido? EjeFuera(Eje e, char letra, Disposicion disposicion, List<string> nota)
        {
            switch (e.Atributo)
            {
                case "COM_AXIS":
                {
                    if (e.Referencia is null || !m.EjesComunes.TryGetValue(e.Referencia, out var comun))
                    {
                        throw new FormatException($"falta el eje común {e.Referencia}.");
                    }
                    if (!m.Disposiciones.TryGetValue(comun.Disposicion, out var dc))
                    {
                        throw new FormatException($"falta el RECORD_LAYOUT {comun.Disposicion} del eje {comun.Nombre}.");
                    }
                    var bigEndian = (BigEndian(comun.OrdenBytes) ?? m.BigEndian) ^ invertir;
                    var partes = Partes(dc, comun.Direccion - base_, bigEndian, [], new() { ['X'] = comun.Maximo }, null);
                    if (!partes.TryGetValue("AXIS_PTS_X", out var p))
                    {
                        throw new FormatException($"el eje común {comun.Nombre} no tiene AXIS_PTS_X.");
                    }
                    nota.Add($"Eje {letra}: {comun.Nombre}{(comun.LongId is { Length: > 0 } l ? " (" + l + ")" : "")}");
                    return new EjeLeido(p.Direccion, p.Tipo, p.Puntos, m.Convertir(comun.Conversion ?? e.Conversion), null, p.Decreciente);
                }
                case "FIX_AXIS":
                {
                    var crudos = e.Fijos ?? (disposicion.Fijos.TryGetValue(letra, out var n) ? Enumerable.Range(0, n).Select(i => (double)i).ToList() : null);
                    if (crudos is null || crudos.Count is < 1 or > MaximoPuntos)
                    {
                        throw new FormatException(crudos is null ? "eje fijo sin valores." : $"eje fijo de {crudos.Count} puntos no admitido.");
                    }
                    var conversion = m.Convertir(e.Conversion);
                    var valores = string.Join(';', crudos.Select(v => (v * conversion.Factor + conversion.Desplazamiento).ToString("G6", CultureInfo.InvariantCulture)));
                    // Los valores ya van convertidos: el eje queda con factor 1.
                    return new EjeLeido(null, TipoDatoMapa.U16, crudos.Count, Conversion.Identidad with { Unidad = conversion.Unidad }, valores.Length <= 4000 ? valores : null, false);
                }
                default:
                    return null;
            }
        }

        /// <summary>
        /// Recorre la disposición (RECORD_LAYOUT) en orden de posición sumando tamaños con su alineación, y lee del
        /// binario el número de puntos de cada eje cuando está (NO_AXIS_PTS_X/Y). <paramref name="bloque"/> fija el
        /// tamaño de los valores para VALUE y VAL_BLK.
        /// </summary>
        private Partes Partes(Disposicion d, long inicio, bool bigEndian, Dictionary<char, int> conocidos, Dictionary<char, int> maximos, (int Columnas, int Filas)? bloque)
        {
            var puntos = new Dictionary<char, int>(conocidos);
            foreach (var (letra, n) in d.Fijos)
            {
                puntos.TryAdd(letra, n);
            }
            int Cuantos(char letra) => puntos.TryGetValue(letra, out var n) ? n
                : maximos.TryGetValue(letra, out var max) ? max
                : throw new FormatException($"no se sabe cuántos puntos tiene el eje {letra}.");
            int Reservados(char letra) => d.Estatica && maximos.TryGetValue(letra, out var max) ? max : Cuantos(letra);

            var resultado = new Partes(puntos);
            var posicion = inicio;
            foreach (var p in d.Partes)
            {
                var tipo = p.Tipo is null ? TipoDatoMapa.U8 : Tipo(p.Tipo);
                var alineacion = p.Tipo is null ? 1 : m.Alineacion(d, p.Tipo);
                posicion = (posicion + alineacion - 1) / alineacion * alineacion;
                var direccion = posicion;
                long tamano;
                switch (p.Clave)
                {
                    case "FNC_VALUES":
                        if (p.Direccionamiento != "DIRECT")
                        {
                            throw new FormatException($"valores con direccionamiento {p.Direccionamiento} no admitidos.");
                        }
                        var (c, f) = bloque ?? (Cuantos('X'), puntos.ContainsKey('Y') || maximos.ContainsKey('Y') ? Cuantos('Y') : 1);
                        if (bloque is null && d.Estatica && (Reservados('X') != c || (f > 1 && Reservados('Y') != f)))
                        {
                            throw new FormatException("disposición estática con ejes incompletos no admitida.");
                        }
                        var reservadosX = bloque is null ? Reservados('X') : c;
                        var reservadosY = bloque is null && f > 1 ? Reservados('Y') : f;
                        tamano = (long)reservadosX * reservadosY * Tamano(tipo);
                        resultado.Agregar(p.Clave, new Parte(direccion, tipo, c * f, p.Orden is "COLUMN_DIR", false));
                        if (p.Orden is not ("COLUMN_DIR" or "ROW_DIR") && c > 1 && f > 1)
                        {
                            throw new FormatException($"orden de valores {p.Orden} no admitido.");
                        }
                        break;
                    case "AXIS_PTS_X" or "AXIS_PTS_Y":
                    {
                        var letra = p.Clave[^1];
                        if (p.Direccionamiento != "DIRECT")
                        {
                            throw new FormatException($"eje con direccionamiento {p.Direccionamiento} no admitido.");
                        }
                        var n = Cuantos(letra);
                        tamano = (long)Reservados(letra) * Tamano(tipo);
                        resultado.Agregar(p.Clave, new Parte(direccion, tipo, n, false, p.Orden == "INDEX_DECR"));
                        break;
                    }
                    case "NO_AXIS_PTS_X" or "NO_AXIS_PTS_Y":
                    {
                        var letra = p.Clave[^1];
                        tamano = Tamano(tipo);
                        if (!conocidos.ContainsKey(letra) && Valor(binario, direccion, tipo, bigEndian) is { } leido)
                        {
                            var max = maximos.GetValueOrDefault(letra, MaximoPuntos);
                            if (leido < 1 || leido > max)
                            {
                                throw new FormatException($"el binario dice {leido} puntos en el eje {letra} y el máximo es {max}: la base o el A2L no corresponden.");
                            }
                            puntos[letra] = (int)leido;
                        }
                        break;
                    }
                    case "RESERVED":
                        tamano = p.Reserva;
                        break;
                    case "AXIS_RESCALE_X" or "AXIS_RESCALE_Y" or "NO_RESCALE_X" or "NO_RESCALE_Y" or "AXIS_PTS_Z" or "NO_AXIS_PTS_Z":
                        throw new FormatException($"{p.Clave} no admitido.");
                    default:
                        // IDENTIFICATION, SRC_ADDR, RIP, SHIFT_OP, OFFSET, DIST_OP: un valor del tipo indicado.
                        tamano = Tamano(tipo);
                        break;
                }
                posicion += tamano;
            }
            return resultado;
        }
    }

    private static string? Corta(string? unidad) => string.IsNullOrWhiteSpace(unidad) ? null : unidad.Trim()[..Math.Min(unidad.Trim().Length, 30)];

    private sealed record Parte(long Direccion, TipoDatoMapa Tipo, int Puntos, bool PorColumnas, bool Decreciente);

    private sealed class Partes(Dictionary<char, int> puntos)
    {
        private readonly Dictionary<string, Parte> partes = [];

        public void Agregar(string clave, Parte parte) => partes[clave] = parte;
        public bool TryGetValue(string clave, out Parte parte) => partes.TryGetValue(clave, out parte!);
        public int Puntos(char letra) => puntos.TryGetValue(letra, out var n) ? n : throw new FormatException($"no se sabe cuántos puntos tiene el eje {letra}.");
    }

    // ── Conversión (COMPU_METHOD) ─────────────────────────────────────────────────────────────────────────────────

    private sealed record Conversion(double Factor, double Desplazamiento, string? Unidad, string? Nota)
    {
        public static readonly Conversion Identidad = new(1, 0, null, null);
    }

    // ── Modelo del A2L ────────────────────────────────────────────────────────────────────────────────────────────

    private sealed record Caracteristica(string Nombre, string? LongId, string Tipo, long Direccion, string Disposicion, string Conversion,
        List<Eje> Ejes, string? OrdenBytes, string? Unidad, (int, int)? Dimensiones);

    private sealed record Eje(string Atributo, string Conversion, int Maximo, string? Referencia, List<double>? Fijos, string? Unidad, string? Magnitud);

    private sealed record EjeComun(string Nombre, string? LongId, long Direccion, string Disposicion, string? Conversion, int Maximo, string? OrdenBytes, string? Magnitud);

    private sealed record ParteDisposicion(string Clave, int Posicion, string? Tipo, string? Orden, string? Direccionamiento, int Reserva);

    private sealed record Disposicion(List<ParteDisposicion> Partes, Dictionary<char, int> Fijos, Dictionary<string, int> Alineaciones, bool Estatica);

    private sealed class Modulo
    {
        public string? Titulo { get; private set; }
        public string? Epk { get; private set; }
        public long? DireccionEpk { get; private set; }
        public bool BigEndian { get; private set; }
        public List<long> Segmentos { get; } = [];
        public List<Caracteristica> Caracteristicas { get; } = [];
        public Dictionary<string, EjeComun> EjesComunes { get; } = [];
        public Dictionary<string, Disposicion> Disposiciones { get; } = [];
        public List<string> Avisos { get; } = [];

        /// <summary>Función de Bosch que define cada parámetro (FUNCTION … DEF_CHARACTERISTIC), por nombre del parámetro.</summary>
        public Dictionary<string, string> Funciones { get; } = [];
        private readonly Dictionary<string, Bloque> metodos = [];
        private readonly Dictionary<string, Conversion> conversiones = [];
        private readonly Dictionary<string, int> alineaciones = new() { ["UBYTE"] = 1, ["SBYTE"] = 1, ["UWORD"] = 2, ["SWORD"] = 2, ["ULONG"] = 4, ["SLONG"] = 4, ["FLOAT32_IEEE"] = 4 };

        public static Modulo Leer(string texto)
        {
            var m = new Modulo();
            var lexico = new Lexico(texto);
            while (lexico.Siguiente() is { } t)
            {
                if (t.Texto == "/include" && !t.Cadena)
                {
                    m.Avisos.Add($"El A2L incluye otro archivo ({lexico.Siguiente()?.Texto}) que no se ha subido: pueden faltar parámetros.");
                    continue;
                }
                if (t.Texto != "/begin" || t.Cadena || lexico.Siguiente() is not { } clave)
                {
                    continue;
                }
                switch (clave.Texto)
                {
                    // Contenedores: se sigue leyendo dentro.
                    case "PROJECT" or "MODULE":
                        if (clave.Texto == "PROJECT")
                        {
                            lexico.Siguiente();
                            m.Titulo ??= lexico.Siguiente()?.Texto is { Length: > 0 } titulo ? titulo : null;
                        }
                        break;
                    case "CHARACTERISTIC" or "AXIS_PTS" or "RECORD_LAYOUT" or "COMPU_METHOD" or "MOD_COMMON" or "MOD_PAR" or "FUNCTION":
                        m.Agregar(Bloque.Leer(lexico, clave.Texto));
                        break;
                    default:
                        lexico.Saltar(clave.Texto);
                        break;
                }
            }
            return m;
        }

        private void Agregar(Bloque b)
        {
            var a = b.Argumentos;
            try
            {
                switch (b.Clave)
                {
                    case "MOD_COMMON":
                        BigEndian = BigEndian(b.Opcion("BYTE_ORDER", 1)?[0]) ?? false;
                        foreach (var (clave, tipos) in new[] { ("ALIGNMENT_BYTE", new[] { "UBYTE", "SBYTE" }), ("ALIGNMENT_WORD", new[] { "UWORD", "SWORD" }), ("ALIGNMENT_LONG", new[] { "ULONG", "SLONG" }), ("ALIGNMENT_FLOAT32_IEEE", new[] { "FLOAT32_IEEE" }) })
                        {
                            if (b.Opcion(clave, 1) is [var texto] && Entero(texto) is { } valor and > 0)
                            {
                                foreach (var tipo in tipos)
                                {
                                    alineaciones[tipo] = (int)valor;
                                }
                            }
                        }
                        break;
                    case "MOD_PAR":
                        if (b.Opcion("ADDR_EPK", 1) is [var direccion])
                        {
                            DireccionEpk = Entero(direccion);
                        }
                        Epk = b.Opcion("EPK", 1)?[0];
                        foreach (var s in b.Hijos.Where(h => h.Clave == "MEMORY_SEGMENT" && h.Argumentos.Count >= 6))
                        {
                            if (Entero(s.Argumentos[5]) is { } inicio)
                            {
                                Segmentos.Add(inicio);
                            }
                        }
                        break;
                    case "COMPU_METHOD":
                        metodos[a[0]] = b;
                        break;
                    case "FUNCTION":
                        foreach (var parametro in b.Hijos.Where(h => h.Clave == "DEF_CHARACTERISTIC").SelectMany(h => h.Argumentos))
                        {
                            Funciones.TryAdd(parametro, a[0]);
                        }
                        break;
                    case "RECORD_LAYOUT":
                        Disposiciones[a[0]] = LeerDisposicion(a);
                        break;
                    case "AXIS_PTS":
                        EjesComunes[a[0]] = new EjeComun(a[0], Limpia(a[1]), Entero(a[2]) ?? 0, a[4], a[6], (int)(Entero(a[7]) ?? 0), b.Opcion("BYTE_ORDER", 1)?[0], a[3]);
                        break;
                    case "CHARACTERISTIC":
                        var ejes = b.Hijos.Where(h => h.Clave == "AXIS_DESCR").Select(LeerEje).ToList();
                        (int, int)? dimensiones = b.Opcion("MATRIX_DIM", 1) is not null
                            ? (b.Numeros("MATRIX_DIM") is [var x, .. var resto] ? ((int)x, resto is [var y, ..] && y > 0 ? (int)y : 1) : null)
                            : b.Opcion("NUMBER", 1) is [var numero] && Entero(numero) is { } n ? ((int)n, 1) : null;
                        if (b.Numeros("MATRIX_DIM") is [_, _, var z, ..] && z > 1)
                        {
                            throw new FormatException("bloque de tres dimensiones no admitido.");
                        }
                        Caracteristicas.Add(new Caracteristica(a[0], Limpia(a[1]), a[2], Entero(a[3]) ?? 0, a[4], a[6], ejes,
                            b.Opcion("BYTE_ORDER", 1)?[0], b.Opcion("PHYS_UNIT", 1)?[0], dimensiones));
                        break;
                }
            }
            catch (Exception e) when (e is ArgumentOutOfRangeException or FormatException)
            {
                if (Avisos.Count < 50)
                {
                    Avisos.Add($"{b.Clave} {(a.Count > 0 ? a[0] : "")} incompleto o no admitido.");
                }
            }
        }

        private static Eje LeerEje(Bloque b)
        {
            var a = b.Argumentos;
            List<double>? fijos = null;
            if (b.Numeros("FIX_AXIS_PAR") is [var desde, var desplazamiento, var n])
            {
                fijos = Enumerable.Range(0, (int)n).Select(i => desde + i * Math.Pow(2, desplazamiento)).ToList();
            }
            else if (b.Numeros("FIX_AXIS_PAR_DIST") is [var inicio, var paso, var puntos])
            {
                fijos = Enumerable.Range(0, (int)puntos).Select(i => inicio + i * paso).ToList();
            }
            else if (b.Hijos.FirstOrDefault(h => h.Clave == "FIX_AXIS_PAR_LIST") is { } lista)
            {
                fijos = lista.Argumentos.Select(Numero).OfType<double>().ToList();
            }
            var deposito = b.Opcion("DEPOSIT", 1)?[0];
            var atributo = deposito == "DIFFERENCE" ? "DIFFERENCE" : a[0];
            return new Eje(atributo, a[2], (int)(Entero(a[3]) ?? 0), b.Opcion("AXIS_PTS_REF", 1)?[0], fijos, b.Opcion("PHYS_UNIT", 1)?[0], a[1]);
        }

        private static readonly Dictionary<string, int> Aridad = new()
        {
            ["FNC_VALUES"] = 4, ["IDENTIFICATION"] = 2, ["AXIS_PTS_X"] = 4, ["AXIS_PTS_Y"] = 4, ["AXIS_PTS_Z"] = 4,
            ["AXIS_RESCALE_X"] = 5, ["AXIS_RESCALE_Y"] = 5, ["NO_AXIS_PTS_X"] = 2, ["NO_AXIS_PTS_Y"] = 2, ["NO_AXIS_PTS_Z"] = 2,
            ["NO_RESCALE_X"] = 2, ["NO_RESCALE_Y"] = 2, ["SRC_ADDR_X"] = 2, ["SRC_ADDR_Y"] = 2, ["RIP_X"] = 2, ["RIP_Y"] = 2,
            ["SHIFT_OP_X"] = 2, ["SHIFT_OP_Y"] = 2, ["OFFSET_X"] = 2, ["OFFSET_Y"] = 2, ["DIST_OP_X"] = 2, ["DIST_OP_Y"] = 2,
            ["RESERVED"] = 2
        };

        private static Disposicion LeerDisposicion(List<string> a)
        {
            var partes = new List<ParteDisposicion>();
            var fijos = new Dictionary<char, int>();
            var alineaciones = new Dictionary<string, int>();
            var estatica = false;
            for (var i = 1; i < a.Count; i++)
            {
                var clave = a[i];
                if (Aridad.TryGetValue(clave, out var n))
                {
                    var arg = a.Skip(i + 1).Take(n).ToList();
                    var posicion = (int)(Entero(arg[0]) ?? 0);
                    partes.Add(clave switch
                    {
                        "RESERVED" => new ParteDisposicion(clave, posicion, null, null, null, arg[1] switch { "WORD" => 2, "LONG" => 4, _ => 1 }),
                        "FNC_VALUES" or "AXIS_PTS_X" or "AXIS_PTS_Y" or "AXIS_PTS_Z" => new ParteDisposicion(clave, posicion, arg[1], arg[2], arg[3], 0),
                        _ => new ParteDisposicion(clave, posicion, arg[1], null, null, 0)
                    });
                    i += n;
                }
                else if (clave is "FIX_NO_AXIS_PTS_X" or "FIX_NO_AXIS_PTS_Y")
                {
                    fijos[clave[^1]] = (int)(Entero(a[++i]) ?? 0);
                }
                else if (clave.StartsWith("ALIGNMENT_", StringComparison.Ordinal))
                {
                    var valor = (int)(Entero(a[++i]) ?? 1);
                    foreach (var tipo in clave switch
                    {
                        "ALIGNMENT_BYTE" => new[] { "UBYTE", "SBYTE" },
                        "ALIGNMENT_WORD" => new[] { "UWORD", "SWORD" },
                        "ALIGNMENT_LONG" => new[] { "ULONG", "SLONG" },
                        "ALIGNMENT_FLOAT32_IEEE" => new[] { "FLOAT32_IEEE" },
                        _ => Array.Empty<string>()
                    })
                    {
                        alineaciones[tipo] = Math.Max(1, valor);
                    }
                }
                else if (clave == "STATIC_RECORD_LAYOUT")
                {
                    estatica = true;
                }
                else if (clave.StartsWith("FIX_NO_AXIS_PTS", StringComparison.Ordinal))
                {
                    i++;
                }
            }
            return new Disposicion(partes.OrderBy(p => p.Posicion).ToList(), fijos, alineaciones, estatica);
        }

        public int Alineacion(Disposicion d, string tipo) =>
            d.Alineaciones.TryGetValue(tipo, out var a) ? a : alineaciones.GetValueOrDefault(tipo, 1);

        /// <summary>
        /// Factor y desplazamiento del método de conversión cuando es lineal (IDENTICAL, LINEAR, RAT_FUNC lineal, FORM
        /// lineal); si no, 1 y 0 con una nota (los valores se ven en bruto).
        /// </summary>
        public Conversion Convertir(string? nombre)
        {
            if (nombre is null or "NO_COMPU_METHOD")
            {
                return ImportadorA2l.Conversion.Identidad;
            }
            if (conversiones.TryGetValue(nombre, out var hecha))
            {
                return hecha;
            }
            if (!metodos.TryGetValue(nombre, out var b) || b.Argumentos.Count < 5)
            {
                return conversiones[nombre] = ImportadorA2l.Conversion.Identidad with { Nota = $"Conversión {nombre} no encontrada: valores en bruto." };
            }
            var unidad = b.Argumentos[4] is { Length: > 0 } u ? u : null;
            var tipo = b.Argumentos[2];
            Conversion resultado = tipo switch
            {
                "IDENTICAL" => new(1, 0, unidad, null),
                "LINEAR" when b.Numeros("COEFFS_LINEAR") is [var a, var c] && a != 0 => new(a, c, unidad, null),
                // RAT_FUNC: interno = (a·f² + b·f + c) / (d·f² + e·f + f'), con f = valor físico. Es lineal si a = d = e = 0.
                "RAT_FUNC" when b.Numeros("COEFFS") is [var a, var bb, var c, var d, var e, var f] && a == 0 && d == 0 && e == 0 && bb != 0 && f != 0
                    => new(f / bb, -c / bb, unidad, null),
                // FORMULA suele ser un bloque, pero hay A2L que lo escriben en línea (FORMULA "0.1*X").
                "FORM" when (b.Hijos.FirstOrDefault(h => h.Clave == "FORMULA")?.Argumentos.FirstOrDefault() ?? b.Opcion("FORMULA", 1)?[0]) is { } formula
                    && Formulas.Lineal(formula.Replace("X1", "X", StringComparison.OrdinalIgnoreCase)) is { } lineal && lineal.Factor != 0
                    => new(lineal.Factor, lineal.Desplazamiento, unidad, null),
                "TAB_VERB" => new(1, 0, unidad, $"Valores codificados (tabla de textos {nombre}): se muestran en bruto."),
                _ => new(1, 0, unidad, $"Conversión {tipo} no lineal ({nombre}): se muestran los valores en bruto.")
            };
            return conversiones[nombre] = resultado;
        }

        private static string? Limpia(string texto) => string.IsNullOrWhiteSpace(texto) ? null : string.Join(' ', texto.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries));
    }

    // ── Sintaxis ──────────────────────────────────────────────────────────────────────────────────────────────────

    /// <summary>Bloque /begin CLAVE … /end CLAVE: argumentos (palabras, números y cadenas, en orden) y bloques hijos.</summary>
    private sealed class Bloque(string clave)
    {
        // Bloques hijos que no hacen falta (y pueden ser enormes): se saltan.
        private static readonly HashSet<string> Ignorados = ["IF_DATA", "ANNOTATION", "FUNCTION_LIST", "MAP_LIST", "DEPENDENT_CHARACTERISTIC", "VIRTUAL_CHARACTERISTIC"];

        public string Clave { get; } = clave;
        public List<string> Argumentos { get; } = [];
        private readonly List<bool> cadenas = [];
        public List<Bloque> Hijos { get; } = [];

        public static Bloque Leer(Lexico lexico, string clave)
        {
            var b = new Bloque(clave);
            while (lexico.Siguiente() is { } t)
            {
                if (!t.Cadena && t.Texto == "/end")
                {
                    lexico.Siguiente();
                    return b;
                }
                if (!t.Cadena && t.Texto == "/begin" && lexico.Siguiente() is { } hijo)
                {
                    if (Ignorados.Contains(hijo.Texto))
                    {
                        lexico.Saltar(hijo.Texto);
                    }
                    else
                    {
                        b.Hijos.Add(Leer(lexico, hijo.Texto));
                    }
                    continue;
                }
                b.Argumentos.Add(t.Texto);
                b.cadenas.Add(t.Cadena);
            }
            return b;
        }

        /// <summary>Los <paramref name="n"/> argumentos que siguen a la palabra clave opcional, o null si no está.</summary>
        public List<string>? Opcion(string palabra, int n)
        {
            for (var i = 0; i < Argumentos.Count - n; i++)
            {
                if (!cadenas[i] && Argumentos[i] == palabra)
                {
                    return Argumentos.GetRange(i + 1, n);
                }
            }
            return null;
        }

        /// <summary>Los números seguidos que vienen tras la palabra clave (p. ej. COEFFS a b c d e f).</summary>
        public List<double>? Numeros(string palabra)
        {
            var i = Argumentos.FindIndex(a => a == palabra);
            if (i < 0 || cadenas[i])
            {
                return null;
            }
            var numeros = new List<double>();
            for (var j = i + 1; j < Argumentos.Count && !cadenas[j] && Numero(Argumentos[j]) is { } v; j++)
            {
                numeros.Add(v);
            }
            return numeros;
        }
    }

    private readonly record struct Token(string Texto, bool Cadena);

    /// <summary>Separa el texto en palabras y cadenas entre comillas, quitando los comentarios /* … */ y // ….</summary>
    private sealed class Lexico(string texto)
    {
        private int i;

        public Token? Siguiente()
        {
            while (i < texto.Length)
            {
                var c = texto[i];
                if (char.IsWhiteSpace(c))
                {
                    i++;
                }
                else if (c == '/' && i + 1 < texto.Length && texto[i + 1] == '*')
                {
                    var fin = texto.IndexOf("*/", i + 2, StringComparison.Ordinal);
                    i = fin < 0 ? texto.Length : fin + 2;
                }
                else if (c == '/' && i + 1 < texto.Length && texto[i + 1] == '/')
                {
                    var fin = texto.IndexOf('\n', i);
                    i = fin < 0 ? texto.Length : fin + 1;
                }
                else if (c == '"')
                {
                    var sb = new StringBuilder();
                    i++;
                    while (i < texto.Length)
                    {
                        var d = texto[i++];
                        if (d == '\\' && i < texto.Length)
                        {
                            sb.Append(texto[i++]);
                        }
                        else if (d == '"')
                        {
                            // "" dentro de una cadena es una comilla.
                            if (i < texto.Length && texto[i] == '"')
                            {
                                sb.Append('"');
                                i++;
                            }
                            else
                            {
                                break;
                            }
                        }
                        else
                        {
                            sb.Append(d);
                        }
                    }
                    return new Token(sb.ToString(), true);
                }
                else
                {
                    var inicio = i;
                    while (i < texto.Length && !char.IsWhiteSpace(texto[i]) && texto[i] != '"'
                        && !(texto[i] == '/' && i + 1 < texto.Length && (texto[i + 1] == '*' || texto[i + 1] == '/') && i > inicio))
                    {
                        i++;
                    }
                    return new Token(texto[inicio..i], false);
                }
            }
            return null;
        }

        /// <summary>Salta hasta el /end del bloque que acaba de abrirse (contando los bloques de dentro).</summary>
        public void Saltar(string clave)
        {
            var nivel = 1;
            while (Siguiente() is { } t)
            {
                if (t.Cadena)
                {
                    continue;
                }
                if (t.Texto == "/begin")
                {
                    nivel++;
                }
                else if (t.Texto == "/end")
                {
                    Siguiente();
                    if (--nivel == 0)
                    {
                        return;
                    }
                }
            }
        }
    }

    private static long? Entero(string texto)
    {
        var t = texto.Trim();
        if (t.StartsWith("0x", StringComparison.OrdinalIgnoreCase))
        {
            return long.TryParse(t[2..], NumberStyles.HexNumber, CultureInfo.InvariantCulture, out var h) ? h : null;
        }
        return long.TryParse(t, NumberStyles.Integer, CultureInfo.InvariantCulture, out var d) ? d
            : double.TryParse(t, NumberStyles.Float, CultureInfo.InvariantCulture, out var f) && f == Math.Floor(f) ? (long)f : null;
    }

    private static double? Numero(string texto) =>
        Entero(texto) is { } e && texto.StartsWith("0x", StringComparison.OrdinalIgnoreCase) ? e
        : double.TryParse(texto, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) ? d : null;
}
