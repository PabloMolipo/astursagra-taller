using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using System.Text.Json.Serialization;
using Anthropic.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;

namespace Taller.Api.Controllers;

public record EstadoAsistente(bool Configurado, string Modelo);

public record SesionListItem(int Id, string Titulo, int? OrdenId, string? Vehiculo, DateTimeOffset FechaActualizacion, long Tokens);

public record HerramientaUsada(string Nombre, string Entrada);

/// <summary>Mensaje tal como lo ve el mecánico (sin resultados de herramientas ni bloques internos).</summary>
public record MensajeVisible(string Rol, string Texto, string? Razonamiento, IReadOnlyList<HerramientaUsada> Herramientas, bool FichaEnviada, DateTimeOffset Fecha, IReadOnlyList<string>? Adjuntos = null);

public record SesionDetalle(int Id, string Titulo, int? OrdenId, string? Vehiculo, long TokensEntrada, long TokensSalida, IReadOnlyList<MensajeVisible> Mensajes);

public record CrearSesionRequest(int? OrdenId);

public record MensajeRequest([Required, MaxLength(8000)] string Texto, List<int>? DocumentoIds = null);

/// <summary>Asistente de diagnóstico: conversaciones guardadas y respuestas en streaming (text/event-stream).</summary>
[ApiController]
[Route("api/asistente")]
[Authorize(Roles = Roles.Taller)]
public class AsistenteController(TallerDbContext db, AsistenteDiagnostico asistente, ClienteAnthropic cliente, ILogger<AsistenteController> log) : ControllerBase
{
    /// <summary>Evita dos respuestas a la vez en la misma conversación (el historial debe crecer en orden).</summary>
    private static readonly ConcurrentDictionary<int, byte> EnCurso = new();

    private static readonly JsonSerializerOptions JsonEventos = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    [HttpGet("estado")]
    public EstadoAsistente Estado() => new(cliente.Configurado, AsistenteDiagnostico.Modelo);

    [HttpGet("sesiones")]
    public async Task<IReadOnlyList<SesionListItem>> Sesiones([FromQuery] int? ordenId, CancellationToken ct)
    {
        var query = db.SesionesAsistente.AsNoTracking();
        if (ordenId is not null)
        {
            query = query.Where(s => s.OrdenTrabajoId == ordenId);
        }
        return await query
            .OrderByDescending(s => s.FechaActualizacion)
            .Take(100)
            .Select(s => new SesionListItem(
                s.Id, s.Titulo, s.OrdenTrabajoId,
                s.OrdenTrabajo != null ? s.OrdenTrabajo.Vehiculo.Marca + " " + (s.OrdenTrabajo.Vehiculo.Modelo ?? "") : null,
                s.FechaActualizacion, s.TokensEntrada + s.TokensSalida))
            .ToListAsync(ct);
    }

    [HttpPost("sesiones")]
    public async Task<ActionResult<SesionDetalle>> Crear(CrearSesionRequest req, CancellationToken ct)
    {
        if (req.OrdenId is { } ordenId && !await db.OrdenesTrabajo.AnyAsync(o => o.Id == ordenId, ct))
        {
            ModelState.AddModelError(nameof(req.OrdenId), "La orden no existe.");
            return ValidationProblem(ModelState);
        }

        var ahora = DateTimeOffset.UtcNow;
        var sesion = new SesionAsistente
        {
            OrdenTrabajoId = req.OrdenId,
            Titulo = req.OrdenId is { } id ? $"Nueva consulta · OT-{id:00000}" : "Nueva consulta",
            FechaCreacion = ahora,
            FechaActualizacion = ahora
        };
        db.SesionesAsistente.Add(sesion);
        await db.SaveChangesAsync(ct);
        return (await Obtener(sesion.Id, ct)).Value!;
    }

    [HttpGet("sesiones/{id:int}")]
    public async Task<ActionResult<SesionDetalle>> Obtener(int id, CancellationToken ct)
    {
        var sesion = await db.SesionesAsistente.AsNoTracking()
            .Include(s => s.OrdenTrabajo).ThenInclude(o => o!.Vehiculo)
            .FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sesion is null)
        {
            return NotFound();
        }

        var mensajes = await db.MensajesAsistente.AsNoTracking()
            .Where(m => m.SesionAsistenteId == id)
            .OrderBy(m => m.Orden)
            .ToListAsync(ct);

        var v = sesion.OrdenTrabajo?.Vehiculo;
        return new SesionDetalle(
            sesion.Id, sesion.Titulo, sesion.OrdenTrabajoId, v is null ? null : $"{v.Marca} {v.Modelo}".Trim(),
            sesion.TokensEntrada, sesion.TokensSalida, Visibles(mensajes));
    }

    [HttpDelete("sesiones/{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var borradas = await db.SesionesAsistente.Where(s => s.Id == id).ExecuteDeleteAsync(ct);
        return borradas == 0 ? NotFound() : NoContent();
    }

    /// <summary>Envía un mensaje y devuelve la respuesta como eventos SSE: texto, pensando, herramienta, resultado, aviso, error y fin.</summary>
    [HttpPost("sesiones/{id:int}/mensajes")]
    public async Task Enviar(int id, MensajeRequest req, CancellationToken ct)
    {
        var sesion = await db.SesionesAsistente.AsNoTracking().FirstOrDefaultAsync(s => s.Id == id, ct);
        if (sesion is null)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }
        if (!cliente.Configurado)
        {
            Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            await Response.WriteAsJsonAsync(new ProblemDetails { Status = 503, Title = "Asistente no configurado", Detail = "Falta la clave de la API de Anthropic." }, ct);
            return;
        }
        if (!EnCurso.TryAdd(id, 0))
        {
            Response.StatusCode = StatusCodes.Status409Conflict;
            await Response.WriteAsJsonAsync(new ProblemDetails { Status = 409, Title = "Conflicto", Detail = "El asistente todavía está respondiendo en esta conversación." }, ct);
            return;
        }

        try
        {
            Response.ContentType = "text/event-stream";
            Response.Headers.CacheControl = "no-cache";
            Response.Headers["X-Accel-Buffering"] = "no";
            HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

            async Task Emitir(EventoAsistente e)
            {
                await Response.WriteAsync($"data: {JsonSerializer.Serialize(e, JsonEventos)}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }

            try
            {
                await asistente.ResponderAsync(sesion, req.Texto.Trim(), req.DocumentoIds ?? [], Emitir, ct);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                // El mecánico ha cerrado la página: el turno no se guarda.
            }
            catch (AnthropicUnauthorizedException)
            {
                await Emitir(new EventoAsistente("error", "La clave de la API de Anthropic no es válida."));
            }
            catch (AnthropicRateLimitException)
            {
                await Emitir(new EventoAsistente("error", "Demasiadas consultas seguidas. Espera un momento y vuelve a intentarlo."));
            }
            catch (Anthropic5xxException)
            {
                await Emitir(new EventoAsistente("error", "El servicio de IA no está disponible ahora mismo. Inténtalo en unos minutos."));
            }
            catch (AnthropicApiException e)
            {
                log.LogError(e, "Error de la API de Anthropic en la sesión {Sesion}", id);
                await Emitir(new EventoAsistente("error", "El asistente ha devuelto un error. Inténtalo de nuevo."));
            }
            catch (AnthropicIOException)
            {
                await Emitir(new EventoAsistente("error", "No hay conexión con el servicio de IA."));
            }
        }
        finally
        {
            EnCurso.TryRemove(id, out _);
        }
    }

    /// <summary>Agrupa los mensajes de API en lo que ve el mecánico: su pregunta y una respuesta (aunque haya habido varias consultas).</summary>
    private static List<MensajeVisible> Visibles(List<MensajeAsistente> mensajes)
    {
        var visibles = new List<MensajeVisible>();
        foreach (var m in mensajes)
        {
            var bloques = BloqueMensaje.Deserializar(m.BloquesJson);
            if (m.Rol == "user")
            {
                var textos = bloques.Where(b => b.Tipo == BloqueMensaje.TipoTexto && !b.Interno).Select(b => b.Texto).ToList();
                if (textos.Count == 0)
                {
                    continue; // Solo resultados de herramientas.
                }
                visibles.Add(new MensajeVisible("user", string.Join("\n\n", textos), null, [],
                    bloques.Any(b => b.Interno), m.Fecha,
                    bloques.Where(b => b.Tipo == BloqueMensaje.TipoDocumento).Select(b => b.Nombre ?? "Documento").ToList()));
                continue;
            }

            var texto = string.Join("", bloques.Where(b => b.Tipo == BloqueMensaje.TipoTexto).Select(b => b.Texto));
            var razonamiento = string.Join("\n\n", bloques.Where(b => b.Tipo == BloqueMensaje.TipoRazonamiento && !string.IsNullOrWhiteSpace(b.Texto)).Select(b => b.Texto));
            var herramientas = bloques.Where(b => b.Tipo == BloqueMensaje.TipoUsoHerramienta)
                .Select(b => new HerramientaUsada(b.Nombre ?? "", b.Contenido ?? "{}")).ToList();

            // Las respuestas encadenadas de un mismo turno (tras consultar herramientas) se juntan en una.
            if (visibles.Count > 0 && visibles[^1].Rol == "assistant")
            {
                var anterior = visibles[^1];
                visibles[^1] = anterior with
                {
                    Texto = string.Join("\n\n", new[] { anterior.Texto, texto }.Where(t => t.Length > 0)),
                    Razonamiento = string.Join("\n\n", new[] { anterior.Razonamiento, razonamiento }.Where(t => !string.IsNullOrEmpty(t))),
                    Herramientas = [.. anterior.Herramientas, .. herramientas]
                };
            }
            else
            {
                visibles.Add(new MensajeVisible("assistant", texto, razonamiento.Length > 0 ? razonamiento : null, herramientas, false, m.Fecha));
            }
        }
        return visibles;
    }
}
