using System.Security.Cryptography;

namespace Taller.Api.Auth;

public static class PasswordTemporal
{
    // Sin caracteres que se confunden al dictarlos o copiarlos a mano (0/o, 1/l/i).
    private const string Letras = "abcdefghjkmnpqrstuvwxyz";
    private const string Digitos = "23456789";

    /// <summary>Genera algo como "kp7m-x3ta": fácil de pasar por WhatsApp y cumple la política (minúscula y dígito).</summary>
    public static string Generar()
    {
        Span<char> c = stackalloc char[9];
        for (var i = 0; i < c.Length; i++)
        {
            var alfabeto = i is 2 or 6 ? Digitos : Letras;
            c[i] = alfabeto[RandomNumberGenerator.GetInt32(alfabeto.Length)];
        }
        c[4] = '-';
        return new string(c);
    }
}
