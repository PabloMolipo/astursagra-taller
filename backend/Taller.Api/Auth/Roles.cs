namespace Taller.Api.Auth;

public static class Roles
{
    /// <summary>Personal del taller: acceso completo a la gestión.</summary>
    public const string Taller = "Taller";

    /// <summary>Cliente: solo lectura de sus propios vehículos e intervenciones.</summary>
    public const string Cliente = "Cliente";

    public static readonly string[] Todos = [Taller, Cliente];
}
