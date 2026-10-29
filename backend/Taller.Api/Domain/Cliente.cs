namespace Taller.Api.Domain;

public class Cliente
{
    public int Id { get; set; }
    public TipoCliente Tipo { get; set; }

    /// <summary>Nombre completo o razón social.</summary>
    public required string Nombre { get; set; }
    public string? NifCif { get; set; }
    public string? Telefono { get; set; }
    public string? Email { get; set; }
    public string? Direccion { get; set; }
    public string? CodigoPostal { get; set; }
    public string? Poblacion { get; set; }
    public string? Provincia { get; set; }
    public string? Notas { get; set; }
    public DateTimeOffset FechaAlta { get; set; }

    public List<Vehiculo> Vehiculos { get; set; } = [];
}
