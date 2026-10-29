using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

public record EstadoVinalfaDto(bool Configurado);

/// <summary>
/// Despiece original por bastidor con Vinalfa. Hace de intermediario: el token de la API se queda en el servidor y aquí
/// solo se aceptan bastidores y hash de catálogo, nunca direcciones arbitrarias.
/// </summary>
[ApiController]
[Route("api/vinalfa")]
[Authorize(Roles = Roles.Taller)]
public class VinalfaController(TallerDbContext db, ClienteVinalfa vinalfa, OpcionesVinalfa opciones) : ControllerBase
{
    [HttpGet("estado")]
    public EstadoVinalfaDto Estado() => new(opciones.Configurado);

    /// <summary>
    /// Identifica el vehículo en los catálogos por su bastidor (o por el identificador indicado: FRAME japonés,
    /// 7 últimos de BMW/MINI). Cuenta una vez al día por bastidor en el límite de la suscripción.
    /// </summary>
    [HttpGet("vehiculos/{vehiculoId:int}")]
    public async Task<IActionResult> Resolver(int vehiculoId, [FromQuery] string? identificador, CancellationToken ct)
    {
        if (!opciones.Configurado) return NoConfigurado();
        var vehiculo = await db.Vehiculos.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vehiculoId, ct);
        if (vehiculo is null) return NotFound();

        var id = string.IsNullOrWhiteSpace(identificador) ? DocumentacionTecnica.Vin(vehiculo.Bastidor) : identificador.Trim().ToUpperInvariant();
        if (id.Length is < 7 or > 32 || id.Any(ch => !char.IsAsciiLetterOrDigit(ch) && ch != '-'))
        {
            return Problema(400, "El vehículo necesita el bastidor (17 caracteres; en BMW y MINI valen los 7 últimos; en japoneses, el número de FRAME).");
        }
        return await Llamar(() => vinalfa.ResolverVehiculoAsync(id, ct));
    }

    [HttpGet("catalogo/{vehiculoHash}/grupos")]
    public Task<IActionResult> Grupos(string vehiculoHash, CancellationToken ct) => Llamar(() => vinalfa.GruposAsync(vehiculoHash, ct));

    [HttpGet("catalogo/{vehiculoHash}/buscar")]
    public Task<IActionResult> Buscar(string vehiculoHash, [FromQuery] string q, CancellationToken ct) =>
        string.IsNullOrWhiteSpace(q) || q.Length > 100
            ? Task.FromResult<IActionResult>(Problema(400, "Escribe qué buscar: un nombre de pieza o una referencia."))
            : Llamar(() => vinalfa.BuscarAsync(vehiculoHash, q.Trim(), ct));

    [HttpGet("secciones/{seccionHash}/subsecciones")]
    public Task<IActionResult> Subsecciones(string seccionHash, CancellationToken ct) => Llamar(() => vinalfa.SubseccionesAsync(seccionHash, ct));

    [HttpGet("secciones/{seccionHash}/piezas")]
    public Task<IActionResult> Piezas(string seccionHash, [FromQuery] string? vehiculo, CancellationToken ct) =>
        Llamar(() => vinalfa.PiezasAsync(seccionHash, string.IsNullOrEmpty(vehiculo) ? null : vehiculo, ct));

    private async Task<IActionResult> Llamar(Func<Task<JsonElement>> llamada)
    {
        if (!opciones.Configurado) return NoConfigurado();
        try
        {
            return Ok(await llamada());
        }
        catch (ErrorVinalfa e)
        {
            return Problema((int)e.Estado, e.Message);
        }
    }

    private ObjectResult NoConfigurado() => Problema(503, "Vinalfa no está configurado (falta Vinalfa:Token).");

    private ObjectResult Problema(int status, string detalle) =>
        StatusCode(status, new ProblemDetails { Status = status, Title = status == 404 ? "No encontrado" : "Error", Detail = detalle });
}
