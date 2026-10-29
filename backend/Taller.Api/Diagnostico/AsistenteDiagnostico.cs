using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Anthropic;
using Anthropic.Exceptions;
using Anthropic.Models.Beta.Messages;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;
using Taller.Api.Integraciones;

namespace Taller.Api.Diagnostico;

/// <summary>Evento que se envía al navegador mientras el asistente responde (Server-Sent Events).</summary>
public record EventoAsistente(string Tipo, string? Texto = null, string? Nombre = null, JsonElement? Datos = null);

/// <summary>
/// Asistente de diagnóstico con Claude. Cada turno: (1) se añade el mensaje del mecánico, con la ficha de la orden si
/// ha cambiado; (2) Claude responde en streaming y puede consultar el historial del taller con herramientas;
/// (3) el turno completo se guarda solo si termina bien. El historial se reenvía siempre idéntico (solo se añade al final),
/// lo que permite reutilizar la caché y conservar el razonamiento entre turnos.
/// </summary>
public class AsistenteDiagnostico(
    TallerDbContext db, HistorialDiagnostico historial, DocumentacionTecnica documentacion, AlmacenPrivado almacen,
    ClienteAnthropic cliente, ClienteVinalfa vinalfa, OpcionesVinalfa opcionesVinalfa, ILogger<AsistenteDiagnostico> log)
{
    public const string Modelo = "claude-opus-5-5";
    private const int MaxVueltasHerramientas = 8;
    private const int MaxCasos = 8;

    // Límites de la API para documentos en base64: PDF de hasta 32 MB por petición, imágenes de hasta 5 MB.
    private const long MaxPdf = 25 * 1024 * 1024;
    private const long MaxImagen = 5 * 1024 * 1024;

    private const string PromptSistema = """
        Eres el asistente de diagnóstico de AsturSagra, un taller de La Sagra (Toledo) que repara turismos, motos,
        furgonetas, camiones, tractores y maquinaria agrícola: mecánica, electromecánica, diagnosis y programación de
        centralitas, y chapa y pintura. Hablas con los mecánicos del taller, profesionales con experiencia: ve al grano,
        en español de taller, sin explicar lo básico.

        Ante una avería:
        - Propón las causas probables ordenadas de más a menos probable para ese vehículo y esos síntomas, con el porqué en una línea.
        - Para cada causa, di cómo confirmarla o descartarla: qué medir, dónde y qué valor esperar. Empieza por las pruebas rápidas y baratas.
        - Si falta un dato que cambiaría el diagnóstico (motorización, cuándo ocurre, códigos, mediciones), pregúntalo.
        - Consulta el historial del taller cuando pueda aportar: casos con los mismos códigos o síntomas parecidos y cómo se
          resolvieron. Cuando te apoyes en un caso, cita su número (por ejemplo OT-00012).
        - Antes de dar valores esperados (presiones, masas de aire, tensiones, resistencias…), consulta los valores de
          referencia del taller y di de dónde sale cada cifra; los genéricos son orientativos.
        - Si hay documentación técnica del vehículo (esquemas eléctricos, manuales, procedimientos), búscala con
          listar_documentacion y ábrela con ver_documento cuando ayude; cita la página o la figura en la que te basas.
          Los documentos que adjunta el mecánico llegan con su mensaje.
        - Si un despiece o un esquema no está en la biblioteca, usa buscar_despieces y da al mecánico los enlaces a los
          catálogos gratuitos en formato [nombre](url). No puedes ver lo que hay en esas webs: no describas su contenido.
        - Para referencias originales de una pieza de este vehículo concreto, usa buscar_piezas_oem (catálogo original por
          bastidor). Da la referencia tal como sale y la sección del despiece donde aparece.
        - Si no conoces un dato concreto del fabricante (valores nominales específicos, pares de apriete, esquemas), dilo y
          propón cómo obtenerlo en lugar de inventarlo.
        - Avisa de los riesgos de seguridad cuando proceda: alta tensión en híbridos y eléctricos, airbags, combustible a
          alta presión, vehículos elevados.

        La ficha de la orden (vehículo, síntomas, códigos, mediciones y pruebas) llega en los mensajes marcados como
        «Ficha de la orden»; si la ficha se actualiza durante la conversación, llega de nuevo y la última es la vigente.

        Formato: respuestas compactas, con listas cuando ayuden y sin introducciones ni resúmenes de relleno.
        """;

    // Herramientas: el asistente decide cuándo consultarlas. Las entradas se validan aquí antes de ejecutarlas.
    private static readonly List<BetaToolUnion> Herramientas =
    [
        new BetaTool
        {
            Name = "buscar_casos_similares",
            Description = "Busca en el historial del taller órdenes con los mismos códigos de avería o con síntomas parecidos, " +
                          "y devuelve qué se diagnosticó y qué trabajos se hicieron. Prioriza la misma marca y tipo de vehículo de la orden actual.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["palabras_clave"] = JsonSerializer.SerializeToElement(new
                    {
                        type = "array",
                        items = new { type = "string" },
                        description = "Palabras clave de los síntomas o componentes (p. ej. \"tirones\", \"EGR\", \"no arranca en frío\")."
                    }),
                    ["codigos"] = JsonSerializer.SerializeToElement(new
                    {
                        type = "array",
                        items = new { type = "string" },
                        description = "Códigos de avería OBD (p. ej. \"P0401\"). Opcional."
                    })
                },
                Required = ["palabras_clave"]
            },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "consultar_codigo",
            Description = "Consulta un código de avería en la biblioteca del taller: descripción, notas propias del taller y " +
                          "los casos del taller en los que apareció y cómo se resolvieron.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["codigo"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Código OBD, p. ej. \"P0299\"." })
                },
                Required = ["codigo"]
            },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "consultar_valores_referencia",
            Description = "Busca en los valores de referencia del taller (rango mínimo-máximo, unidad, condición de medida y a qué " +
                          "vehículos aplica) para comparar mediciones: masa de aire, presión de turbo, presión de rail, tensiones, resistencias…",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["texto"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Qué se busca: \"turbo\", \"caudalímetro\", \"presión rail\", \"batería\"…" }),
                    ["combustible"] = JsonSerializer.SerializeToElement(new { type = "string", @enum = new[] { "Gasolina", "Diesel" }, description = "Opcional." })
                },
                Required = ["texto"]
            },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "listar_documentacion",
            Description = "Lista la documentación técnica del taller: la compatible con el vehículo de la orden (esquemas eléctricos, manuales, procedimientos) " +
                          "y la genérica por temática (Common Rail, climatización…), que vale para cualquier vehículo.",
            InputSchema = new() { Properties = new Dictionary<string, JsonElement>() },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "ver_documento",
            Description = "Abre un documento de la biblioteca técnica por su id (de listar_documentacion) para leerlo.",
            InputSchema = new() { Properties = new Dictionary<string, JsonElement> { ["id"] = JsonSerializer.SerializeToElement(new { type = "integer" }) }, Required = ["id"] },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "buscar_piezas_oem",
            Description = "Busca una pieza por nombre o referencia en el catálogo original del vehículo de la orden, identificado por su bastidor " +
                          "(Vinalfa). Devuelve las secciones del despiece y las referencias originales aplicables a ese vehículo concreto.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["texto"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Pieza o referencia: pastillas de freno delanteras, filtro de aceite, 1K0698151F…" })
                },
                Required = ["texto"]
            },
            EagerInputStreaming = true
        },
        new BetaTool
        {
            Name = "buscar_despieces",
            Description = "Enlaces a catálogos gratuitos de despieces y esquemas de otras webs (RealOEM, PartSouq, 7zap…) para el vehículo de la orden, " +
                          "ya abiertos por su bastidor, y enlaces para buscar una referencia de pieza. Solo devuelve enlaces para el mecánico, no el contenido de esas webs.",
            InputSchema = new()
            {
                Properties = new Dictionary<string, JsonElement>
                {
                    ["referencia"] = JsonSerializer.SerializeToElement(new { type = "string", description = "Opcional: referencia de pieza a buscar, p. ej. 11427953129." })
                }
            },
            EagerInputStreaming = true
        }
    ];

    /// <summary>Contexto de la orden que se antepone al mensaje del mecánico. Sin datos del cliente.</summary>
    public async Task<string?> FichaComoTextoAsync(int? ordenId, CancellationToken ct)
    {
        if (ordenId is null)
        {
            return null;
        }

        var orden = await db.OrdenesTrabajo.AsNoTracking()
            .Include(o => o.Vehiculo)
            .FirstOrDefaultAsync(o => o.Id == ordenId, ct);
        if (orden is null)
        {
            return null;
        }

        var ficha = await db.FichasDiagnosis.AsNoTracking()
            .Include(f => f.Codigos).Include(f => f.Mediciones).Include(f => f.Pruebas)
            .AsSplitQuery()
            .FirstOrDefaultAsync(f => f.OrdenTrabajoId == ordenId, ct);

        var anteriores = await db.OrdenesTrabajo.AsNoTracking()
            .Where(o => o.VehiculoId == orden.VehiculoId && o.Id != orden.Id)
            .OrderByDescending(o => o.FechaEntrada)
            .Take(5)
            .Select(o => new { o.Id, o.FechaEntrada, o.MotivoEntrada, o.Diagnostico })
            .ToListAsync(ct);

        var v = orden.Vehiculo;
        var t = new StringBuilder();
        Linea(t, $"Ficha de la orden OT-{orden.Id:00000}");
        Linea(t, $"Vehículo: {v.Tipo} {v.Marca} {v.Modelo}{(v.Anio is { } a ? $" ({a})" : "")}");
        if (v.Motor is { } motor)
        {
            Linea(t, $"Código de motor: {motor}");
        }
        if ((orden.KilometrosEntrada ?? v.Kilometros) is { } km)
        {
            Linea(t, $"Kilómetros: {km:N0}");
        }
        if ((orden.HorasEntrada ?? v.Horas) is { } h)
        {
            Linea(t, $"Horas de uso: {h:N0}");
        }
        Linea(t, $"Motivo de entrada: {orden.MotivoEntrada}");
        Linea(t, $"Servicios: {string.Join(", ", orden.Servicios)}");
        if (orden.Diagnostico is { } diag)
        {
            Linea(t, $"Diagnóstico anotado en la orden: {diag}");
        }

        if (ficha is not null)
        {
            if (ficha.Sintomas is { } s)
            {
                Linea(t, $"Síntomas: {s}");
            }
            if (ficha.Codigos.Count > 0)
            {
                Linea(t, "Códigos leídos:");
                foreach (var c in ficha.Codigos.OrderBy(c => c.Id))
                {
                    Linea(t, $"- {c.Codigo} [{c.Estado}] {c.Descripcion}{(c.Nota is { } n ? $" · {n}" : "")}");
                }
            }
            if (ficha.Mediciones.Count > 0)
            {
                Linea(t, "Mediciones:");
                foreach (var m in ficha.Mediciones.OrderBy(m => m.Id))
                {
                    var esperado = m.ValorEsperado is { } e ? $" (esperado {e})" : "";
                    var resultado = m.Resultado == ResultadoMedicion.SinValorar ? "" : $" → {m.Resultado}";
                    Linea(t, $"- {m.Parametro}: {m.Valor} {m.Unidad}{esperado}{resultado}{(m.Nota is { } n ? $" · {n}" : "")}");
                }
            }
            if (ficha.Pruebas.Count > 0)
            {
                Linea(t, "Pruebas realizadas:");
                foreach (var p in ficha.Pruebas.OrderBy(p => p.Id))
                {
                    Linea(t, $"- {p.Descripcion}{(p.Resultado is { } r ? $": {r}" : "")}");
                }
            }
            if (ficha.Conclusion is { } conclusion)
            {
                Linea(t, $"Conclusión provisional: {conclusion}");
            }
        }

        if (anteriores.Count > 0)
        {
            Linea(t, "Visitas anteriores de este vehículo:");
            foreach (var o in anteriores)
            {
                Linea(t, $"- OT-{o.Id:00000} ({o.FechaEntrada:dd/MM/yyyy}): {o.MotivoEntrada}{(o.Diagnostico is { } d ? $" → {d}" : "")}");
            }
        }

        return t.ToString().TrimEnd();

        // Siempre "\n" (no el salto de línea del sistema): la huella de la ficha no debe depender del servidor.
        static void Linea(StringBuilder t, string texto) => t.Append(texto).Append('\n');
    }

    /// <summary>
    /// Ejecuta un turno completo. Los mensajes nuevos solo se guardan si el turno termina bien;
    /// si falla o el modelo lo rechaza, el historial queda como estaba.
    /// </summary>
    public async Task ResponderAsync(
        SesionAsistente sesion, string texto, IReadOnlyList<int> documentoIds, Func<EventoAsistente, Task> emitir, CancellationToken ct)
    {
        // Documentos adjuntos por el mecánico: se comprueban antes de empezar.
        var adjuntos = new List<BloqueMensaje>();
        foreach (var id in documentoIds.Distinct())
        {
            var doc = await db.DocumentosTecnicos.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, ct);
            var problema = doc is null ? "Uno de los documentos adjuntos ya no existe." : ErrorDocumento(doc);
            if (problema is not null || doc is null)
            {
                await emitir(new EventoAsistente("error", problema));
                return;
            }
            adjuntos.Add(new BloqueMensaje { Tipo = BloqueMensaje.TipoDocumento, DocumentoId = doc.Id, Nombre = doc.Titulo });
        }

        var historico = await db.MensajesAsistente.AsNoTracking()
            .Where(m => m.SesionAsistenteId == sesion.Id)
            .OrderBy(m => m.Orden)
            .ToListAsync(ct);

        var nuevos = new List<(string Rol, List<BloqueMensaje> Bloques)>();

        // Mensaje del mecánico, con la ficha delante si es la primera vez o ha cambiado.
        var bloquesUsuario = new List<BloqueMensaje>();
        var ficha = await FichaComoTextoAsync(sesion.OrdenTrabajoId, ct);
        var huella = ficha is null ? null : Huella(ficha);
        if (ficha is not null && huella != sesion.HuellaFicha)
        {
            bloquesUsuario.Add(new BloqueMensaje { Tipo = BloqueMensaje.TipoTexto, Texto = ficha, Interno = true });
        }
        bloquesUsuario.AddRange(adjuntos);
        bloquesUsuario.Add(new BloqueMensaje { Tipo = BloqueMensaje.TipoTexto, Texto = texto });
        nuevos.Add(("user", bloquesUsuario));

        long entrada = 0, salida = 0;
        var vehiculo = sesion.OrdenTrabajoId is { } oid
            ? await db.OrdenesTrabajo.AsNoTracking().Where(o => o.Id == oid).Select(o => o.Vehiculo).FirstOrDefaultAsync(ct)
            : null;
        var archivos = new Dictionary<int, (string Base64, string Tipo, string Titulo)>();

        for (var vuelta = 0; vuelta < MaxVueltasHerramientas; vuelta++)
        {
            var conversacion = historico.Select(m => (m.Rol, Bloques: BloqueMensaje.Deserializar(m.BloquesJson))).Concat(nuevos).ToList();
            await CargarArchivosAsync(conversacion.SelectMany(m => m.Bloques), archivos, ct);
            var mensajes = conversacion.Select(m => AParametro(m.Rol, m.Bloques, archivos)).ToList();

            var respuesta = await TransmitirAsync(mensajes, emitir, ct);
            entrada += respuesta.TokensEntrada;
            salida += respuesta.TokensSalida;

            if (respuesta.MotivoParada == "refusal")
            {
                await emitir(new EventoAsistente("error", "El asistente no puede responder a esta consulta. Prueba a reformularla."));
                return;
            }

            nuevos.Add(("assistant", respuesta.Bloques));

            if (respuesta.MotivoParada == "max_tokens")
            {
                await emitir(new EventoAsistente("aviso", "La respuesta se ha cortado por ser demasiado larga."));
                break;
            }

            var llamadas = respuesta.Bloques.Where(b => b.Tipo == BloqueMensaje.TipoUsoHerramienta).ToList();
            if (respuesta.MotivoParada != "tool_use" || llamadas.Count == 0)
            {
                break;
            }

            // Todos los resultados en un solo mensaje, uno por cada llamada.
            var resultados = new List<BloqueMensaje>();
            foreach (var llamada in llamadas)
            {
                var (contenido, error, documento) = await EjecutarHerramientaAsync(llamada, vehiculo, sesion.OrdenTrabajoId, ct);
                resultados.Add(new BloqueMensaje { Tipo = BloqueMensaje.TipoResultado, Id = llamada.Id, Contenido = contenido, EsError = error, DocumentoId = documento });
                await emitir(new EventoAsistente("resultado", error ? "Error al consultar" : Resumen(llamada.Nombre!, contenido), llamada.Nombre));
            }
            nuevos.Add(("user", resultados));
        }

        // Turno completo: se guarda todo de una vez.
        var orden = historico.Count == 0 ? 0 : historico.Max(m => m.Orden) + 1;
        var ahora = DateTimeOffset.UtcNow;
        foreach (var (rol, bloques) in nuevos)
        {
            db.MensajesAsistente.Add(new MensajeAsistente
            {
                SesionAsistenteId = sesion.Id,
                Orden = orden++,
                Rol = rol,
                BloquesJson = BloqueMensaje.Serializar(bloques),
                Fecha = ahora
            });
        }

        // Los documentos usados quedan protegidos contra el borrado mientras exista la conversación.
        var usados = nuevos.SelectMany(m => m.Bloques).Select(b => b.DocumentoId).OfType<int>().Distinct().ToList();
        var yaRegistrados = await db.UsosDocumentoAsistente.Where(u => u.SesionAsistenteId == sesion.Id).Select(u => u.DocumentoTecnicoId).ToListAsync(ct);
        db.UsosDocumentoAsistente.AddRange(usados.Except(yaRegistrados).Select(d => new UsoDocumentoAsistente { SesionAsistenteId = sesion.Id, DocumentoTecnicoId = d }));

        var seguida = await db.SesionesAsistente.FirstAsync(s => s.Id == sesion.Id, ct);
        seguida.FechaActualizacion = ahora;
        seguida.HuellaFicha = huella ?? seguida.HuellaFicha;
        seguida.TokensEntrada += entrada;
        seguida.TokensSalida += salida;
        if (historico.Count == 0 && seguida.Titulo.StartsWith("Nueva consulta"))
        {
            seguida.Titulo = texto.Length > 80 ? texto[..77] + "…" : texto;
        }
        await db.SaveChangesAsync(ct);

        await emitir(new EventoAsistente("fin", Datos: JsonSerializer.SerializeToElement(new { entrada, salida })));
    }

    private record Respuesta(List<BloqueMensaje> Bloques, string? MotivoParada, long TokensEntrada, long TokensSalida);

    /// <summary>Una petición en streaming: reenvía el texto según llega y reconstruye los bloques completos.</summary>
    private async Task<Respuesta> TransmitirAsync(List<BetaMessageParam> mensajes, Func<EventoAsistente, Task> emitir, CancellationToken ct)
    {
        var parametros = new MessageCreateParams
        {
            Model = Modelo,
            MaxTokens = 32000,
            System = PromptSistema,
            Messages = mensajes,
            Tools = Herramientas,
            Thinking = new BetaThinkingConfigAdaptive { Display = Display.Summarized },
            // Diagnosticar es trabajo de razonamiento: esfuerzo alto (en Opus 5.5 el valor por defecto es medio).
            OutputConfig = new BetaOutputConfig { Effort = Effort.High },
            // Caché automática del prefijo (sistema + herramientas + historial).
            CacheControl = new BetaCacheControlEphemeral(),
            // Si un filtro de seguridad rechaza la petición, se reintenta en el modelo que recomiende Anthropic.
            Betas = ["server-side-fallback-2026-07-01"],
            Fallbacks = new Default()
        };

        var bloques = new SortedDictionary<long, BloqueEnCurso>();
        string? motivo = null;
        long entrada = 0, salida = 0;

        await foreach (var evento in cliente.Cliente.Beta.Messages.CreateStreaming(parametros, ct))
        {
            if (evento.TryPickStart(out var inicio))
            {
                var uso = inicio.Message.Usage;
                entrada += uso.InputTokens + (uso.CacheReadInputTokens ?? 0) + (uso.CacheCreationInputTokens ?? 0);
            }
            else if (evento.TryPickContentBlockStart(out var bloqueInicio))
            {
                var b = new BloqueEnCurso();
                var contenido = bloqueInicio.ContentBlock;
                if (contenido.TryPickBetaText(out var t))
                {
                    b.Tipo = BloqueMensaje.TipoTexto;
                    b.Texto.Append(t.Text);
                }
                else if (contenido.TryPickBetaThinking(out var th))
                {
                    b.Tipo = BloqueMensaje.TipoRazonamiento;
                    b.Texto.Append(th.Thinking);
                    b.Firma = th.Signature;
                }
                else if (contenido.TryPickBetaRedactedThinking(out var r))
                {
                    b.Tipo = BloqueMensaje.TipoRazonamientoOculto;
                    b.Datos = r.Data;
                }
                else if (contenido.TryPickBetaToolUse(out var tu))
                {
                    b.Tipo = BloqueMensaje.TipoUsoHerramienta;
                    b.Id = tu.ID;
                    b.Nombre = tu.Name;
                }
                else if (contenido.TryPickBetaFallback(out _))
                {
                    // Cambio de modelo a mitad de respuesta: marca de frontera, no se reenvía.
                    b.Tipo = "fallback";
                }
                else
                {
                    b.Tipo = "otro";
                }
                bloques[bloqueInicio.Index] = b;
            }
            else if (evento.TryPickContentBlockDelta(out var delta) && bloques.TryGetValue(delta.Index, out var actual))
            {
                if (delta.Delta.TryPickText(out var dt))
                {
                    actual.Texto.Append(dt.Text);
                    await emitir(new EventoAsistente("texto", dt.Text));
                }
                else if (delta.Delta.TryPickThinking(out var dth))
                {
                    actual.Texto.Append(dth.Thinking);
                    await emitir(new EventoAsistente("pensando", dth.Thinking));
                }
                else if (delta.Delta.TryPickSignature(out var ds))
                {
                    actual.Firma = ds.Signature;
                }
                else if (delta.Delta.TryPickInputJson(out var dj))
                {
                    actual.Entrada.Append(dj.PartialJson);
                }
            }
            else if (evento.TryPickContentBlockStop(out var parada) && bloques.TryGetValue(parada.Index, out var terminado)
                     && terminado.Tipo == BloqueMensaje.TipoUsoHerramienta)
            {
                await emitir(new EventoAsistente("herramienta", Nombre: terminado.Nombre, Texto: terminado.Entrada.ToString()));
            }
            else if (evento.TryPickDelta(out var final))
            {
                motivo = final.Delta.StopReason?.Raw();
                salida += final.Usage.OutputTokens;
            }
        }

        return new Respuesta(ParaHistorial(bloques.Values.ToList()), motivo, entrada, salida);
    }

    /// <summary>
    /// Bloques que se guardan para reenviar. Tras un cambio de modelo a mitad de respuesta, lo anterior a la última marca
    /// solo conserva el texto (el razonamiento y las llamadas de un modelo no valen para otro).
    /// </summary>
    private static List<BloqueMensaje> ParaHistorial(List<BloqueEnCurso> bloques)
    {
        var ultimaFrontera = bloques.FindLastIndex(b => b.Tipo == "fallback");
        return bloques
            .Select((b, i) => (b, i))
            .Where(x => x.b.Tipo is not ("fallback" or "otro"))
            .Where(x => x.i > ultimaFrontera || x.b.Tipo == BloqueMensaje.TipoTexto)
            .Select(x => x.b.ABloque())
            .Where(b => b.Tipo != BloqueMensaje.TipoTexto || !string.IsNullOrEmpty(b.Texto))
            .ToList();
    }

    private sealed class BloqueEnCurso
    {
        public string Tipo { get; set; } = "otro";
        public StringBuilder Texto { get; } = new();
        public StringBuilder Entrada { get; } = new();
        public string? Firma { get; set; }
        public string? Datos { get; set; }
        public string? Id { get; set; }
        public string? Nombre { get; set; }

        public BloqueMensaje ABloque() => new()
        {
            Tipo = Tipo,
            Texto = Tipo is BloqueMensaje.TipoTexto or BloqueMensaje.TipoRazonamiento ? Texto.ToString() : null,
            Firma = Firma,
            Datos = Datos,
            Id = Id,
            Nombre = Nombre,
            Contenido = Tipo == BloqueMensaje.TipoUsoHerramienta ? (Entrada.Length == 0 ? "{}" : Entrada.ToString()) : null
        };
    }

    private static BetaMessageParam AParametro(string rol, List<BloqueMensaje> bloques, Dictionary<int, (string Base64, string Tipo, string Titulo)> archivos)
    {
        var contenido = new List<BetaContentBlockParam>();
        foreach (var b in bloques)
        {
            switch (b.Tipo)
            {
                case BloqueMensaje.TipoTexto:
                    contenido.Add(new BetaTextBlockParam { Text = b.Texto ?? "" });
                    break;
                case BloqueMensaje.TipoRazonamiento:
                    // La firma debe reenviarse intacta.
                    contenido.Add(new BetaThinkingBlockParam { Thinking = b.Texto ?? "", Signature = b.Firma ?? "" });
                    break;
                case BloqueMensaje.TipoRazonamientoOculto:
                    contenido.Add(new BetaRedactedThinkingBlockParam { Data = b.Datos ?? "" });
                    break;
                case BloqueMensaje.TipoUsoHerramienta:
                    contenido.Add(new BetaToolUseBlockParam { ID = b.Id!, Name = b.Nombre!, Input = EntradaComoDiccionario(b.Contenido) });
                    break;
                case BloqueMensaje.TipoDocumento:
                    contenido.Add(BloqueArchivo(archivos[b.DocumentoId!.Value]));
                    break;
                case BloqueMensaje.TipoResultado when b.DocumentoId is { } doc:
                    contenido.Add(new BetaToolResultBlockParam
                    {
                        ToolUseID = b.Id!,
                        Content = new List<Block> { new BetaTextBlockParam { Text = b.Contenido ?? "" }, BloqueArchivoResultado(archivos[doc]) }
                    });
                    break;
                case BloqueMensaje.TipoResultado:
                    contenido.Add(new BetaToolResultBlockParam { ToolUseID = b.Id!, Content = b.Contenido ?? "", IsError = b.EsError });
                    break;
            }
        }
        return new BetaMessageParam { Role = rol == "assistant" ? Role.Assistant : Role.User, Content = contenido };
    }

    private static BetaContentBlockParam BloqueArchivo((string Base64, string Tipo, string Titulo) a) => a.Tipo == "application/pdf"
        ? new BetaRequestDocumentBlock { Source = new BetaBase64PdfSource { Data = a.Base64 }, Title = a.Titulo }
        : new BetaImageBlockParam { Source = new BetaBase64ImageSource { Data = a.Base64, MediaType = a.Tipo switch { "image/png" => MediaType.ImagePng, "image/webp" => MediaType.ImageWebP, _ => MediaType.ImageJpeg } } };

    private static Block BloqueArchivoResultado((string Base64, string Tipo, string Titulo) a)
    {
        if (a.Tipo == "application/pdf")
        {
            return new BetaRequestDocumentBlock { Source = new BetaBase64PdfSource { Data = a.Base64 }, Title = a.Titulo };
        }
        return new BetaImageBlockParam { Source = new BetaBase64ImageSource { Data = a.Base64, MediaType = a.Tipo switch { "image/png" => MediaType.ImagePng, "image/webp" => MediaType.ImageWebP, _ => MediaType.ImageJpeg } } };
    }

    private static string? ErrorDocumento(DocumentoTecnico d) =>
        d.TipoContenido == "application/pdf" ? (d.Tamano > MaxPdf ? "El PDF es demasiado grande para el asistente (máx. 25 MB)." : null)
        : d.Tamano > MaxImagen ? "La imagen es demasiado grande para el asistente (máx. 5 MB)." : null;

    /// <summary>Lee (una vez por turno) los archivos de los documentos que aparecen en la conversación.</summary>
    private async Task CargarArchivosAsync(IEnumerable<BloqueMensaje> bloques, Dictionary<int, (string Base64, string Tipo, string Titulo)> archivos, CancellationToken ct)
    {
        foreach (var id in bloques.Select(b => b.DocumentoId).OfType<int>().Distinct().Where(i => !archivos.ContainsKey(i)).ToList())
        {
            var d = await db.DocumentosTecnicos.AsNoTracking().FirstAsync(x => x.Id == id, ct);
            archivos[id] = (Convert.ToBase64String(await File.ReadAllBytesAsync(almacen.Ruta(d.Archivo), ct)), d.TipoContenido, d.Titulo);
        }
    }

    /// <summary>Herramientas de documentación; el resto se delega.</summary>
    private async Task<(string Contenido, bool Error, int? Documento)> EjecutarHerramientaAsync(BloqueMensaje llamada, Vehiculo? vehiculo, int? ordenId, CancellationToken ct)
    {
        if (llamada.Nombre == "listar_documentacion")
        {
            if (vehiculo is null) return ("La consulta no está ligada a una orden: no hay vehículo.", false, null);
            var docs = await documentacion.CompatiblesAsync(vehiculo, ct);
            var genericos = await documentacion.GenericosAsync(ct);
            return (JsonSerializer.Serialize(new
            {
                encontrados = docs.Count,
                documentos = docs.Select(d => new { id = d.Id, titulo = d.Titulo, tipo = d.Tipo.ToString(), sistema = d.Sistema, modelo = d.Modelo, motor = d.Motor }),
                genericos = genericos.Select(d => new { id = d.Id, titulo = d.Titulo, tipo = d.Tipo.ToString(), tematica = d.Sistema })
            }), false, null);
        }
        if (llamada.Nombre == "ver_documento")
        {
            int? id = null;
            try { using var j = JsonDocument.Parse(llamada.Contenido ?? "{}"); if (j.RootElement.TryGetProperty("id", out var p) && p.TryGetInt32(out var n)) id = n; } catch (JsonException) { }
            var d = id is null ? null : await db.DocumentosTecnicos.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
            if (d is null) return ("Documento no encontrado. Usa listar_documentacion para ver los disponibles.", true, null);
            if (ErrorDocumento(d) is { } e) return (e, true, null);
            return ($"Documento: {d.Titulo}", false, d.Id);
        }
        if (llamada.Nombre == "buscar_piezas_oem")
        {
            string? texto = null;
            try
            {
                using var j = JsonDocument.Parse(llamada.Contenido ?? "{}");
                if (j.RootElement.TryGetProperty("texto", out var t) && t.ValueKind == JsonValueKind.String) texto = t.GetString()?.Trim();
            }
            catch (JsonException)
            {
                return ("Entrada no válida: no es JSON completo. Vuelve a llamar a la herramienta.", true, null);
            }
            if (string.IsNullOrEmpty(texto) || texto.Length > 100) return ("Indica qué pieza o referencia buscar (máximo 100 caracteres).", true, null);
            if (!opcionesVinalfa.Configurado) return ("El catálogo original (Vinalfa) no está configurado en el taller.", false, null);
            if (vehiculo is null) return ("La consulta no está ligada a una orden: no hay vehículo.", false, null);
            var vin = DocumentacionTecnica.Vin(vehiculo.Bastidor);
            if (vin.Length < 7) return ("El vehículo no tiene bastidor en su ficha: pide al mecánico que lo rellene.", false, null);
            try
            {
                var resuelto = await vinalfa.ResolverVehiculoAsync(vin, ct);
                var hashes = ClienteVinalfa.HashesVehiculo(resuelto);
                if (hashes.Count == 0) return ("El catálogo original no ha identificado este bastidor.", false, null);
                var resultado = await vinalfa.BuscarAsync(hashes[0], texto, ct);
                var json = JsonSerializer.Serialize(new { variantes_del_vehiculo = hashes.Count, resultado });
                return (json.Length > 12000 ? json[..12000] + " …(recortado)" : json, false, null);
            }
            catch (ErrorVinalfa e)
            {
                return (e.Message, true, null);
            }
        }
        if (llamada.Nombre == "buscar_despieces")
        {
            string? referencia = null;
            try
            {
                using var j = JsonDocument.Parse(llamada.Contenido ?? "{}");
                if (j.RootElement.TryGetProperty("referencia", out var p) && p.ValueKind == JsonValueKind.String) referencia = p.GetString();
            }
            catch (JsonException)
            {
                return ("Entrada no válida: no es JSON completo. Vuelve a llamar a la herramienta.", true, null);
            }
            var catalogos = vehiculo is null ? [] : await documentacion.CatalogosAsync(vehiculo, ct);
            var enlacesReferencia = string.IsNullOrWhiteSpace(referencia) ? [] : await documentacion.BuscarReferenciaAsync(referencia, vehiculo, ct);
            return (JsonSerializer.Serialize(new
            {
                aviso = vehiculo is null ? "La consulta no está ligada a una orden: no hay vehículo." : null,
                catalogos = catalogos.Select(x => new { nombre = x.Nombre, descripcion = x.Descripcion, url = x.Url, falta = x.Falta }),
                referencia = enlacesReferencia.Select(x => new { nombre = x.Nombre, url = x.Url })
            }), false, null);
        }
        var (c, err) = await EjecutarHerramientaAsync(llamada, vehiculo?.Marca, vehiculo?.Tipo, ordenId, ct);
        return (c, err, null);
    }

    private static Dictionary<string, JsonElement> EntradaComoDiccionario(string? json)
    {
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(string.IsNullOrWhiteSpace(json) ? "{}" : json) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    /// <summary>Ejecuta una herramienta validando su entrada (con streaming de entrada, puede llegar incompleta).</summary>
    private async Task<(string Contenido, bool Error)> EjecutarHerramientaAsync(
        BloqueMensaje llamada, string? marca, TipoVehiculo? tipo, int? ordenId, CancellationToken ct)
    {
        JsonElement entrada;
        try
        {
            entrada = JsonDocument.Parse(llamada.Contenido ?? "{}").RootElement;
        }
        catch (JsonException)
        {
            return ("Entrada no válida: no es JSON completo. Vuelve a llamar a la herramienta.", true);
        }

        try
        {
            switch (llamada.Nombre)
            {
                case "buscar_casos_similares":
                {
                    if (!entrada.TryGetProperty("palabras_clave", out var p) || p.ValueKind != JsonValueKind.Array)
                    {
                        return ("Falta \"palabras_clave\" (lista de textos).", true);
                    }
                    var palabras = p.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToList();
                    var codigos = entrada.TryGetProperty("codigos", out var c) && c.ValueKind == JsonValueKind.Array
                        ? c.EnumerateArray().Select(x => DecodificadorObd.Normalizar(x.GetString())).OfType<string>().ToList()
                        : [];
                    var casos = await historial.CasosSimilaresAsync(palabras, codigos, marca, tipo, ordenId, MaxCasos, ct);
                    return (JsonSerializer.Serialize(new { encontrados = casos.Count, casos = casos.Select(CasoParaModelo) }), false);
                }
                case "consultar_codigo":
                {
                    var codigo = entrada.TryGetProperty("codigo", out var c) ? DecodificadorObd.Normalizar(c.GetString()) : null;
                    if (codigo is null)
                    {
                        return ("\"codigo\" no tiene formato de código OBD (p. ej. P0401).", true);
                    }
                    var (descripcion, sistema, entradaBiblioteca) = await historial.DescribirAsync(codigo, ct);
                    var casos = await historial.CasosPorCodigoAsync(codigo, MaxCasos, ct);
                    return (JsonSerializer.Serialize(new
                    {
                        codigo,
                        descripcion,
                        sistema,
                        notas_del_taller = entradaBiblioteca?.Notas,
                        interpretacion = DecodificadorObd.Interpretar(codigo)?.Descripcion,
                        casos_en_el_taller = casos.Select(CasoParaModelo)
                    }), false);
                }
                case "consultar_valores_referencia":
                {
                    var texto = entrada.TryGetProperty("texto", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString()!.Trim() : "";
                    if (texto.Length == 0)
                    {
                        return ("Falta \"texto\".", true);
                    }
                    Combustible? combustible = entrada.TryGetProperty("combustible", out var cb) && Enum.TryParse<Combustible>(cb.GetString(), true, out var c) ? c : null;
                    // Cada palabra debe aparecer en el parámetro, la condición, la categoría o la aplicación.
                    var palabras = texto.Split(' ', StringSplitOptions.RemoveEmptyEntries).Where(p => p.Length >= 3).Select(p => $"%{p}%").Take(5).ToList();
                    var query = db.ValoresReferencia.AsNoTracking();
                    foreach (var p in palabras)
                    {
                        query = query.Where(v => EF.Functions.ILike(v.Parametro, p) || EF.Functions.ILike(v.Condicion!, p) ||
                                                 EF.Functions.ILike(v.Categoria, p) || EF.Functions.ILike(v.Aplicacion!, p));
                    }
                    if (combustible is { } fc)
                    {
                        query = query.Where(v => v.Combustible == fc || v.Combustible == Combustible.Todos);
                    }
                    var valores = await query.OrderBy(v => v.Categoria).ThenBy(v => v.Parametro).Take(15).ToListAsync(ct);
                    return (JsonSerializer.Serialize(new
                    {
                        encontrados = valores.Count,
                        valores = valores.Select(v => new
                        {
                            parametro = v.Parametro,
                            condicion = v.Condicion,
                            minimo = v.Minimo,
                            maximo = v.Maximo,
                            unidad = v.Unidad,
                            combustible = v.Combustible.ToString(),
                            aplicacion = v.Aplicacion,
                            notas = v.Notas,
                            origen = v.EsPropio ? "del taller" : "genérico orientativo"
                        })
                    }), false);
                }
                default:
                    return ($"Herramienta desconocida: {llamada.Nombre}", true);
            }
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogError(e, "Error en la herramienta {Herramienta}", llamada.Nombre);
            return ("Error interno al consultar el historial.", true);
        }
    }

    private static object CasoParaModelo(Contracts.CasoTaller c) => new
    {
        orden = $"OT-{c.OrdenId:00000}",
        fecha = c.Fecha.ToString("yyyy-MM-dd"),
        vehiculo = $"{c.TipoVehiculo} {c.Vehiculo}",
        estado = c.Estado.ToString(),
        motivo = c.MotivoEntrada,
        diagnostico = c.Diagnostico,
        conclusion = c.Conclusion,
        codigos = c.Codigos,
        trabajos = c.Trabajos
    };

    private static string Resumen(string herramienta, string contenido)
    {
        try
        {
            using var doc = JsonDocument.Parse(contenido);
            var raiz = doc.RootElement;
            if (raiz.TryGetProperty("encontrados", out var n))
            {
                return herramienta == "consultar_valores_referencia" ? $"{n.GetInt32()} valores de referencia" : $"{n.GetInt32()} casos encontrados";
            }
            if (raiz.TryGetProperty("casos_en_el_taller", out var casos))
            {
                return $"{raiz.GetProperty("codigo").GetString()}: {casos.GetArrayLength()} casos en el taller";
            }
        }
        catch (JsonException)
        {
        }
        return herramienta;
    }

    private static string Huella(string texto) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(texto)))[..32];
}

/// <summary>
/// Cliente de Anthropic configurado con la clave de <c>Anthropic:ApiKey</c> (user-secrets o variable
/// <c>Anthropic__ApiKey</c>) o, si no, <c>ANTHROPIC_API_KEY</c>. Sin clave, el asistente aparece como no configurado.
/// <c>Anthropic:BaseUrl</c> permite apuntar a un servidor de pruebas.
/// </summary>
public class ClienteAnthropic(IConfiguration config)
{
    private readonly Lazy<AnthropicClient?> cliente = new(() =>
    {
        var clave = config["Anthropic:ApiKey"] ?? Environment.GetEnvironmentVariable("ANTHROPIC_API_KEY");
        if (string.IsNullOrWhiteSpace(clave))
        {
            return null;
        }
        return config["Anthropic:BaseUrl"] is { Length: > 0 } url
            ? new AnthropicClient { ApiKey = clave, BaseUrl = url }
            : new AnthropicClient { ApiKey = clave };
    });

    public bool Configurado => cliente.Value is not null;

    public AnthropicClient Cliente => cliente.Value ?? throw new InvalidOperationException("Falta la clave de la API de Anthropic.");
}
