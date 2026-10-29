using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

// Ficha de diagnosis

public record CodigoLeidoDto(string Codigo, string? Descripcion, EstadoCodigo Estado, string? Nota);

public record MedicionDto(string Parametro, string Valor, string? Unidad, string? ValorEsperado, ResultadoMedicion Resultado, string? Nota, int? ValorReferenciaId);

public record PruebaDto(string Descripcion, string? Resultado);

public record AdjuntoDto(int Id, string NombreOriginal, string TipoContenido, long Tamano, DateTimeOffset Fecha, bool VisibleCliente = true);

public record VisibleClienteRequest(bool Visible);

public record FichaDiagnosisDto(
    int OrdenTrabajoId,
    string? Sintomas,
    string? Conclusion,
    DateTimeOffset? FechaActualizacion,
    IReadOnlyList<CodigoLeidoDto> Codigos,
    IReadOnlyList<MedicionDto> Mediciones,
    IReadOnlyList<PruebaDto> Pruebas,
    IReadOnlyList<AdjuntoDto> Adjuntos);

public record CodigoLeidoRequest(
    [Required, MaxLength(10)] string Codigo,
    [MaxLength(300)] string? Descripcion,
    EstadoCodigo Estado,
    [MaxLength(500)] string? Nota);

public record MedicionRequest(
    [Required, MaxLength(150)] string Parametro,
    [Required, MaxLength(60)] string Valor,
    [MaxLength(20)] string? Unidad,
    [MaxLength(60)] string? ValorEsperado,
    ResultadoMedicion Resultado,
    [MaxLength(500)] string? Nota,
    int? ValorReferenciaId = null);

public record PruebaRequest([Required, MaxLength(500)] string Descripcion, [MaxLength(1000)] string? Resultado);

public record FichaDiagnosisRequest(
    [MaxLength(4000)] string? Sintomas,
    [MaxLength(4000)] string? Conclusion,
    List<CodigoLeidoRequest> Codigos,
    List<MedicionRequest> Mediciones,
    List<PruebaRequest> Pruebas);

/// <summary>Códigos leídos con el lector OBD para añadir a la ficha (los repetidos se actualizan).</summary>
public record AnadirCodigosRequest([MinLength(1)] List<CodigoLeidoRequest> Codigos);

// Biblioteca de códigos

public record CodigoAveriaListItem(string Codigo, string Descripcion, string? Sistema, bool EsPropio, bool TieneNotas, int NumCasos);

/// <summary>Un caso del taller: una orden en la que apareció el código o con síntomas parecidos.</summary>
public record CasoTaller(
    int OrdenId,
    DateTimeOffset Fecha,
    string Vehiculo,
    TipoVehiculo TipoVehiculo,
    EstadoOrden Estado,
    string MotivoEntrada,
    string? Diagnostico,
    string? Conclusion,
    IReadOnlyList<string> Codigos,
    IReadOnlyList<string> Trabajos);

public record CodigoAveriaDetalle(
    string Codigo,
    string Descripcion,
    string? Sistema,
    string? Notas,
    bool EsPropio,
    bool EnBiblioteca,
    string? Estructura,
    IReadOnlyList<CasoTaller> Casos);

public record ValorReferenciaDto(
    int Id, string Parametro, string Categoria, string? Condicion, decimal? Minimo, decimal? Maximo, string Unidad,
    Combustible Combustible, string? Aplicacion, string? PidObd, string? Notas, bool EsPropio);

public record ValorReferenciaRequest(
    [Required, MaxLength(150)] string Parametro,
    [Required, MaxLength(60)] string Categoria,
    [MaxLength(200)] string? Condicion,
    decimal? Minimo,
    decimal? Maximo,
    [Required, MaxLength(20)] string Unidad,
    Combustible Combustible,
    [MaxLength(200)] string? Aplicacion,
    [MaxLength(4)] string? PidObd,
    [MaxLength(1000)] string? Notas);

public record CodigoAveriaRequest(
    [Required, MaxLength(300)] string Descripcion,
    [MaxLength(60)] string? Sistema,
    [MaxLength(4000)] string? Notas);

// Documentación técnica

public record DocumentoTecnicoDto(
    int Id, string Titulo, TipoDocumento Tipo, string? Marca, string? Modelo, string? Motor, int? AnioDesde, int? AnioHasta,
    string? Sistema, string? Notas, string NombreOriginal, string TipoContenido, long Tamano, DateTimeOffset FechaAlta, int UsosAsistente,
    string? SharePointRuta = null, bool DeSharePoint = false, bool EliminadoEnSharePoint = false);

public record DocumentoTecnicoRequest(
    [Required, MaxLength(200)] string Titulo,
    TipoDocumento Tipo,
    [MaxLength(100)] string? Marca,
    [MaxLength(100)] string? Modelo,
    [MaxLength(30)] string? Motor,
    [Range(1900, 2100)] int? AnioDesde,
    [Range(1900, 2100)] int? AnioHasta,
    [MaxLength(100)] string? Sistema,
    [MaxLength(1000)] string? Notas);

public record EnlacePortalDto(int Id, string Nombre, string Url, string? Marca, int Orden);

public record EnlacePortalRequest([Required, MaxLength(100)] string Nombre, [Required, MaxLength(1000)] string Url, [MaxLength(100)] string? Marca, int Orden);

public record PortalVehiculoDto(string Nombre, string Url);

public record CatalogoDespieceDto(
    int Id, string Nombre, string? Descripcion, string UrlVehiculo, string? UrlReferencia, string? Marcas, string? AliasMarcas, bool Activo, int Orden);

public record CatalogoDespieceRequest(
    [Required, MaxLength(100)] string Nombre,
    [MaxLength(500)] string? Descripcion,
    [Required, MaxLength(1000)] string UrlVehiculo,
    [MaxLength(1000)] string? UrlReferencia,
    [MaxLength(500)] string? Marcas,
    [MaxLength(500)] string? AliasMarcas,
    bool Activo,
    int Orden);

/// <summary>Catálogo para un vehículo: Url es null si le falta un dato (Falta dice cuál).</summary>
public record CatalogoVehiculoDto(int Id, string Nombre, string? Descripcion, string? Url, string? Falta, bool BuscaReferencias);

public record EnlaceReferenciaDto(string Nombre, string Url);

/// <summary>Documentación, portales y catálogos de despieces de un vehículo, para su ficha y para cada orden.</summary>
public record DocumentacionVehiculoDto(
    IReadOnlyList<DocumentoTecnicoDto> Documentos, IReadOnlyList<PortalVehiculoDto> Portales, IReadOnlyList<CatalogoVehiculoDto> Catalogos, string? Bastidor);
