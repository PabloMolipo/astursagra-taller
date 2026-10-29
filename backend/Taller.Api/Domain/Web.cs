namespace Taller.Api.Domain;

/// <summary>Servicio del catálogo que se muestra en la web pública.</summary>
public class Servicio
{
    public int Id { get; set; }
    public required string Slug { get; set; }
    public required string Titulo { get; set; }
    public required string Resumen { get; set; }
    public string? Descripcion { get; set; }

    /// <summary>Clave del icono que pinta la web (motor, electrica, programacion, chapa, mantenimiento, agricola…).</summary>
    public required string Icono { get; set; }
    public int Orden { get; set; }
    public bool Publicado { get; set; }
}

/// <summary>Trabajo realizado publicado en la web, con su galería de fotos.</summary>
public class TrabajoRealizado
{
    public int Id { get; set; }
    public required string Slug { get; set; }
    public required string Titulo { get; set; }
    public required string Resumen { get; set; }
    public string? Descripcion { get; set; }
    public DateOnly Fecha { get; set; }

    /// <summary>Texto libre del vehículo, p. ej. "BMW 530d" o "Tractor John Deere 6155R".</summary>
    public string? Vehiculo { get; set; }
    public TipoVehiculo? TipoVehiculo { get; set; }
    public List<TipoServicio> Servicios { get; set; } = [];
    public bool Publicado { get; set; }
    public bool Destacado { get; set; }
    public DateTimeOffset FechaAlta { get; set; }

    public List<FotoTrabajo> Fotos { get; set; } = [];
}

public class FotoTrabajo
{
    public int Id { get; set; }
    public int TrabajoRealizadoId { get; set; }
    public TrabajoRealizado TrabajoRealizado { get; set; } = null!;

    /// <summary>Nombre del archivo en el almacén de medios (aleatorio, no el original).</summary>
    public required string Archivo { get; set; }
    public string? Pie { get; set; }
    public int Orden { get; set; }
}

/// <summary>Datos de contacto y presentación del taller (una sola fila).</summary>
public class DatosTaller
{
    public const int IdUnico = 1;

    public int Id { get; set; } = IdUnico;
    public required string Nombre { get; set; }
    public string? Lema { get; set; }
    public string? Presentacion { get; set; }
    public string? Telefono { get; set; }
    public string? WhatsApp { get; set; }
    public string? Email { get; set; }
    public string? Direccion { get; set; }
    public string? CodigoPostal { get; set; }
    public string? Poblacion { get; set; }
    public string? Provincia { get; set; }
    public string? Horario { get; set; }

    /// <summary>IVA (%) con el que se crean las líneas nuevas de las órdenes; 0 si no se aplica.</summary>
    public decimal IvaPorDefecto { get; set; } = 21m;

    /// <summary>Datos fiscales para las facturas: titular (nombre o razón social) y NIF/CIF.</summary>
    public string? RazonSocial { get; set; }
    public string? Nif { get; set; }

    /// <summary>Texto al pie de las facturas (p. ej. la causa de exención si no se aplica IVA).</summary>
    public string? PieFactura { get; set; }

    /// <summary>Enlace de Google Maps (o similar) para "Cómo llegar".</summary>
    public string? UrlMapa { get; set; }
}
