using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

public record EstadoMatriculaDto(bool Configurado);

public record ConsultaMatriculaRequest([Required, MaxLength(20)] string Matricula, bool Moto, bool Repetir);

/// <summary>Datos de una consulta. DesdeGuardada: no ha costado nada porque ya se había consultado.</summary>
public record ConsultaMatriculaDto(
    string Matricula, DateTimeOffset Fecha, bool DesdeGuardada,
    string? Bastidor, string? Marca, string? Modelo, string? Variante, string? Descripcion, int? Anio, DateOnly? FechaMatriculacion,
    int? Cilindrada, string? Combustible, decimal? PotenciaCv, int? Puertas);

/// <summary>Datos de un vehículo español por su matrícula (MatriculaAPI, de pago por consulta).</summary>
[ApiController]
[Route("api/matricula")]
[Authorize(Roles = Roles.Taller)]
public class MatriculaController(TallerDbContext db, ClienteMatriculaApi cliente, OpcionesMatriculaApi opciones, ILogger<MatriculaController> log) : ControllerBase
{
    [HttpGet("estado")]
    public EstadoMatriculaDto Estado() => new(opciones.Configurado);

    [HttpPost("consultar")]
    public async Task<ActionResult<ConsultaMatriculaDto>> Consultar(ConsultaMatriculaRequest req, CancellationToken ct)
    {
        if (!opciones.Configurado)
        {
            return Problema(503, "La búsqueda por matrícula no está configurada (falta MatriculaApi:Usuario).");
        }
        var matricula = Normalizar(req.Matricula);
        if (matricula.Length is < 4 or > 10)
        {
            ModelState.AddModelError(nameof(req.Matricula), "La matrícula no es válida.");
            return ValidationProblem(ModelState);
        }

        var guardada = await db.ConsultasMatricula.FirstOrDefaultAsync(c => c.Matricula == matricula && c.Moto == req.Moto, ct);
        if (guardada is not null && !req.Repetir)
        {
            return ToDto(guardada, desdeGuardada: true);
        }

        string json;
        try
        {
            json = await cliente.ConsultarAsync(matricula, req.Moto, ct);
            ClienteMatriculaApi.Interpretar(json);
        }
        catch (ErrorMatricula e)
        {
            return Problema(e.NoEncontrado ? 404 : 502, e.Message);
        }
        catch (System.Text.Json.JsonException)
        {
            return Problema(502, "MatriculaAPI ha devuelto una respuesta que no se entiende.");
        }

        if (guardada is null)
        {
            guardada = new ConsultaMatricula { Matricula = matricula, Moto = req.Moto, Respuesta = json };
            db.ConsultasMatricula.Add(guardada);
        }
        guardada.Respuesta = json;
        guardada.Fecha = DateTimeOffset.UtcNow;
        guardada.Usuario = User.Identity?.Name;
        await db.SaveChangesAsync(ct);
        log.LogInformation("Consulta de matrícula en MatriculaAPI por {Usuario}", guardada.Usuario);
        return ToDto(guardada, desdeGuardada: false);
    }

    /// <summary>"1234-bcd" → "1234BCD".</summary>
    public static string Normalizar(string matricula) => new(matricula.ToUpperInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());

    private ObjectResult Problema(int status, string detalle) =>
        StatusCode(status, new ProblemDetails { Status = status, Title = status == 404 ? "No encontrado" : "Error", Detail = detalle });

    private static ConsultaMatriculaDto ToDto(ConsultaMatricula c, bool desdeGuardada)
    {
        var d = ClienteMatriculaApi.Interpretar(c.Respuesta);
        return new ConsultaMatriculaDto(c.Matricula, c.Fecha, desdeGuardada, d.Bastidor, d.Marca, d.Modelo, d.Variante, d.Descripcion,
            d.Anio, d.FechaMatriculacion, d.Cilindrada, d.Combustible, d.PotenciaCv, d.Puertas);
    }
}
