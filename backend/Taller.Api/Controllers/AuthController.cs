using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Controllers;

[ApiController]
[Route("api/auth")]
[PermitirPasswordTemporal]
public class AuthController(UserManager<Usuario> users, SignInManager<Usuario> signIn, TallerDbContext db) : ControllerBase
{
    private const string Incorrecto = "Usuario o contraseña incorrectos.";

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<SesionDto>> Login(LoginRequest req)
    {
        var usuario = await users.FindByNameAsync(req.Usuario.Trim());
        if (usuario is null)
        {
            return Rechazar(Incorrecto);
        }

        var resultado = await signIn.PasswordSignInAsync(usuario, req.Password, req.Recordar, lockoutOnFailure: true);
        if (resultado.IsLockedOut)
        {
            return Rechazar("Demasiados intentos fallidos. Espera unos minutos y vuelve a probar.");
        }
        if (!resultado.Succeeded)
        {
            return Rechazar(Incorrecto);
        }

        usuario.UltimoAcceso = DateTimeOffset.UtcNow;
        await users.UpdateAsync(usuario);
        return await SesionDe(usuario);
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await signIn.SignOutAsync();
        return NoContent();
    }

    [HttpGet("sesion")]
    [Authorize]
    public async Task<ActionResult<SesionDto>> Sesion()
    {
        var usuario = await users.GetUserAsync(User);
        return usuario is null ? Unauthorized() : await SesionDe(usuario);
    }

    [HttpPost("cambiar-password")]
    [Authorize]
    public async Task<ActionResult<SesionDto>> CambiarPassword(CambiarPasswordRequest req)
    {
        var usuario = await users.GetUserAsync(User);
        if (usuario is null)
        {
            return Unauthorized();
        }
        if (req.Actual == req.Nueva)
        {
            ModelState.AddModelError(nameof(req.Nueva), "La contraseña nueva debe ser distinta de la actual.");
            return ValidationProblem(ModelState);
        }

        var resultado = await users.ChangePasswordAsync(usuario, req.Actual, req.Nueva);
        if (!resultado.Succeeded)
        {
            foreach (var e in resultado.Errors)
            {
                ModelState.AddModelError(e.Code == nameof(IdentityErrorDescriber.PasswordMismatch) ? nameof(req.Actual) : nameof(req.Nueva), e.Description);
            }
            return ValidationProblem(ModelState);
        }

        usuario.DebeCambiarPassword = false;
        await users.UpdateAsync(usuario);
        // Regenera la cookie para que deje de llevar la marca de contraseña temporal.
        await signIn.RefreshSignInAsync(usuario);
        return await SesionDe(usuario);
    }

    private async Task<SesionDto> SesionDe(Usuario usuario)
    {
        var esTaller = await users.IsInRoleAsync(usuario, Roles.Taller);
        var nombre = usuario.ClienteId is { } clienteId
            ? await db.Clientes.Where(c => c.Id == clienteId).Select(c => c.Nombre).FirstOrDefaultAsync() ?? usuario.UserName!
            : usuario.UserName!;

        return new SesionDto(usuario.UserName!, esTaller ? Roles.Taller : Roles.Cliente, nombre, usuario.ClienteId, usuario.DebeCambiarPassword);
    }

    private UnauthorizedObjectResult Rechazar(string detalle) =>
        Unauthorized(new ProblemDetails { Status = StatusCodes.Status401Unauthorized, Title = "No autorizado", Detail = detalle });
}
