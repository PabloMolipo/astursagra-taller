using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/ordenes")]
public class OrdenesController(TallerDbContext db, AlmacenPrivado almacen, AlmacenMultimedia multimedia) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<OrdenListItem>> Listar(
        [FromQuery] EstadoOrden? estado, [FromQuery] bool? abiertas, [FromQuery] string? q, [FromQuery] bool? pagado, CancellationToken ct)
    {
        var query = ConDetalle(db.OrdenesTrabajo.AsNoTracking(), conFactura: false);

        if (estado is not null)
        {
            query = query.Where(o => o.Estado == estado);
        }
        else if (abiertas == true)
        {
            query = query.Where(o => o.Estado != EstadoOrden.Entregado && o.Estado != EstadoOrden.Cancelado);
        }

        // Pendientes de cobro: las no pagadas que no están canceladas.
        if (pagado is not null)
        {
            query = query.Where(o => o.Pagado == pagado && o.Estado != EstadoOrden.Cancelado);
        }

        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            var codigo = $"%{Normalizar.Codigo(q)}%";
            query = query.Where(o =>
                EF.Functions.ILike(o.Vehiculo.Matricula!, codigo) ||
                EF.Functions.ILike(o.Vehiculo.Bastidor!, codigo) ||
                EF.Functions.ILike(o.Vehiculo.Marca, patron) ||
                EF.Functions.ILike(o.Vehiculo.Cliente.Nombre, patron) ||
                EF.Functions.ILike(o.MotivoEntrada, patron));
        }

        var ordenes = await query
            .OrderByDescending(o => o.FechaEntrada)
            .Take(200)
            .ToListAsync(ct);

        return ordenes.Select(o => o.ToListItem()).ToList();
    }

    /// <summary>
    /// Tablero del taller: las órdenes abiertas y las entregadas en los últimos días (por defecto 7), sin las canceladas.
    /// </summary>
    [HttpGet("tablero")]
    public async Task<IReadOnlyList<OrdenListItem>> Tablero([FromQuery] int diasEntregados = 7, CancellationToken ct = default)
    {
        var desde = DateTimeOffset.UtcNow.AddDays(-Math.Clamp(diasEntregados, 0, 60));
        var ordenes = await ConDetalle(db.OrdenesTrabajo.AsNoTracking(), conFactura: false)
            .Where(o => (o.Estado != EstadoOrden.Entregado && o.Estado != EstadoOrden.Cancelado) ||
                        (o.Estado == EstadoOrden.Entregado && o.FechaSalida >= desde))
            .OrderBy(o => o.FechaEntrada)
            .Take(500)
            .ToListAsync(ct);
        return ordenes.Select(o => o.ToListItem()).ToList();
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<OrdenDetalle>> Obtener(int id, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo.AsNoTracking()).FirstOrDefaultAsync(o => o.Id == id, ct);
        return orden is null ? NotFound() : orden.ToDetalle();
    }

    [HttpPost]
    public async Task<ActionResult<OrdenDetalle>> Crear(OrdenCrearRequest req, CancellationToken ct)
    {
        var vehiculo = await db.Vehiculos.Include(v => v.Cliente).FirstOrDefaultAsync(v => v.Id == req.VehiculoId, ct);
        if (vehiculo is null)
        {
            ModelState.AddModelError(nameof(req.VehiculoId), "El vehículo no existe.");
            return ValidationProblem(ModelState);
        }
        if (ValidarFechaEntrada(req.FechaEntrada) is { } error)
        {
            return error;
        }

        var orden = new OrdenTrabajo
        {
            Vehiculo = vehiculo,
            Estado = EstadoOrden.Recibido,
            Servicios = req.Servicios.Distinct().ToList(),
            FechaEntrada = req.FechaEntrada is { } f && f != HoraTaller.Hoy() ? HoraTaller.ConFecha(f) : DateTimeOffset.UtcNow,
            FechaPrevista = req.FechaPrevista,
            MotivoEntrada = req.MotivoEntrada.Trim(),
            KilometrosEntrada = req.KilometrosEntrada,
            HorasEntrada = req.HorasEntrada,
            Observaciones = Normalizar.Texto(req.Observaciones)
        };

        ActualizarUsoVehiculo(vehiculo, req.KilometrosEntrada, req.HorasEntrada);

        db.OrdenesTrabajo.Add(orden);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Obtener), new { id = orden.Id }, orden.ToDetalle());
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<OrdenDetalle>> Actualizar(int id, OrdenActualizarRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }

        if (ValidarFechaEntrada(req.FechaEntrada) is { } error)
        {
            return error;
        }

        if (req.FechaEntrada is { } fecha && fecha != HoraTaller.FechaDe(orden.FechaEntrada))
        {
            orden.FechaEntrada = HoraTaller.ConFecha(fecha, orden.FechaEntrada);
        }
        orden.Servicios = req.Servicios.Distinct().ToList();
        orden.FechaPrevista = req.FechaPrevista;
        orden.MotivoEntrada = req.MotivoEntrada.Trim();
        orden.Diagnostico = Normalizar.Texto(req.Diagnostico);
        orden.KilometrosEntrada = req.KilometrosEntrada;
        orden.HorasEntrada = req.HorasEntrada;
        orden.Observaciones = Normalizar.Texto(req.Observaciones);
        ActualizarUsoVehiculo(orden.Vehiculo, req.KilometrosEntrada, req.HorasEntrada);

        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    private ActionResult? ValidarFechaEntrada(DateOnly? fecha)
    {
        if (fecha > HoraTaller.Hoy())
        {
            ModelState.AddModelError("FechaEntrada", "La fecha de entrada no puede ser posterior a hoy.");
        }
        else if (fecha < new DateOnly(2000, 1, 1))
        {
            ModelState.AddModelError("FechaEntrada", "La fecha de entrada no es válida.");
        }
        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    /// <summary>Marca la orden como pagada (o la desmarca).</summary>
    [HttpPut("{id:int}/pagado")]
    public async Task<ActionResult<OrdenDetalle>> MarcarPagado(int id, MarcarPagadoRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }

        if (req.Pagado && req.Fecha is { } fecha)
        {
            if (ValidarFechaPosterior(fecha, orden, "Fecha", "de pago") is { } error)
            {
                return error;
            }
            orden.Pagado = true;
            // Si ya estaba pagada ese mismo día se conserva la hora; si no, se pone ese día.
            orden.FechaPago = orden.FechaPago is { } previa && HoraTaller.FechaDe(previa) == fecha ? previa : HoraTaller.ConFecha(fecha);
        }
        else if (orden.Pagado != req.Pagado)
        {
            orden.Pagado = req.Pagado;
            orden.FechaPago = req.Pagado ? DateTimeOffset.UtcNow : null;
        }
        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    /// <summary>Cambia el día de entrega de una orden entregada (para cargar histórico o corregirlo).</summary>
    [HttpPut("{id:int}/salida")]
    public async Task<ActionResult<OrdenDetalle>> CambiarFechaSalida(int id, FechaSalidaRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }
        if (orden.Estado != EstadoOrden.Entregado)
        {
            ModelState.AddModelError(nameof(FechaSalidaRequest.Fecha), "Solo se puede indicar la fecha de entrega de una orden entregada.");
            return ValidationProblem(ModelState);
        }
        if (ValidarFechaPosterior(req.Fecha, orden, nameof(FechaSalidaRequest.Fecha), "de entrega") is { } error)
        {
            return error;
        }
        if (orden.FechaSalida is null || HoraTaller.FechaDe(orden.FechaSalida.Value) != req.Fecha)
        {
            orden.FechaSalida = HoraTaller.ConFecha(req.Fecha);
            await db.SaveChangesAsync(ct);
        }
        return orden.ToDetalle();
    }

    /// <summary>Fechas de entrega o de pago: no pueden ser futuras ni anteriores a la entrada del vehículo.</summary>
    private ActionResult? ValidarFechaPosterior(DateOnly fecha, OrdenTrabajo orden, string campo, string que)
    {
        if (fecha > HoraTaller.Hoy())
        {
            ModelState.AddModelError(campo, $"La fecha {que} no puede ser posterior a hoy.");
        }
        else if (fecha < HoraTaller.FechaDe(orden.FechaEntrada))
        {
            ModelState.AddModelError(campo, $"La fecha {que} no puede ser anterior a la entrada del vehículo.");
        }
        return ModelState.IsValid ? null : ValidationProblem(ModelState);
    }

    [HttpPut("{id:int}/estado")]
    public async Task<ActionResult<OrdenDetalle>> CambiarEstado(int id, CambiarEstadoRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }

        orden.Estado = req.Estado;
        orden.FechaSalida = req.Estado == EstadoOrden.Entregado
            ? orden.FechaSalida ?? DateTimeOffset.UtcNow
            : null;

        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var orden = await db.OrdenesTrabajo.Include(o => o.Lineas).Include(o => o.Factura).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }
        if (orden.Factura is not null)
        {
            ModelState.AddModelError("Factura", $"La orden tiene la factura {orden.Factura.Codigo}, que debe conservarse: no se puede eliminar.");
            return ValidationProblem(ModelState);
        }

        // La ficha de diagnosis se borra en cascada; sus archivos adjuntos hay que quitarlos del disco aparte.
        var adjuntos = await db.AdjuntosDiagnosis
            .Where(a => a.FichaDiagnosis.OrdenTrabajoId == id)
            .Select(a => a.Archivo)
            .ToListAsync(ct);

        var archivosMultimedia = await db.MultimediaOrdenes.Where(m => m.OrdenTrabajoId == id).Select(m => m.Archivo).ToListAsync(ct);

        db.OrdenesTrabajo.Remove(orden);
        await db.SaveChangesAsync(ct);
        adjuntos.ForEach(almacen.Borrar);
        archivosMultimedia.ForEach(multimedia.Borrar);
        return NoContent();
    }

    // Factura

    private static readonly JsonSerializerOptions JsonFactura = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private static FacturaDto ToDto(Factura f) =>
        new(f.Id, f.Codigo, f.Fecha, f.Simplificada, f.Total, JsonSerializer.Deserialize<FacturaContenido>(f.Contenido, JsonFactura)!);

    [HttpGet("{id:int}/factura")]
    public async Task<ActionResult<FacturaDto>> ObtenerFactura(int id, CancellationToken ct)
    {
        var factura = await db.Facturas.AsNoTracking().FirstOrDefaultAsync(f => f.OrdenTrabajoId == id, ct);
        return factura is null ? NotFound() : ToDto(factura);
    }

    /// <summary>
    /// Emite la factura de la orden con el siguiente número del año. Sin NIF del cliente solo cabe factura simplificada
    /// (hasta 400 € con IVA). La numeración es correlativa, así que la fecha no puede ser anterior a la última factura del año.
    /// </summary>
    [HttpPost("{id:int}/factura")]
    public async Task<ActionResult<FacturaDto>> EmitirFactura(int id, EmitirFacturaRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }

        var datos = await db.DatosTaller.AsNoTracking().FirstOrDefaultAsync(ct);
        var cliente = orden.Vehiculo.Cliente;
        var totales = Totales.De(orden.Lineas);
        var fecha = req.Fecha ?? HoraTaller.Hoy();
        var simplificada = string.IsNullOrWhiteSpace(cliente.NifCif);

        if (orden.Factura is not null)
        {
            ModelState.AddModelError("Factura", $"La orden ya tiene la factura {orden.Factura.Codigo}.");
        }
        else if (orden.Estado == EstadoOrden.Cancelado)
        {
            ModelState.AddModelError("Factura", "No se puede facturar una orden cancelada.");
        }
        else if (orden.Lineas.Count == 0 || totales.Total <= 0)
        {
            ModelState.AddModelError("Factura", "Añade los conceptos de la orden antes de facturarla.");
        }
        else if (datos is null || string.IsNullOrWhiteSpace(datos.Nif) || string.IsNullOrWhiteSpace(datos.RazonSocial) || string.IsNullOrWhiteSpace(datos.Direccion))
        {
            ModelState.AddModelError("Factura", "Faltan los datos fiscales del taller: indica el titular y el NIF en Contabilidad → Ajustes, y la dirección en Web → Datos del taller.");
        }
        else if (simplificada && totales.Total > 400)
        {
            ModelState.AddModelError("Factura", "El cliente no tiene NIF/CIF: sin él solo se puede emitir factura simplificada, y solo hasta 400 € con IVA. Añádelo en la ficha del cliente.");
        }
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }
        if (ValidarFechaPosterior(fecha, orden, nameof(EmitirFacturaRequest.Fecha), "de la factura") is { } errorFecha)
        {
            return errorFecha;
        }

        var ultima = await db.Facturas.Where(f => f.Anio == fecha.Year).OrderByDescending(f => f.Numero)
            .Select(f => new { f.Numero, f.Fecha }).FirstOrDefaultAsync(ct);
        if (ultima is not null && fecha < ultima.Fecha)
        {
            ModelState.AddModelError(nameof(EmitirFacturaRequest.Fecha),
                $"La última factura de {fecha.Year} es del {ultima.Fecha:dd/MM/yyyy}: las facturas van numeradas por orden de fecha, así que esta no puede ser anterior.");
            return ValidationProblem(ModelState);
        }

        var numero = (ultima?.Numero ?? 0) + 1;
        var contenido = ContenidoFactura(orden, datos!);
        var factura = new Factura
        {
            OrdenTrabajo = orden,
            Anio = fecha.Year,
            Numero = numero,
            Codigo = $"F{fecha.Year}-{numero:0000}",
            Fecha = fecha,
            Simplificada = simplificada,
            Total = totales.Total,
            Contenido = JsonSerializer.Serialize(contenido, JsonFactura),
            FechaAlta = DateTimeOffset.UtcNow
        };
        db.Facturas.Add(factura);
        try
        {
            await db.SaveChangesAsync(ct);
        }
        catch (DbUpdateException)
        {
            // Otra factura ha cogido el mismo número a la vez (índice único): se pide repetir.
            ModelState.AddModelError("Factura", "Se ha emitido otra factura al mismo tiempo. Vuelve a intentarlo.");
            return ValidationProblem(ModelState);
        }
        return ToDto(factura);
    }

    /// <summary>
    /// Vuelve a generar la factura ya emitida con los datos actuales del cliente, el vehículo y el taller (para corregir errores).
    /// Conserva número, fecha e importes: los conceptos de una orden facturada no se pueden cambiar.
    /// </summary>
    [HttpPut("{id:int}/factura")]
    public async Task<ActionResult<FacturaDto>> ReemitirFactura(int id, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden?.Factura is null)
        {
            return NotFound();
        }

        var datos = await db.DatosTaller.AsNoTracking().FirstOrDefaultAsync(ct);
        var simplificada = string.IsNullOrWhiteSpace(orden.Vehiculo.Cliente.NifCif);
        if (datos is null || string.IsNullOrWhiteSpace(datos.Nif) || string.IsNullOrWhiteSpace(datos.RazonSocial) || string.IsNullOrWhiteSpace(datos.Direccion))
        {
            ModelState.AddModelError("Factura", "Faltan los datos fiscales del taller: indica el titular y el NIF en Contabilidad → Ajustes, y la dirección en Web → Datos del taller.");
        }
        else if (simplificada && orden.Factura.Total > 400)
        {
            ModelState.AddModelError("Factura", "El cliente no tiene NIF/CIF: sin él solo se puede emitir factura simplificada, y solo hasta 400 € con IVA. Añádelo en la ficha del cliente.");
        }
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        orden.Factura.Simplificada = simplificada;
        orden.Factura.Contenido = JsonSerializer.Serialize(ContenidoFactura(orden, datos!), JsonFactura);
        await db.SaveChangesAsync(ct);
        return ToDto(orden.Factura);
    }

    private static FacturaContenido ContenidoFactura(OrdenTrabajo orden, DatosTaller datos)
    {
        var cliente = orden.Vehiculo.Cliente;
        return new FacturaContenido(
            new EmisorFactura(datos.Nombre, datos.RazonSocial!, datos.Nif!, datos.Direccion, datos.CodigoPostal, datos.Poblacion, datos.Provincia,
                datos.Telefono, datos.Email),
            new ClienteFactura(cliente.Nombre, cliente.NifCif, cliente.Direccion, cliente.CodigoPostal, cliente.Poblacion, cliente.Provincia),
            orden.ToDetalle(),
            datos.PieFactura);
    }

    [HttpPost("{id:int}/lineas")]
    public async Task<ActionResult<OrdenDetalle>> AgregarLinea(int id, LineaRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        if (orden is null)
        {
            return NotFound();
        }

        if (ComprobarSinFactura(orden) is { } facturada)
        {
            return facturada;
        }

        var linea = new LineaTrabajo { Descripcion = "" };
        Aplicar(linea, req);
        orden.Lineas.Add(linea);

        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    [HttpPut("{id:int}/lineas/{lineaId:int}")]
    public async Task<ActionResult<OrdenDetalle>> ActualizarLinea(int id, int lineaId, LineaRequest req, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        var linea = orden?.Lineas.FirstOrDefault(l => l.Id == lineaId);
        if (orden is null || linea is null)
        {
            return NotFound();
        }

        if (orden.Factura is not null)
        {
            if (!MismoConcepto(linea, req) && ComprobarSinFactura(orden) is { } facturada)
            {
                return facturada;
            }
            linea.CosteUnitario = req.CosteUnitario;
        }
        else
        {
            Aplicar(linea, req);
        }
        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    [HttpDelete("{id:int}/lineas/{lineaId:int}")]
    public async Task<ActionResult<OrdenDetalle>> EliminarLinea(int id, int lineaId, CancellationToken ct)
    {
        var orden = await ConDetalle(db.OrdenesTrabajo).FirstOrDefaultAsync(o => o.Id == id, ct);
        var linea = orden?.Lineas.FirstOrDefault(l => l.Id == lineaId);
        if (orden is null || linea is null)
        {
            return NotFound();
        }

        if (ComprobarSinFactura(orden) is { } facturada)
        {
            return facturada;
        }

        orden.Lineas.Remove(linea);
        await db.SaveChangesAsync(ct);
        return orden.ToDetalle();
    }

    private static IQueryable<OrdenTrabajo> ConDetalle(IQueryable<OrdenTrabajo> query, bool conFactura = true)
    {
        query = query.Include(o => o.Vehiculo).ThenInclude(v => v.Cliente).Include(o => o.Lineas);
        return (conFactura ? query.Include(o => o.Factura) : query).AsSplitQuery();
    }

    /// <summary>Una orden facturada conserva sus conceptos: solo se puede cambiar el coste de compra (no se factura).</summary>
    private ActionResult? ComprobarSinFactura(OrdenTrabajo orden)
    {
        if (orden.Factura is null)
        {
            return null;
        }
        ModelState.AddModelError("Factura", $"La orden ya tiene la factura {orden.Factura.Codigo}: sus conceptos no se pueden modificar.");
        return ValidationProblem(ModelState);
    }

    private static bool MismoConcepto(LineaTrabajo l, LineaRequest req) =>
        l.Tipo == req.Tipo && l.Descripcion == req.Descripcion.Trim() && l.Referencia == Normalizar.Texto(req.Referencia) &&
        l.Cantidad == req.Cantidad && l.PrecioUnitario == req.PrecioUnitario &&
        l.DescuentoPorcentaje == req.DescuentoPorcentaje && l.IvaPorcentaje == req.IvaPorcentaje;

    /// <summary>El vehículo guarda el último uso conocido; nunca se reduce.</summary>
    private static void ActualizarUsoVehiculo(Vehiculo vehiculo, int? kilometros, int? horas)
    {
        if (kilometros > (vehiculo.Kilometros ?? 0))
        {
            vehiculo.Kilometros = kilometros;
        }

        if (horas > (vehiculo.Horas ?? 0))
        {
            vehiculo.Horas = horas;
        }
    }

    private static void Aplicar(LineaTrabajo l, LineaRequest req)
    {
        l.Tipo = req.Tipo;
        l.Descripcion = req.Descripcion.Trim();
        l.Referencia = Normalizar.Texto(req.Referencia);
        l.Cantidad = req.Cantidad;
        l.PrecioUnitario = req.PrecioUnitario;
        l.DescuentoPorcentaje = req.DescuentoPorcentaje;
        l.IvaPorcentaje = req.IvaPorcentaje;
        l.CosteUnitario = req.CosteUnitario;
    }
}
