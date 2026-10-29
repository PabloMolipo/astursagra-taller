using System.Text.RegularExpressions;
using Taller.Api.Importacion;

namespace Taller.Api.Infrastructure;

public static partial class Slug
{
    [GeneratedRegex("[^a-z0-9]+")]
    private static partial Regex NoAlfanumerico();

    /// <summary>"Cambio de embrague en BMW 530d" → "cambio-de-embrague-en-bmw-530d".</summary>
    public static string De(string texto)
    {
        var slug = NoAlfanumerico().Replace(TextoImportado.Clave(texto), "-").Trim('-');
        if (slug.Length > 80)
        {
            slug = slug[..80].TrimEnd('-');
        }
        return slug.Length > 0 ? slug : "sin-titulo";
    }

    /// <summary>Añade -2, -3… si el slug ya está ocupado.</summary>
    public static async Task<string> UnicoAsync(string texto, Func<string, Task<bool>> existe)
    {
        var baseSlug = De(texto);
        var slug = baseSlug;
        for (var n = 2; await existe(slug); n++)
        {
            slug = $"{baseSlug}-{n}";
        }
        return slug;
    }
}
