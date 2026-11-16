namespace Taller.Api.Domain;

public enum TipoCentralita
{
    Motor,
    Cambio,
    Abs,
    Luces,
    Airbag,
    Confort,
    Otra
}

/// <summary>Cómo se guarda cada valor de un mapa o de un eje en el binario.</summary>
public enum TipoDatoMapa
{
    U8,
    I8,
    U16,
    I16,
    U32,
    I32,
    F32
}

/// <summary>Para qué sirve el mapa (los importantes de una reprogramación); null si no se ha clasificado.</summary>
public enum GrupoMapa
{
    Inyeccion,
    Turbo,
    Rail,
    Par,
    Limitadores,
    Avance,
    Egr,
    Dpf,
    Lambda,
    Otros
}

public enum OrigenMapa
{
    /// <summary>Encontrado al analizar el archivo (sin nombre ni conversión: valores en bruto).</summary>
    Detectado,
    Manual
}

/// <summary>
/// Lectura (volcado) de una centralita: el binario se guarda en el almacén privado y, al subirlo, se identifica
/// (familia, números de hardware y software) y se buscan sus mapas.
/// </summary>
public class Centralita
{
    public int Id { get; set; }
    public TipoCentralita Tipo { get; set; }
    public required string Nombre { get; set; }

    /// <summary>Nombre del archivo subido (.bin, .ori…).</summary>
    public required string NombreArchivo { get; set; }

    /// <summary>Nombre con el que está guardado en el almacén.</summary>
    public required string Archivo { get; set; }
    public long Tamano { get; set; }
    public required string Sha256 { get; set; }

    public string? Familia { get; set; }
    public string? Hardware { get; set; }
    public string? Software { get; set; }

    /// <summary>Referencia del fabricante del vehículo (p. ej. VAG 03L906018).</summary>
    public string? Referencia { get; set; }

    public int? VehiculoId { get; set; }
    public Vehiculo? Vehiculo { get; set; }
    public string? Notas { get; set; }
    public DateTimeOffset FechaAlta { get; set; }

    /// <summary>Otra lectura del mismo tamaño con la que se compara (la modificada de este original, o al revés).</summary>
    public int? ComparadaConId { get; set; }

    public List<MapaCentralita> Mapas { get; set; } = [];
}

/// <summary>
/// Definición de un mapa (tabla de 2 ejes), curva (1 eje: <see cref="Filas"/> = 1) o valor suelto dentro del binario:
/// dónde está y cómo se lee. Valor físico = bruto × factor + desplazamiento (igual en los ejes). Los ejes son opcionales:
/// sin dirección se numeran 0, 1, 2…
/// </summary>
public abstract class DefinicionMapa
{
    public required string Nombre { get; set; }

    /// <summary>Qué es el mapa en palabras (p. ej. la descripción del A2L traducida); el nombre suele ser una abreviatura.</summary>
    public string? Descripcion { get; set; }
    public GrupoMapa? Grupo { get; set; }

    public int Direccion { get; set; }
    public int Columnas { get; set; }
    public int Filas { get; set; }
    public TipoDatoMapa TipoDato { get; set; }
    public bool BigEndian { get; set; }

    /// <summary>Valores guardados por columnas: cada punto del eje X con todos los de Y seguidos (si no, por filas).</summary>
    public bool PorColumnas { get; set; }
    public double Factor { get; set; } = 1;
    public double Desplazamiento { get; set; }
    public string? Unidad { get; set; }

    /// <summary>Eje X (columnas).</summary>
    public int? EjeXDireccion { get; set; }
    public TipoDatoMapa EjeXTipo { get; set; }
    public double EjeXFactor { get; set; } = 1;
    public double EjeXDesplazamiento { get; set; }
    public string? EjeXUnidad { get; set; }

    /// <summary>Qué mide el eje (régimen, carga…), para la cabecera de la tabla.</summary>
    public string? EjeXNombre { get; set; }

    /// <summary>Valores fijos del eje X separados por «;» (ejes que no están en el binario, p. ej. de un XDF), si no tiene dirección.</summary>
    public string? EjeXValores { get; set; }

    /// <summary>Eje Y (filas).</summary>
    public int? EjeYDireccion { get; set; }
    public TipoDatoMapa EjeYTipo { get; set; }
    public double EjeYFactor { get; set; } = 1;
    public double EjeYDesplazamiento { get; set; }
    public string? EjeYUnidad { get; set; }
    public string? EjeYNombre { get; set; }
    public string? EjeYValores { get; set; }

    public string? Notas { get; set; }

    /// <summary>Copia la definición de otro mapa (de otra lectura o de la biblioteca).</summary>
    public void CopiarDe(DefinicionMapa o)
    {
        Nombre = o.Nombre;
        Grupo = o.Grupo;
        Direccion = o.Direccion;
        Columnas = o.Columnas;
        Filas = o.Filas;
        TipoDato = o.TipoDato;
        BigEndian = o.BigEndian;
        PorColumnas = o.PorColumnas;
        Factor = o.Factor;
        Desplazamiento = o.Desplazamiento;
        Unidad = o.Unidad;
        EjeXDireccion = o.EjeXDireccion;
        EjeXTipo = o.EjeXTipo;
        EjeXFactor = o.EjeXFactor;
        EjeXDesplazamiento = o.EjeXDesplazamiento;
        EjeXUnidad = o.EjeXUnidad;
        EjeXValores = o.EjeXValores;
        EjeYDireccion = o.EjeYDireccion;
        EjeYTipo = o.EjeYTipo;
        EjeYFactor = o.EjeYFactor;
        EjeYDesplazamiento = o.EjeYDesplazamiento;
        EjeYUnidad = o.EjeYUnidad;
        EjeYValores = o.EjeYValores;
        Notas = o.Notas;
        Descripcion = o.Descripcion;
        EjeXNombre = o.EjeXNombre;
        EjeYNombre = o.EjeYNombre;
    }
}

/// <summary>Mapa de una lectura: detectado al analizarla, o con nombre (creado, editado, copiado o importado).</summary>
public class MapaCentralita : DefinicionMapa
{
    public int Id { get; set; }
    public int CentralitaId { get; set; }
    public OrigenMapa Origen { get; set; }
}

/// <summary>
/// Biblioteca de mapas con nombre para un software (clave: número de software, o referencia si no lo tiene, y tamaño del
/// archivo). Se alimenta con los mapas que se nombran en cualquier lectura y con los XDF importados, y se aplica sola a
/// las lecturas nuevas del mismo software: el mismo software tiene los mapas en las mismas direcciones.
/// </summary>
public class BibliotecaSoftware
{
    public int Id { get; set; }
    public required string Clave { get; set; }
    public string? Familia { get; set; }
    public string? Software { get; set; }
    public string? Referencia { get; set; }
    public long Tamano { get; set; }
    public DateTimeOffset FechaAlta { get; set; }
    public DateTimeOffset Modificada { get; set; }
    public List<MapaBiblioteca> Mapas { get; set; } = [];
}

public class MapaBiblioteca : DefinicionMapa
{
    public int Id { get; set; }
    public int BibliotecaSoftwareId { get; set; }
}

/// <summary>
/// Registro de un XDF importado: en qué lectura, para qué biblioteca (si la lectura tiene software), cuántos mapas se
/// importaron y los avisos. El archivo se guarda en el almacén de centralitas para poder descargarlo.
/// </summary>
public class ImportacionXdf
{
    public int Id { get; set; }
    public int? BibliotecaSoftwareId { get; set; }
    public int? CentralitaId { get; set; }
    public string? Titulo { get; set; }
    public required string NombreArchivo { get; set; }
    public required string Archivo { get; set; }
    public long Tamano { get; set; }
    public int Importados { get; set; }
    public int Omitidos { get; set; }

    /// <summary>Avisos de la importación, uno por línea.</summary>
    public string? Avisos { get; set; }
    public DateTimeOffset Fecha { get; set; }
}
