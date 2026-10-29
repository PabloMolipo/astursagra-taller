namespace Taller.Api.Domain;

public enum EstadoCodigo
{
    /// <summary>Almacenado / confirmado (modo 03).</summary>
    Activo,
    /// <summary>Pendiente de confirmar (modo 07).</summary>
    Pendiente,
    /// <summary>Permanente: no se borra hasta que el sistema verifica la reparación (modo 0A).</summary>
    Permanente,
    /// <summary>Ya resuelto o borrado; se conserva como referencia.</summary>
    Historico
}

public enum ResultadoMedicion
{
    SinValorar,
    Correcto,
    FueraDeRango
}

/// <summary>Ficha de diagnosis de una orden: lo que se ha leído, medido y probado, y la conclusión.</summary>
public class FichaDiagnosis
{
    public int Id { get; set; }
    public int OrdenTrabajoId { get; set; }
    public OrdenTrabajo OrdenTrabajo { get; set; } = null!;

    public string? Sintomas { get; set; }
    public string? Conclusion { get; set; }
    public DateTimeOffset FechaActualizacion { get; set; }

    public List<CodigoLeido> Codigos { get; set; } = [];
    public List<Medicion> Mediciones { get; set; } = [];
    public List<PruebaDiagnosis> Pruebas { get; set; } = [];
    public List<AdjuntoDiagnosis> Adjuntos { get; set; } = [];
}

public class CodigoLeido
{
    public int Id { get; set; }
    public int FichaDiagnosisId { get; set; }
    public required string Codigo { get; set; }
    public string? Descripcion { get; set; }
    public EstadoCodigo Estado { get; set; }
    public string? Nota { get; set; }
}

public class Medicion
{
    public int Id { get; set; }
    public int FichaDiagnosisId { get; set; }

    /// <summary>Qué se mide: "Tensión de batería", "Presión rail al arranque"…</summary>
    public required string Parametro { get; set; }
    public required string Valor { get; set; }
    public string? Unidad { get; set; }
    public string? ValorEsperado { get; set; }
    public ResultadoMedicion Resultado { get; set; }
    public string? Nota { get; set; }

    /// <summary>Referencia con la que se compara (opcional).</summary>
    public int? ValorReferenciaId { get; set; }
    public ValorReferencia? ValorReferencia { get; set; }
}

public class PruebaDiagnosis
{
    public int Id { get; set; }
    public int FichaDiagnosisId { get; set; }
    public required string Descripcion { get; set; }
    public string? Resultado { get; set; }
}

/// <summary>Informe PDF de la máquina de diagnosis, foto, captura… Privado: solo lo descarga el taller.</summary>
public class AdjuntoDiagnosis
{
    public int Id { get; set; }
    public int FichaDiagnosisId { get; set; }
    public FichaDiagnosis FichaDiagnosis { get; set; } = null!;
    public required string Archivo { get; set; }
    public required string NombreOriginal { get; set; }
    public required string TipoContenido { get; set; }
    public long Tamano { get; set; }
    public DateTimeOffset Fecha { get; set; }

    /// <summary>El cliente lo ve (y lo descarga) en su área. Por defecto, sí.</summary>
    public bool VisibleCliente { get; set; } = true;
}

/// <summary>Biblioteca de códigos de avería: genéricos SAE de partida y los que añada o anote el taller.</summary>
public class CodigoAveria
{
    /// <summary>En mayúsculas, p. ej. "P0401".</summary>
    public required string Codigo { get; set; }
    public required string Descripcion { get; set; }
    public string? Sistema { get; set; }

    /// <summary>Notas del taller: causas habituales vistas, trucos, marcas en las que se repite…</summary>
    public string? Notas { get; set; }

    /// <summary>Añadido por el taller (p. ej. un código de fabricante), no de la lista genérica.</summary>
    public bool EsPropio { get; set; }
}

/// <summary>Conversación con el asistente de diagnóstico, normalmente ligada a una orden.</summary>
public class SesionAsistente
{
    public int Id { get; set; }
    public int? OrdenTrabajoId { get; set; }
    public OrdenTrabajo? OrdenTrabajo { get; set; }
    public required string Titulo { get; set; }
    public DateTimeOffset FechaCreacion { get; set; }
    public DateTimeOffset FechaActualizacion { get; set; }

    /// <summary>Huella de la ficha enviada por última vez; si cambia, se envía la ficha actualizada.</summary>
    public string? HuellaFicha { get; set; }
    public long TokensEntrada { get; set; }
    public long TokensSalida { get; set; }

    public List<MensajeAsistente> Mensajes { get; set; } = [];
}

/// <summary>
/// Un mensaje tal como se envió o recibió de la API (texto, razonamiento, llamadas a herramientas y sus resultados).
/// El historial se reenvía siempre idéntico y en el mismo orden: solo se añaden mensajes al final.
/// </summary>
public class MensajeAsistente
{
    public int Id { get; set; }
    public int SesionAsistenteId { get; set; }
    public int Orden { get; set; }

    /// <summary>"user" o "assistant".</summary>
    public required string Rol { get; set; }

    /// <summary>Bloques del mensaje serializados (ver <c>BloqueMensaje</c>).</summary>
    public required string BloquesJson { get; set; }
    public DateTimeOffset Fecha { get; set; }
}
