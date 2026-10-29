using System.Runtime.CompilerServices;
using Google.GenAI;
using Google.GenAI.Types;

namespace Taller.Api.Integraciones;

/// <summary>
/// Mecánico virtual con Gemini (modelo económico). Sección <c>Gemini</c>: ApiKey (clave de Google AI Studio; en
/// user-secrets o variables de entorno), Modelo (por defecto gemini-3.1-flash-lite), ModeloImagen (para la imagen de los
/// vehículos; por defecto gemini-3.1-flash-image) y BaseUrl (solo para pruebas).
/// </summary>
public class OpcionesGemini
{
    public string? ApiKey { get; set; }
    public string Modelo { get; set; } = "gemini-3.1-flash-lite";
    public string ModeloImagen { get; set; } = "gemini-3.1-flash-image";
    public string? BaseUrl { get; set; }

    public bool Configurado => !string.IsNullOrWhiteSpace(ApiKey);
}

public class MecanicoVirtual(OpcionesGemini opciones)
{
    /// <summary>Mensajes anteriores que se reenvían en cada turno: suficiente contexto sin disparar el coste.</summary>
    public const int MaxHistorial = 40;

    private const string Instrucciones = """
        Eres el mecánico virtual de AsturSagra, un taller de La Sagra (Toledo) que repara turismos, motos, furgonetas,
        camiones, tractores y maquinaria agrícola: mecánica, electromecánica, programación, chapa y pintura.
        Hablas con los mecánicos del taller, en español de España y con su vocabulario.

        - Responde de forma práctica y directa: causas probables ordenadas, cómo comprobarlas (qué medir, dónde, con qué
          herramienta) y cómo repararlas. Empieza por lo rápido y barato.
        - Si falta un dato que cambia la respuesta (marca, modelo, motor, año, síntomas, códigos de avería), pregúntalo.
        - No inventes valores del fabricante (pares de apriete, presiones, tensiones, reglajes, capacidades). Si no estás
          seguro, dilo y sugiere dónde consultarlo (documentación técnica, portal del fabricante, HaynesPro…).
        - Avisa de los riesgos de seguridad cuando proceda: alta tensión en híbridos y eléctricos, airbags, sistemas de
          combustible a presión, aire acondicionado, vehículos elevados, hidráulica de maquinaria agrícola.
        - No tienes acceso a los datos del taller (clientes, órdenes, historial) salvo la ficha de la orden cuando se te
          da; trabaja con eso y con lo que te cuenten.
        - Formato: respuestas compactas, con listas cuando ayuden, sin introducciones ni resúmenes de relleno.
        """;

    private Client? cliente;

    public bool Configurado => opciones.Configurado;
    public string Modelo => opciones.Modelo;

    private Client Cliente => cliente ??= new Client(
        apiKey: opciones.ApiKey,
        httpOptions: string.IsNullOrWhiteSpace(opciones.BaseUrl) ? null : new HttpOptions { BaseUrl = opciones.BaseUrl });

    /// <summary>Respuesta en trozos de texto según los va generando el modelo.</summary>
    public async IAsyncEnumerable<string> ResponderAsync(
        IReadOnlyList<(bool EsUsuario, string Texto)> conversacion, string? contextoOrden, [EnumeratorCancellation] CancellationToken ct)
    {
        // La ficha de la orden va en las instrucciones y se rehace en cada pregunta: si la orden cambia, el modelo lo sabe.
        var instrucciones = contextoOrden is null ? Instrucciones : Instrucciones + $"""

            El mecánico te consulta desde una orden de trabajo. Datos actuales de la orden y del vehículo (sin datos del cliente):
            {contextoOrden}
            Usa estos datos sin volver a pedirlos y dirígete a este vehículo en concreto; si falta algo que cambie la respuesta, pregúntalo.
            """;

        var contenidos = conversacion
            .TakeLast(MaxHistorial)
            .Select(m => new Content { Role = m.EsUsuario ? "user" : "model", Parts = [new Part { Text = m.Texto }] })
            .ToList();

        var config = new GenerateContentConfig
        {
            SystemInstruction = new Content { Parts = [new Part { Text = instrucciones }] },
            Temperature = 0.4f,
            MaxOutputTokens = 4096,
            // Razonamiento bajo: respuestas rápidas y baratas, suficientes para dudas de taller.
            ThinkingConfig = new ThinkingConfig { ThinkingLevel = ThinkingLevel.Low }
        };

        await foreach (var trozo in Cliente.Models.GenerateContentStreamAsync(opciones.Modelo, contenidos, config, ct))
        {
            var partes = trozo.Candidates?.FirstOrDefault()?.Content?.Parts;
            if (partes is null) continue;
            foreach (var parte in partes)
            {
                if (parte.Thought != true && !string.IsNullOrEmpty(parte.Text))
                {
                    yield return parte.Text;
                }
            }
        }
    }
}
