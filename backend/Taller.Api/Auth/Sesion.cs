using System.Security.Claims;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;
using Taller.Api.Domain;

namespace Taller.Api.Auth;

public static class Claims
{
    public const string TipoClienteId = "cliente_id";
    public const string TipoDebeCambiarPassword = "debe_cambiar_password";

    public static int? ClienteId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(TipoClienteId), out var id) ? id : null;

    public static bool DebeCambiarPassword(this ClaimsPrincipal user) =>
        user.FindFirstValue(TipoDebeCambiarPassword) == "true";
}

/// <summary>Añade a la cookie el cliente vinculado y si la contraseña es temporal, para no consultar la BD en cada petición.</summary>
public class TallerClaimsFactory(UserManager<Usuario> users, RoleManager<IdentityRole> roles, IOptions<IdentityOptions> options)
    : UserClaimsPrincipalFactory<Usuario, IdentityRole>(users, roles, options)
{
    protected override async Task<ClaimsIdentity> GenerateClaimsAsync(Usuario user)
    {
        var identity = await base.GenerateClaimsAsync(user);
        if (user.ClienteId is { } clienteId)
        {
            identity.AddClaim(new Claim(Claims.TipoClienteId, clienteId.ToString()));
        }
        identity.AddClaim(new Claim(Claims.TipoDebeCambiarPassword, user.DebeCambiarPassword ? "true" : "false"));
        return identity;
    }
}

/// <summary>Marca acciones que se pueden usar con una contraseña temporal (consultar la sesión, cambiarla, salir).</summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class PermitirPasswordTemporalAttribute : Attribute;

/// <summary>Con una contraseña temporal solo se puede cambiar la contraseña; el resto de la API responde 403.</summary>
public class RequierePasswordDefinitiva : IAsyncActionFilter
{
    public Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var permitido = context.ActionDescriptor.EndpointMetadata.OfType<PermitirPasswordTemporalAttribute>().Any();
        if (!permitido && context.HttpContext.User.DebeCambiarPassword())
        {
            context.Result = new ObjectResult(new ProblemDetails
            {
                Status = StatusCodes.Status403Forbidden,
                Title = "Cambio de contraseña obligatorio",
                Detail = "Tienes que cambiar la contraseña temporal antes de continuar."
            })
            { StatusCode = StatusCodes.Status403Forbidden };
            return Task.CompletedTask;
        }
        return next();
    }
}
