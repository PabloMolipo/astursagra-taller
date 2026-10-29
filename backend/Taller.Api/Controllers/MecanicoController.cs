using System.Collections.Concurrent;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Google.GenAI;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

public record EstadoMecanicoDto(bool Configurado, string Modelo);
public record ConversacionMecanicoDto(int Id, string Titulo, DateTimeOffset Creada, DateTimeOffset Actualizada, int? OrdenId);
public record MensajeMecanicoDto(int Id, bool EsUsuario, string Texto, DateTimeOffset Fecha);
public record ConversacionMecanicoDetalle(int Id, string Titulo, int? OrdenId, IReadOnlyList<MensajeMecanicoDto> Mensajes);
public record MensajeMecanicoRequest([Required, MaxLength(8000)] string Texto);
public record EventoMecanico(string Tipo, string? Texto = null, int? Id = null);

/// <summary>
/// Mecánico virtual (Gemini): conversaciones por usuario y respuestas en streaming (text/event-stream con eventos
/// texto, error y fin). Cada turno se guarda entero o no se guarda.
/// </summary>
[ApiController]
[Route("api/mecanico")]
[Authorize(Roles = Roles.Taller)]
public class MecanicoController(TallerDbContext db, MecanicoVirtual mecanico, AsistenteDiagnostico asistente, ILogger<MecanicoController> log) : ControllerBase
{
    private static readonly ConcurrentDictionary<int, byte> EnCurso = new();
    private static readonly JsonSerializerOptions JsonEventos = new(JsonSerializerDefaults.Web) { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull };

    private string Usuario => User.Identity?.Name ?? "";

    [HttpGet("estado")]
    public EstadoMecanicoDto Estado() => new(mecanico.Configurado, mecanico.Modelo);

    [HttpGet("conversaciones")]
    public async Task<IReadOnlyList<ConversacionMecanicoDto>> Listar(CancellationToken ct) =>
        await db.ConversacionesMecanico.AsNoTracking()
            .Where(c => c.Usuario == Usuario)
            .OrderByDescending(c => c.Actualizada)
            .Take(200)
            .Select(c => new ConversacionMecanicoDto(c.Id, c.Titulo, c.Creada, c.Actualizada, c.OrdenTrabajoId))
            .ToListAsync(ct);

    [HttpPost("conversaciones")]
    public async Task<ConversacionMecanicoDto> Crear(CancellationToken ct)
    {
        var ahora = DateTimeOffset.UtcNow;
        var c = new ConversacionMecanico { Titulo = "Nueva conversación", Usuario = Usuario, Creada = ahora, Actualizada = ahora };
        db.ConversacionesMecanico.Add(c);
        await db.SaveChangesAsync(ct);
        return new ConversacionMecanicoDto(c.Id, c.Titulo, c.Creada, c.Actualizada, null);
    }

    /// <summary>
    /// Conversación del usuario para una orden (la última; con nueva=true, una nueva). El modelo recibe en cada
    /// pregunta los datos actualizados de la orden y su vehículo.
    /// </summary>
    [HttpPost("ordenes/{ordenId:int}/conversacion")]
    public async Task<ActionResult<ConversacionMecanicoDetalle>> DeOrden(int ordenId, [FromQuery] bool nueva, CancellationToken ct)
    {
        var orden = await db.OrdenesTrabajo.AsNoTracking().Where(o => o.Id == ordenId)
            .Select(o => new { o.Id, o.Vehiculo.Marca, o.Vehiculo.Modelo }).FirstOrDefaultAsync(ct);
        if (orden is null)
        {
            return NotFound();
        }
        var c = nueva ? null : await db.ConversacionesMecanico.AsNoTracking()
            .Where(x => x.OrdenTrabajoId == ordenId && x.Usuario == Usuario).OrderByDescending(x => x.Actualizada).FirstOrDefaultAsync(ct);
        if (c is null)
        {
            var ahora = DateTimeOffset.UtcNow;
            var titulo = $"OT-{orden.Id:00000} · {orden.Marca} {orden.Modelo}".Trim();
            c = new ConversacionMecanico { Titulo = titulo.Length > 120 ? titulo[..120] : titulo, Usuario = Usuario, OrdenTrabajoId = ordenId, Creada = ahora, Actualizada = ahora };
            db.ConversacionesMecanico.Add(c);
            await db.SaveChangesAsync(ct);
        }
        return (await Obtener(c.Id, ct)).Value!;
    }

    [HttpGet("conversaciones/{id:int}")]
    public async Task<ActionResult<ConversacionMecanicoDetalle>> Obtener(int id, CancellationToken ct)
    {
        var c = await db.ConversacionesMecanico.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id && x.Usuario == Usuario, ct);
        if (c is null)
        {
            return NotFound();
        }
        var mensajes = await db.MensajesMecanico.AsNoTracking().Where(m => m.ConversacionMecanicoId == id).OrderBy(m => m.Id)
            .Select(m => new MensajeMecanicoDto(m.Id, m.EsUsuario, m.Texto, m.Fecha)).ToListAsync(ct);
        return new ConversacionMecanicoDetalle(c.Id, c.Titulo, c.OrdenTrabajoId, mensajes);
    }

    [HttpDelete("conversaciones/{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var borradas = await db.ConversacionesMecanico.Where(c => c.Id == id && c.Usuario == Usuario).ExecuteDeleteAsync(ct);
        return borradas == 0 ? NotFound() : NoContent();
    }

    [HttpPost("conversaciones/{id:int}/mensajes")]
    public async Task Enviar(int id, MensajeMecanicoRequest req, CancellationToken ct)
    {
        var conversacion = await db.ConversacionesMecanico.FirstOrDefaultAsync(c => c.Id == id && c.Usuario == Usuario, ct);
        var texto = req.Texto.Trim();
        if (conversacion is null || texto.Length == 0)
        {
            await Problema(conversacion is null ? 404 : 400, conversacion is null ? "La conversación no existe." : "Escribe una pregunta.", ct);
            return;
        }
        if (!mecanico.Configurado)
        {
            await Problema(503, "El mecánico virtual no está configurado (falta Gemini:ApiKey).", ct);
            return;
        }
        if (!EnCurso.TryAdd(id, 0))
        {
            await Problema(409, "El mecánico virtual todavía está respondiendo en esta conversación.", ct);
            return;
        }

        try
        {
            Response.ContentType = "text/event-stream";
            Response.Headers.CacheControl = "no-cache";
            Response.Headers["X-Accel-Buffering"] = "no";
            HttpContext.Features.Get<IHttpResponseBodyFeature>()?.DisableBuffering();

            async Task Emitir(EventoMecanico e)
            {
                await Response.WriteAsync($"data: {JsonSerializer.Serialize(e, JsonEventos)}\n\n", ct);
                await Response.Body.FlushAsync(ct);
            }

            var historial = await db.MensajesMecanico.AsNoTracking().Where(m => m.ConversacionMecanicoId == id)
                .OrderByDescending(m => m.Id).Take(MecanicoVirtual.MaxHistorial - 1)
                .Select(m => new { m.EsUsuario, m.Texto }).ToListAsync(ct);
            var turnos = historial.AsEnumerable().Reverse().Select(m => (m.EsUsuario, m.Texto)).Append((true, texto)).ToList();

            var contexto = await asistente.FichaComoTextoAsync(conversacion.OrdenTrabajoId, ct);
            var respuesta = new System.Text.StringBuilder();
            try
            {
                await foreach (var trozo in mecanico.ResponderAsync(turnos, contexto, ct))
                {
                    respuesta.Append(trozo);
                    await Emitir(new EventoMecanico("texto", trozo));
                }
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return; // El mecánico ha cerrado la página: el turno no se guarda.
            }
            catch (ClientError e)
            {
                log.LogWarning(e, "Gemini rechazó la petición en la conversación {Id}", id);
                await Emitir(new EventoMecanico("error", MensajeDeError(e)));
                return;
            }
            catch (Exception e) when (e is ServerError or ApiException or HttpRequestException or TaskCanceledException)
            {
                log.LogWarning(e, "Error de Gemini en la conversación {Id}", id);
                await Emitir(new EventoMecanico("error", "El servicio de Gemini no está disponible ahora mismo. Inténtalo en unos minutos."));
                return;
            }

            if (respuesta.Length == 0)
            {
                await Emitir(new EventoMecanico("error", "Gemini no ha devuelto respuesta (puede que la pregunta haya activado un filtro). Prueba a reformularla."));
                return;
            }

            var ahora = DateTimeOffset.UtcNow;
            db.MensajesMecanico.Add(new MensajeMecanico { ConversacionMecanicoId = id, EsUsuario = true, Texto = texto, Fecha = ahora });
            var guardada = new MensajeMecanico { ConversacionMecanicoId = id, EsUsuario = false, Texto = respuesta.ToString(), Fecha = ahora };
            db.MensajesMecanico.Add(guardada);
            if (conversacion.Titulo == "Nueva conversación")
            {
                var linea = texto.Split('\n', StringSplitOptions.RemoveEmptyEntries)[0].Trim();
                conversacion.Titulo = linea.Length > 80 ? linea[..80].TrimEnd() + "…" : linea;
            }
            conversacion.Actualizada = ahora;
            await db.SaveChangesAsync(CancellationToken.None);
            await Emitir(new EventoMecanico("fin", conversacion.Titulo, guardada.Id));
        }
        finally
        {
            EnCurso.TryRemove(id, out _);
        }
    }

    /// <summary>Errores 4xx de Gemini en lenguaje del taller (sin reenviar su texto).</summary>
    private static string MensajeDeError(ClientError e)
    {
        var t = e.Message.ToLowerInvariant();
        if (t.Contains("api key") || t.Contains("api_key") || t.Contains("permission") || t.Contains("unauthenticated") || t.Contains("403") || t.Contains("401"))
            return "La clave de Gemini no es válida o no tiene permiso. Revisa Gemini:ApiKey.";
        if (t.Contains("quota") || t.Contains("resource_exhausted") || t.Contains("429") || t.Contains("rate"))
            return "Se ha alcanzado el límite de consultas de Gemini. Espera un momento y vuelve a intentarlo.";
        if (t.Contains("not found") || t.Contains("404") || t.Contains("model"))
            return "El modelo de Gemini configurado no está disponible. Revisa Gemini:Modelo.";
        return "Gemini no ha aceptado la pregunta. Prueba a reformularla.";
    }

    private async Task Problema(int status, string detalle, CancellationToken ct)
    {
        Response.StatusCode = status;
        await Response.WriteAsJsonAsync(new ProblemDetails { Status = status, Title = status == 404 ? "No encontrado" : "Error", Detail = detalle }, ct);
    }
}
