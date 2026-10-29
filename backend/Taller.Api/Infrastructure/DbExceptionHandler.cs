using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace Taller.Api.Infrastructure;

/// <summary>
/// Traduce violaciones de restricciones de PostgreSQL (duplicados, registros relacionados) a 409 Conflict.
/// </summary>
public class DbExceptionHandler(IProblemDetailsService problemDetails) : IExceptionHandler
{
    public async ValueTask<bool> TryHandleAsync(HttpContext httpContext, Exception exception, CancellationToken cancellationToken)
    {
        // SaveChanges la envuelve en DbUpdateException; ExecuteDelete/ExecuteUpdate la lanzan directamente.
        var pg = exception as PostgresException ?? (exception as DbUpdateException)?.InnerException as PostgresException;
        if (pg is null)
        {
            return false;
        }

        var detail = pg.SqlState switch
        {
            PostgresErrorCodes.UniqueViolation => DescribirDuplicado(pg.ConstraintName),
            PostgresErrorCodes.ForeignKeyViolation => "No se puede completar la operación porque hay registros relacionados.",
            _ => null
        };

        if (detail is null)
        {
            return false;
        }

        httpContext.Response.StatusCode = StatusCodes.Status409Conflict;
        return await problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = httpContext,
            ProblemDetails = new ProblemDetails
            {
                Status = StatusCodes.Status409Conflict,
                Title = "Conflicto",
                Detail = detail
            }
        });
    }

    private static string DescribirDuplicado(string? constraint) => constraint switch
    {
        var c when c?.Contains("Matricula") == true => "Ya existe un vehículo con esa matrícula.",
        var c when c?.Contains("Bastidor") == true => "Ya existe un vehículo con ese número de bastidor.",
        var c when c?.Contains("NifCif") == true => "Ya existe un cliente con ese NIF/CIF.",
        _ => "Ya existe un registro con esos datos."
    };
}
