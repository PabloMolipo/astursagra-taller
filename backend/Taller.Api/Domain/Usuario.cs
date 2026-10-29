using Microsoft.AspNetCore.Identity;

namespace Taller.Api.Domain;

/// <summary>
/// Usuario del portal. El personal del taller tiene rol <c>Taller</c>; cada cliente con acceso tiene rol
/// <c>Cliente</c> y <see cref="ClienteId"/> apunta a su ficha.
/// </summary>
public class Usuario : IdentityUser
{
    public int? ClienteId { get; set; }
    public Cliente? Cliente { get; set; }

    /// <summary>Las contraseñas temporales (alta o restablecimiento) obligan a cambiarla al entrar.</summary>
    public bool DebeCambiarPassword { get; set; }

    public DateTimeOffset FechaAlta { get; set; }
    public DateTimeOffset? UltimoAcceso { get; set; }
}
