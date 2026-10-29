namespace Taller.Api.Infrastructure;

public static class Normalizar
{
    /// <summary>Recorta espacios y convierte cadenas vacías en null.</summary>
    public static string? Texto(string? valor) =>
        string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();

    /// <summary>Matrículas, bastidores y NIF: mayúsculas, sin espacios ni guiones ("1234-ABC" → "1234ABC").</summary>
    public static string? Codigo(string? valor) =>
        string.IsNullOrWhiteSpace(valor)
            ? null
            : new string(valor.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
}
