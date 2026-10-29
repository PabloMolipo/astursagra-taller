using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;

namespace Taller.Api.Auth;

/// <summary>
/// Vista previa del área de un cliente para el personal del taller: la cookie <see cref="Cookie"/> lleva el id del
/// cliente y solo se tiene en cuenta si quien pide es del taller (para un cliente se ignora y siempre ve lo suyo).
/// Es de solo lectura, igual que el portal.
/// </summary>
public static class VistaCliente
{
    public const string Cookie = "astursagra.vista";
    private const string Clave = "VistaCliente.Id";

    /// <summary>Cliente cuyos datos se muestran: el de la sesión o, para el taller, el de la vista previa.</summary>
    public static int ClienteIdPortal(this HttpContext http) =>
        http.Items.TryGetValue(Clave, out var id) && id is int v
            ? v
            : http.User.ClienteId() ?? throw new InvalidOperationException("Usuario sin cliente.");

    /// <summary>
    /// Filtro del portal: para un usuario del taller exige una vista previa válida (cookie con un cliente existente);
    /// sin ella responde 400.
    /// </summary>
    public sealed class FiltroAttribute : Attribute, IAsyncActionFilter
    {
        public async Task OnActionExecutionAsync(ActionExecutingContext ctx, ActionExecutionDelegate next)
        {
            var http = ctx.HttpContext;
            if (http.User.IsInRole(Roles.Taller))
            {
                var db = http.RequestServices.GetRequiredService<TallerDbContext>();
                if (!int.TryParse(http.Request.Cookies[Cookie], out var id) ||
                    !await db.Clientes.AnyAsync(c => c.Id == id, http.RequestAborted))
                {
                    ctx.Result = new ObjectResult(new ProblemDetails
                    {
                        Status = 400,
                        Title = "Error",
                        Detail = "Abre la vista previa desde la ficha del cliente."
                    }) { StatusCode = 400 };
                    return;
                }
                http.Items[Clave] = id;
            }
            await next();
        }
    }
}
