using System.ComponentModel.DataAnnotations;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public record ClienteListItem(
    int Id,
    TipoCliente Tipo,
    string Nombre,
    string? NifCif,
    string? Telefono,
    string? Poblacion,
    int NumVehiculos);

public record ClienteDetalle(
    int Id,
    TipoCliente Tipo,
    string Nombre,
    string? NifCif,
    string? Telefono,
    string? Email,
    string? Direccion,
    string? CodigoPostal,
    string? Poblacion,
    string? Provincia,
    string? Notas,
    DateTimeOffset FechaAlta,
    IReadOnlyList<VehiculoListItem> Vehiculos);

public record ClienteRequest(
    TipoCliente Tipo,
    [Required, MaxLength(200)] string Nombre,
    [MaxLength(20)] string? NifCif,
    [MaxLength(30)] string? Telefono,
    [MaxLength(200), EmailAddress] string? Email,
    [MaxLength(300)] string? Direccion,
    [MaxLength(10)] string? CodigoPostal,
    [MaxLength(100)] string? Poblacion,
    [MaxLength(100)] string? Provincia,
    string? Notas);
