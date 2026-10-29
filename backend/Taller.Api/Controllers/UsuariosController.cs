using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Controllers;

/// <summary>Gestión → Usuarios: todos los accesos (taller y clientes) en un solo sitio.</summary>
[ApiController]
[Route("api/usuarios")]
[Authorize(Roles = Roles.Taller)]
public class UsuariosController(UserManager<Usuario> users, GestorAccesos accesos, TallerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<UsuarioDto>> Listar(CancellationToken ct)
    {
        var rolTaller = await db.Roles.Where(r => r.Name == Roles.Taller).Select(r => r.Id).FirstAsync(ct);
        var deTaller = await db.UserRoles.Where(ur => ur.RoleId == rolTaller).Select(ur => ur.UserId).ToListAsync(ct);

        var lista = await users.Users.AsNoTracking()
            .Select(u => new
            {
                Usuario = u,
                ClienteNombre = u.Cliente != null ? u.Cliente.Nombre : null
            })
            .ToListAsync(ct);

        var yo = users.GetUserId(User);
        return lista
            .Select(x => ToDto(x.Usuario, deTaller.Contains(x.Usuario.Id), x.ClienteNombre, x.Usuario.Id == yo))
            .OrderByDescending(u => u.Rol == Roles.Taller)
            .ThenBy(u => u.Nombre)
            .ToList();
    }

    /// <summary>Alta de un usuario del taller (los de clientes se crean desde la ficha del cliente).</summary>
    [HttpPost]
    public async Task<ActionResult<AccesoCreadoDto>> CrearTaller(CrearAccesoRequest req)
    {
        var r = await accesos.CrearAsync(req.Usuario, Roles.Taller);
        if (!r.Correcto)
        {
            foreach (var e in r.Resultado.Errors)
            {
                ModelState.AddModelError(nameof(req.Usuario), e.Description);
            }
            return ValidationProblem(ModelState);
        }
        return Ok(new AccesoCreadoDto(r.Usuario!.UserName!, r.PasswordTemporal!));
    }

    [HttpPost("{id}/restablecer")]
    public async Task<ActionResult<AccesoCreadoDto>> Restablecer(string id)
    {
        var usuario = await users.FindByIdAsync(id);
        if (usuario is null)
        {
            return NotFound();
        }
        if (usuario.Id == users.GetUserId(User))
        {
            return Conflicto("Para cambiar tu propia contraseña usa \"Cambiar contraseña\" en tu menú.");
        }

        var r = await accesos.RestablecerAsync(usuario);
        return r.Correcto ? Ok(new AccesoCreadoDto(usuario.UserName!, r.PasswordTemporal!)) : Conflicto(string.Join(" ", r.Resultado.Errors.Select(e => e.Description)));
    }

    [HttpPost("{id}/desbloquear")]
    public async Task<IActionResult> Desbloquear(string id)
    {
        var usuario = await users.FindByIdAsync(id);
        if (usuario is null)
        {
            return NotFound();
        }
        await accesos.DesbloquearAsync(usuario);
        return NoContent();
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Eliminar(string id)
    {
        var usuario = await users.FindByIdAsync(id);
        if (usuario is null)
        {
            return NotFound();
        }
        if (usuario.Id == users.GetUserId(User))
        {
            return Conflicto("No puedes eliminar tu propio usuario.");
        }
        if (await users.IsInRoleAsync(usuario, Roles.Taller) && (await users.GetUsersInRoleAsync(Roles.Taller)).Count <= 1)
        {
            return Conflicto("Debe quedar al menos un usuario del taller.");
        }

        await users.DeleteAsync(usuario);
        return NoContent();
    }

    private static UsuarioDto ToDto(Usuario u, bool esTaller, string? clienteNombre, bool esYo) => new(
        u.Id, u.UserName!, esTaller ? Roles.Taller : Roles.Cliente, clienteNombre ?? u.UserName!, u.ClienteId,
        u.FechaAlta, u.UltimoAcceso, GestorAccesos.Bloqueado(u), u.DebeCambiarPassword, esYo);

    private ObjectResult Conflicto(string detalle) =>
        Conflict(new ProblemDetails { Status = StatusCodes.Status409Conflict, Title = "Conflicto", Detail = detalle });
}
