using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Gestión del contenido de la web pública: datos del taller, catálogo de servicios y trabajos realizados.</summary>
[ApiController]
[Route("api/web")]
[Authorize(Roles = Roles.Taller)]
public class WebController(TallerDbContext db, AlmacenMedia media) : ControllerBase
{
    // Datos del taller

    [HttpGet("datos")]
    public async Task<DatosTallerDto> ObtenerDatos(CancellationToken ct) =>
        (await db.DatosTaller.AsNoTracking().FirstOrDefaultAsync(ct) ?? ContenidoInicial.Datos()).ToDto();

    [HttpPut("datos")]
    public async Task<DatosTallerDto> GuardarDatos(DatosTallerDto req, CancellationToken ct)
    {
        var datos = await db.DatosTaller.FirstOrDefaultAsync(ct);
        if (datos is null)
        {
            datos = ContenidoInicial.Datos();
            db.DatosTaller.Add(datos);
        }

        datos.Nombre = req.Nombre.Trim();
        datos.Lema = Normalizar.Texto(req.Lema);
        datos.Presentacion = Normalizar.Texto(req.Presentacion);
        datos.Telefono = Normalizar.Texto(req.Telefono);
        datos.WhatsApp = Normalizar.Texto(req.WhatsApp);
        datos.Email = Normalizar.Texto(req.Email);
        datos.Direccion = Normalizar.Texto(req.Direccion);
        datos.CodigoPostal = Normalizar.Texto(req.CodigoPostal);
        datos.Poblacion = Normalizar.Texto(req.Poblacion);
        datos.Provincia = Normalizar.Texto(req.Provincia);
        datos.Horario = Normalizar.Texto(req.Horario);
        datos.UrlMapa = Normalizar.Texto(req.UrlMapa);

        await db.SaveChangesAsync(ct);
        return datos.ToDto();
    }

    // Catálogo de servicios

    [HttpGet("servicios")]
    public async Task<IReadOnlyList<ServicioDto>> Servicios(CancellationToken ct) =>
        (await db.Servicios.AsNoTracking().OrderBy(s => s.Orden).ThenBy(s => s.Titulo).ToListAsync(ct)).Select(s => s.ToDto()).ToList();

    [HttpPost("servicios")]
    public async Task<ServicioDto> CrearServicio(ServicioRequest req, CancellationToken ct)
    {
        var servicio = new Servicio
        {
            Slug = await Slug.UnicoAsync(req.Titulo, s => db.Servicios.AnyAsync(x => x.Slug == s, ct)),
            Titulo = "", Resumen = "", Icono = ""
        };
        Aplicar(servicio, req);
        db.Servicios.Add(servicio);
        await db.SaveChangesAsync(ct);
        return servicio.ToDto();
    }

    [HttpPut("servicios/{id:int}")]
    public async Task<ActionResult<ServicioDto>> ActualizarServicio(int id, ServicioRequest req, CancellationToken ct)
    {
        var servicio = await db.Servicios.FindAsync([id], ct);
        if (servicio is null)
        {
            return NotFound();
        }
        Aplicar(servicio, req);
        await db.SaveChangesAsync(ct);
        return servicio.ToDto();
    }

    [HttpDelete("servicios/{id:int}")]
    public async Task<IActionResult> EliminarServicio(int id, CancellationToken ct)
    {
        var borrados = await db.Servicios.Where(s => s.Id == id).ExecuteDeleteAsync(ct);
        return borrados == 0 ? NotFound() : NoContent();
    }

    // Trabajos realizados

    [HttpGet("trabajos")]
    public async Task<IReadOnlyList<TrabajoListItem>> Trabajos(CancellationToken ct) =>
        (await db.TrabajosRealizados.AsNoTracking().Include(t => t.Fotos)
            .OrderByDescending(t => t.Fecha).ThenByDescending(t => t.Id)
            .ToListAsync(ct))
        .Select(t => t.ToListItem()).ToList();

    [HttpGet("trabajos/{id:int}")]
    public async Task<ActionResult<TrabajoDetalle>> Trabajo(int id, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.AsNoTracking().Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        return trabajo is null ? NotFound() : trabajo.ToDetalle();
    }

    [HttpPost("trabajos")]
    public async Task<TrabajoDetalle> CrearTrabajo(TrabajoRequest req, CancellationToken ct)
    {
        var trabajo = new TrabajoRealizado
        {
            Slug = await Slug.UnicoAsync(req.Titulo, s => db.TrabajosRealizados.AnyAsync(x => x.Slug == s, ct)),
            Titulo = "", Resumen = "",
            FechaAlta = DateTimeOffset.UtcNow
        };
        Aplicar(trabajo, req);
        db.TrabajosRealizados.Add(trabajo);
        await db.SaveChangesAsync(ct);
        return trabajo.ToDetalle();
    }

    [HttpPut("trabajos/{id:int}")]
    public async Task<ActionResult<TrabajoDetalle>> ActualizarTrabajo(int id, TrabajoRequest req, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (trabajo is null)
        {
            return NotFound();
        }
        Aplicar(trabajo, req);
        await db.SaveChangesAsync(ct);
        return trabajo.ToDetalle();
    }

    [HttpDelete("trabajos/{id:int}")]
    public async Task<IActionResult> EliminarTrabajo(int id, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (trabajo is null)
        {
            return NotFound();
        }
        var archivos = trabajo.Fotos.Select(f => f.Archivo).ToList();
        db.TrabajosRealizados.Remove(trabajo);
        await db.SaveChangesAsync(ct);
        archivos.ForEach(media.Borrar);
        return NoContent();
    }

    // Fotos

    /// <summary>Sube una foto (JPG, PNG o WebP, hasta 10 MB) o un vídeo (MP4, MOV o WebM, hasta 300 MB) al trabajo.</summary>
    [HttpPost("trabajos/{id:int}/fotos")]
    [RequestSizeLimit(AlmacenMedia.Maximo + 1024 * 1024)]
    [RequestFormLimits(MultipartBodyLengthLimit = AlmacenMedia.Maximo + 1024 * 1024)]
    public async Task<ActionResult<TrabajoDetalle>> SubirFoto(int id, IFormFile archivo, [FromForm] string? pie, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        if (trabajo is null)
        {
            return NotFound();
        }

        var guardado = await media.GuardarAsync(archivo, ct);
        if (guardado is not null && !AlmacenMedia.EsVideo(guardado.Value.Nombre) && archivo.Length > AlmacenMedia.MaximoFoto)
        {
            media.Borrar(guardado.Value.Nombre);
            guardado = null;
        }
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), await EsHeicAsync(archivo)
                ? "Las fotos HEIC del iPhone no se ven en los navegadores. En el iPhone: Ajustes → Cámara → Formatos → «Más compatible»."
                : "Solo fotos JPG, PNG o WebP de hasta 10 MB y vídeos MP4, MOV o WebM de hasta 300 MB.");
            return ValidationProblem(ModelState);
        }

        trabajo.Fotos.Add(new FotoTrabajo
        {
            Archivo = guardado.Value.Nombre,
            Pie = Normalizar.Texto(pie),
            Orden = trabajo.Fotos.Count == 0 ? 0 : trabajo.Fotos.Max(f => f.Orden) + 1
        });
        await db.SaveChangesAsync(ct);
        return trabajo.ToDetalle();
    }

    private static async Task<bool> EsHeicAsync(IFormFile archivo)
    {
        var cabecera = new byte[12];
        await using var lectura = archivo.OpenReadStream();
        return await lectura.ReadAtLeastAsync(cabecera, cabecera.Length, throwOnEndOfStream: false) == 12 && AlmacenMultimedia.EsHeic(cabecera);
    }

    [HttpPut("trabajos/{id:int}/fotos/{fotoId:int}")]
    public async Task<ActionResult<TrabajoDetalle>> ActualizarFoto(int id, int fotoId, FotoRequest req, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        var foto = trabajo?.Fotos.FirstOrDefault(f => f.Id == fotoId);
        if (trabajo is null || foto is null)
        {
            return NotFound();
        }
        foto.Pie = Normalizar.Texto(req.Pie);
        foto.Orden = req.Orden;
        await db.SaveChangesAsync(ct);
        return trabajo.ToDetalle();
    }

    [HttpDelete("trabajos/{id:int}/fotos/{fotoId:int}")]
    public async Task<ActionResult<TrabajoDetalle>> EliminarFoto(int id, int fotoId, CancellationToken ct)
    {
        var trabajo = await db.TrabajosRealizados.Include(t => t.Fotos).FirstOrDefaultAsync(t => t.Id == id, ct);
        var foto = trabajo?.Fotos.FirstOrDefault(f => f.Id == fotoId);
        if (trabajo is null || foto is null)
        {
            return NotFound();
        }
        trabajo.Fotos.Remove(foto);
        await db.SaveChangesAsync(ct);
        media.Borrar(foto.Archivo);
        return trabajo.ToDetalle();
    }

    private static void Aplicar(Servicio s, ServicioRequest req)
    {
        s.Titulo = req.Titulo.Trim();
        s.Resumen = req.Resumen.Trim();
        s.Descripcion = Normalizar.Texto(req.Descripcion);
        s.Icono = req.Icono.Trim();
        s.Orden = req.Orden;
        s.Publicado = req.Publicado;
    }

    private static void Aplicar(TrabajoRealizado t, TrabajoRequest req)
    {
        t.Titulo = req.Titulo.Trim();
        t.Resumen = req.Resumen.Trim();
        t.Descripcion = Normalizar.Texto(req.Descripcion);
        t.Fecha = req.Fecha;
        t.Vehiculo = Normalizar.Texto(req.Vehiculo);
        t.TipoVehiculo = req.TipoVehiculo;
        t.Servicios = (req.Servicios ?? []).Distinct().ToList();
        t.Publicado = req.Publicado;
        t.Destacado = req.Destacado;
    }
}
