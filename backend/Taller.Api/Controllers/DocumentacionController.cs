using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Biblioteca de documentación técnica (privada) y accesos a portales de datos técnicos.</summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
public class DocumentacionController(TallerDbContext db, DocumentacionTecnica documentacion, AlmacenPrivado almacen) : ControllerBase
{
    // Biblioteca

    [HttpGet("api/documentacion")]
    public async Task<IReadOnlyList<DocumentoTecnicoDto>> Listar([FromQuery] string? q, [FromQuery] TipoDocumento? tipo, CancellationToken ct)
    {
        var query = db.DocumentosTecnicos.AsNoTracking();
        if (tipo is not null)
        {
            query = query.Where(d => d.Tipo == tipo);
        }
        if (!string.IsNullOrWhiteSpace(q))
        {
            foreach (var palabra in q.Split(' ', StringSplitOptions.RemoveEmptyEntries).Take(5))
            {
                var p = $"%{palabra}%";
                query = query.Where(d => EF.Functions.ILike(d.Titulo, p) || EF.Functions.ILike(d.Marca!, p) || EF.Functions.ILike(d.Modelo!, p) ||
                                         EF.Functions.ILike(d.Motor!, p) || EF.Functions.ILike(d.Sistema!, p) || EF.Functions.ILike(d.Notas!, p));
            }
        }
        var documentos = await query.OrderBy(d => d.Marca).ThenBy(d => d.Modelo).ThenBy(d => d.Titulo).Take(500).ToListAsync(ct);
        return await ConUsos(documentos, ct);
    }

    [HttpGet("api/vehiculos/{vehiculoId:int}/documentacion")]
    public async Task<ActionResult<DocumentacionVehiculoDto>> DeVehiculo(int vehiculoId, CancellationToken ct)
    {
        var vehiculo = await db.Vehiculos.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vehiculoId, ct);
        if (vehiculo is null)
        {
            return NotFound();
        }
        var documentos = await documentacion.CompatiblesAsync(vehiculo, ct);
        var portales = await documentacion.PortalesAsync(vehiculo, ct);
        var catalogos = await documentacion.CatalogosAsync(vehiculo, ct);
        var bastidor = DocumentacionTecnica.Vin(vehiculo.Bastidor);
        return new DocumentacionVehiculoDto(
            await ConUsos(documentos, ct), portales.Select(p => new PortalVehiculoDto(p.Nombre, p.Url)).ToList(), catalogos,
            bastidor.Length > 0 ? bastidor : null);
    }

    /// <summary>Sube un documento (multipart: archivo + datos del documento).</summary>
    [HttpPost("api/documentacion")]
    [RequestSizeLimit(AlmacenPrivado.Maximo + 64 * 1024)]
    public async Task<ActionResult<DocumentoTecnicoDto>> Subir([FromForm] IFormFile archivo, [FromForm] DocumentoTecnicoRequest datos, CancellationToken ct)
    {
        if (Validar(datos) is { } error)
        {
            return error;
        }
        var guardado = await almacen.GuardarAsync(archivo, ct);
        if (guardado is null)
        {
            ModelState.AddModelError(nameof(archivo), "El documento debe ser PDF, JPG, PNG o WebP y pesar como mucho 25 MB.");
            return ValidationProblem(ModelState);
        }

        var documento = new DocumentoTecnico
        {
            Titulo = "",
            Archivo = guardado.Value.Nombre,
            NombreOriginal = Path.GetFileName(archivo.FileName).Trim() is { Length: > 0 } n ? n[..Math.Min(n.Length, 255)] : "documento",
            TipoContenido = guardado.Value.Tipo.TipoContenido,
            Tamano = archivo.Length,
            FechaAlta = DateTimeOffset.UtcNow
        };
        Aplicar(documento, datos);
        db.DocumentosTecnicos.Add(documento);
        await db.SaveChangesAsync(ct);
        return ToDto(documento, 0);
    }

    [HttpPut("api/documentacion/{id:int}")]
    public async Task<ActionResult<DocumentoTecnicoDto>> Actualizar(int id, DocumentoTecnicoRequest datos, CancellationToken ct)
    {
        if (Validar(datos) is { } error)
        {
            return error;
        }
        var documento = await db.DocumentosTecnicos.FindAsync([id], ct);
        if (documento is null)
        {
            return NotFound();
        }
        Aplicar(documento, datos);
        await db.SaveChangesAsync(ct);
        return (await ConUsos([documento], ct))[0];
    }

    [HttpDelete("api/documentacion/{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var documento = await db.DocumentosTecnicos.FindAsync([id], ct);
        if (documento is null)
        {
            return NotFound();
        }
        if (documento.SharePointId is not null && !documento.EliminadoEnSharePoint)
        {
            return Conflict(new ProblemDetails { Status = 409, Title = "Conflicto", Detail = "Este documento viene de SharePoint: bórralo allí y desaparecerá en la siguiente sincronización." });
        }

        // Las conversaciones del asistente reenvían su historial completo: si faltara el documento, dejarían de funcionar.
        var usos = await db.UsosDocumentoAsistente.CountAsync(u => u.DocumentoTecnicoId == id, ct);
        if (usos > 0)
        {
            return Conflict(new ProblemDetails
            {
                Status = 409,
                Title = "Conflicto",
                Detail = $"Este documento se usa en {usos} {(usos == 1 ? "consulta" : "consultas")} del asistente. Borra esas consultas antes de eliminarlo."
            });
        }
        db.DocumentosTecnicos.Remove(documento);
        await db.SaveChangesAsync(ct);
        almacen.Borrar(documento.Archivo);
        return NoContent();
    }

    [HttpGet("api/documentacion/{id:int}/archivo")]
    public async Task<IActionResult> Descargar(int id, CancellationToken ct)
    {
        var documento = await db.DocumentosTecnicos.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
        if (documento is null || !System.IO.File.Exists(almacen.Ruta(documento.Archivo)))
        {
            return NotFound();
        }
        Response.Headers.ContentDisposition = $"inline; filename*=UTF-8''{Uri.EscapeDataString(documento.NombreOriginal)}";
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(almacen.Ruta(documento.Archivo), documento.TipoContenido);
    }

    // Portales

    [HttpGet("api/portales")]
    public async Task<IReadOnlyList<EnlacePortalDto>> Portales(CancellationToken ct) =>
        await db.EnlacesPortal.AsNoTracking().OrderBy(e => e.Orden).ThenBy(e => e.Nombre)
            .Select(e => new EnlacePortalDto(e.Id, e.Nombre, e.Url, e.Marca, e.Orden)).ToListAsync(ct);

    [HttpPost("api/portales")]
    public async Task<ActionResult<EnlacePortalDto>> CrearPortal(EnlacePortalRequest req, CancellationToken ct)
    {
        if (!DocumentacionTecnica.UrlValida(req.Url))
        {
            ModelState.AddModelError(nameof(req.Url), "La dirección debe empezar por https:// (o http://).");
            return ValidationProblem(ModelState);
        }
        var enlace = new EnlacePortal { Nombre = req.Nombre.Trim(), Url = req.Url.Trim(), Marca = Normalizar.Texto(req.Marca), Orden = req.Orden };
        db.EnlacesPortal.Add(enlace);
        await db.SaveChangesAsync(ct);
        return new EnlacePortalDto(enlace.Id, enlace.Nombre, enlace.Url, enlace.Marca, enlace.Orden);
    }

    [HttpPut("api/portales/{id:int}")]
    public async Task<ActionResult<EnlacePortalDto>> ActualizarPortal(int id, EnlacePortalRequest req, CancellationToken ct)
    {
        if (!DocumentacionTecnica.UrlValida(req.Url))
        {
            ModelState.AddModelError(nameof(req.Url), "La dirección debe empezar por https:// (o http://).");
            return ValidationProblem(ModelState);
        }
        var enlace = await db.EnlacesPortal.FindAsync([id], ct);
        if (enlace is null)
        {
            return NotFound();
        }
        enlace.Nombre = req.Nombre.Trim();
        enlace.Url = req.Url.Trim();
        enlace.Marca = Normalizar.Texto(req.Marca);
        enlace.Orden = req.Orden;
        await db.SaveChangesAsync(ct);
        return new EnlacePortalDto(enlace.Id, enlace.Nombre, enlace.Url, enlace.Marca, enlace.Orden);
    }

    [HttpDelete("api/portales/{id:int}")]
    public async Task<IActionResult> EliminarPortal(int id, CancellationToken ct)
    {
        var borrados = await db.EnlacesPortal.Where(e => e.Id == id).ExecuteDeleteAsync(ct);
        return borrados == 0 ? NotFound() : NoContent();
    }

    // Catálogos de despieces

    [HttpGet("api/catalogos")]
    public async Task<IReadOnlyList<CatalogoDespieceDto>> Catalogos(CancellationToken ct) =>
        (await db.CatalogosDespiece.AsNoTracking().OrderBy(c => c.Orden).ThenBy(c => c.Nombre).ToListAsync(ct)).Select(ToDto).ToList();

    /// <summary>Enlaces para buscar una referencia de pieza; con vehiculoId, solo en los catálogos de su marca.</summary>
    [HttpGet("api/catalogos/referencia")]
    public async Task<ActionResult<IReadOnlyList<EnlaceReferenciaDto>>> BuscarReferencia([FromQuery] string q, [FromQuery] int? vehiculoId, CancellationToken ct)
    {
        Vehiculo? vehiculo = null;
        if (vehiculoId is not null && (vehiculo = await db.Vehiculos.AsNoTracking().FirstOrDefaultAsync(v => v.Id == vehiculoId, ct)) is null)
        {
            return NotFound();
        }
        return await documentacion.BuscarReferenciaAsync(q ?? "", vehiculo, ct);
    }

    [HttpPost("api/catalogos")]
    public async Task<ActionResult<CatalogoDespieceDto>> CrearCatalogo(CatalogoDespieceRequest req, CancellationToken ct)
    {
        if (ValidarCatalogo(req) is { } error)
        {
            return error;
        }
        var catalogo = new CatalogoDespiece { Nombre = "", UrlVehiculo = "" };
        Aplicar(catalogo, req);
        db.CatalogosDespiece.Add(catalogo);
        await db.SaveChangesAsync(ct);
        return ToDto(catalogo);
    }

    [HttpPut("api/catalogos/{id:int}")]
    public async Task<ActionResult<CatalogoDespieceDto>> ActualizarCatalogo(int id, CatalogoDespieceRequest req, CancellationToken ct)
    {
        if (ValidarCatalogo(req) is { } error)
        {
            return error;
        }
        var catalogo = await db.CatalogosDespiece.FindAsync([id], ct);
        if (catalogo is null)
        {
            return NotFound();
        }
        Aplicar(catalogo, req);
        await db.SaveChangesAsync(ct);
        return ToDto(catalogo);
    }

    [HttpDelete("api/catalogos/{id:int}")]
    public async Task<IActionResult> EliminarCatalogo(int id, CancellationToken ct)
    {
        var borrados = await db.CatalogosDespiece.Where(c => c.Id == id).ExecuteDeleteAsync(ct);
        return borrados == 0 ? NotFound() : NoContent();
    }

    private ActionResult? ValidarCatalogo(CatalogoDespieceRequest r)
    {
        if (!DocumentacionTecnica.UrlValida(r.UrlVehiculo))
        {
            ModelState.AddModelError(nameof(r.UrlVehiculo), "La dirección debe empezar por https:// (o http://).");
        }
        if (!string.IsNullOrWhiteSpace(r.UrlReferencia) &&
            (!DocumentacionTecnica.UrlValida(r.UrlReferencia) || !r.UrlReferencia.Contains("{referencia}", StringComparison.OrdinalIgnoreCase)))
        {
            ModelState.AddModelError(nameof(r.UrlReferencia), "La búsqueda por referencia debe empezar por https:// e incluir {referencia}.");
        }
        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    private static void Aplicar(CatalogoDespiece c, CatalogoDespieceRequest r)
    {
        c.Nombre = r.Nombre.Trim();
        c.Descripcion = Normalizar.Texto(r.Descripcion);
        c.UrlVehiculo = r.UrlVehiculo.Trim();
        c.UrlReferencia = Normalizar.Texto(r.UrlReferencia);
        c.Marcas = Normalizar.Texto(r.Marcas);
        c.AliasMarcas = Normalizar.Texto(r.AliasMarcas);
        c.Activo = r.Activo;
        c.Orden = r.Orden;
    }

    private static CatalogoDespieceDto ToDto(CatalogoDespiece c) =>
        new(c.Id, c.Nombre, c.Descripcion, c.UrlVehiculo, c.UrlReferencia, c.Marcas, c.AliasMarcas, c.Activo, c.Orden);

    private ActionResult? Validar(DocumentoTecnicoRequest d)
    {
        if (d.AnioDesde > d.AnioHasta)
        {
            ModelState.AddModelError(nameof(d.AnioDesde), "El año inicial no puede ser posterior al final.");
            return ValidationProblem(ModelState);
        }
        return null;
    }

    private static void Aplicar(DocumentoTecnico d, DocumentoTecnicoRequest r)
    {
        d.Titulo = r.Titulo.Trim();
        d.Tipo = r.Tipo;
        d.Marca = Normalizar.Texto(r.Marca);
        d.Modelo = Normalizar.Texto(r.Modelo);
        d.Motor = Normalizar.Texto(r.Motor)?.ToUpperInvariant();
        d.AnioDesde = r.AnioDesde;
        d.AnioHasta = r.AnioHasta;
        d.Sistema = Normalizar.Texto(r.Sistema);
        d.Notas = Normalizar.Texto(r.Notas);
    }

    private async Task<List<DocumentoTecnicoDto>> ConUsos(List<DocumentoTecnico> documentos, CancellationToken ct)
    {
        var ids = documentos.Select(d => d.Id).ToList();
        var usos = await db.UsosDocumentoAsistente.Where(u => ids.Contains(u.DocumentoTecnicoId))
            .GroupBy(u => u.DocumentoTecnicoId).Select(g => new { g.Key, N = g.Count() })
            .ToDictionaryAsync(x => x.Key, x => x.N, ct);
        return documentos.Select(d => ToDto(d, usos.GetValueOrDefault(d.Id))).ToList();
    }

    public static DocumentoTecnicoDto ToDto(DocumentoTecnico d, int usos) => new(
        d.Id, d.Titulo, d.Tipo, d.Marca, d.Modelo, d.Motor, d.AnioDesde, d.AnioHasta, d.Sistema, d.Notas,
        d.NombreOriginal, d.TipoContenido, d.Tamano, d.FechaAlta, usos, d.SharePointRuta, d.SharePointId is not null, d.EliminadoEnSharePoint);
}
