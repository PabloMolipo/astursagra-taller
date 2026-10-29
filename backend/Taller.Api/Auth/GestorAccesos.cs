using Microsoft.AspNetCore.Identity;
using Taller.Api.Domain;

namespace Taller.Api.Auth;

/// <summary>Resultado de una operación que genera contraseña temporal (solo se conoce en este momento).</summary>
public record ResultadoAcceso(IdentityResult Resultado, Usuario? Usuario, string? PasswordTemporal)
{
    public bool Correcto => Resultado.Succeeded;
}

/// <summary>Altas y restablecimientos de usuarios, compartido por la ficha del cliente, Gestión → Usuarios y la consola.</summary>
public class GestorAccesos(UserManager<Usuario> users)
{
    public async Task<ResultadoAcceso> CrearAsync(string nombre, string rol, int? clienteId = null)
    {
        var password = PasswordTemporal.Generar();
        var usuario = new Usuario
        {
            UserName = Normalizar(nombre),
            ClienteId = clienteId,
            DebeCambiarPassword = true,
            FechaAlta = DateTimeOffset.UtcNow
        };

        var resultado = await users.CreateAsync(usuario, password);
        if (resultado.Succeeded)
        {
            resultado = await users.AddToRoleAsync(usuario, rol);
        }
        return new ResultadoAcceso(resultado, usuario, resultado.Succeeded ? password : null);
    }

    /// <summary>Nueva contraseña temporal; además desbloquea la cuenta y cierra las sesiones abiertas.</summary>
    public async Task<ResultadoAcceso> RestablecerAsync(Usuario usuario)
    {
        var password = PasswordTemporal.Generar();
        await users.RemovePasswordAsync(usuario);
        var resultado = await users.AddPasswordAsync(usuario, password);
        if (!resultado.Succeeded)
        {
            return new ResultadoAcceso(resultado, usuario, null);
        }

        usuario.DebeCambiarPassword = true;
        await users.SetLockoutEndDateAsync(usuario, null);
        await users.ResetAccessFailedCountAsync(usuario);
        await users.UpdateSecurityStampAsync(usuario);
        await users.UpdateAsync(usuario);
        return new ResultadoAcceso(resultado, usuario, password);
    }

    public async Task DesbloquearAsync(Usuario usuario)
    {
        await users.SetLockoutEndDateAsync(usuario, null);
        await users.ResetAccessFailedCountAsync(usuario);
    }

    public static string Normalizar(string nombre) => nombre.Trim().ToLowerInvariant();

    public static bool Bloqueado(Usuario u) => u.LockoutEnd > DateTimeOffset.UtcNow;
}
