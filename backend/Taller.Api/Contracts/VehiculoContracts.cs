using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record VehiculoListItem(
    int Id,
    TipoVehiculo Tipo,
    string? Matricula,
    string? Bastidor,
    string Marca,
    string? Modelo,
    int? Anio,
    int ClienteId,
    string ClienteNombre,
    string? Motor = null);

public record VehiculoDetalle(
    int Id,
    TipoVehiculo Tipo,
    string? Matricula,
    string? Bastidor,
    string Marca,
    string? Modelo,
    int? Anio,
    int? Kilometros,
    int? Horas,
    string? Notas,
    int ClienteId,
    string ClienteNombre,
    IReadOnlyList<OrdenListItem> Ordenes,
    string? Motor,
    string? Color = null);

public record VehiculoRequest(
    int ClienteId,
    TipoVehiculo Tipo,
    [MaxLength(20)] string? Matricula,
    [MaxLength(30)] string? Bastidor,
    [Required, MaxLength(100)] string Marca,
    [MaxLength(100)] string? Modelo,
    [Range(1900, 2100)] int? Anio,
    [Range(0, int.MaxValue)] int? Kilometros,
    [Range(0, int.MaxValue)] int? Horas,
    string? Notas,
    [MaxLength(30)] string? Motor = null,
    [MaxLength(40)] string? Color = null)
{
    public bool SinIdentificar => string.IsNullOrWhiteSpace(Matricula) && string.IsNullOrWhiteSpace(Bastidor);
}

/// <summary>Color con el que generar la imagen (opcional): se guarda como color del vehículo.</summary>
public record GenerarImagenRequest([MaxLength(40)] string? Color);

/// <summary>Imagen orientativa del vehículo.</summary>
public record ImagenVehiculoDto(string Url, DateTimeOffset Fecha, bool Generada);

/// <summary>Visión 360 de la ficha: todo lo relacionado con el vehículo, agrupado.</summary>
public record VehiculoResumen(
    ImagenVehiculoDto? Imagen,
    bool GeneradorImagen,
    DatosTecnicosVehiculo? Tecnicos,
    PropietarioResumen Propietario,
    UsoResumen Uso,
    HistorialResumen Historial,
    DiagnosticoResumen Diagnostico,
    ReproResumen Repro,
    MultimediaResumen Multimedia,
    int Conversaciones);

/// <summary>De la última consulta de la matrícula guardada (MatriculaAPI).</summary>
public record DatosTecnicosVehiculo(
    string? Variante, string? Combustible, int? Cilindrada, decimal? PotenciaCv, DateOnly? FechaMatriculacion, DateTimeOffset Fecha);

public record PropietarioResumen(
    int Id, string Nombre, TipoCliente Tipo, string? Telefono, string? Email, string? Poblacion, DateTimeOffset FechaAlta, int Vehiculos);

/// <summary>Kilómetros u horas leídos en cada visita, del más antiguo al más reciente.</summary>
public record UsoResumen(bool EnHoras, int? Actual, IReadOnlyList<PuntoUso> Puntos, int? PorAnio);

public record PuntoUso(DateTimeOffset Fecha, int Valor);

public record HistorialResumen(
    int Visitas, DateTimeOffset? Primera, DateTimeOffset? Ultima, string? UltimoMotivo, decimal Facturado, decimal Margen,
    OrdenListItem? Abierta, decimal PendienteCobro = 0);

/// <summary>Códigos sin resolver de la última ficha de diagnosis y los que se han repetido en varias visitas.</summary>
public record DiagnosticoResumen(
    IReadOnlyList<CodigoResumen> Activos, IReadOnlyList<string> Repetidos, int? OrdenId, DateTimeOffset? Fecha, string? Conclusion);

public record CodigoResumen(string Codigo, string? Descripcion, EstadoCodigo Estado);

public record ReproResumen(int Total, string? Ultima, DateTimeOffset? Fecha);

/// <summary>Fotos y vídeos de todas sus órdenes; la orden más reciente que tiene alguno, para abrirla.</summary>
public record MultimediaResumen(int Fotos, int Videos, int? UltimaOrdenId, DateTimeOffset? Ultima);
