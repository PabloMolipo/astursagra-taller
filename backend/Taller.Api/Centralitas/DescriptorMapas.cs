using System.Globalization;
using System.Text;
using Anthropic.Models.Beta.Messages;
using Taller.Api.Contracts;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;

namespace Taller.Api.Centralitas;

/// <summary>
/// Describe un mapa de centralita en lenguaje de taller con Claude: qué es probablemente, cómo es su forma y, si se
/// compara con otra lectura, qué le ha hecho la reprogramación. Solo se envían los números del mapa y la identificación
/// de la centralita (familia, software, vehículo), nunca el archivo ni datos del cliente.
/// </summary>
public class DescriptorMapas(ClienteAnthropic cliente)
{
    public const string Modelo = AsistenteDiagnostico.Modelo;

    /// <summary>Límite de celdas: un 64×64 cabe de sobra y evita peticiones enormes.</summary>
    public const int MaxCeldas = 4096;

    private const string PromptSistema = """
        Eres un calibrador experto en centralitas de motor (Bosch EDC15/16/17, MD1/MG1, Delphi DCM, Siemens SID…) que
        ayuda a los mecánicos de AsturSagra, un taller que reprograma centralitas. Te llega un mapa tal como se ve en
        su editor: ejes, valores y, a veces, el mismo mapa en otra lectura (original o modificada) para comparar.

        Describe el mapa en español de taller, directo y sin relleno:
        - **Qué es probablemente**: tipo de mapa (par máximo, limitador de humos, presión de turbo, cantidad de inyección,
          avance, rail, EGR…) y por qué lo crees (dimensiones, rango y forma de los ejes, forma de la superficie). Si
          el mapa no tiene nombre ni conversión (valores en bruto), dilo y da tu hipótesis con su grado de confianza.
          Puedes proponer qué factor o unidad encajaría, como hipótesis.
        - **Forma**: dónde están los máximos y los mínimos, zonas planas, cortes o escalones llamativos.
        - **Si hay comparación**: qué cambió (zonas, % aproximado, celdas a 0 o al máximo) y qué efecto tendrá en el
          coche; avisa si algo parece arriesgado (humo, temperatura de escape, embrague, turbo).
        - Si no se puede saber qué es, dilo sin inventar.

        Formato: 4–8 viñetas cortas en Markdown, sin introducción ni resumen final. Las cifras, redondeadas.
        """;

    public bool Configurado => cliente.Configurado;

    public async Task<DescripcionMapa> DescribirAsync(Centralita c, DescribirMapaRequest req, CancellationToken ct)
    {
        var parametros = new MessageCreateParams
        {
            Model = Modelo,
            MaxTokens = 8000,
            System = PromptSistema,
            Messages = [new BetaMessageParam { Role = Role.User, Content = Contexto(c, req) }],
            // Describir un mapa es interpretar números con criterio, pero sin una investigación larga: esfuerzo medio.
            Thinking = new BetaThinkingConfigAdaptive(),
            OutputConfig = new BetaOutputConfig { Effort = Effort.Medium },
            // Si un filtro de seguridad rechaza la petición, se reintenta en el modelo que recomiende Anthropic.
            Betas = ["server-side-fallback-2026-07-01"],
            Fallbacks = new Default()
        };
        var respuesta = await cliente.Cliente.Beta.Messages.Create(parametros, ct);
        if (respuesta.StopReason?.Raw() == "refusal")
        {
            return new("La IA no ha querido describir este mapa.", Modelo);
        }
        var texto = new StringBuilder();
        foreach (var bloque in respuesta.Content)
        {
            if (bloque.TryPickText(out var t))
            {
                texto.Append(t.Text);
            }
        }
        return new(texto.ToString().Trim(), Modelo);
    }

    /// <summary>Mensaje con la centralita y el mapa como tablas de texto (filas = eje Y, columnas = eje X).</summary>
    public static string Contexto(Centralita c, DescribirMapaRequest req)
    {
        var s = new StringBuilder();
        var v = c.Vehiculo;
        s.AppendLine("Centralita: " + Unir(c.Familia, c.Software is null ? null : "software " + c.Software, c.Hardware is null ? null : "hardware " + c.Hardware));
        if (v is not null)
        {
            s.AppendLine("Vehículo: " + Unir(v.Marca, v.Modelo, v.Motor is null ? null : "motor " + v.Motor, v.Anio?.ToString(CultureInfo.InvariantCulture)));
        }
        s.AppendLine($"Tamaño del archivo: {c.Tamano / 1024} KB");
        s.AppendLine();
        s.AppendLine($"Mapa: «{req.Nombre}»" + (req.Grupo is { } g ? $" (grupo: {g})" : "") + (req.Detectado ? " — detectado automáticamente: valores y ejes en bruto, sin conversión" : ""));
        if (!string.IsNullOrWhiteSpace(req.Descripcion))
        {
            s.AppendLine($"Descripción guardada del mapa: {req.Descripcion}");
        }
        if (!string.IsNullOrWhiteSpace(req.Sugerencia))
        {
            s.AppendLine($"Reconocimiento automático del taller: {req.Sugerencia}");
        }
        var filas = req.Valores.Length;
        var columnas = req.Valores.Length > 0 ? req.Valores[0].Length : 0;
        s.AppendLine($"Dimensiones: {columnas} columnas (eje X) × {filas} filas (eje Y); unidad de los valores: {req.Unidad ?? "sin unidad"}");
        s.AppendLine($"Eje X ({(Unir(req.EjeXNombre, req.EjeXUnidad) is { Length: > 0 } ex ? ex : "sin unidad")}): {Lista(req.EjeX)}");
        if (filas > 1)
        {
            s.AppendLine($"Eje Y ({(Unir(req.EjeYNombre, req.EjeYUnidad) is { Length: > 0 } ey ? ey : "sin unidad")}): {Lista(req.EjeY)}");
        }
        s.AppendLine();
        Tabla(s, req.ValoresOtra is not null && req.OtraEsOriginal ? "Valores en ESTA lectura (la modificada)" : "Valores en esta lectura", req.Valores, req.EjeY);
        if (req.ValoresOtra is not null)
        {
            s.AppendLine();
            Tabla(s, req.OtraEsOriginal ? "Valores en la lectura ORIGINAL" : "Valores en la lectura MODIFICADA (la reprogramación)", req.ValoresOtra, req.EjeY);
        }
        return s.ToString();
    }

    /// <summary>Error de validación de la forma del mapa; null si es correcto.</summary>
    public static string? Validar(DescribirMapaRequest req)
    {
        var columnas = req.Valores.Length > 0 ? req.Valores[0].Length : 0;
        if (columnas == 0 || req.Valores.Any(f => f.Length != columnas))
        {
            return "El mapa debe tener el mismo número de columnas en todas las filas.";
        }
        if (columnas * req.Valores.Length > MaxCeldas)
        {
            return $"El mapa es demasiado grande para describirlo (máximo {MaxCeldas} celdas).";
        }
        if (req.EjeX.Length != columnas || (req.Valores.Length > 1 && req.EjeY.Length != req.Valores.Length))
        {
            return "Los ejes no coinciden con las dimensiones del mapa.";
        }
        if (req.ValoresOtra is { } o && (o.Length != req.Valores.Length || o.Any(f => f.Length != columnas)))
        {
            return "El mapa de la otra lectura no tiene las mismas dimensiones.";
        }
        return null;
    }

    private static string Unir(params string?[] partes) => string.Join(", ", partes.Where(p => !string.IsNullOrWhiteSpace(p)));

    private static string Numero(double? x) => x is { } n && double.IsFinite(n) ? Math.Round(n, 3).ToString(CultureInfo.InvariantCulture) : "—";

    private static string Lista(double?[] valores) => string.Join(" ", valores.Select(Numero));

    private static void Tabla(StringBuilder s, string titulo, double?[][] valores, double?[] ejeY)
    {
        s.AppendLine(titulo + " (una línea por fila; «Y=…» es el valor del eje Y):");
        for (var f = 0; f < valores.Length; f++)
        {
            s.AppendLine((valores.Length > 1 ? $"Y={Numero(ejeY.ElementAtOrDefault(f))}: " : "") + Lista(valores[f]));
        }
    }
}
