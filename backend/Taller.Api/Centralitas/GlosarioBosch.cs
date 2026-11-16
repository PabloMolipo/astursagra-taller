using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Taller.Api.Centralitas;

/// <summary>
/// Glosario propio para hacer legibles los A2L de Bosch: traduce al español sus descripciones (casi siempre en alemán
/// técnico) y pone nombre a las magnitudes de los ejes. Traduce palabra a palabra y descompone las palabras compuestas
/// alemanas, que se leen al revés que en español (Zündwinkelkennfeld → «mapa de avance de encendido»), así que el
/// resultado es literal pero se entiende. Lo que no conoce (abreviaturas, nombres de variables) lo deja como está.
/// </summary>
public static partial class GlosarioBosch
{
    private sealed record Termino(string Texto, bool Adjetivo = false);

    // Palabras sueltas que no forman compuestos (artículos, preposiciones…). "" = se quita.
    private static readonly Dictionary<string, string> Funcionales = new()
    {
        ["der"] = "", ["die"] = "", ["das"] = "", ["den"] = "", ["dem"] = "", ["des"] = "", ["ein"] = "", ["eine"] = "",
        ["einen"] = "", ["einem"] = "", ["einer"] = "", ["eines"] = "",
        ["fuer"] = "para", ["bei"] = "con", ["beim"] = "con", ["von"] = "de", ["vom"] = "del", ["zum"] = "para", ["zur"] = "para",
        ["und"] = "y", ["oder"] = "o", ["mit"] = "con", ["ohne"] = "sin", ["im"] = "en", ["in"] = "en", ["an"] = "en", ["am"] = "en",
        ["auf"] = "sobre", ["aus"] = "de", ["nach"] = "tras", ["vor"] = "antes de", ["ueber"] = "sobre", ["unter"] = "bajo",
        ["bis"] = "hasta", ["ab"] = "desde", ["pro"] = "por", ["je"] = "por", ["als"] = "como", ["wenn"] = "si", ["falls"] = "si",
        ["nicht"] = "no", ["kein"] = "sin", ["keine"] = "sin", ["zwischen"] = "entre", ["gegen"] = "contra", ["durch"] = "por",
        ["waehrend"] = "durante", ["zu"] = "a", ["ist"] = "es", ["wird"] = "se", ["werden"] = "se", ["sind"] = "son",
        ["oben"] = "arriba", ["unten"] = "abajo", ["nur"] = "solo", ["alle"] = "todos", ["jeweils"] = "cada uno"
    };

    // Raíces (en minúsculas, sin diéresis: ä → ae…) que también pueden formar parte de compuestos.
    private static readonly Dictionary<string, Termino> Raices = Crear(
        // Tipos de parámetro
        ("kennfeld", "mapa"), ("kennlinie", "curva"), ("festwert", "valor fijo"), ("wert", "valor"), ("werte", "valores"),
        ("schwelle", "umbral"), ("schwellwert", "umbral"), ("grenze", "límite"), ("grenzwert", "valor límite"),
        ("begrenzung", "limitación"), ("limit", "límite"), ("faktor", "factor"), ("offset", "offset"), ("korrektur", "corrección"),
        ("anpassung", "adaptación"), ("adaption", "adaptación"), ("sollwert", "consigna"), ("soll", "consigna"), ("istwert", "valor real"),
        ("zeit", "tiempo"), ("dauer", "duración"), ("zeitkonstante", "constante de tiempo"), ("verzoegerung", "retardo"),
        ("filter", "filtro"), ("filterung", "filtrado"), ("rampe", "rampa"), ("steigung", "pendiente"), ("gradient", "gradiente"),
        ("hysterese", "histéresis"), ("totzeit", "tiempo muerto"), ("zaehler", "contador"), ("zustand", "estado"), ("bedingung", "condición"),
        ("freigabe", "habilitación"), ("sperre", "bloqueo"), ("abschaltung", "desconexión"), ("aktivierung", "activación"),
        ("deaktivierung", "desactivación"), ("schalter", "interruptor"), ("diagnose", "diagnóstico"), ("fehler", "error"),
        ("erkennung", "detección"), ("ueberwachung", "supervisión"), ("plausibilisierung", "verificación"), ("modell", "modelo"),
        ("berechnung", "cálculo"), ("regler", "regulador"), ("regelung", "regulación"), ("regel", "regulación"), ("steuerung", "control"),
        ("vorsteuerung", "precontrol"), ("anteil", "parte"), ("verstaerkung", "ganancia"), ("abweichung", "desviación"),
        ("differenz", "diferencia"), ("summe", "suma"), ("mittelwert", "valor medio"), ("anzahl", "número"), ("schritt", "paso"),
        ("stufe", "nivel"), ("bereich", "rango"), ("auswahl", "selección"), ("umschaltung", "conmutación"), ("schwingung", "oscilación"),
        ("tabelle", "tabla"), ("kennzahl", "índice"), ("gewichtung", "ponderación"), ("verhaeltnis", "relación"), ("quotient", "cociente"),
        ("ersatzwert", "valor sustitutivo"), ("ersatz", "sustitución"), ("vorgabe", "valor prefijado"), ("zeitpunkt", "momento"),
        ("bedatung", "calibración"), ("applikation", "calibración"), ("stuetzstelle", "punto de apoyo"), ("achse", "eje"),
        // Motor y funcionamiento
        ("motor", "motor"), ("drehzahl", "régimen"), ("leerlauf", "ralentí"), ("last", "carga"), ("teillast", "carga parcial"),
        ("volllast", "plena carga"), ("drehmoment", "par"), ("moment", "par"), ("leistung", "potencia"), ("start", "arranque"),
        ("nachstart", "post-arranque"), ("warmlauf", "calentamiento"), ("nachlauf", "post-funcionamiento"), ("schub", "retención"),
        ("schubabschaltung", "corte en retención"), ("betrieb", "funcionamiento"), ("betriebsart", "modo de funcionamiento"),
        ("betriebspunkt", "punto de funcionamiento"), ("zylinder", "cilindro"), ("nockenwelle", "árbol de levas"),
        ("kurbelwelle", "cigüeñal"), ("verbrennung", "combustión"), ("wirkungsgrad", "rendimiento"), ("verbrauch", "consumo"),
        ("beschleunigung", "aceleración"), ("ruck", "tirón"), ("daempfung", "amortiguación"), ("abstellen", "parada"),
        // Aire y sobrealimentación
        ("luft", "aire"), ("ansaugluft", "aire de admisión"), ("ansaug", "admisión"), ("ladeluft", "aire de sobrealimentación"),
        ("luftmasse", "masa de aire"), ("masse", "masa"), ("fuellung", "llenado"), ("luftfuellung", "llenado de aire"),
        ("saugrohr", "colector de admisión"), ("druck", "presión"), ("ladedruck", "presión de turbo"), ("umgebung", "ambiente"),
        ("umgebungsdruck", "presión ambiente"), ("hoehe", "altitud"), ("lader", "turbocompresor"), ("turbolader", "turbocompresor"),
        ("turbo", "turbo"), ("verdichter", "compresor"), ("turbine", "turbina"), ("drossel", "mariposa"), ("drosselklappe", "mariposa"),
        ("klappe", "trampilla"), ("drall", "turbulencia"), ("ladung", "carga"),
        // Combustible e inyección
        ("kraftstoff", "combustible"), ("einspritzung", "inyección"), ("einspritz", "inyección"), ("spritz", "inyección"),
        ("menge", "cantidad"), ("voreinspritzung", "preinyección"), ("nacheinspritzung", "postinyección"),
        ("haupteinspritzung", "inyección principal"), ("beginn", "inicio"), ("ende", "fin"), ("ansteuerung", "activación"),
        ("ansteuer", "activación"), ("injektor", "inyector"), ("duese", "tobera"), ("pumpe", "bomba"), ("hochdruck", "alta presión"),
        ("niederdruck", "baja presión"), ("rail", "rail"), ("raildruck", "presión del rail"), ("zumesseinheit", "dosificador"),
        ("zumessung", "dosificación"), ("ventil", "válvula"), ("tank", "depósito"), ("diesel", "diésel"), ("benzin", "gasolina"),
        ("rauch", "humo"), ("rauchbegrenzung", "limitación de humo"), ("gemisch", "mezcla"), ("lambda", "lambda"), ("sonde", "sonda"),
        // Encendido
        ("zuendung", "encendido"), ("zuend", "encendido"), ("zuendwinkel", "avance de encendido"), ("winkel", "ángulo"),
        ("klopf", "picado"), ("klopfen", "picado"), ("kerze", "bujía"), ("zuendkerze", "bujía"),
        // Escape y anticontaminación
        ("abgas", "gases de escape"), ("abgasrueckfuehrung", "EGR"), ("rueckfuehrung", "recirculación"), ("rate", "tasa"),
        ("partikelfilter", "filtro de partículas"), ("partikel", "partículas"), ("russ", "hollín"), ("regeneration", "regeneración"),
        ("beladung", "carga"), ("katalysator", "catalizador"), ("harnstoff", "urea"), ("dosierung", "dosificación"),
        ("gluehkerze", "bujía de incandescencia"), ("glueh", "incandescencia"), ("gluehen", "precalentamiento"),
        // Temperaturas, electricidad y actuadores
        ("temperatur", "temperatura"), ("kuehlmittel", "refrigerante"), ("kuehlwasser", "agua de refrigeración"), ("wasser", "agua"),
        ("oel", "aceite"), ("batterie", "batería"), ("spannung", "tensión"), ("strom", "corriente"), ("sensor", "sensor"),
        ("signal", "señal"), ("frequenz", "frecuencia"), ("tastverhaeltnis", "ciclo de trabajo"), ("impuls", "impulso"),
        ("stellung", "posición"), ("position", "posición"), ("stellglied", "actuador"), ("steller", "actuador"),
        // Vehículo
        ("fahrzeug", "vehículo"), ("geschwindigkeit", "velocidad"), ("fahrpedal", "pedal del acelerador"), ("pedal", "pedal"),
        ("gang", "marcha"), ("getriebe", "caja de cambios"), ("kupplung", "embrague"), ("bremse", "freno"), ("klima", "climatización"),
        ("klimaanlage", "climatización"), ("kompressor", "compresor"), ("luefter", "ventilador"), ("tempomat", "control de crucero"),
        // Adjetivos (en español van detrás; las formas abreviadas evitan concordar el género)
        ("maximal", "máx.", true), ("max", "máx.", true), ("minimal", "mín.", true), ("min", "mín.", true), ("ober", "superior", true),
        ("unter", "inferior", true), ("erst", "primero", true), ("zweit", "segundo", true), ("normal", "normal", true),
        ("gefiltert", "filtrado", true), ("korrigiert", "corregido", true), ("aktuell", "actual", true), ("kalt", "en frío", true),
        ("warm", "en caliente", true), ("heiss", "en caliente", true), ("hoch", "alto", true), ("niedrig", "bajo", true),
        ("zulaessig", "admisible", true), ("erlaubt", "permitido", true), ("stationaer", "estacionario", true),
        ("dynamisch", "dinámico", true), ("effektiv", "efectivo", true), ("indiziert", "indicado", true), ("relativ", "relativo", true),
        ("absolut", "absoluto", true), ("mittel", "medio", true), ("mittler", "medio", true), ("gesamt", "total", true),
        ("aktiv", "activo", true), ("inaktiv", "inactivo", true), ("haupt", "principal", true), ("neu", "nuevo", true),
        ("abhaengig", "dependiente", true));

    private static readonly string[] Terminaciones = ["en", "er", "es", "em", "e", "n", "s"];
    private static readonly string[] Uniones = ["s", "es", "n", "en"];

    private static Dictionary<string, Termino> Crear(params object[] terminos) =>
        terminos.Select(x => x switch
        {
            ValueTuple<string, string> p => (p.Item1, new Termino(p.Item2)),
            ValueTuple<string, string, bool> p => (p.Item1, new Termino(p.Item2, p.Item3)),
            _ => throw new ArgumentException("Término del glosario mal escrito.")
        }).ToDictionary(x => x.Item1, x => x.Item2);

    [GeneratedRegex(@"[\p{L}\p{N}_]+|[^\p{L}\p{N}_]+")]
    private static partial Regex Piezas();

    [GeneratedRegex(@"\b(in\s+)?abh(ä|ae)ngig(keit)?\s+(von|vom|der|des)\b", RegexOptions.IgnoreCase)]
    private static partial Regex Dependencia();

    [GeneratedRegex(@"\s{2,}")]
    private static partial Regex Espacios();

    /// <summary>
    /// Descripción en español. Si reconoce menos de un tercio de las palabras (p. ej. está en inglés), la devuelve tal cual.
    /// </summary>
    public static string? Traducir(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto))
        {
            return null;
        }
        var piezas = Piezas().Matches(Dependencia().Replace(texto, " en función de ")).Select(m => m.Value).ToList();
        var salida = new List<(string Texto, bool Palabra, bool Adjetivo, bool Sustantivo)>();
        var traducidas = 0;
        foreach (var p in piezas)
        {
            if (!char.IsLetterOrDigit(p[0]) && p[0] != '_')
            {
                salida.Add((p, false, false, false));
                continue;
            }
            // Identificadores y abreviaturas (KFZW, nmot_w, P_595…): no se tocan.
            if (p.Any(c => c == '_' || char.IsDigit(c)) || p.Length > 1 && p.All(c => !char.IsLetter(c) || char.IsUpper(c)))
            {
                salida.Add((p, true, false, false));
                continue;
            }
            var clave = Normalizar(p);
            if (Funcionales.TryGetValue(clave, out var f))
            {
                // «der/des» detrás de un sustantivo es un genitivo: «de».
                var genitivo = clave is "der" or "des" && salida.LastOrDefault(s => s.Palabra && s.Texto.Length > 0) is { Sustantivo: true };
                salida.Add((genitivo ? "de" : f, true, false, false));
                traducidas++;
                continue;
            }
            if (Palabra(clave) is { } t)
            {
                salida.Add((t.Texto, true, t.Adjetivo, !t.Adjetivo));
                traducidas++;
                continue;
            }
            salida.Add((p, true, false, false));
        }
        var palabras = piezas.Count(p => char.IsLetter(p[0]));
        if (traducidas == 0 || traducidas * 3 < palabras)
        {
            return Limpiar(texto);
        }

        // El adjetivo va detrás del sustantivo que le sigue: «maximale Einspritzmenge» → «cantidad de inyección máx.».
        for (var i = 0; i < salida.Count; i++)
        {
            if (!salida[i].Adjetivo)
            {
                continue;
            }
            var j = salida.FindIndex(i + 1, s => s.Palabra && s.Texto.Length > 0);
            if (j > 0 && salida[j].Sustantivo)
            {
                (salida[i], salida[j]) = (salida[j], salida[i]);
                i = j;
            }
        }
        var resultado = Limpiar(string.Concat(salida.Select(s => s.Texto)));
        return resultado.Length > 0 ? char.ToUpper(resultado[0], CultureInfo.InvariantCulture) + resultado[1..] : null;
    }

    private static string Limpiar(string texto)
    {
        var t = Espacios().Replace(texto, " ").Trim();
        t = t.Replace(" ,", ",", StringComparison.Ordinal).Replace("( ", "(", StringComparison.Ordinal).Replace(" )", ")", StringComparison.Ordinal);
        return t.Length > 300 ? t[..300] : t;
    }

    /// <summary>Una palabra entera (con terminación de flexión o sin ella) o un compuesto de raíces conocidas.</summary>
    private static Termino? Palabra(string clave)
    {
        if (Raiz(clave) is { } t)
        {
            return t;
        }
        if (Descomponer(clave) is not { Count: >= 2 } partes)
        {
            return null;
        }
        // El núcleo del compuesto alemán es la última parte; en español va primero: «Zündwinkelkennfeld» → mapa de avance…
        var nombres = partes.Where(p => !p.Adjetivo).Select(p => p.Texto).Reverse().ToList();
        var adjetivos = partes.Where(p => p.Adjetivo).Select(p => p.Texto).ToList();
        if (nombres.Count == 0)
        {
            return new Termino(string.Join(' ', adjetivos), true);
        }
        return new Termino(string.Join(" de ", nombres) + (adjetivos.Count > 0 ? " " + string.Join(' ', adjetivos) : ""));
    }

    private static Termino? Raiz(string clave)
    {
        if (Raices.TryGetValue(clave, out var t))
        {
            return t;
        }
        foreach (var fin in Terminaciones)
        {
            if (clave.Length > fin.Length + 2 && clave.EndsWith(fin, StringComparison.Ordinal) && Raices.TryGetValue(clave[..^fin.Length], out t))
            {
                return t;
            }
        }
        return null;
    }

    /// <summary>Partición del compuesto en el menor número de raíces conocidas (con las uniones -s-, -n-… entre ellas).</summary>
    private static List<Termino>? Descomponer(string w)
    {
        var mejor = new List<Termino>?[w.Length + 1];
        mejor[0] = [];
        for (var i = 0; i < w.Length; i++)
        {
            if (mejor[i] is not { } previo)
            {
                continue;
            }
            for (var j = w.Length; j >= i + 3; j--)
            {
                var trozo = w[i..j];
                var t = j == w.Length ? Raiz(trozo) : Raices.GetValueOrDefault(trozo);
                if (t is null)
                {
                    continue;
                }
                Proponer(mejor, j, previo, t);
                foreach (var u in Uniones)
                {
                    if (j + u.Length < w.Length && string.CompareOrdinal(w, j, u, 0, u.Length) == 0)
                    {
                        Proponer(mejor, j + u.Length, previo, t);
                    }
                }
            }
        }
        return mejor[w.Length];
    }

    private static void Proponer(List<Termino>?[] mejor, int posicion, List<Termino> previo, Termino t)
    {
        if (mejor[posicion] is not { } actual || actual.Count > previo.Count + 1)
        {
            mejor[posicion] = [.. previo, t];
        }
    }

    private static string Normalizar(string palabra)
    {
        var s = new StringBuilder(palabra.Length + 4);
        foreach (var c in palabra.ToLowerInvariant())
        {
            s.Append(c switch { 'ä' => "ae", 'ö' => "oe", 'ü' => "ue", 'ß' => "ss", _ => c.ToString() });
        }
        return s.ToString();
    }

    // ── Magnitudes de los ejes ──────────────────────────────────────────────────────────────────────────────────

    // Variables clásicas (ME7, EDC15/16), sin el sufijo «_w», «_kw»…
    private static readonly Dictionary<string, string> Clasicas = new()
    {
        ["nmot"] = "Régimen del motor", ["rl"] = "Carga relativa", ["rlsol"] = "Carga relativa (consigna)", ["tmot"] = "Temp. del motor",
        ["tans"] = "Temp. del aire de admisión", ["ub"] = "Tensión de batería", ["wped"] = "Pedal del acelerador",
        ["pwg"] = "Pedal del acelerador", ["wdkba"] = "Mariposa", ["ml"] = "Caudal de aire", ["ps"] = "Presión del colector",
        ["pu"] = "Presión ambiente", ["pvdk"] = "Presión antes de mariposa", ["plsol"] = "Presión de turbo (consigna)",
        ["pld"] = "Presión de turbo", ["vfzg"] = "Velocidad del vehículo", ["mi"] = "Par indicado", ["mibas"] = "Par indicado base",
        ["misol"] = "Par indicado (consigna)", ["md"] = "Par", ["lamsoni"] = "Lambda", ["lamsbg"] = "Lambda (consigna)",
        ["zwout"] = "Avance de encendido", ["tabgm"] = "Temp. de escape", ["toel"] = "Temp. del aceite", ["gang"] = "Marcha",
        ["mle"] = "Cantidad inyectada", ["me"] = "Cantidad inyectada", ["n"] = "Régimen del motor", ["tkw"] = "Temp. del refrigerante"
    };

    // Convención de nombres de EDC17/MED17 «Componente_xVariable»: las minúsculas del principio de la variable dicen qué
    // magnitud es (n régimen, p presión, t temperatura…). Las de varias letras van antes que las de una.
    private static readonly (string Prefijo, string Magnitud)[] Tipos =
    [
        ("trq", "Par"), ("dm", "Caudal másico"), ("phi", "Ángulo"), ("ti", "Tiempo"), ("ctr", "Contador"), ("st", "Estado"),
        ("num", "Número"), ("fac", "Factor"), ("rat", "Relación"), ("lam", "Lambda"), ("n", "Régimen"), ("q", "Cantidad"),
        ("p", "Presión"), ("t", "Temperatura"), ("r", "Proporción"), ("u", "Tensión"), ("i", "Corriente"), ("v", "Velocidad"),
        ("m", "Masa"), ("s", "Recorrido"), ("a", "Aceleración"), ("w", "Energía")
    ];

    private static readonly (string Prefijo, string Componente)[] Componentes =
    [
        ("CEngDsT", "refrigerante"), ("CEng", "motor"), ("CoEng", "motor"), ("Eng", "motor"), ("Epm", "motor"), ("Mo", "motor"), ("RailP", "rail"),
        ("Rail", "rail"), ("EnvP", "ambiente"), ("EnvT", "ambiente"), ("Env", "ambiente"), ("IAT", "aire de admisión"),
        ("FuelT", "combustible"), ("Fuel", "combustible"), ("Oil", "aceite"), ("PCR", "turbo"), ("Boost", "turbo"), ("Turbo", "turbo"),
        ("AFS", "aire"), ("Air", "aire"), ("EGR", "EGR"), ("APP", "pedal"), ("AccPed", "pedal"), ("InjCrv", "inyección"),
        ("InjCtl", "inyección"), ("Inj", "inyección"), ("Exh", "escape"), ("Batt", "batería"), ("VSS", "vehículo"),
        ("Veh", "vehículo"), ("Gbx", "caja de cambios"), ("Clth", "embrague"), ("AC", "climatización"), ("Lam", "lambda"),
        ("PFlt", "filtro de partículas"), ("SCR", "SCR"), ("ThrVlv", "mariposa"), ("Thr", "mariposa"), ("Ign", "encendido"),
        ("Knk", "picado"), ("Clg", "refrigeración"), ("Fan", "ventilador")
    ];

    /// <summary>Qué mide un eje según la variable de entrada del A2L; si no la reconoce, el propio nombre de la variable.</summary>
    public static string? Magnitud(string? variable)
    {
        if (string.IsNullOrWhiteSpace(variable) || variable.Trim() is "NO_INPUT_QUANTITY")
        {
            return null;
        }
        var v = variable.Trim();
        var partes = v.Split('_', StringSplitOptions.RemoveEmptyEntries);
        if (partes.Length > 0 && Clasicas.TryGetValue(partes[0].ToLowerInvariant(), out var clasica))
        {
            return clasica;
        }
        if (partes.Length >= 2 && char.IsUpper(partes[0][0]))
        {
            var minusculas = new string(partes[1].TakeWhile(char.IsLower).ToArray());
            // Las de una letra solo si es la única minúscula («pFlt» es presión; «pos…» no).
            var tipo = Tipos.FirstOrDefault(t => t.Prefijo.Length > 1 ? minusculas.StartsWith(t.Prefijo, StringComparison.Ordinal) : minusculas == t.Prefijo).Magnitud;
            var componente = Componentes.FirstOrDefault(c => partes[0].StartsWith(c.Prefijo, StringComparison.Ordinal)).Componente;
            if (tipo is not null)
            {
                return Recortar(componente is null ? $"{tipo} ({v})" : $"{tipo} de {componente}");
            }
        }
        return Recortar(v);
    }

    private static string Recortar(string texto) => texto.Length > 60 ? texto[..60] : texto;
}
