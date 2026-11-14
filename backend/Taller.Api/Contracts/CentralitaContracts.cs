using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record CentralitaListItem(
    int Id,
    TipoCentralita Tipo,
    string Nombre,
    string NombreArchivo,
    long Tamano,
    string? Familia,
    string? Hardware,
    string? Software,
    string? Referencia,
    int? VehiculoId,
    string? Vehiculo,
    string? Matricula,
    int Mapas,
    DateTimeOffset FechaAlta,
    int MapasConNombre = 0);

public record CentralitaDetalle(
    int Id,
    TipoCentralita Tipo,
    string Nombre,
    string NombreArchivo,
    long Tamano,
    string Sha256,
    string? Familia,
    string? Hardware,
    string? Software,
    string? Referencia,
    int? VehiculoId,
    string? Vehiculo,
    string? Matricula,
    string? Notas,
    DateTimeOffset FechaAlta,
    IReadOnlyList<MapaDto> Mapas,
    string? ClaveBiblioteca = null,
    int MapasBiblioteca = 0,
    int? BibliotecaId = null,
    int? ComparadaConId = null,
    string? ComparadaNombre = null);

public record MapaDto(
    int Id,
    string Nombre,
    OrigenMapa Origen,
    GrupoMapa? Grupo,
    int Direccion,
    int Columnas,
    int Filas,
    TipoDatoMapa TipoDato,
    bool BigEndian,
    bool PorColumnas,
    double Factor,
    double Desplazamiento,
    string? Unidad,
    int? EjeXDireccion,
    TipoDatoMapa EjeXTipo,
    double EjeXFactor,
    string? EjeXUnidad,
    int? EjeYDireccion,
    TipoDatoMapa EjeYTipo,
    double EjeYFactor,
    string? EjeYUnidad,
    string? Notas,
    double EjeXDesplazamiento = 0,
    string? EjeXValores = null,
    double EjeYDesplazamiento = 0,
    string? EjeYValores = null);

public record CadenaBinario(int Direccion, string Texto);

public record CopiarMapasRequest(int OrigenId);

/// <summary>Archivo de una reprogramación (REPRO) que se pasa a lectura; sin vehículo, el de la reprogramación.</summary>
public record DesdeReproRequest(int ArchivoId, TipoCentralita Tipo = TipoCentralita.Motor, int? VehiculoId = null);

public record ComparadaRequest(int? OtraId);

/// <summary>Avisos: los primeros 50 (fórmulas no lineales, tamaños no admitidos…); TotalAvisos, todos.</summary>
public record ImportacionXdfResultado(string? Titulo, int Importados, int Omitidos, IReadOnlyList<string> Avisos, int TotalAvisos);

/// <summary>Aplicados: mapas que ya estaban en la misma dirección y tamaño; añadidos: los que no estaban (solo con el mismo software).</summary>
public record CopiarMapasResultado(int Aplicados, int Anadidos, int Omitidos);

public record CentralitaActualizarRequest(
    TipoCentralita Tipo,
    [Required, MaxLength(200)] string Nombre,
    int? VehiculoId,
    [MaxLength(4000)] string? Notas,
    [MaxLength(60)] string? Familia,
    [MaxLength(60)] string? Hardware,
    [MaxLength(60)] string? Software,
    [MaxLength(60)] string? Referencia);

/// <summary>Filas = 1 para una curva; los ejes sin dirección se numeran 0, 1, 2…</summary>
public record MapaRequest(
    [Required, MaxLength(200)] string Nombre,
    GrupoMapa? Grupo,
    [Range(0, int.MaxValue)] int Direccion,
    [Range(1, 256)] int Columnas,
    [Range(1, 256)] int Filas,
    TipoDatoMapa TipoDato,
    bool BigEndian,
    bool PorColumnas,
    double Factor,
    double Desplazamiento,
    [MaxLength(30)] string? Unidad,
    [Range(0, int.MaxValue)] int? EjeXDireccion,
    TipoDatoMapa EjeXTipo,
    double EjeXFactor,
    [MaxLength(30)] string? EjeXUnidad,
    [Range(0, int.MaxValue)] int? EjeYDireccion,
    TipoDatoMapa EjeYTipo,
    double EjeYFactor,
    [MaxLength(30)] string? EjeYUnidad,
    [MaxLength(2000)] string? Notas,
    double EjeXDesplazamiento = 0,
    [MaxLength(4000)] string? EjeXValores = null,
    double EjeYDesplazamiento = 0,
    [MaxLength(4000)] string? EjeYValores = null);

public record BibliotecaListItem(
    int Id,
    string Clave,
    string? Familia,
    string? Software,
    string? Referencia,
    long Tamano,
    int Mapas,
    int Importaciones,
    int Lecturas,
    DateTimeOffset Modificada);

public record ImportacionXdfDto(
    int Id,
    string? Titulo,
    string NombreArchivo,
    long Tamano,
    int Importados,
    int Omitidos,
    IReadOnlyList<string> Avisos,
    int? CentralitaId,
    DateTimeOffset Fecha);

public record LecturaBiblioteca(int Id, TipoCentralita Tipo, string Nombre, string NombreArchivo, string? Vehiculo, string? Matricula, DateTimeOffset FechaAlta);

/// <summary>Los mapas se devuelven como <see cref="MapaDto"/> (origen siempre Manual).</summary>
public record BibliotecaDetalle(
    int Id,
    string Clave,
    string? Familia,
    string? Software,
    string? Referencia,
    long Tamano,
    DateTimeOffset FechaAlta,
    DateTimeOffset Modificada,
    IReadOnlyList<MapaDto> Mapas,
    IReadOnlyList<ImportacionXdfDto> Importaciones,
    IReadOnlyList<LecturaBiblioteca> Lecturas);

/// <summary>Lecturas: cuántas de ese software se han actualizado; Mapas: cuántos mapas se han aplicado en total.</summary>
public record AplicarBibliotecaResultado(int Lecturas, int Mapas);

/// <summary>
/// Mapa tal como se ve en el navegador (ya convertido con su factor) para que la IA lo describa. Valores: [fila][columna];
/// null en las celdas fuera del archivo. ValoresOtra: el mismo mapa en la lectura con la que se compara, que es la
/// original si OtraEsOriginal (y si no, la modificada).
/// </summary>
public record DescribirMapaRequest(
    [Required, MaxLength(200)] string Nombre,
    GrupoMapa? Grupo,
    [MaxLength(30)] string? Unidad,
    bool Detectado,
    [Required, MaxLength(256)] double?[] EjeX,
    [MaxLength(30)] string? EjeXUnidad,
    [Required, MaxLength(256)] double?[] EjeY,
    [MaxLength(30)] string? EjeYUnidad,
    [Required, MaxLength(256)] double?[][] Valores,
    [MaxLength(256)] double?[][]? ValoresOtra,
    bool OtraEsOriginal,
    [MaxLength(200)] string? Sugerencia);

public record DescripcionMapa(string Texto, string Modelo);
