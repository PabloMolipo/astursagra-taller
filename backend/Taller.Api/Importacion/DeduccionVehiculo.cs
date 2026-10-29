using System.Text.RegularExpressions;
using Taller.Api.Domain;

namespace Taller.Api.Importacion;

/// <summary>
/// Deduce marca, modelo y tipo a partir de textos libres del Excel como "BMW 530D", "Terracan" o "406".
/// </summary>
public static partial class DeduccionVehiculo
{
    private static readonly Dictionary<string, string> Marcas = new()
    {
        ["bmw"] = "BMW", ["mercedes"] = "Mercedes-Benz", ["mercedes-benz"] = "Mercedes-Benz", ["audi"] = "Audi",
        ["volkswagen"] = "Volkswagen", ["vw"] = "Volkswagen", ["seat"] = "Seat", ["cupra"] = "Cupra", ["skoda"] = "Skoda",
        ["peugeot"] = "Peugeot", ["citroen"] = "Citroën", ["renault"] = "Renault", ["dacia"] = "Dacia", ["opel"] = "Opel",
        ["ford"] = "Ford", ["fiat"] = "Fiat", ["toyota"] = "Toyota", ["nissan"] = "Nissan", ["mazda"] = "Mazda",
        ["honda"] = "Honda", ["hyundai"] = "Hyundai", ["kia"] = "Kia", ["mitsubishi"] = "Mitsubishi", ["mithubisi"] = "Mitsubishi",
        ["mitsubisi"] = "Mitsubishi", ["ssangyong"] = "SsangYong", ["jeep"] = "Jeep", ["land"] = "Land Rover", ["range"] = "Land Rover",
        ["jaguar"] = "Jaguar", ["volvo"] = "Volvo", ["iveco"] = "Iveco", ["alfa"] = "Alfa Romeo", ["chevrolet"] = "Chevrolet",
        ["chrysler"] = "Chrysler", ["dodge"] = "Dodge", ["lexus"] = "Lexus", ["mini"] = "Mini", ["porsche"] = "Porsche",
        ["suzuki"] = "Suzuki", ["subaru"] = "Subaru", ["tesla"] = "Tesla", ["smart"] = "Smart", ["lancia"] = "Lancia",
        ["isuzu"] = "Isuzu", ["man"] = "MAN", ["scania"] = "Scania", ["daf"] = "DAF", ["deere"] = "John Deere",
        ["john"] = "John Deere", ["kubota"] = "Kubota", ["fendt"] = "Fendt", ["massey"] = "Massey Ferguson",
        ["holland"] = "New Holland", ["deutz"] = "Deutz-Fahr", ["lamborghini"] = "Lamborghini", ["yamaha"] = "Yamaha",
        ["kawasaki"] = "Kawasaki", ["ducati"] = "Ducati", ["harley"] = "Harley-Davidson", ["vespa"] = "Vespa",
        ["piaggio"] = "Piaggio", ["ktm"] = "KTM", ["aprilia"] = "Aprilia", ["infiniti"] = "Infiniti", ["saab"] = "Saab",
        ["rover"] = "Rover", ["daewoo"] = "Daewoo", ["tata"] = "Tata", ["ds"] = "DS", ["same"] = "SAME",
        ["simca"] = "Simca",
        // Erratas vistas en el Excel
        ["maxda"] = "Mazda", ["mitshubisi"] = "Mitsubishi", ["inifiniti"] = "Infiniti", ["porche"] = "Porsche",
        ["renalt"] = "Renault"
    };

    /// <summary>Modelos que aparecen sin marca en el Excel.</summary>
    private static readonly Dictionary<string, string> Modelos = new()
    {
        // Volkswagen
        ["golf"] = "Volkswagen", ["polo"] = "Volkswagen", ["passat"] = "Volkswagen", ["touareg"] = "Volkswagen",
        ["tiguan"] = "Volkswagen", ["touran"] = "Volkswagen", ["caddy"] = "Volkswagen", ["transporter"] = "Volkswagen",
        ["amarok"] = "Volkswagen", ["sharan"] = "Volkswagen", ["scirocco"] = "Volkswagen", ["beetle"] = "Volkswagen",
        ["t-roc"] = "Volkswagen", ["crafter"] = "Volkswagen", ["bora"] = "Volkswagen", ["jetta"] = "Volkswagen",
        // Seat
        ["leon"] = "Seat", ["ibiza"] = "Seat", ["altea"] = "Seat", ["toledo"] = "Seat", ["cordoba"] = "Seat",
        ["alhambra"] = "Seat", ["ateca"] = "Seat", ["arona"] = "Seat", ["tarraco"] = "Seat", ["exeo"] = "Seat",
        // Citroën
        ["c1"] = "Citroën", ["c2"] = "Citroën", ["c3"] = "Citroën", ["c4"] = "Citroën", ["c5"] = "Citroën",
        ["c8"] = "Citroën", ["xsara"] = "Citroën", ["picasso"] = "Citroën", ["berlingo"] = "Citroën", ["saxo"] = "Citroën",
        ["evasion"] = "Citroën", ["jumpy"] = "Citroën", ["jumper"] = "Citroën", ["nemo"] = "Citroën", ["c-elysee"] = "Citroën",
        // Peugeot
        ["106"] = "Peugeot", ["206"] = "Peugeot", ["207"] = "Peugeot", ["208"] = "Peugeot", ["306"] = "Peugeot",
        ["307"] = "Peugeot", ["308"] = "Peugeot", ["406"] = "Peugeot", ["407"] = "Peugeot", ["508"] = "Peugeot",
        ["607"] = "Peugeot", ["807"] = "Peugeot", ["2008"] = "Peugeot", ["3008"] = "Peugeot", ["5008"] = "Peugeot",
        ["partner"] = "Peugeot", ["expert"] = "Peugeot", ["boxer"] = "Peugeot", ["rifter"] = "Peugeot",
        // Opel
        ["astra"] = "Opel", ["corsa"] = "Opel", ["insignia"] = "Opel", ["vectra"] = "Opel", ["zafira"] = "Opel",
        ["meriva"] = "Opel", ["combo"] = "Opel", ["vivaro"] = "Opel", ["mokka"] = "Opel", ["antara"] = "Opel", ["frontera"] = "Opel",
        // Ford
        ["focus"] = "Ford", ["fiesta"] = "Ford", ["mondeo"] = "Ford", ["kuga"] = "Ford", ["transit"] = "Ford",
        ["s-max"] = "Ford", ["galaxy"] = "Ford", ["ranger"] = "Ford", ["c-max"] = "Ford", ["fusion"] = "Ford",
        // Renault
        ["megane"] = "Renault", ["clio"] = "Renault", ["laguna"] = "Renault", ["kangoo"] = "Renault", ["scenic"] = "Renault",
        ["trafic"] = "Renault", ["master"] = "Renault", ["twingo"] = "Renault", ["captur"] = "Renault", ["kadjar"] = "Renault",
        ["espace"] = "Renault", ["koleos"] = "Renault",
        // Dacia
        ["duster"] = "Dacia", ["sandero"] = "Dacia", ["logan"] = "Dacia", ["lodgy"] = "Dacia", ["dokker"] = "Dacia",
        // Hyundai / Kia
        ["terracan"] = "Hyundai", ["tucson"] = "Hyundai", ["i30"] = "Hyundai", ["i20"] = "Hyundai", ["i10"] = "Hyundai",
        ["getz"] = "Hyundai", ["h1"] = "Hyundai", ["santa"] = "Hyundai", ["ix35"] = "Hyundai", ["galloper"] = "Hyundai",
        ["sportage"] = "Kia", ["sorento"] = "Kia", ["ceed"] = "Kia", ["carnival"] = "Kia", ["picanto"] = "Kia", ["rio"] = "Kia",
        // SsangYong
        ["rexton"] = "SsangYong", ["kyron"] = "SsangYong", ["korando"] = "SsangYong", ["actyon"] = "SsangYong",
        // Nissan
        ["patrol"] = "Nissan", ["qashqai"] = "Nissan", ["navara"] = "Nissan", ["terrano"] = "Nissan", ["micra"] = "Nissan",
        ["juke"] = "Nissan", ["x-trail"] = "Nissan", ["almera"] = "Nissan", ["primera"] = "Nissan", ["pathfinder"] = "Nissan",
        ["note"] = "Nissan",
        // Toyota
        ["hilux"] = "Toyota", ["rav4"] = "Toyota", ["corolla"] = "Toyota", ["yaris"] = "Toyota", ["auris"] = "Toyota",
        ["prius"] = "Toyota", ["avensis"] = "Toyota", ["cruiser"] = "Toyota", ["chr"] = "Toyota", ["c-hr"] = "Toyota",
        // Jeep
        ["cherokee"] = "Jeep", ["wrangler"] = "Jeep", ["compass"] = "Jeep", ["renegade"] = "Jeep", ["grand"] = "Jeep",
        // Mercedes
        ["sprinter"] = "Mercedes-Benz", ["vito"] = "Mercedes-Benz", ["viano"] = "Mercedes-Benz", ["ml"] = "Mercedes-Benz",
        ["gl"] = "Mercedes-Benz", ["glk"] = "Mercedes-Benz", ["cla"] = "Mercedes-Benz", ["clk"] = "Mercedes-Benz",
        // Otros
        ["daily"] = "Iveco", ["roomster"] = "Skoda", ["octavia"] = "Skoda", ["fabia"] = "Skoda", ["superb"] = "Skoda",
        ["seicento"] = "Fiat", ["seincento"] = "Fiat", ["punto"] = "Fiat", ["panda"] = "Fiat", ["ducato"] = "Fiat",
        ["doblo"] = "Fiat", ["stilo"] = "Fiat", ["bravo"] = "Fiat", ["outlander"] = "Mitsubishi", ["montero"] = "Mitsubishi",
        ["pajero"] = "Mitsubishi", ["l200"] = "Mitsubishi", ["asx"] = "Mitsubishi", ["cx5"] = "Mazda", ["cx-5"] = "Mazda",
        ["civic"] = "Honda", ["accord"] = "Honda", ["cr-v"] = "Honda", ["crv"] = "Honda", ["jazz"] = "Honda",
        ["vitara"] = "Suzuki", ["jimny"] = "Suzuki", ["swift"] = "Suzuki", ["xc90"] = "Volvo", ["xc60"] = "Volvo",
        ["v40"] = "Volvo", ["v70"] = "Volvo", ["s60"] = "Volvo", ["discovery"] = "Land Rover", ["defender"] = "Land Rover",
        ["freelander"] = "Land Rover", ["evoque"] = "Land Rover", ["velar"] = "Land Rover", ["cayenne"] = "Porsche",
        ["macan"] = "Porsche", ["movano"] = "Opel", ["nubira"] = "Daewoo", ["captiva"] = "Chevrolet", ["c15"] = "Citroën",
        ["strada"] = "Fiat",
        // Erratas vistas en el Excel
        ["santafe"] = "Hyundai", ["xtrail"] = "Nissan", ["qhasqai"] = "Nissan", ["traffic"] = "Renault",
        ["parnert"] = "Peugeot", ["partnet"] = "Peugeot"
    };

    private static readonly HashSet<string> Furgonetas =
    [
        "daily", "sprinter", "vito", "transit", "kangoo", "berlingo", "partner", "combo", "trafic", "master", "jumpy",
        "jumper", "boxer", "expert", "ducato", "vivaro", "caddy", "transporter", "doblo", "nemo", "crafter", "dokker", "rifter",
        "furgoneta", "movano", "traffic", "parnert", "partnet", "c15"
    ];

    private const string SinEspecificar = "Sin especificar";

    /// <summary>Textos que solo dicen el tipo de vehículo ("Tractor", "Moto", "Camion y laser"…).</summary>
    private static readonly HashSet<string> Genericos = ["tractor", "moto", "furgoneta", "pickup", "remolque", "camion", "y", "laser"];

    private static readonly HashSet<string> MarcasTractor = ["SAME", "John Deere", "Kubota", "Fendt", "Massey Ferguson", "New Holland", "Deutz-Fahr", "Lamborghini"];
    private static readonly HashSet<string> MarcasCamion = ["MAN", "Scania", "DAF"];
    private static readonly HashSet<string> MarcasMoto = ["Yamaha", "Kawasaki", "Ducati", "Harley-Davidson", "Vespa", "Piaggio", "KTM", "Aprilia"];

    // BMW: X1..X7, "serie 3", 118d, 320d, 530D, 735i…  Audi: A1..A8, Q2..Q8, TT.  Mercedes: E350, C220, ML350…
    // También códigos de chasis BMW: E39, F10, G30…
    [GeneratedRegex(@"^(x[1-7]|serie|[1-8]\d{2}[a-z]{0,2}|m[2-8]|[efg]\d{2})$")]
    private static partial Regex ModeloBmw();
    [GeneratedRegex(@"^(a[1-8]|q[2-8]|tt|rs\d)$")]
    private static partial Regex ModeloAudi();
    [GeneratedRegex(@"^([abcegs]|ml|gl|clk|cla|slk|sl)\d{3}[a-z]{0,3}$")]
    private static partial Regex ModeloMercedes();

    public record Resultado(string Marca, string? Modelo, TipoVehiculo Tipo, bool Reconocida);

    public static Resultado Deducir(string texto)
    {
        var palabras = texto.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var claves = palabras.Select(TextoImportado.Clave).ToArray();

        string? marca = null;
        var indiceMarca = -1;

        for (var i = 0; i < claves.Length && marca is null; i++)
        {
            if (Marcas.TryGetValue(claves[i], out var m))
            {
                marca = m;
                indiceMarca = i;
            }
        }

        for (var i = 0; i < claves.Length && marca is null; i++)
        {
            if (Modelos.TryGetValue(claves[i], out var m))
            {
                marca = m;
            }
            else if (ModeloBmw().IsMatch(claves[i]))
            {
                marca = "BMW";
            }
            else if (ModeloAudi().IsMatch(claves[i]))
            {
                marca = "Audi";
            }
            else if (ModeloMercedes().IsMatch(claves[i]))
            {
                marca = "Mercedes-Benz";
            }
        }

        var generico = marca is null && claves.Length > 0 && claves.All(Genericos.Contains);
        if (generico)
        {
            marca = SinEspecificar;
        }

        var reconocida = marca is not null;
        marca ??= TextoImportado.Capitalizar(texto);

        // El modelo es el resto del texto sin la palabra de la marca (y sin el "Benz"/"Rover" de marcas compuestas).
        var resto = palabras
            .Where((_, i) => i != indiceMarca)
            .Where(p => !reconocida || !marca.Contains(p, StringComparison.OrdinalIgnoreCase) || Modelos.ContainsKey(TextoImportado.Clave(p)))
            .ToArray();
        var modelo = reconocida && !generico && resto.Length > 0 ? string.Join(' ', resto) : null;

        var tipo = TipoVehiculo.Turismo;
        if (claves.Any(Furgonetas.Contains) || marca == "Iveco")
        {
            tipo = TipoVehiculo.Furgoneta;
        }
        if (claves.Contains("camion") || MarcasCamion.Contains(marca))
        {
            tipo = TipoVehiculo.Camion;
        }
        if (claves.Contains("tractor") || MarcasTractor.Contains(marca))
        {
            tipo = TipoVehiculo.Tractor;
        }
        if (claves.Contains("moto") || MarcasMoto.Contains(marca))
        {
            tipo = TipoVehiculo.Moto;
        }
        if (claves.Contains("remolque"))
        {
            tipo = TipoVehiculo.Otro;
        }

        return new Resultado(marca, modelo, tipo, reconocida);
    }
}
