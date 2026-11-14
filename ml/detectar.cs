#:project ../backend/Taller.Api/Taller.Api.csproj
#:property JsonSerializerIsReflectionEnabledByDefault=true
#:property NoWarn=$(NoWarn);IL2026;IL3050
// Paso 2: detecta los mapas de cada original con el mismo detector que la web (AnalizadorBinario).
// Uso: dotnet run detectar.cs -- <carpeta de datos> <carpeta de salida> → <salida>/mapas-detectados.json
using System.Text.Json;
using Taller.Api.Centralitas;

var (datos, salida) = (args[0], args[1]);
var parejas = JsonDocument.Parse(File.ReadAllText(Path.Combine(salida, "parejas.json"))).RootElement;
var resultado = new Dictionary<string, object>();
foreach (var p in parejas.EnumerateArray())
{
    var clave = p.GetProperty("carpeta").GetString() + "/" + p.GetProperty("ori").GetString();
    if (resultado.ContainsKey(clave))
    {
        continue;
    }
    resultado[clave] = AnalizadorBinario.DetectarMapas(File.ReadAllBytes(Path.Combine(datos, clave)))
        .Select(AnalizadorBinario.ToEntidad)
        .Select(m => new { m.Direccion, m.Columnas, m.Filas, TipoDato = m.TipoDato.ToString(), m.BigEndian, m.PorColumnas, m.EjeXDireccion, m.EjeYDireccion })
        .ToList();
}
File.WriteAllText(Path.Combine(salida, "mapas-detectados.json"), JsonSerializer.Serialize(resultado));
Console.WriteLine($"Mapas detectados en {resultado.Count} originales");
