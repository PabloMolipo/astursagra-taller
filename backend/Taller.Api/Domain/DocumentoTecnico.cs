namespace Taller.Api.Domain;

public enum TipoDocumento
{
    EsquemaElectrico,
    Manual,
    Procedimiento,
    Boletin,
    DatosTecnicos,
    Otro
}

/// <summary>
/// Documento de la biblioteca técnica del taller (esquema eléctrico, manual, procedimiento…). Privado.
/// Se asocia a vehículos por marca, modelo, código de motor y años; sin marca, solo aparece en la biblioteca.
/// </summary>
public class DocumentoTecnico
{
    public int Id { get; set; }
    public required string Titulo { get; set; }
    public TipoDocumento Tipo { get; set; }

    public string? Marca { get; set; }

    /// <summary>Texto que debe contener el modelo del vehículo, p. ej. "Golf" o "León".</summary>
    public string? Modelo { get; set; }

    /// <summary>Código de motor, p. ej. "BKC" o "CFFB".</summary>
    public string? Motor { get; set; }
    public int? AnioDesde { get; set; }
    public int? AnioHasta { get; set; }

    /// <summary>Sistema o circuito: "Inyección", "Cierre centralizado", "Climatización"…</summary>
    public string? Sistema { get; set; }
    public string? Notas { get; set; }

    public required string Archivo { get; set; }
    public required string NombreOriginal { get; set; }
    public required string TipoContenido { get; set; }
    public long Tamano { get; set; }
    public DateTimeOffset FechaAlta { get; set; }

    /// <summary>Id del archivo en SharePoint si viene de la sincronización (null = subido a mano).</summary>
    public string? SharePointId { get; set; }

    /// <summary>Versión del contenido en SharePoint (cTag): si cambia, se vuelve a descargar.</summary>
    public string? SharePointVersion { get; set; }

    /// <summary>Carpeta en SharePoint, p. ej. "Volkswagen/Golf".</summary>
    public string? SharePointRuta { get; set; }

    /// <summary>Borrado en SharePoint pero conservado porque lo usa alguna consulta del asistente.</summary>
    public bool EliminadoEnSharePoint { get; set; }
}

/// <summary>Estado de la sincronización con SharePoint: una fila por biblioteca (documentación y REPRO).</summary>
public class EstadoSincronizacion
{
    public const int IdDocumentacion = 1;
    public const int IdRepro = 2;
    public int Id { get; set; } = IdDocumentacion;

    /// <summary>Id de la biblioteca (drive) en Graph, para leer archivos sin volver a buscarla.</summary>
    public string? DriveId { get; set; }

    /// <summary>Enlace delta de Graph para pedir solo los cambios desde la última vez.</summary>
    public string? EnlaceDelta { get; set; }
    public DateTimeOffset? UltimaSincronizacion { get; set; }
    public string? UltimoResultado { get; set; }
    public bool UltimaConError { get; set; }

    /// <summary>Site, biblioteca y carpeta de la última sincronización: si cambian, se empieza de cero.</summary>
    public string? Origen { get; set; }
}

/// <summary>
/// Acceso directo a un portal de datos técnicos (HaynesPro, portal del fabricante…). La URL admite
/// {vin}, {matricula}, {marca} y {modelo}, que se sustituyen con los datos del vehículo.
/// </summary>
public class EnlacePortal
{
    public int Id { get; set; }
    public required string Nombre { get; set; }
    public required string Url { get; set; }

    /// <summary>Solo para esta marca; vacío = para todos los vehículos.</summary>
    public string? Marca { get; set; }
    public int Orden { get; set; }
}

/// <summary>Documento usado en una conversación del asistente: mientras exista, el documento no se puede borrar.</summary>
public class UsoDocumentoAsistente
{
    public int SesionAsistenteId { get; set; }
    public int DocumentoTecnicoId { get; set; }
}

/// <summary>
/// Catálogo gratuito de despieces o esquemas en otra web (RealOEM, PartSouq, 7zap…). Su contenido no se copia ni se
/// incrusta: se abre en el navegador ya posicionado en el vehículo. Las direcciones admiten {vin}, {vin7} (los 7 últimos
/// caracteres), {marca}, {marca-slug}, {modelo}, {matricula} y, en la de referencias, {referencia}.
/// </summary>
public class CatalogoDespiece
{
    public int Id { get; set; }
    public required string Nombre { get; set; }

    /// <summary>Qué ofrece, para elegir entre catálogos: "Despieces originales de BMW y MINI".</summary>
    public string? Descripcion { get; set; }
    public required string UrlVehiculo { get; set; }

    /// <summary>Búsqueda por referencia de pieza (opcional).</summary>
    public string? UrlReferencia { get; set; }

    /// <summary>Marcas separadas por comas; vacío = todas.</summary>
    public string? Marcas { get; set; }

    /// <summary>Cómo llama la web a algunas marcas en {marca-slug}: "Mercedes-Benz=mercedes, VW=volkswagen".</summary>
    public string? AliasMarcas { get; set; }
    public bool Activo { get; set; } = true;
    public int Orden { get; set; }
}
