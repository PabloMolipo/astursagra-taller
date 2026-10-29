using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Contracts;

public static class WebMapeos
{
    public static DatosTallerDto ToDto(this DatosTaller d) => new(
        d.Nombre, d.Lema, d.Presentacion, d.Telefono, d.WhatsApp, d.Email, d.Direccion, d.CodigoPostal,
        d.Poblacion, d.Provincia, d.Horario, d.UrlMapa);

    public static ServicioDto ToDto(this Servicio s) => new(
        s.Id, s.Slug, s.Titulo, s.Resumen, s.Descripcion, s.Icono, s.Orden, s.Publicado);

    private static IEnumerable<FotoTrabajo> Ordenadas(this TrabajoRealizado t) => t.Fotos.OrderBy(f => f.Orden).ThenBy(f => f.Id);

    /// <summary>
    /// Requiere las fotos cargadas. La portada es la primera foto; si el trabajo solo tiene vídeos, el primero.
    /// NumFotos cuenta solo fotos y NumVideos, vídeos.
    /// </summary>
    public static TrabajoListItem ToListItem(this TrabajoRealizado t)
    {
        var ordenadas = t.Ordenadas().ToList();
        var portada = ordenadas.FirstOrDefault(f => !AlmacenMedia.EsVideo(f.Archivo)) ?? ordenadas.FirstOrDefault();
        var videos = ordenadas.Count(f => AlmacenMedia.EsVideo(f.Archivo));
        return new(
            t.Id, t.Slug, t.Titulo, t.Resumen, t.Fecha, t.Vehiculo, t.TipoVehiculo, t.Servicios, t.Publicado, t.Destacado,
            portada is null ? null : AlmacenMedia.Url(portada.Archivo), ordenadas.Count - videos,
            portada is not null && AlmacenMedia.EsVideo(portada.Archivo), videos);
    }

    /// <summary>Requiere las fotos cargadas.</summary>
    public static TrabajoDetalle ToDetalle(this TrabajoRealizado t) => new(
        t.Id, t.Slug, t.Titulo, t.Resumen, t.Descripcion, t.Fecha, t.Vehiculo, t.TipoVehiculo, t.Servicios, t.Publicado, t.Destacado,
        t.Ordenadas().Select(f => new FotoDto(f.Id, AlmacenMedia.Url(f.Archivo), f.Pie, f.Orden, AlmacenMedia.EsVideo(f.Archivo))).ToList());
}
