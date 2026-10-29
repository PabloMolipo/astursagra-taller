using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;

namespace Taller.Api.Integraciones;

/// <summary>
/// Lanza la sincronización con SharePoint cada <c>IntervaloMinutos</c> (si está configurado) o cuando se pide desde
/// la aplicación. Nunca hay dos sincronizaciones a la vez.
/// </summary>
public class ServicioSincronizacion(IServiceScopeFactory scopes, OpcionesSharePoint opciones, ILogger<ServicioSincronizacion> log) : BackgroundService
{
    private readonly SemaphoreSlim peticion = new(0, 1);
    private volatile bool enCurso;
    private volatile string? progreso;

    public bool EnCurso => enCurso;
    public string? Progreso => progreso;

    /// <summary>Pide una sincronización inmediata. Devuelve false si ya hay una en marcha.</summary>
    public bool Solicitar()
    {
        if (enCurso || !opciones.Configurado)
        {
            return false;
        }
        try
        {
            peticion.Release();
        }
        catch (SemaphoreFullException)
        {
            // Ya había una petición pendiente.
        }
        return true;
    }

    protected override async Task ExecuteAsync(CancellationToken parada)
    {
        if (!opciones.Configurado)
        {
            log.LogInformation("SharePoint no está configurado: la sincronización automática está desactivada.");
            return;
        }
        if (!opciones.Automatica)
        {
            // En Cloud Run la lanza un trabajo programado (comando sincronizar-sharepoint); aquí solo a petición.
            log.LogInformation("Sincronización automática de SharePoint desactivada (SharePoint:Automatica=false): solo a petición.");
            while (!parada.IsCancellationRequested)
            {
                try { await peticion.WaitAsync(parada); } catch (OperationCanceledException) { break; }
                await EjecutarAsync(parada);
            }
            return;
        }

        // Primera sincronización al poco de arrancar; luego cada intervalo o cuando se pida.
        var espera = TimeSpan.FromSeconds(30);
        while (!parada.IsCancellationRequested)
        {
            try
            {
                await peticion.WaitAsync(espera, parada);
            }
            catch (OperationCanceledException)
            {
                break;
            }

            await EjecutarAsync(parada);
            espera = TimeSpan.FromMinutes(Math.Max(5, opciones.IntervaloMinutos));
        }
    }

    private async Task EjecutarAsync(CancellationToken ct)
    {
        enCurso = true;
        progreso = "Empezando…";
        try
        {
            // Cada biblioteca por separado: si falla una, la otra se sincroniza igual.
            try
            {
                using var scope = scopes.CreateScope();
                var resultado = await scope.ServiceProvider.GetRequiredService<SincronizadorSharePoint>().SincronizarAsync(p => progreso = p, ct);
                log.LogInformation("Documentación de SharePoint sincronizada: {Resultado}", resultado);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                log.LogError(e, "Error al sincronizar la documentación de SharePoint");
                await GuardarErrorAsync(Domain.EstadoSincronizacion.IdDocumentacion, e is ErrorGraph ? e.Message : "Error inesperado al sincronizar. Revisa el registro de la API.", ct);
            }

            if (!string.IsNullOrWhiteSpace(opciones.BibliotecaRepro))
            {
                try
                {
                    using var scope = scopes.CreateScope();
                    var resultado = await scope.ServiceProvider.GetRequiredService<SincronizadorRepro>().SincronizarAsync(p => progreso = p, ct);
                    log.LogInformation("REPRO de SharePoint sincronizado: {Resultado}", resultado);
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    log.LogError(e, "Error al sincronizar REPRO de SharePoint");
                    await GuardarErrorAsync(Domain.EstadoSincronizacion.IdRepro, e is ErrorGraph ? e.Message : "Error inesperado al sincronizar REPRO. Revisa el registro de la API.", ct);
                }
            }
        }
        finally
        {
            enCurso = false;
            progreso = null;
        }
    }

    /// <summary>
    /// Anota el error en la base de datos. Si tampoco se puede (p. ej. la base de datos está caída), solo se registra:
    /// una excepción aquí pararía el servicio en segundo plano y, con él, toda la aplicación.
    /// </summary>
    private async Task GuardarErrorAsync(int biblioteca, string mensaje, CancellationToken ct)
    {
        try
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<TallerDbContext>();
            var estado = await db.EstadoSincronizacion.FindAsync([biblioteca], ct)
                         ?? db.EstadoSincronizacion.Add(new Domain.EstadoSincronizacion { Id = biblioteca }).Entity;
            estado.UltimaSincronizacion = DateTimeOffset.UtcNow;
            estado.UltimoResultado = mensaje;
            estado.UltimaConError = true;
            await db.SaveChangesAsync(ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogWarning(e, "No se ha podido guardar el estado de error de la sincronización ({Biblioteca}).", biblioteca);
        }
    }
}
