using Taller.Api.Importacion;

namespace Taller.Api.Infrastructure;

/// <summary>
/// Marcas conocidas y sus alias, para reconocerlas en nombres de carpeta ("VW Golf V", "Mercedes Sprinter") y
/// compararlas sin depender de cómo se escriban ("Mercedes" y "Mercedes-Benz" son la misma).
/// </summary>
public static class Marcas
{
    /// <summary>Nombre canónico → otras formas de escribirlo.</summary>
    private static readonly Dictionary<string, string[]> Conocidas = new()
    {
        ["Abarth"] = [], ["Alfa Romeo"] = ["Alfa"], ["Audi"] = [], ["BMW"] = [], ["Chevrolet"] = [], ["Chrysler"] = [],
        ["Citroën"] = ["Citroen"], ["Cupra"] = [], ["Dacia"] = [], ["Daewoo"] = [], ["DS"] = [], ["Fiat"] = [], ["Ford"] = [],
        ["Honda"] = [], ["Hyundai"] = [], ["Infiniti"] = [], ["Isuzu"] = [], ["Iveco"] = [], ["Jaguar"] = [], ["Jeep"] = [],
        ["Kia"] = [], ["Lancia"] = [], ["Land Rover"] = ["Landrover", "Range Rover"], ["Lexus"] = [], ["Mazda"] = [],
        ["Mercedes-Benz"] = ["Mercedes", "Mercedes Benz"], ["MG"] = [], ["Mini"] = [], ["Mitsubishi"] = [], ["Nissan"] = [],
        ["Opel"] = [], ["Peugeot"] = [], ["Porsche"] = [], ["Renault"] = [], ["Rover"] = [], ["Saab"] = [], ["Seat"] = [],
        ["Škoda"] = ["Skoda"], ["Smart"] = [], ["SsangYong"] = ["Ssang Yong"], ["Subaru"] = [], ["Suzuki"] = [], ["Tesla"] = [],
        ["Toyota"] = [], ["Volkswagen"] = ["VW"], ["Volvo"] = [],
        // Industriales y motos
        ["DAF"] = [], ["MAN"] = [], ["Scania"] = [], ["Piaggio"] = [], ["Yamaha"] = [], ["Kawasaki"] = [], ["KTM"] = [],
        ["Ducati"] = [], ["Harley-Davidson"] = ["Harley"], ["Vespa"] = [],
        // Agrícolas
        ["John Deere"] = ["JohnDeere"], ["Massey Ferguson"] = ["Massey"], ["New Holland"] = [], ["Case IH"] = [],
        ["Fendt"] = [], ["Claas"] = [], ["Deutz-Fahr"] = ["Deutz", "Deutz Fahr"], ["Same"] = [], ["Lamborghini"] = [],
        ["Landini"] = [], ["Kubota"] = [], ["Valtra"] = [], ["Pasquali"] = [], ["Antonio Carraro"] = ["Carraro"],
        ["McCormick"] = [], ["Ebro"] = [], ["Lindner"] = [], ["Steyr"] = [], ["JCB"] = [], ["Manitou"] = [], ["Merlo"] = []
    };

    /// <summary>Forma normalizada (sin tildes ni mayúsculas, guiones como espacios) → nombre canónico.</summary>
    private static readonly Dictionary<string, string> PorClave = Conocidas
        .SelectMany(m => m.Value.Append(m.Key).Select(alias => (Clave: Normalizar(alias), Canonica: m.Key)))
        .GroupBy(x => x.Clave).ToDictionary(g => g.Key, g => g.First().Canonica);

    private static string Normalizar(string texto) =>
        string.Join(' ', TextoImportado.Clave(texto).Replace('-', ' ').Replace('_', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries));

    /// <summary>Grupos: la documentación de «VAG 1.6 TDI» vale para un Seat, un Audi o un Škoda con ese motor.</summary>
    private static readonly Dictionary<string, string[]> Grupos = new()
    {
        ["Grupo VAG"] = ["Volkswagen", "Audi", "Seat", "Škoda", "Cupra"],
        ["Grupo PSA"] = ["Peugeot", "Citroën", "DS", "Opel"]
    };

    private static readonly Dictionary<string, string> AliasGrupos = new()
    {
        ["vag"] = "Grupo VAG", ["grupo vag"] = "Grupo VAG", ["vw group"] = "Grupo VAG",
        ["psa"] = "Grupo PSA", ["grupo psa"] = "Grupo PSA"
    };

    /// <summary>
    /// Modelos y series que se nombran sin la marca delante («E46 Cabrio», «Terracan», «Fastrac»). Las series de BMW
    /// (E46, F30, G20…) se reconocen aparte.
    /// </summary>
    private static readonly Dictionary<string, string> Modelos = new()
    {
        ["terracan"] = "Hyundai", ["santa fe"] = "Hyundai", ["tucson"] = "Hyundai", ["galloper"] = "Hyundai",
        ["fastrac"] = "JCB",
        ["cherokee"] = "Jeep", ["grand cherokee"] = "Jeep", ["wrangler"] = "Jeep", ["compass"] = "Jeep",
        ["patrol"] = "Nissan", ["terrano"] = "Nissan", ["navara"] = "Nissan", ["xtrail"] = "Nissan", ["x trail"] = "Nissan", ["qashqai"] = "Nissan",
        ["sprinter"] = "Mercedes-Benz", ["vito"] = "Mercedes-Benz", ["jumper"] = "Citroën", ["berlingo"] = "Citroën",
        ["ducato"] = "Fiat", ["transit"] = "Ford", ["ranger"] = "Ford", ["hilux"] = "Toyota", ["rav4"] = "Toyota", ["land cruiser"] = "Toyota",
        ["golf"] = "Volkswagen", ["passat"] = "Volkswagen", ["polo"] = "Volkswagen", ["touareg"] = "Volkswagen", ["transporter"] = "Volkswagen",
        ["leon"] = "Seat", ["ibiza"] = "Seat", ["octavia"] = "Škoda", ["defender"] = "Land Rover", ["discovery"] = "Land Rover"
    };

    /// <summary>Lo que va detrás de la marca y es una temática, no un modelo («BMW Coding»).</summary>
    private static readonly HashSet<string> Tematicas =
        ["coding", "codificacion", "codificaciones", "programacion", "diagnosis", "pinout", "pinouts", "esquemas", "manuales", "ecu", "centralitas", "software", "general", "varios"];

    /// <summary>Nombre canónico de una marca; si no se conoce, la propia marca.</summary>
    public static string Canonica(string marca) =>
        AliasGrupos.GetValueOrDefault(Normalizar(marca)) ?? PorClave.GetValueOrDefault(Normalizar(marca), marca.Trim());

    /// <summary>
    /// ¿Son la misma marca? ("VW" y "Volkswagen", "Mercedes" y "Mercedes-Benz"). Un grupo coincide con sus marcas
    /// ("VAG" con Seat, Audi, Škoda…).
    /// </summary>
    public static bool Iguales(string? a, string? b)
    {
        if (a is null || b is null)
        {
            return false;
        }
        var ca = Canonica(a);
        var cb = Canonica(b);
        bool En(string grupo, string marca) => Grupos.TryGetValue(grupo, out var marcas) && marcas.Any(m => Normalizar(m) == Normalizar(marca));
        return Normalizar(ca) == Normalizar(cb) || En(ca, cb) || En(cb, ca);
    }

    /// <summary>¿Es una temática y no un modelo? («Coding», «Pinouts»…).</summary>
    public static bool EsTematica(string texto) => Tematicas.Contains(Normalizar(texto));

    /// <summary>
    /// Si el texto empieza por una marca (conocida o de la lista adicional), la marca canónica y el resto
    /// ("VW Golf V 1.9 TDI" → Volkswagen, "Golf V 1.9 TDI"). Se prefiere la coincidencia más larga.
    /// </summary>
    public static (string Marca, string Resto)? Separar(string texto, IEnumerable<string>? adicionales = null)
    {
        var palabras = texto.Replace('_', ' ').Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var extra = (adicionales ?? []).Where(m => !string.IsNullOrWhiteSpace(m))
            .GroupBy(Normalizar).ToDictionary(g => g.Key, g => Canonica(g.First()));
        for (var n = Math.Min(3, palabras.Length); n >= 1; n--)
        {
            var clave = Normalizar(string.Join(' ', palabras.Take(n)));
            var marca = AliasGrupos.GetValueOrDefault(clave) ?? PorClave.GetValueOrDefault(clave) ?? extra.GetValueOrDefault(clave);
            if (marca is not null)
            {
                return (marca, string.Join(' ', palabras.Skip(n)).Trim(' ', '-', '_'));
            }
        }

        // Sin marca delante: un modelo o una serie conocidos («E46 Cabrio» → BMW, «Terracan» → Hyundai). El texto
        // entero es el modelo.
        if (palabras.Length > 0)
        {
            var primera = Normalizar(palabras[0]);
            if (System.Text.RegularExpressions.Regex.IsMatch(primera, "^[efg][0-9]{2}$"))
            {
                return ("BMW", texto.Trim());
            }
            for (var n = Math.Min(3, palabras.Length); n >= 1; n--)
            {
                if (Modelos.TryGetValue(Normalizar(string.Join(' ', palabras.Take(n))), out var marca))
                {
                    return (marca, texto.Trim());
                }
            }
        }
        return null;
    }
}
