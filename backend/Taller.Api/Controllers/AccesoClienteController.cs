using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Controllers;

/// <summary>El taller da, restablece o quita el acceso al portal de cada cliente.</summary>
[ApiController]
[Route("api/clientes/{clienteId:int}/acceso")]
[Authorize(Roles = Roles.Taller)]
public class AccesoClienteController(UserManager<Usuario> users, GestorAccesos accesos, TallerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<AccesoDto>> Obtener(int clienteId)
    {
        var usuario = await Buscar(clienteId);
        return usuario is null ? NotFound() : ToDto(usuario);
    }

    [HttpPost]
    public async Task<ActionResult<AccesoCreadoDto>> Crear(int clienteId, CrearAccesoRequest req)
    {
        if (!await db.Clientes.AnyAsync(c => c.Id == clienteId))
        {
            return NotFound();
        }
        if (await Buscar(clienteId) is not null)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Conflicto", Detail = "Este cliente ya tiene acceso al portal." });
        }

        var r = await accesos.CrearAsync(req.Usuario, Roles.Cliente, clienteId);
        return r.Correcto ? Ok(new AccesoCreadoDto(r.Usuario!.UserName!, r.PasswordTemporal!)) : Errores(r.Resultado);
    }

    [HttpPost("restablecer")]
    public async Task<ActionResult<AccesoCreadoDto>> Restablecer(int clienteId)
    {
        var usuario = await Buscar(clienteId);
        if (usuario is null)
        {
            return NotFound();
        }

        var r = await accesos.RestablecerAsync(usuario);
        return r.Correcto ? Ok(new AccesoCreadoDto(usuario.UserName!, r.PasswordTemporal!)) : Errores(r.Resultado);
    }

    [HttpDelete]
    public async Task<IActionResult> Eliminar(int clienteId)
    {
        var usuario = await Buscar(clienteId);
        if (usuario is null)
        {
            return NotFound();
        }
        await users.DeleteAsync(usuario);
        return NoContent();
    }

    private Task<Usuario?> Buscar(int clienteId) => users.Users.FirstOrDefaultAsync(u => u.ClienteId == clienteId);

    private static AccesoDto ToDto(Usuario u) => new(
        u.UserName!, u.FechaAlta, u.UltimoAcceso, GestorAccesos.Bloqueado(u), u.DebeCambiarPassword);

    private ActionResult Errores(IdentityResult resultado)
    {
        foreach (var e in resultado.Errors)
        {
            ModelState.AddModelError(nameof(CrearAccesoRequest.Usuario), e.Description);
        }
        return ValidationProblem(ModelState);
    }
}
