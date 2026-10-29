using Taller.Api.Domain;

namespace Taller.Api.Diagnostico;

/// <summary>
/// Valores de referencia genéricos de partida. Son orientativos: cada fabricante y motor tiene los suyos,
/// y el taller los corrige o añade desde Diagnóstico → Valores de referencia.
/// </summary>
public static class ReferenciasGenericas
{
    private const string Turismos = "Turismos en general";

    public record Ref(
        string Categoria, string Parametro, string? Condicion, decimal? Min, decimal? Max, string Unidad,
        Combustible Combustible = Combustible.Todos, string? Aplicacion = Turismos, string? Pid = null, string? Notas = null);

    public static readonly Ref[] Lista =
    [
        // Eléctrico
        new("Eléctrico", "Tensión de batería en reposo", "Motor parado, 1 h sin uso", 12.4m, 12.8m, "V", Notas: "12,6 V o más = cargada; por debajo de 12,4 V, cargar antes de diagnosticar."),
        new("Eléctrico", "Tensión de carga (alternador)", "Motor en marcha, consumidores apagados", 13.8m, 14.7m, "V", Pid: "42", Notas: "Con alternador gestionado puede bajar a ~12,8 V a ratos; mirar con el diagnosis."),
        new("Eléctrico", "Tensión durante el arranque", "Mientras gira el motor de arranque", 9.6m, null, "V", Notas: "Por debajo de 9,6 V: batería débil, bornes o cableado."),
        new("Eléctrico", "Consumo en reposo (fuga)", "Vehículo cerrado y módulos dormidos", null, 50m, "mA", Notas: "Esperar a que duerman los módulos (puede tardar 20-40 min)."),
        new("Eléctrico", "Tensión de referencia de sensores", "Contacto puesto, en el conector del sensor", 4.9m, 5.1m, "V"),
        new("Eléctrico", "Tensión de batería en reposo (24 V)", "Motor parado, dos baterías en serie", 24.8m, 25.6m, "V", Aplicacion: "Camiones y maquinaria de 24 V"),
        new("Eléctrico", "Tensión de carga (24 V)", "Motor en marcha", 27.6m, 28.8m, "V", Aplicacion: "Camiones y maquinaria de 24 V"),

        // Refrigeración y lubricación
        new("Refrigeración", "Temperatura de funcionamiento del refrigerante", "Motor caliente", 85m, 105m, "°C", Pid: "05"),
        new("Refrigeración", "Protección del anticongelante", "Medido con refractómetro", null, -25m, "°C", Notas: "Valor máximo: debe proteger al menos hasta -25 °C."),
        new("Lubricación", "Presión de aceite al ralentí", "Motor caliente, ralentí", 0.8m, 2.0m, "bar"),
        new("Lubricación", "Presión de aceite a 2000 rpm", "Motor caliente", 2.0m, 4.5m, "bar"),

        // Motor
        new("Motor", "Régimen de ralentí", "Motor caliente, sin consumidores", 650m, 900m, "rpm"),
        new("Motor", "Compresión por cilindro (gasolina)", "Motor caliente, mariposa abierta, todos los cilindros", 10m, 15m, "bar", Combustible.Gasolina, Notas: "Diferencia máxima entre cilindros ~10 %."),
        new("Motor", "Compresión por cilindro (diésel)", "Motor caliente, a régimen de arranque", 25m, 35m, "bar", Combustible.Diesel, Notas: "Diferencia máxima entre cilindros ~10 %; por debajo de ~18 bar, arranque difícil."),

        // Admisión
        new("Admisión", "Masa de aire (caudalímetro) al ralentí", "Ralentí, motor caliente, A/A apagado", 230m, 370m, "mg/carrera", Combustible.Diesel, "VAG 1.9 TDI (90-130 CV)", Notas: "Bloque de valores de motor (mg/H)."),
        new("Admisión", "Masa de aire (caudalímetro) a plena carga", "Plena carga en 3.ª, ~3000 rpm", 800m, null, "mg/carrera", Combustible.Diesel, "VAG 1.9 TDI (90-130 CV)", Notas: "Valores bajos: caudalímetro, fuga de admisión o turbo."),
        new("Admisión", "Caudal de aire (MAF) al ralentí", "Ralentí, motor caliente", 2m, 7m, "g/s", Combustible.Gasolina, Notas: "Regla práctica: ~1 g/s por litro de cilindrada al ralentí."),
        new("Admisión", "Presión del colector (MAP) al ralentí", "Ralentí, motor caliente, atmosférico", 25m, 40m, "kPa", Combustible.Gasolina, Notas: "Presión absoluta; equivale a un vacío de ~0,6-0,75 bar."),

        // Sobrealimentación
        new("Sobrealimentación", "Presión de turbo a plena carga", "Plena carga, 2000-3000 rpm", 2.0m, 2.6m, "bar abs.", Combustible.Diesel, "Turbodiésel de turismo", Notas: "Equivale a 1,0-1,6 bar relativos. Comparar real con especificado en el diagnosis."),
        new("Sobrealimentación", "Presión de turbo al ralentí", "Ralentí", 0.95m, 1.10m, "bar abs.", Combustible.Diesel, "Turbodiésel de turismo", Notas: "Aproximadamente la presión atmosférica."),
        new("Sobrealimentación", "Desviación real/especificada de turbo", "Plena carga", null, 0.1m, "bar", Combustible.Diesel, "Turbodiésel de turismo", Notas: "Si la real queda >0,1-0,2 bar por debajo de la especificada: fuga, geometría variable o actuador."),

        // Combustible
        new("Combustible", "Presión del rail al ralentí", "Ralentí, motor caliente", 250m, 400m, "bar", Combustible.Diesel, "Common rail de turismo"),
        new("Combustible", "Presión mínima del rail para arrancar", "Durante el arranque", 150m, null, "bar", Combustible.Diesel, "Common rail de turismo", Notas: "Según sistema (Bosch, Delphi, Denso…), suele hacer falta 150-250 bar."),
        new("Combustible", "Corrección de caudal de inyectores", "Ralentí, motor caliente", -3m, 3m, "mg/carrera", Combustible.Diesel, "Diésel de turismo (VAG y otros)", Notas: "Inyectores fuera de ±3 mg/H: revisar o sustituir."),
        new("Combustible", "Presión de combustible (inyección indirecta)", "Ralentí", 2.5m, 4.0m, "bar", Combustible.Gasolina),
        new("Combustible", "Corrección de mezcla a corto plazo (STFT)", "Motor caliente, bucle cerrado", -10m, 10m, "%", Combustible.Gasolina),
        new("Combustible", "Corrección de mezcla a largo plazo (LTFT)", "Motor caliente, bucle cerrado", -10m, 10m, "%", Combustible.Gasolina, Notas: "Positivo alto: mezcla pobre (fuga de aire, presión baja). Negativo alto: rica."),

        // Emisiones
        new("Emisiones", "Sonda lambda (banda estrecha) antes del catalizador", "2500 rpm, motor caliente", 0.1m, 0.9m, "V", Combustible.Gasolina, Notas: "Debe oscilar entre esos valores; al menos ~8 cambios cada 10 s."),
        new("Emisiones", "Lambda (banda ancha)", "Ralentí, motor caliente", 0.98m, 1.02m, "λ", Combustible.Gasolina),
        new("Emisiones", "Presión diferencial del filtro de partículas", "Ralentí, filtro en buen estado", null, 20m, "mbar", Combustible.Diesel, "Diésel con FAP", Notas: "Orientativo; con el filtro limpio, a 3000 rpm sin carga suele quedar por debajo de ~100 mbar."),
        new("Emisiones", "Temperatura de regeneración del FAP", "Durante la regeneración", 550m, 650m, "°C", Combustible.Diesel, "Diésel con FAP"),

        // Resistencias de componentes
        new("Componentes", "Resistencia de inyector de alta impedancia", "Conector desenchufado, a 20 °C", 12m, 17m, "Ω", Combustible.Gasolina),
        new("Componentes", "Resistencia de inyector de baja impedancia", "Conector desenchufado, a 20 °C", 2m, 5m, "Ω", Combustible.Gasolina),
        new("Componentes", "Resistencia de bujía de precalentamiento", "Desconectada, a temperatura ambiente", 0.5m, 2m, "Ω", Combustible.Diesel, Notas: "Circuito abierto (∞) = bujía cortada."),
        new("Componentes", "Bobina de encendido (primario)", "A 20 °C", 0.4m, 2m, "Ω", Combustible.Gasolina),
        new("Componentes", "Bobina de encendido (secundario)", "A 20 °C", 6m, 15m, "kΩ", Combustible.Gasolina),
        new("Componentes", "Sensor de cigüeñal inductivo", "A 20 °C", 200m, 1500m, "Ω", Notas: "Solo sensores inductivos de dos hilos; los Hall no se miden así."),
        new("Componentes", "Sensor de temperatura NTC a 20 °C", "Desconectado", 2m, 3m, "kΩ", Notas: "A 80 °C baja a ~0,3 kΩ. Comparar con la curva del fabricante."),

        // Climatización
        new("Climatización", "Temperatura del aire en los aireadores", "A/A al máximo, recirculación, 25 °C exterior", 4m, 8m, "°C"),
        new("Climatización", "Presión de baja del A/A", "Compresor funcionando, 25 °C exterior", 1.5m, 2.5m, "bar", Notas: "Orientativo para R134a/R1234yf; depende mucho de la temperatura exterior."),
        new("Climatización", "Presión de alta del A/A", "Compresor funcionando, 25 °C exterior", 12m, 18m, "bar", Notas: "Orientativo para R134a/R1234yf; depende mucho de la temperatura exterior."),

        // Frenos y neumáticos
        new("Frenos y neumáticos", "Humedad del líquido de frenos", "Con medidor de humedad", null, 3m, "%", Notas: "Por encima del 3 %, cambiar el líquido."),
        new("Frenos y neumáticos", "Espesor mínimo de pastillas", null, 3m, null, "mm", Notas: "Por debajo de 2-3 mm, sustituir."),
        new("Frenos y neumáticos", "Profundidad del dibujo del neumático", null, 1.6m, null, "mm", Notas: "Mínimo legal 1,6 mm; recomendable cambiar a partir de 3 mm.")
    ];

    public static ValorReferencia AEntidad(Ref r) => new()
    {
        Categoria = r.Categoria,
        Parametro = r.Parametro,
        Condicion = r.Condicion,
        Minimo = r.Min,
        Maximo = r.Max,
        Unidad = r.Unidad,
        Combustible = r.Combustible,
        Aplicacion = r.Aplicacion,
        PidObd = r.Pid,
        Notas = r.Notas
    };
}
