using ClosedXML.Excel;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Importacion;

/// <summary>
/// Importa el histórico de trabajos de la hoja "Taller" del Excel de facturas.
///
/// Columnas: A Cliente | B Concepto | C Coche | D Cobrado | E Coste piezas | F Observaciones | G Rentabilidad (=D−E)
///           | H Recepción | I Recogida | J, K notas.
/// En las filas anteriores a <see cref="PrimeraFilaColumnasCambiadas"/> B es el concepto y C el coche; después, al revés.
/// </summary>
public class ImportadorExcel(TallerDbContext db, TextWriter salida)
{
    public const string Marca = "Importado de Excel";
    private const int PrimeraFilaColumnasCambiadas = 16;
    private static readonly DateOnly FechaDesconocida = new(2025, 1, 1);
    private static readonly TimeZoneInfo ZonaMadrid = TimeZoneInfo.FindSystemTimeZoneById("Europe/Madrid");

    /// <param name="Anio">Solo filas cuya fecha de recepción (o recogida) es de ese año. Las filas sin fecha se descartan.</param>
    /// <param name="SinAgrupar">Cada fila crea su propio cliente y vehículo, aunque el nombre se repita.</param>
    public record Opciones(
        string Ruta, string Hoja = "Taller", bool Simular = false, bool Reemplazar = false, int? Anio = null, bool SinAgrupar = false);

    private record Fila(
        int Numero, string Cliente, string Concepto, string Coche, decimal Cobrado, decimal Coste,
        DateOnly? Recepcion, DateOnly? Recogida, List<string> Notas);

    public async Task<int> EjecutarAsync(Opciones opciones, CancellationToken ct = default)
    {
        var archivo = Path.GetFileName(opciones.Ruta);
        var avisos = new List<string>();
        var filas = LeerFilas(opciones, avisos);

        if (opciones.Anio is { } anio)
        {
            var total = filas.Count;
            filas = filas.Where(f => (f.Recepcion ?? f.Recogida)?.Year == anio).ToList();
            salida.WriteLine($"Filtro año {anio}: {filas.Count} de {total} filas (las filas sin fecha se descartan).");
        }

        var yaImportadas = await db.OrdenesTrabajo.CountAsync(o => o.Observaciones!.Contains(Marca), ct);
        if (yaImportadas > 0 && !opciones.Reemplazar && !opciones.Simular)
        {
            salida.WriteLine($"Ya hay {yaImportadas} órdenes importadas. Usa --reemplazar para borrarlas y volver a importar.");
            return 1;
        }

        var clientes = new Dictionary<string, Cliente>();
        var vehiculos = new Dictionary<string, Vehiculo>();
        var ordenes = new List<OrdenTrabajo>();
        var marcasNoReconocidas = new SortedSet<string>();
        var sinFecha = 0;

        foreach (var f in filas)
        {
            var claveCliente = opciones.SinAgrupar ? $"fila{f.Numero}" : TextoImportado.Clave(f.Cliente);
            if (!clientes.TryGetValue(claveCliente, out var cliente))
            {
                cliente = new Cliente
                {
                    Tipo = TipoCliente.Particular,
                    Nombre = TextoImportado.Capitalizar(f.Cliente),
                    Notas = $"{Marca} ({archivo})",
                    FechaAlta = AInstante(f.Recepcion ?? FechaDesconocida)
                };
                clientes[claveCliente] = cliente;
            }

            var claveVehiculo = $"{claveCliente}|{TextoImportado.Clave(f.Coche)}";
            if (!vehiculos.TryGetValue(claveVehiculo, out var vehiculo))
            {
                var deducido = DeduccionVehiculo.Deducir(f.Coche);
                if (!deducido.Reconocida)
                {
                    marcasNoReconocidas.Add(f.Coche);
                }
                vehiculo = new Vehiculo
                {
                    Cliente = cliente,
                    Tipo = deducido.Tipo,
                    Marca = Recortar(deducido.Marca, 100),
                    Modelo = deducido.Modelo is null ? null : Recortar(deducido.Modelo, 100),
                    Notas = $"{Marca} ({archivo}). Texto original: \"{f.Coche}\"."
                };
                vehiculos[claveVehiculo] = vehiculo;
            }

            var observaciones = new List<string>(f.Notas);
            var entrada = f.Recepcion ?? f.Recogida;
            var salidaFecha = f.Recogida ?? entrada;
            if (entrada is null)
            {
                sinFecha++;
                entrada = salidaFecha = FechaDesconocida;
                observaciones.Add("Fecha desconocida en el Excel.");
            }
            else if (salidaFecha < entrada)
            {
                observaciones.Add($"En el Excel la recogida ({salidaFecha:dd/MM/yyyy}) es anterior a la recepción.");
                avisos.Add($"Fila {f.Numero}: recogida {salidaFecha:dd/MM/yyyy} anterior a recepción {entrada:dd/MM/yyyy}; se usa la recepción.");
                salidaFecha = entrada;
            }
            if (f.Coste > f.Cobrado)
            {
                observaciones.Add("Cobrado por debajo del coste de las piezas.");
            }
            observaciones.Add($"{Marca}: {archivo}, hoja {opciones.Hoja}, fila {f.Numero}.");

            ordenes.Add(new OrdenTrabajo
            {
                Vehiculo = vehiculo,
                Estado = EstadoOrden.Entregado,
                Servicios = TextoImportado.Servicios(f.Concepto),
                FechaEntrada = AInstante(entrada.Value),
                FechaSalida = AInstante(salidaFecha!.Value),
                MotivoEntrada = Recortar(f.Concepto, 2000),
                Observaciones = string.Join("\n", observaciones),
                Lineas = Lineas(f.Cobrado, f.Coste)
            });
        }

        var lineas = ordenes.SelectMany(o => o.Lineas).ToList();
        Informe(filas, clientes.Values, vehiculos.Values, ordenes, lineas, sinFecha, marcasNoReconocidas, avisos, !opciones.SinAgrupar);

        if (opciones.Simular)
        {
            salida.WriteLine("\nSimulación: no se ha guardado nada.");
            return 0;
        }

        await using var transaccion = await db.Database.BeginTransactionAsync(ct);
        if (opciones.Reemplazar)
        {
            await BorrarImportadosAsync(ct);
        }
        db.OrdenesTrabajo.AddRange(ordenes);
        await db.SaveChangesAsync(ct);
        await transaccion.CommitAsync(ct);

        salida.WriteLine($"\nImportación completada: {clientes.Count} clientes, {vehiculos.Count} vehículos, {ordenes.Count} órdenes.");
        return 0;
    }

    /// <summary>
    /// D es lo cobrado y E el coste de las piezas. Se separa en piezas (precio = coste = E) y mano de obra (D − E),
    /// de modo que el total coincide con D y el margen con la columna "Rentabilidad". El Excel no lleva IVA.
    /// </summary>
    private static List<LineaTrabajo> Lineas(decimal cobrado, decimal coste)
    {
        var lineas = new List<LineaTrabajo>();
        if (coste > 0)
        {
            lineas.Add(new LineaTrabajo
            {
                Tipo = TipoLinea.Pieza,
                Descripcion = "Piezas",
                Cantidad = 1,
                PrecioUnitario = Math.Min(coste, cobrado),
                CosteUnitario = coste,
                IvaPorcentaje = 0
            });
        }
        if (cobrado > coste)
        {
            lineas.Add(new LineaTrabajo
            {
                Tipo = TipoLinea.ManoObra,
                Descripcion = "Mano de obra",
                Cantidad = 1,
                PrecioUnitario = cobrado - coste,
                IvaPorcentaje = 0
            });
        }
        return lineas;
    }

    private List<Fila> LeerFilas(Opciones opciones, List<string> avisos)
    {
        using var libro = new XLWorkbook(opciones.Ruta);
        var hoja = libro.Worksheet(opciones.Hoja);
        var filas = new List<Fila>();
        var ultima = hoja.LastRowUsed()?.RowNumber() ?? 1;

        for (var n = 2; n <= ultima; n++)
        {
            var fila = hoja.Row(n);
            var cliente = Texto(fila.Cell("A"));
            var b = Texto(fila.Cell("B"));
            var c = Texto(fila.Cell("C"));

            if (fila.Cell("D").HasFormula && fila.Cell("D").FormulaA1.Contains("SUM", StringComparison.OrdinalIgnoreCase))
            {
                avisos.Add($"Fila {n}: fila de totales, se omite.");
                continue;
            }
            if (cliente.Length == 0 && b.Length == 0 && c.Length == 0)
            {
                continue;
            }
            if (b.Length == 0 && c.Length == 0)
            {
                avisos.Add($"Fila {n}: \"{cliente}\" sin coche ni concepto, se omite.");
                continue;
            }

            var (concepto, coche) = n < PrimeraFilaColumnasCambiadas ? (b, c) : (c, b);
            // A veces el coche se repite en la primera línea del concepto ("Touareg\nCambio cardan 60…").
            coche = coche.Split('\n')[0].Trim();

            var notas = new[] { "F", "J", "K" }
                .Select(col => Texto(fila.Cell(col)))
                .Where(t => t.Length > 0)
                .ToList();

            filas.Add(new Fila(
                n,
                cliente.Length > 0 ? cliente : "Sin nombre",
                concepto.Length > 0 ? concepto : "Sin concepto",
                coche.Length > 0 ? coche : "Desconocido",
                Importe(fila.Cell("D"), n, avisos),
                Importe(fila.Cell("E"), n, avisos),
                Fecha(fila.Cell("H"), n, avisos),
                Fecha(fila.Cell("I"), n, avisos),
                notas));
        }

        return filas;
    }

    private static string Texto(IXLCell celda) =>
        celda.IsEmpty() ? "" : celda.GetFormattedString().Replace("\r", "").Trim();

    private static decimal Importe(IXLCell celda, int fila, List<string> avisos)
    {
        if (celda.IsEmpty())
        {
            return 0;
        }
        var valor = celda.CachedValue;
        if (valor.IsNumber)
        {
            var importe = (decimal)valor.GetNumber();
            if (importe < 0)
            {
                avisos.Add($"Fila {fila}: importe negativo en {celda.Address}, se toma 0.");
                return 0;
            }
            return Math.Round(importe, 2);
        }
        avisos.Add($"Fila {fila}: importe no numérico en {celda.Address} (\"{celda.GetFormattedString()}\"), se toma 0.");
        return 0;
    }

    private static DateOnly? Fecha(IXLCell celda, int fila, List<string> avisos)
    {
        if (celda.IsEmpty())
        {
            return null;
        }
        if (!celda.CachedValue.IsDateTime)
        {
            avisos.Add($"Fila {fila}: fecha no válida en {celda.Address} (\"{celda.GetFormattedString()}\"), se ignora.");
            return null;
        }
        var fecha = DateOnly.FromDateTime(celda.CachedValue.GetDateTime());
        // Error de tecleo frecuente en el Excel: 2925 en lugar de 2025.
        if (fecha.Year > 2100)
        {
            fecha = fecha.AddYears(-900);
        }
        return fecha;
    }

    /// <summary>Medianoche en hora de Madrid, convertida a UTC (PostgreSQL guarda timestamptz en UTC).</summary>
    private static DateTimeOffset AInstante(DateOnly fecha)
    {
        var local = fecha.ToDateTime(TimeOnly.MinValue);
        return new DateTimeOffset(local, ZonaMadrid.GetUtcOffset(local)).ToUniversalTime();
    }

    private static DateTimeOffset AMadrid(DateTimeOffset instante) => TimeZoneInfo.ConvertTime(instante, ZonaMadrid);

    private static string Recortar(string texto, int max) => texto.Length <= max ? texto : texto[..max];

    private async Task BorrarImportadosAsync(CancellationToken ct)
    {
        var ordenes = await db.OrdenesTrabajo.Where(o => o.Observaciones!.Contains(Marca)).ExecuteDeleteAsync(ct);
        var vehiculos = await db.Vehiculos.Where(v => v.Notas!.Contains(Marca) && !v.Ordenes.Any()).ExecuteDeleteAsync(ct);
        var clientes = await db.Clientes.Where(c => c.Notas!.Contains(Marca) && !c.Vehiculos.Any()).ExecuteDeleteAsync(ct);
        salida.WriteLine($"Borrado lo importado anteriormente: {ordenes} órdenes, {vehiculos} vehículos, {clientes} clientes.");
    }

    private void Informe(
        List<Fila> filas, IEnumerable<Cliente> clientes, IEnumerable<Vehiculo> vehiculos, List<OrdenTrabajo> ordenes,
        List<LineaTrabajo> lineas, int sinFecha, SortedSet<string> marcasNoReconocidas, List<string> avisos, bool agrupado)
    {
        var listaClientes = clientes.ToList();
        var listaVehiculos = vehiculos.ToList();
        var cobrado = filas.Sum(f => f.Cobrado);
        var coste = filas.Sum(f => f.Coste);

        salida.WriteLine("=== Resumen ===");
        salida.WriteLine($"Filas importables:   {filas.Count}");
        salida.WriteLine($"Clientes:            {listaClientes.Count}");
        salida.WriteLine($"Vehículos:           {listaVehiculos.Count}");
        salida.WriteLine($"Órdenes:             {ordenes.Count} ({ordenes.Count(o => o.Lineas.Count == 0)} sin importe)");
        salida.WriteLine($"Líneas:              {lineas.Count}");
        salida.WriteLine($"Total cobrado (D):   {cobrado:N2} €  → líneas: {lineas.Sum(l => l.BaseImponible):N2} €");
        salida.WriteLine($"Coste piezas (E):    {coste:N2} €  → líneas: {lineas.Sum(l => l.Coste):N2} €");
        salida.WriteLine($"Rentabilidad (D−E):  {cobrado - coste:N2} €");
        salida.WriteLine($"Órdenes sin fecha:   {sinFecha} (se les pone {FechaDesconocida:dd/MM/yyyy})");
        if (ordenes.Count == 0)
        {
            salida.WriteLine("No hay filas que importar.");
            return;
        }
        salida.WriteLine($"Rango de fechas:     {AMadrid(ordenes.Min(o => o.FechaEntrada)):dd/MM/yyyy} – {AMadrid(ordenes.Max(o => o.FechaEntrada)):dd/MM/yyyy}");

        salida.WriteLine("\n=== Vehículos por tipo ===");
        foreach (var g in listaVehiculos.GroupBy(v => v.Tipo).OrderByDescending(g => g.Count()))
        {
            salida.WriteLine($"{g.Key,-20} {g.Count()}");
        }

        salida.WriteLine("\n=== Servicios deducidos ===");
        foreach (var g in ordenes.SelectMany(o => o.Servicios).GroupBy(s => s).OrderByDescending(g => g.Count()))
        {
            salida.WriteLine($"{g.Key,-20} {g.Count()}");
        }

        salida.WriteLine($"\n=== Marcas no reconocidas ({marcasNoReconocidas.Count}): se guarda el texto como marca ===");
        salida.WriteLine(string.Join(" · ", marcasNoReconocidas));

        // Sin agrupar, los nombres repetidos son intencionados: no tiene sentido sugerir fusiones.
        var parecidos = !agrupado ? [] : listaClientes
            .SelectMany((a, i) => listaClientes.Skip(i + 1).Select(b => (a, b)))
            .Where(p =>
            {
                var ka = TextoImportado.Clave(p.a.Nombre);
                var kb = TextoImportado.Clave(p.b.Nombre);
                return Math.Min(ka.Length, kb.Length) >= 4 && TextoImportado.Distancia(ka, kb) <= 1;
            })
            .Select(p => $"\"{p.a.Nombre}\" / \"{p.b.Nombre}\"")
            .ToList();
        salida.WriteLine($"\n=== Clientes con nombre parecido ({parecidos.Count}): revisar si son el mismo ===");
        salida.WriteLine(string.Join("\n", parecidos));

        salida.WriteLine($"\n=== Avisos ({avisos.Count}) ===");
        salida.WriteLine(string.Join("\n", avisos));
    }
}
