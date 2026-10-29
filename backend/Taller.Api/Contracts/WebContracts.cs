using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record DatosTallerDto(
    [Required, MaxLength(120)] string Nombre,
    [MaxLength(200)] string? Lema,
    [MaxLength(4000)] string? Presentacion,
    [MaxLength(30)] string? Telefono,
    [MaxLength(30)] string? WhatsApp,
    [MaxLength(200), EmailAddress] string? Email,
    [MaxLength(300)] string? Direccion,
    [MaxLength(10)] string? CodigoPostal,
    [MaxLength(100)] string? Poblacion,
    [MaxLength(100)] string? Provincia,
    [MaxLength(500)] string? Horario,
    [MaxLength(1000), Url] string? UrlMapa);

public record ServicioDto(
    int Id, string Slug, string Titulo, string Resumen, string? Descripcion, string Icono, int Orden, bool Publicado);

public record ServicioRequest(
    [Required, MaxLength(120)] string Titulo,
    [Required, MaxLength(300)] string Resumen,
    [MaxLength(4000)] string? Descripcion,
    [Required, MaxLength(30)] string Icono,
    int Orden,
    bool Publicado);

/// <summary>Foto o vídeo de un trabajo.</summary>
public record FotoDto(int Id, string Url, string? Pie, int Orden, bool EsVideo);

public record TrabajoListItem(
    int Id, string Slug, string Titulo, string Resumen, DateOnly Fecha, string? Vehiculo, TipoVehiculo? TipoVehiculo,
    IReadOnlyList<TipoServicio> Servicios, bool Publicado, bool Destacado, string? Portada, int NumFotos,
    bool PortadaEsVideo = false, int NumVideos = 0);

public record TrabajoDetalle(
    int Id, string Slug, string Titulo, string Resumen, string? Descripcion, DateOnly Fecha, string? Vehiculo,
    TipoVehiculo? TipoVehiculo, IReadOnlyList<TipoServicio> Servicios, bool Publicado, bool Destacado, IReadOnlyList<FotoDto> Fotos);

public record TrabajoRequest(
    [Required, MaxLength(160)] string Titulo,
    [Required, MaxLength(400)] string Resumen,
    [MaxLength(8000)] string? Descripcion,
    DateOnly Fecha,
    [MaxLength(120)] string? Vehiculo,
    TipoVehiculo? TipoVehiculo,
    List<TipoServicio> Servicios,
    bool Publicado,
    bool Destacado);

public record FotoRequest([MaxLength(300)] string? Pie, int Orden);

/// <summary>Todo lo que necesita la portada de la web en una sola petición.</summary>
public record InicioPublico(DatosTallerDto Datos, IReadOnlyList<ServicioDto> Servicios, IReadOnlyList<TrabajoListItem> Destacados);
