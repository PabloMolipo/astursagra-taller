using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record LoginRequest([Required] string Usuario, [Required] string Password, bool Recordar = false);

public record SesionDto(string Usuario, string Rol, string Nombre, int? ClienteId, bool DebeCambiarPassword);

public record CambiarPasswordRequest([Required] string Actual, [Required] string Nueva);

/// <summary>Acceso al portal de un cliente, visto desde el taller.</summary>
public record AccesoDto(string Usuario, DateTimeOffset FechaAlta, DateTimeOffset? UltimoAcceso, bool Bloqueado, bool PendienteCambio);

public record CrearAccesoRequest([Required, MaxLength(100)] string Usuario);

/// <summary>La contraseña temporal solo se devuelve una vez, al crearla.</summary>
public record AccesoCreadoDto(string Usuario, string PasswordTemporal);

// Portal del cliente: nunca incluye costes, márgenes ni observaciones internas.

public record PortalOrdenResumen(
    int Id, EstadoOrden Estado, IReadOnlyList<TipoServicio> Servicios, DateTimeOffset FechaEntrada,
    DateOnly? FechaPrevista, DateTimeOffset? FechaSalida, string MotivoEntrada, decimal Total, bool Pagado = false);

public record PortalVehiculo(
    int Id, TipoVehiculo Tipo, string? Matricula, string? Bastidor, string Marca, string? Modelo, int? Anio,
    int? Kilometros, int? Horas, int NumIntervenciones, PortalOrdenResumen? UltimaIntervencion);

public record PortalVehiculoDetalle(PortalVehiculo Vehiculo, IReadOnlyList<PortalOrdenResumen> Ordenes);

public record PortalLinea(
    TipoLinea Tipo, string Descripcion, string? Referencia, decimal Cantidad, decimal PrecioUnitario,
    decimal DescuentoPorcentaje, decimal IvaPorcentaje, decimal BaseImponible);

public record PortalTotales(decimal BaseImponible, decimal Iva, decimal Total);

public record PortalOrdenDetalle(
    int Id, EstadoOrden Estado, IReadOnlyList<TipoServicio> Servicios, DateTimeOffset FechaEntrada,
    DateOnly? FechaPrevista, DateTimeOffset? FechaSalida, string MotivoEntrada, string? Diagnostico,
    int? KilometrosEntrada, int? HorasEntrada, PortalVehiculo Vehiculo, IReadOnlyList<PortalLinea> Lineas, PortalTotales Totales,
    IReadOnlyList<PortalMultimedia> Multimedia,
    bool Pagado = false,
    PortalDiagnosis? Diagnosis = null,
    IReadOnlyList<PortalDocumento>? Documentos = null);

/// <summary>Documento de la orden que el taller comparte con el cliente (informe de diagnosis, captura…).</summary>
public record PortalDocumento(int Id, string Nombre, string TipoContenido, long Tamano, DateTimeOffset Fecha, string Url);

/// <summary>
/// Ficha de diagnosis tal como la ve el cliente: síntomas, conclusión, códigos de avería, mediciones y pruebas.
/// Sin las notas internas del taller ni los adjuntos.
/// </summary>
public record PortalDiagnosis(
    string? Sintomas, string? Conclusion, DateTimeOffset Fecha,
    IReadOnlyList<PortalCodigo> Codigos, IReadOnlyList<PortalMedicion> Mediciones, IReadOnlyList<PortalPrueba> Pruebas);

public record PortalCodigo(string Codigo, string? Descripcion, EstadoCodigo Estado);

public record PortalMedicion(string Parametro, string Valor, string? Unidad, string? ValorEsperado, ResultadoMedicion Resultado);

public record PortalPrueba(string Descripcion, string? Resultado);

public record PortalMultimedia(int Id, EtapaMultimedia Etapa, string? Descripcion, string TipoContenido, DateTimeOffset Fecha, string Url);

/// <summary>Fila de Gestión → Usuarios. <see cref="EsYo"/> marca al usuario con la sesión abierta.</summary>
public record UsuarioDto(
    string Id, string Usuario, string Rol, string Nombre, int? ClienteId, DateTimeOffset FechaAlta,
    DateTimeOffset? UltimoAcceso, bool Bloqueado, bool PendienteCambio, bool EsYo);

/// <summary>
/// Visión 360 del vehículo para su dueño: imagen, identificación, uso, historial y la reparación en curso.
/// Solo lo que el cliente puede ver (sin márgenes ni datos internos del taller); las fotos cuentan solo las visibles.
/// </summary>
public record PortalVehiculoResumen(
    string? ImagenUrl, bool ImagenGenerada, string? Color, string? Motor, DatosTecnicosVehiculo? Tecnicos, UsoResumen Uso,
    int Visitas, DateTimeOffset? Primera, DateTimeOffset? Ultima, string? UltimoMotivo, decimal Facturado,
    PortalOrdenResumen? EnCurso, int Fotos, int Videos, int? UltimaOrdenConFotos);

/// <summary>Cliente cuya área se está viendo.</summary>
public record PortalClienteDto(int Id, string Nombre);
