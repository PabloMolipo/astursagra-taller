using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/vehiculos")]
public class VehiculosController(
    TallerDbContext db, AlmacenPrivado almacen, GeneradorImagenVehiculo generador, ILogger<VehiculosController> log) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<VehiculoListItem>> Listar(
        [FromQuery] string? q, [FromQuery] int? clienteId, [FromQuery] TipoVehiculo? tipo, CancellationToken ct)
    {
        var query = db.Vehiculos.AsNoTracking();

        if (clienteId is not null)
        {
            query = query.Where(v => v.ClienteId == clienteId);
        }

        if (tipo is not null)
        {
            query = query.Where(v => v.Tipo == tipo);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            var codigo = $"%{Normalizar.Codigo(q)}%";
            query = query.Where(v =>
                EF.Functions.ILike(v.Matricula!, codigo) ||
                EF.Functions.ILike(v.Bastidor!, codigo) ||
                EF.Functions.ILike(v.Marca, patron) ||
                EF.Functions.ILike(v.Modelo!, patron) ||
                EF.Functions.ILike(v.Cliente.Nombre, patron));
        }

        return await query
            .OrderBy(v => v.Matricula ?? v.Bastidor)
            .Take(200)
            .Select(Mapeos.VehiculoListItem)
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<VehiculoDetalle>> Obtener(int id, CancellationToken ct)
    {
        var v = await db.Vehiculos.AsNoTracking()
            .Include(v => v.Cliente)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(v => v.Id == id, ct);

        if (v is null)
        {
            return NotFound();
        }

        return ToDetalle(v);
    }

    [HttpPost]
    public async Task<ActionResult<VehiculoDetalle>> Crear(VehiculoRequest req, CancellationToken ct)
    {
        // Los vehículos nuevos deben identificarse. Los importados del histórico pueden no tener
        // matrícula ni bastidor, así que al editar no se exige.
        if (req.SinIdentificar)
        {
            ModelState.AddModelError(nameof(VehiculoRequest.Matricula), "Indica la matrícula o el número de bastidor.");
            return ValidationProblem(ModelState);
        }

        var cliente = await db.Clientes.FindAsync([req.ClienteId], ct);
        if (cliente is null)
        {
            return ClienteNoExiste();
        }

        var vehiculo = new Vehiculo { Marca = "", Cliente = cliente };
        Aplicar(vehiculo, req);
        db.Vehiculos.Add(vehiculo);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Obtener), new { id = vehiculo.Id }, ToDetalle(vehiculo));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<VehiculoDetalle>> Actualizar(int id, VehiculoRequest req, CancellationToken ct)
    {
        var vehiculo = await db.Vehiculos
            .Include(v => v.Cliente)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(v => v.Id == id, ct);

        if (vehiculo is null)
        {
            return NotFound();
        }

        if (vehiculo.ClienteId != req.ClienteId)
        {
            var cliente = await db.Clientes.FindAsync([req.ClienteId], ct);
            if (cliente is null)
            {
                return ClienteNoExiste();
            }
            vehiculo.Cliente = cliente;
        }

        Aplicar(vehiculo, req);
        await db.SaveChangesAsync(ct);
        return ToDetalle(vehiculo);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var imagen = await db.Vehiculos.Where(v => v.Id == id).Select(v => v.Imagen).FirstOrDefaultAsync(ct);
        var borrados = await db.Vehiculos.Where(v => v.Id == id).ExecuteDeleteAsync(ct);
        if (imagen is not null)
        {
            almacen.Borrar(imagen);
        }
        return borrados == 0 ? NotFound() : NoContent();
    }

    // ---- Visión 360 ----

    /// <summary>
    /// Todo lo relacionado con el vehículo, agrupado para la ficha: imagen, datos técnicos, propietario, uso, historial,
    /// diagnóstico, reprogramaciones, fotos y conversaciones con el mecánico virtual.
    /// </summary>
    [HttpGet("{id:int}/resumen")]
    public async Task<ActionResult<VehiculoResumen>> Resumen(int id, CancellationToken ct)
    {
        var v = await db.Vehiculos.AsNoTracking()
            .Include(v => v.Cliente)
            .Include(v => v.Ordenes).ThenInclude(o => o.Lineas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(v => v.Id == id, ct);
        if (v is null)
        {
            return NotFound();
        }
        foreach (var o in v.Ordenes)
        {
            o.Vehiculo = v;
        }

        var ordenIds = v.Ordenes.Select(o => o.Id).ToList();
        var ordenes = v.Ordenes.Where(o => o.Estado != EstadoOrden.Cancelado).OrderBy(o => o.FechaEntrada).ToList();
        var items = ordenes.Select(o => o.ToListItem()).ToList();

        var tecnicos = await ResumenVehiculo.TecnicosAsync(db, v.Matricula, ct);

        var c = v.Cliente;
        var vehiculosCliente = await db.Vehiculos.CountAsync(x => x.ClienteId == c.Id, ct);
        var propietario = new PropietarioResumen(c.Id, c.Nombre, c.Tipo, c.Telefono, c.Email, c.Poblacion, c.FechaAlta, vehiculosCliente);

        var historial = new HistorialResumen(
            ordenes.Count,
            ordenes.FirstOrDefault()?.FechaEntrada,
            ordenes.LastOrDefault()?.FechaEntrada,
            ordenes.LastOrDefault()?.MotivoEntrada,
            items.Sum(o => o.Total),
            items.Sum(o => o.Margen),
            items.LastOrDefault(o => o.Estado != EstadoOrden.Entregado),
            items.Where(o => !o.Pagado).Sum(o => o.Total));

        // Diagnóstico: los códigos sin resolver de la ficha más reciente y los que han salido en más de una visita.
        var fichas = await db.FichasDiagnosis.AsNoTracking()
            .Where(f => ordenIds.Contains(f.OrdenTrabajoId))
            .Select(f => new
            {
                f.OrdenTrabajoId,
                f.OrdenTrabajo.FechaEntrada,
                f.Conclusion,
                Codigos = f.Codigos.Select(x => new { x.Codigo, x.Descripcion, x.Estado }).ToList()
            })
            .ToListAsync(ct);
        var ultimaFicha = fichas.Where(f => f.Codigos.Count > 0 || f.Conclusion is not null).MaxBy(f => f.FechaEntrada);
        var diagnostico = new DiagnosticoResumen(
            ultimaFicha?.Codigos.Where(x => x.Estado != EstadoCodigo.Historico)
                .OrderBy(x => x.Estado == EstadoCodigo.Pendiente).ThenBy(x => x.Codigo).Select(x => new CodigoResumen(x.Codigo, x.Descripcion, x.Estado)).ToList() ?? [],
            fichas.SelectMany(f => f.Codigos.Select(x => x.Codigo).Distinct())
                .GroupBy(x => x).Where(g => g.Count() > 1).Select(g => g.Key).Order().ToList(),
            ultimaFicha?.OrdenTrabajoId, ultimaFicha?.FechaEntrada, ultimaFicha?.Conclusion);

        var repros = await db.Reprogramaciones.AsNoTracking().Where(r => r.VehiculoId == id)
            .OrderByDescending(r => r.Fecha).Select(r => new { r.Nombre, r.Fecha }).ToListAsync(ct);
        var repro = new ReproResumen(repros.Count, repros.FirstOrDefault()?.Nombre, repros.FirstOrDefault()?.Fecha);

        var media = await db.MultimediaOrdenes.AsNoTracking().Where(m => ordenIds.Contains(m.OrdenTrabajoId))
            .Select(m => new { m.OrdenTrabajoId, m.TipoContenido, m.Fecha }).ToListAsync(ct);
        var ultimaMedia = media.MaxBy(m => m.Fecha);
        var videos = media.Count(m => m.TipoContenido.StartsWith("video/"));
        var multimedia = new MultimediaResumen(media.Count - videos, videos, ultimaMedia?.OrdenTrabajoId, ultimaMedia?.Fecha);

        var conversaciones = await db.ConversacionesMecanico
            .CountAsync(x => x.OrdenTrabajoId != null && ordenIds.Contains(x.OrdenTrabajoId.Value), ct);

        return new VehiculoResumen(ImagenDto(v), generador.Configurado, tecnicos, propietario, ResumenVehiculo.Uso(v, ordenes), historial,
            diagnostico, repro, multimedia, conversaciones);
    }

    // ---- Imagen orientativa ----

    [HttpGet("{id:int}/imagen")]
    public async Task<IActionResult> Imagen(int id, CancellationToken ct)
    {
        var imagen = await db.Vehiculos.Where(v => v.Id == id).Select(v => v.Imagen).FirstOrDefaultAsync(ct);
        if (imagen is null || !System.IO.File.Exists(almacen.Ruta(imagen)))
        {
            return NotFound();
        }
        return PhysicalFile(almacen.Ruta(imagen), TipoImagen(imagen));
    }

    /// <summary>Genera con Gemini una imagen orientativa del vehículo (sustituye la que hubiera).</summary>
    [HttpPost("{id:int}/imagen/generar")]
    public async Task<ActionResult<ImagenVehiculoDto>> GenerarImagen(int id, GenerarImagenRequest? req, CancellationToken ct)
    {
        if (!generador.Configurado)
        {
            return Problem(statusCode: 503, title: "Error", detail: "Gemini no está configurado. Guarda la clave en Gemini:ApiKey.");
        }
        var v = await db.Vehiculos.FirstOrDefaultAsync(v => v.Id == id, ct);
        if (v is null)
        {
            return NotFound();
        }

        // El color elegido se queda como color del vehículo: así sale en la ficha y se reutiliza al regenerar.
        var color = Normalizar.Texto(req?.Color);
        if (color is not null)
        {
            if (!GeneradorImagenVehiculo.ColorValido(color))
            {
                ModelState.AddModelError(nameof(GenerarImagenRequest.Color), "El color solo puede llevar letras, espacios y guiones.");
                return ValidationProblem(ModelState);
            }
            v.Color = color;
        }

        byte[] datos;
        try
        {
            datos = await generador.GenerarAsync(v, ct);
        }
        catch (ErrorImagen e)
        {
            log.LogWarning(e, "No se ha podido generar la imagen del vehículo {Id}", id);
            return Problem(statusCode: 502, title: "Error", detail: e.Message);
        }

        using var flujo = new MemoryStream(datos);
        var guardada = await almacen.GuardarAsync(flujo, datos.Length, ct);
        if (guardada is null || !guardada.Value.Tipo.TipoContenido.StartsWith("image/"))
        {
            if (guardada is not null) almacen.Borrar(guardada.Value.Nombre);
            return Problem(statusCode: 502, title: "Error", detail: "Gemini ha devuelto la imagen en un formato que no se puede guardar.");
        }
        return await SustituirImagen(v, guardada.Value.Nombre, generada: true, ct);
    }

    /// <summary>Sube una foto real como imagen del vehículo (JPG, PNG o WebP de hasta 10 MB).</summary>
    [HttpPost("{id:int}/imagen")]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public async Task<ActionResult<ImagenVehiculoDto>> SubirImagen(int id, IFormFile archivo, CancellationToken ct)
    {
        var v = await db.Vehiculos.FirstOrDefaultAsync(v => v.Id == id, ct);
        if (v is null)
        {
            return NotFound();
        }
        var guardada = archivo.Length > 10 * 1024 * 1024 ? null : await almacen.GuardarAsync(archivo, ct);
        if (guardada is null || guardada.Value.Tipo.TipoContenido is not ("image/jpeg" or "image/png" or "image/webp"))
        {
            if (guardada is not null) almacen.Borrar(guardada.Value.Nombre);
            ModelState.AddModelError(nameof(archivo), "La imagen debe ser JPG, PNG o WebP y pesar como mucho 10 MB.");
            return ValidationProblem(ModelState);
        }
        return await SustituirImagen(v, guardada.Value.Nombre, generada: false, ct);
    }

    [HttpDelete("{id:int}/imagen")]
    public async Task<IActionResult> QuitarImagen(int id, CancellationToken ct)
    {
        var v = await db.Vehiculos.FirstOrDefaultAsync(v => v.Id == id, ct);
        if (v is null)
        {
            return NotFound();
        }
        if (v.Imagen is not null)
        {
            almacen.Borrar(v.Imagen);
            v.Imagen = null;
            v.ImagenFecha = null;
            v.ImagenGenerada = false;
            await db.SaveChangesAsync(ct);
        }
        return NoContent();
    }

    private async Task<ImagenVehiculoDto> SustituirImagen(Vehiculo v, string archivo, bool generada, CancellationToken ct)
    {
        var anterior = v.Imagen;
        v.Imagen = archivo;
        v.ImagenFecha = DateTimeOffset.UtcNow;
        v.ImagenGenerada = generada;
        await db.SaveChangesAsync(ct);
        if (anterior is not null)
        {
            almacen.Borrar(anterior);
        }
        return ImagenDto(v)!;
    }

    private static ImagenVehiculoDto? ImagenDto(Vehiculo v) => v.Imagen is null
        ? null
        : new ImagenVehiculoDto($"/api/vehiculos/{v.Id}/imagen?v={Path.GetFileNameWithoutExtension(v.Imagen)[..8]}",
            v.ImagenFecha ?? DateTimeOffset.UtcNow, v.ImagenGenerada);

    private static string TipoImagen(string archivo) => Path.GetExtension(archivo).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".webp" => "image/webp",
        _ => "image/jpeg"
    };

    private ActionResult ClienteNoExiste()
    {
        ModelState.AddModelError(nameof(VehiculoRequest.ClienteId), "El cliente no existe.");
        return ValidationProblem(ModelState);
    }

    private static void Aplicar(Vehiculo v, VehiculoRequest req)
    {
        v.Tipo = req.Tipo;
        v.Matricula = Normalizar.Codigo(req.Matricula);
        v.Bastidor = Normalizar.Codigo(req.Bastidor);
        v.Marca = req.Marca.Trim();
        v.Modelo = Normalizar.Texto(req.Modelo);
        v.Motor = Normalizar.Texto(req.Motor)?.ToUpperInvariant();
        v.Anio = req.Anio;
        v.Kilometros = req.Kilometros;
        v.Horas = req.Horas;
        v.Notas = Normalizar.Texto(req.Notas);
        v.Color = Normalizar.Texto(req.Color);
    }

    private static VehiculoDetalle ToDetalle(Vehiculo v)
    {
        // Las órdenes se mapean con el vehículo y cliente ya cargados.
        foreach (var o in v.Ordenes)
        {
            o.Vehiculo = v;
        }

        return new VehiculoDetalle(
            v.Id, v.Tipo, v.Matricula, v.Bastidor, v.Marca, v.Modelo, v.Anio, v.Kilometros, v.Horas, v.Notas,
            v.ClienteId, v.Cliente.Nombre,
            v.Ordenes.OrderByDescending(o => o.FechaEntrada).Select(o => o.ToListItem()).ToList(),
            v.Motor, v.Color);
    }
}
