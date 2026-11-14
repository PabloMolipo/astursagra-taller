using System.IO.Compression;
using System.Security.Cryptography;
using Anthropic.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Centralitas;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;
using Taller.Api.Integraciones;

namespace Taller.Api.Controllers;

/// <summary>
/// Lecturas de centralitas (motor, cambio, ABS…): se sube el binario, se identifica y se buscan sus mapas, que luego se
/// pueden nombrar, ajustar o añadir a mano. El contenido se descarga entero para verlo en el navegador.
/// </summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/centralitas")]
public class CentralitasController(TallerDbContext db, AlmacenCentralitas almacen, ClienteGraph graph, OpcionesSharePoint opcionesSharePoint) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<CentralitaListItem>> Listar(
        [FromQuery] TipoCentralita? tipo, [FromQuery] int? vehiculoId, [FromQuery] string? q, CancellationToken ct)
    {
        var query = db.Centralitas.AsNoTracking();
        if (tipo is not null) query = query.Where(c => c.Tipo == tipo);
        if (vehiculoId is not null) query = query.Where(c => c.VehiculoId == vehiculoId);
        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            query = query.Where(c => EF.Functions.ILike(c.Nombre, patron) || EF.Functions.ILike(c.NombreArchivo, patron)
                || EF.Functions.ILike(c.Familia!, patron) || EF.Functions.ILike(c.Hardware!, patron) || EF.Functions.ILike(c.Software!, patron)
                || EF.Functions.ILike(c.Referencia!, patron) || EF.Functions.ILike(c.Vehiculo!.Matricula!, patron)
                || EF.Functions.ILike(c.Vehiculo!.Marca + " " + c.Vehiculo.Modelo, patron));
        }
        return await query.OrderByDescending(c => c.FechaAlta).Take(500)
            .Select(c => new CentralitaListItem(c.Id, c.Tipo, c.Nombre, c.NombreArchivo, c.Tamano, c.Familia, c.Hardware, c.Software,
                c.Referencia, c.VehiculoId, c.Vehiculo == null ? null : (c.Vehiculo.Marca + " " + c.Vehiculo.Modelo).Trim(),
                c.Vehiculo == null ? null : c.Vehiculo.Matricula ?? c.Vehiculo.Bastidor, c.Mapas.Count, c.FechaAlta,
                c.Mapas.Count(m => m.Origen == OrigenMapa.Manual)))
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<CentralitaDetalle>> Obtener(int id, CancellationToken ct)
    {
        var c = await db.Centralitas.AsNoTracking().Include(x => x.Vehiculo).Include(x => x.Mapas).AsSplitQuery()
            .FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        var comparada = c.ComparadaConId is { } otra ? await db.Centralitas.AsNoTracking().Where(x => x.Id == otra).Select(x => x.Nombre + " (" + x.NombreArchivo + ")").FirstOrDefaultAsync(ct) : null;
        return ToDetalle(c, await Biblioteca.Info(db, c, ct), comparada);
    }

    /// <summary>Sube una lectura (binario en bruto, hasta 32 MB), la identifica y busca sus mapas.</summary>
    [HttpPost]
    [RequestSizeLimit(AlmacenCentralitas.Maximo + 64 * 1024)]
    public async Task<ActionResult<CentralitaDetalle>> Subir(IFormFile archivo, [FromForm] TipoCentralita tipo, [FromForm] int? vehiculoId, CancellationToken ct)
    {
        if (vehiculoId is not null && !await db.Vehiculos.AnyAsync(v => v.Id == vehiculoId, ct))
        {
            ModelState.AddModelError(nameof(vehiculoId), "El vehículo no existe.");
            return ValidationProblem(ModelState);
        }
        if (await EsTextoHex(archivo, ct))
        {
            ModelState.AddModelError(nameof(archivo), "Es un archivo Intel HEX o Motorola S-record (texto). De momento solo se admiten binarios en bruto (.bin, .ori…): conviértelo a binario con tu herramienta de lectura.");
            return ValidationProblem(ModelState);
        }
        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), "Sube el binario de la lectura (.bin, .ori…), de hasta 32 MB. Las fotos, PDF y vídeos no son lecturas de centralita.");
            return ValidationProblem(ModelState);
        }

        var nombreArchivo = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : "lectura.bin";
        var c = await Crear(guardado.Value.Nombre, nombreArchivo, tipo, vehiculoId, ct);
        return CreatedAtAction(nameof(Obtener), new { id = c.Id }, (await Obtener(c.Id, ct)).Value);
    }

    /// <summary>
    /// Crea una lectura a partir de un archivo de una reprogramación (REPRO de SharePoint), sin descargarlo en el
    /// navegador. Si ya hay una lectura con el mismo contenido, devuelve esa. Sin vehículo, toma el de la reprogramación.
    /// </summary>
    [HttpPost("desde-repro")]
    public async Task<ActionResult<CentralitaDetalle>> DesdeRepro(DesdeReproRequest req, CancellationToken ct)
    {
        var archivo = await db.ArchivosReprogramacion.AsNoTracking().FirstOrDefaultAsync(a => a.Id == req.ArchivoId, ct);
        var driveId = await db.EstadoSincronizacion.AsNoTracking().Where(e => e.Id == EstadoSincronizacion.IdRepro).Select(e => e.DriveId).FirstOrDefaultAsync(ct);
        if (archivo is null)
        {
            return NotFound();
        }
        if (!opcionesSharePoint.Configurado || driveId is null)
        {
            return Problem(statusCode: 503, detail: "SharePoint no está configurado o REPRO aún no se ha sincronizado.");
        }
        if (archivo.Tamano > AlmacenCentralitas.Maximo)
        {
            ModelState.AddModelError(nameof(req.ArchivoId), "El archivo pesa más de 32 MB: no parece una lectura de centralita.");
            return ValidationProblem(ModelState);
        }
        var vehiculoId = req.VehiculoId ?? await db.Reprogramaciones.Where(r => r.Id == archivo.ReprogramacionId).Select(r => r.VehiculoId).FirstOrDefaultAsync(ct);

        (string Nombre, TipoArchivo Tipo)? guardado;
        try
        {
            using var respuesta = await graph.DescargarAsync(driveId, archivo.SharePointId, ct);
            await using var contenido = await respuesta.Content.ReadAsStreamAsync(ct);
            guardado = await almacen.GuardarAsync(contenido, respuesta.Content.Headers.ContentLength ?? archivo.Tamano, ct);
        }
        catch (ErrorGraph)
        {
            return Problem(statusCode: 502, detail: "No se ha podido leer el archivo de SharePoint. Puede que se haya movido o borrado: sincroniza de nuevo.");
        }
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(req.ArchivoId), "Ese archivo no es una lectura de centralita (es una foto, un PDF o un vídeo, o está vacío).");
            return ValidationProblem(ModelState);
        }

        var hash = Convert.ToHexStringLower(SHA256.HashData(await System.IO.File.ReadAllBytesAsync(almacen.Ruta(guardado.Value.Nombre), ct)));
        if (await db.Centralitas.AsNoTracking().Where(x => x.Sha256 == hash).Select(x => (int?)x.Id).FirstOrDefaultAsync(ct) is { } existente)
        {
            almacen.Borrar(guardado.Value.Nombre);
            return await Obtener(existente, ct);
        }
        var c = await Crear(guardado.Value.Nombre, archivo.Nombre[..Math.Min(archivo.Nombre.Length, 255)], req.Tipo, vehiculoId, ct);
        return CreatedAtAction(nameof(Obtener), new { id = c.Id }, (await Obtener(c.Id, ct)).Value);
    }

    /// <summary>Indica con qué otra lectura (la modificada u original del mismo coche) se compara; null para quitarla.</summary>
    [HttpPut("{id:int}/comparada")]
    public async Task<ActionResult<CentralitaDetalle>> Comparada(int id, ComparadaRequest req, CancellationToken ct)
    {
        var c = await db.Centralitas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        if (req.OtraId is { } otraId)
        {
            var otra = await db.Centralitas.AsNoTracking().Where(x => x.Id == otraId).Select(x => new { x.Tamano }).FirstOrDefaultAsync(ct);
            if (otra is null || otraId == id)
            {
                ModelState.AddModelError(nameof(req.OtraId), "Elige otra lectura.");
            }
            else if (otra.Tamano != c.Tamano)
            {
                ModelState.AddModelError(nameof(req.OtraId), "Las dos lecturas deben tener el mismo tamaño para compararlas.");
            }
            if (!ModelState.IsValid)
            {
                return ValidationProblem(ModelState);
            }
        }
        c.ComparadaConId = req.OtraId;
        await db.SaveChangesAsync(ct);
        return await Obtener(id, ct);
    }

    /// <summary>Crea la lectura de un archivo ya guardado en el almacén: identificación, mapas y biblioteca.</summary>
    private async Task<Centralita> Crear(string archivoGuardado, string nombreArchivo, TipoCentralita tipo, int? vehiculoId, CancellationToken ct)
    {
        var datos = await System.IO.File.ReadAllBytesAsync(almacen.Ruta(archivoGuardado), ct);
        var identificacion = AnalizadorBinario.Identificar(datos);
        var c = new Centralita
        {
            Tipo = tipo,
            Nombre = Nombre(identificacion, nombreArchivo),
            NombreArchivo = nombreArchivo,
            Archivo = archivoGuardado,
            Tamano = datos.Length,
            Sha256 = Convert.ToHexStringLower(SHA256.HashData(datos)),
            Familia = identificacion.Familia,
            Hardware = identificacion.Hardware,
            Software = identificacion.Software,
            Referencia = identificacion.Referencia,
            VehiculoId = vehiculoId,
            FechaAlta = DateTimeOffset.UtcNow,
            Mapas = AnalizadorBinario.DetectarMapas(datos).Select(AnalizadorBinario.ToEntidad).ToList()
        };
        await Biblioteca.Aplicar(db, c, ct);
        db.Centralitas.Add(c);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch
        {
            almacen.Borrar(archivoGuardado);
            throw;
        }
        return c;
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<CentralitaDetalle>> Actualizar(int id, CentralitaActualizarRequest req, CancellationToken ct)
    {
        var c = await db.Centralitas.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        if (req.VehiculoId is not null && !await db.Vehiculos.AnyAsync(v => v.Id == req.VehiculoId, ct))
        {
            ModelState.AddModelError(nameof(req.VehiculoId), "El vehículo no existe.");
            return ValidationProblem(ModelState);
        }
        c.Tipo = req.Tipo;
        c.Nombre = req.Nombre.Trim();
        c.VehiculoId = req.VehiculoId;
        c.Notas = Normalizar.Texto(req.Notas);
        c.Familia = Normalizar.Texto(req.Familia);
        c.Hardware = Normalizar.Texto(req.Hardware);
        var clave = Biblioteca.Clave(c);
        c.Software = Normalizar.Texto(req.Software);
        c.Referencia = Normalizar.Texto(req.Referencia);
        // Con otro software, la lectura pasa a usar la biblioteca de ese software.
        if (Biblioteca.Clave(c) != clave)
        {
            await Biblioteca.Aplicar(db, c, ct);
        }
        await db.SaveChangesAsync(ct);
        return await Obtener(id, ct);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var c = await db.Centralitas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        // Las importaciones de XDF sin biblioteca (lectura sin software) solo tienen sentido con su lectura.
        var importaciones = await db.ImportacionesXdf.Where(i => i.CentralitaId == id && i.BibliotecaSoftwareId == null).ToListAsync(ct);
        db.ImportacionesXdf.RemoveRange(importaciones);
        db.Centralitas.Remove(c);
        await db.SaveChangesAsync(ct);
        almacen.Borrar(c.Archivo);
        importaciones.ForEach(i => almacen.Borrar(i.Archivo));
        return NoContent();
    }

    /// <summary>El binario (con rangos); <paramref name="descargar"/> lo ofrece como descarga con su nombre original.</summary>
    [HttpGet("{id:int}/contenido")]
    public async Task<IActionResult> Contenido(int id, [FromQuery] bool descargar, CancellationToken ct)
    {
        var c = await db.Centralitas.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null || !System.IO.File.Exists(almacen.Ruta(c.Archivo)))
        {
            return NotFound();
        }
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        if (descargar)
        {
            Response.Headers.ContentDisposition = $"attachment; filename*=UTF-8''{Uri.EscapeDataString(c.NombreArchivo)}";
        }
        return PhysicalFile(almacen.Ruta(c.Archivo), "application/octet-stream", enableRangeProcessing: true);
    }

    /// <summary>Textos legibles del binario (números de pieza, versión de software, familia…), con su dirección.</summary>
    [HttpGet("{id:int}/cadenas")]
    public async Task<ActionResult<IReadOnlyList<CadenaBinario>>> Cadenas(int id, CancellationToken ct)
    {
        var datos = await Leer(id, ct);
        return datos is null ? NotFound() : AnalizadorBinario.Cadenas(datos).Select(x => new CadenaBinario(x.Direccion, x.Texto)).ToList();
    }

    /// <summary>
    /// Vuelve a analizar el binario: sustituye los mapas detectados que no se han tocado (los creados o editados a mano se
    /// conservan) y aplica la biblioteca de su software.
    /// </summary>
    [HttpPost("{id:int}/reanalizar")]
    public async Task<ActionResult<CentralitaDetalle>> Reanalizar(int id, CancellationToken ct)
    {
        var c = await db.Centralitas.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        var datos = c is null ? null : await Leer(id, ct);
        if (c is null || datos is null)
        {
            return NotFound();
        }
        var identificacion = AnalizadorBinario.Identificar(datos);
        c.Familia = identificacion.Familia;
        c.Hardware = identificacion.Hardware;
        c.Software = identificacion.Software;
        c.Referencia = identificacion.Referencia;
        c.Mapas.RemoveAll(m => m.Origen == OrigenMapa.Detectado);
        var manuales = c.Mapas.Select(m => m.Direccion).ToHashSet();
        c.Mapas.AddRange(AnalizadorBinario.DetectarMapas(datos).Where(m => !manuales.Contains(m.Direccion)).Select(AnalizadorBinario.ToEntidad));
        await Biblioteca.Aplicar(db, c, ct);
        await db.SaveChangesAsync(ct);
        return await Obtener(id, ct);
    }

    /// <summary>Crea un mapa con nombre; se guarda también en la biblioteca de su software.</summary>
    [HttpPost("{id:int}/mapas")]
    public async Task<ActionResult<MapaDto>> CrearMapa(int id, MapaRequest req, CancellationToken ct)
    {
        var c = await db.Centralitas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        if (ValidarMapa(req, c.Tamano) is { } error)
        {
            return error;
        }
        var m = new MapaCentralita { Nombre = "", CentralitaId = id };
        Aplicar(m, req);
        db.MapasCentralita.Add(m);
        await Biblioteca.Guardar(db, c, [m], ct);
        await db.SaveChangesAsync(ct);
        return ToDto(m);
    }

    /// <summary>
    /// Editar un mapa detectado lo pasa a manual (ya no se sustituye al volver a analizar). Se guarda en la biblioteca de su
    /// software; si cambia de dirección, se quita de la anterior.
    /// </summary>
    [HttpPut("{id:int}/mapas/{mapaId:int}")]
    public async Task<ActionResult<MapaDto>> ActualizarMapa(int id, int mapaId, MapaRequest req, CancellationToken ct)
    {
        var m = await db.MapasCentralita.FirstOrDefaultAsync(x => x.Id == mapaId && x.CentralitaId == id, ct);
        var c = await db.Centralitas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (m is null || c is null)
        {
            return NotFound();
        }
        if (ValidarMapa(req, c.Tamano) is { } error)
        {
            return error;
        }
        var anterior = m.Origen == OrigenMapa.Manual ? m.Direccion : (int?)null;
        Aplicar(m, req);
        if (anterior is { } a && a != m.Direccion)
        {
            await Biblioteca.Quitar(db, c, a, ct);
        }
        await Biblioteca.Guardar(db, c, [m], ct);
        await db.SaveChangesAsync(ct);
        return ToDto(m);
    }

    /// <summary>Borra el mapa; si tenía nombre, también de la biblioteca de su software (se consideraba erróneo).</summary>
    [HttpDelete("{id:int}/mapas/{mapaId:int}")]
    public async Task<IActionResult> EliminarMapa(int id, int mapaId, CancellationToken ct)
    {
        var m = await db.MapasCentralita.FirstOrDefaultAsync(x => x.Id == mapaId && x.CentralitaId == id, ct);
        var c = await db.Centralitas.FirstOrDefaultAsync(x => x.Id == id, ct);
        if (m is null || c is null)
        {
            return NotFound();
        }
        db.MapasCentralita.Remove(m);
        if (m.Origen == OrigenMapa.Manual)
        {
            await Biblioteca.Quitar(db, c, m.Direccion, ct);
        }
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Describe con IA el mapa que se está viendo (valores ya leídos en el navegador) y, si se compara, qué le cambió la reprogramación.</summary>
    [HttpPost("{id:int}/describir-mapa")]
    public async Task<ActionResult<DescripcionMapa>> DescribirMapa(int id, DescribirMapaRequest req, [FromServices] DescriptorMapas descriptor, [FromServices] ILogger<CentralitasController> log, CancellationToken ct)
    {
        var c = await db.Centralitas.AsNoTracking().Include(x => x.Vehiculo).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        if (DescriptorMapas.Validar(req) is { } error)
        {
            return Problem(error, statusCode: StatusCodes.Status400BadRequest);
        }
        if (!descriptor.Configurado)
        {
            return Problem("Falta la clave de la API de Anthropic.", statusCode: StatusCodes.Status503ServiceUnavailable);
        }
        try
        {
            return await descriptor.DescribirAsync(c, req, ct);
        }
        catch (AnthropicRateLimitException)
        {
            return Problem("Demasiadas consultas seguidas. Espera un momento y vuelve a intentarlo.", statusCode: StatusCodes.Status429TooManyRequests);
        }
        catch (AnthropicApiException e)
        {
            log.LogError(e, "Error de la API de Anthropic al describir un mapa de la lectura {Id}", id);
            return Problem("El servicio de IA no está disponible ahora mismo. Inténtalo en unos minutos.", statusCode: StatusCodes.Status502BadGateway);
        }
    }

    /// <summary>
    /// Importa un XDF de TunerPro: sus mapas se aplican sobre los de la lectura en la misma dirección y tamaño, o se
    /// añaden, y se guardan en la biblioteca de su software. Los que no caben en el archivo se omiten.
    /// </summary>
    [HttpPost("{id:int}/importar-xdf")]
    [RequestSizeLimit(20 * 1024 * 1024)]
    public async Task<ActionResult<ImportacionXdfResultado>> ImportarXdf(int id, IFormFile archivo, CancellationToken ct)
    {
        var c = await db.Centralitas.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        ResultadoDefinicion xdf;
        try
        {
            await using var lectura = archivo.OpenReadStream();
            xdf = ImportadorXdf.Leer(lectura);
        }
        catch (Exception e) when (e is FormatException or System.Xml.XmlException)
        {
            ModelState.AddModelError(nameof(archivo), $"No se ha podido leer el XDF: {e.Message}");
            return ValidationProblem(ModelState);
        }

        var avisos = xdf.Avisos.ToList();
        if (xdf.TamanoEsperado is { } esperado && esperado != c.Tamano)
        {
            avisos.Insert(0, $"El XDF es para un binario de {esperado:N0} bytes y esta lectura tiene {c.Tamano:N0}: puede no corresponder a este software.");
        }
        return await AplicarDefinicion(c, xdf, avisos, archivo, "definicion.xdf", ct);
    }

    /// <summary>
    /// Importa un A2L (ASAP2) de este software, tal cual o comprimido con gzip (el portal lo comprime al subirlo: los A2L
    /// pasan de 30 MB). Sus parámetros se sitúan en el binario de la lectura (ver <see cref="ImportadorA2l"/>) y se aplican
    /// como los de un XDF.
    /// </summary>
    [HttpPost("{id:int}/importar-a2l")]
    [RequestSizeLimit(MaximoA2lSubido + 64 * 1024)]
    public async Task<ActionResult<ImportacionXdfResultado>> ImportarA2l(int id, IFormFile archivo, CancellationToken ct)
    {
        var c = await db.Centralitas.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        if (c is null)
        {
            return NotFound();
        }
        var binario = await Leer(id, ct);
        if (binario is null)
        {
            return NotFound();
        }
        ResultadoDefinicion a2l;
        try
        {
            a2l = ImportadorA2l.Leer(await ContenidoA2l(archivo, ct), binario);
        }
        catch (Exception e) when (e is FormatException or InvalidDataException)
        {
            ModelState.AddModelError(nameof(archivo), $"No se ha podido leer el A2L: {e.Message}");
            return ValidationProblem(ModelState);
        }
        return await AplicarDefinicion(c, a2l, a2l.Avisos.ToList(), archivo, "definicion.a2l", ct);
    }

    private const long MaximoA2lSubido = 30L * 1024 * 1024;
    private const long MaximoA2l = 300L * 1024 * 1024;

    /// <summary>El A2L subido, descomprimido si viene en gzip (sin pasar de <see cref="MaximoA2l"/>).</summary>
    private static async Task<byte[]> ContenidoA2l(IFormFile archivo, CancellationToken ct)
    {
        await using var lectura = archivo.OpenReadStream();
        var cabecera = new byte[2];
        var leidos = await lectura.ReadAtLeastAsync(cabecera, 2, throwOnEndOfStream: false, ct);
        lectura.Position = 0;
        Stream origen = leidos == 2 && cabecera[0] == 0x1F && cabecera[1] == 0x8B ? new GZipStream(lectura, CompressionMode.Decompress) : lectura;
        await using (origen)
        {
            using var destino = new MemoryStream();
            var bufer = new byte[81920];
            int n;
            while ((n = await origen.ReadAsync(bufer, ct)) > 0)
            {
                if (destino.Length + n > MaximoA2l)
                {
                    throw new InvalidDataException("el A2L descomprimido pasa de 300 MB.");
                }
                destino.Write(bufer, 0, n);
            }
            return destino.ToArray();
        }
    }

    /// <summary>
    /// Aplica los mapas de una definición importada (XDF o A2L) sobre los de la lectura en la misma dirección y tamaño, o
    /// los añade; los guarda en la biblioteca de su software y registra la importación con el archivo subido.
    /// </summary>
    private async Task<ActionResult<ImportacionXdfResultado>> AplicarDefinicion(Centralita c, ResultadoDefinicion xdf, List<string> avisos,
        IFormFile archivo, string nombrePorDefecto, CancellationToken ct)
    {
        var importados = new List<MapaCentralita>();
        var omitidos = 0;
        foreach (var o in xdf.Mapas)
        {
            if (!Biblioteca.Cabe(o, c.Tamano))
            {
                omitidos++;
                continue;
            }
            var d = c.Mapas.FirstOrDefault(m => m.Direccion == o.Direccion && m.Columnas == o.Columnas && m.Filas == o.Filas);
            if (d is null)
            {
                d = new MapaCentralita { Nombre = "" };
                c.Mapas.Add(d);
            }
            d.CopiarDe(o);
            d.Origen = OrigenMapa.Manual;
            importados.Add(d);
        }
        var biblioteca = await Biblioteca.Guardar(db, c, importados, ct);
        await db.SaveChangesAsync(ct);

        // Registro de la importación con el XDF guardado (la biblioteca ya tiene id si era nueva).
        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is not null)
        {
            var textoAvisos = string.Join("\n", avisos);
            db.ImportacionesXdf.Add(new ImportacionXdf
            {
                BibliotecaSoftwareId = biblioteca?.Id,
                CentralitaId = c.Id,
                Titulo = xdf.Titulo is { } t ? t[..Math.Min(t.Length, 300)] : null,
                NombreArchivo = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : nombrePorDefecto,
                Archivo = guardado.Value.Nombre,
                Tamano = archivo.Length,
                Importados = importados.Count,
                Omitidos = omitidos,
                Avisos = textoAvisos.Length == 0 ? null : textoAvisos[..Math.Min(textoAvisos.Length, 20000)],
                Fecha = DateTimeOffset.UtcNow
            });
            await db.SaveChangesAsync(ct);
        }
        return new ImportacionXdfResultado(xdf.Titulo, importados.Count, omitidos, avisos.Take(50).ToList(), avisos.Count);
    }

    /// <summary>
    /// Copia los mapas con nombre (manuales) de otra lectura: se aplican sobre los que estén en la misma dirección y con
    /// el mismo tamaño. Si las dos tienen el mismo software (o son el mismo archivo), los mapas están en las mismas
    /// direcciones y se añaden también los que falten; si no, se omiten (en otro software pueden estar en otro sitio).
    /// </summary>
    [HttpPost("{id:int}/copiar-mapas")]
    public async Task<ActionResult<CopiarMapasResultado>> CopiarMapas(int id, CopiarMapasRequest req, CancellationToken ct)
    {
        var destino = await db.Centralitas.Include(x => x.Mapas).FirstOrDefaultAsync(x => x.Id == id, ct);
        var origen = await db.Centralitas.AsNoTracking().Include(x => x.Mapas.Where(m => m.Origen == OrigenMapa.Manual))
            .FirstOrDefaultAsync(x => x.Id == req.OrigenId, ct);
        if (destino is null)
        {
            return NotFound();
        }
        if (origen is null || origen.Id == id)
        {
            ModelState.AddModelError(nameof(req.OrigenId), "Elige otra lectura.");
            return ValidationProblem(ModelState);
        }

        var mismoSoftware = origen.Sha256 == destino.Sha256
            || (origen.Software is not null && origen.Software == destino.Software && origen.Tamano == destino.Tamano);
        int aplicados = 0, anadidos = 0, omitidos = 0;
        foreach (var o in origen.Mapas)
        {
            var d = destino.Mapas.FirstOrDefault(m => m.Direccion == o.Direccion && m.Columnas == o.Columnas && m.Filas == o.Filas);
            var cabe = o.Direccion + (long)o.Columnas * o.Filas * AnalizadorBinario.Tamano(o.TipoDato) <= destino.Tamano;
            if (d is null && mismoSoftware && cabe)
            {
                d = new MapaCentralita { Nombre = "" };
                destino.Mapas.Add(d);
                anadidos++;
            }
            else if (d is not null)
            {
                aplicados++;
            }
            else
            {
                omitidos++;
                continue;
            }
            d.CopiarDe(o);
            d.Origen = OrigenMapa.Manual;
        }
        await Biblioteca.Guardar(db, destino, destino.Mapas.Where(m => m.Origen == OrigenMapa.Manual), ct);
        await db.SaveChangesAsync(ct);
        return new CopiarMapasResultado(aplicados, anadidos, omitidos);
    }

    private async Task<byte[]?> Leer(int id, CancellationToken ct)
    {
        var archivo = await db.Centralitas.AsNoTracking().Where(x => x.Id == id).Select(x => x.Archivo).FirstOrDefaultAsync(ct);
        return archivo is null || !System.IO.File.Exists(almacen.Ruta(archivo)) ? null : await System.IO.File.ReadAllBytesAsync(almacen.Ruta(archivo), ct);
    }

    /// <summary>Intel HEX («:10000000…») y Motorola S-record («S0…», «S3…») empiezan por texto reconocible.</summary>
    private static async Task<bool> EsTextoHex(IFormFile archivo, CancellationToken ct)
    {
        var cabecera = new byte[9];
        await using var lectura = archivo.OpenReadStream();
        var leidos = await lectura.ReadAtLeastAsync(cabecera, cabecera.Length, throwOnEndOfStream: false, ct);
        if (leidos < cabecera.Length)
        {
            return false;
        }
        static bool Hex(byte b) => b is >= (byte)'0' and <= (byte)'9' or >= (byte)'A' and <= (byte)'F' or >= (byte)'a' and <= (byte)'f';
        return (cabecera[0] == ':' && cabecera[1..].All(Hex)) || (cabecera[0] == 'S' && cabecera[1] is >= (byte)'0' and <= (byte)'9' && cabecera[2..].All(Hex));
    }

    private static string Nombre(IdentificacionCentralita i, string nombreArchivo)
    {
        var partes = new[] { i.Familia, i.Hardware, i.Software }.Where(p => p is not null).ToList();
        var nombre = partes.Count > 0 ? string.Join(" · ", partes) : Path.GetFileNameWithoutExtension(nombreArchivo);
        return nombre[..Math.Min(nombre.Length, 200)];
    }

    private ActionResult? ValidarMapa(MapaRequest req, long tamano)
    {
        foreach (var (campo, error) in MapeoMapas.Errores(req, tamano))
        {
            ModelState.AddModelError(campo, error);
        }
        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    private static void Aplicar(MapaCentralita m, MapaRequest req)
    {
        MapeoMapas.Aplicar(m, req);
        m.Origen = OrigenMapa.Manual;
    }

    private static MapaDto ToDto(MapaCentralita m) => MapeoMapas.ToDto(m, m.Id, m.Origen);

    private static CentralitaDetalle ToDetalle(Centralita c, (int Id, int Mapas)? biblioteca, string? comparada) => new(
        c.Id, c.Tipo, c.Nombre, c.NombreArchivo, c.Tamano, c.Sha256, c.Familia, c.Hardware, c.Software, c.Referencia, c.VehiculoId,
        c.Vehiculo is null ? null : $"{c.Vehiculo.Marca} {c.Vehiculo.Modelo}".Trim(), c.Vehiculo?.Matricula ?? c.Vehiculo?.Bastidor,
        c.Notas, c.FechaAlta, c.Mapas.OrderBy(m => m.Direccion).Select(ToDto).ToList(), Biblioteca.Clave(c), biblioteca?.Mapas ?? 0, biblioteca?.Id,
        comparada is null ? null : c.ComparadaConId, comparada);
}
