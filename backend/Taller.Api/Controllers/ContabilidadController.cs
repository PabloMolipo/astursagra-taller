using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

/// <summary>Análisis de ingresos, costes y gastos del taller, y ajustes de importes.</summary>
[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/contabilidad")]
public class ContabilidadController(TallerDbContext db) : ControllerBase
{
    /// <summary>
    /// Resumen del periodo (por defecto, el mes en curso). Las fechas son días en la hora del taller. Con conIva=false
    /// los importes de las órdenes van sin IVA (base imponible); los gastos son siempre el importe pagado.
    /// </summary>
    [HttpGet("resumen")]
    public async Task<ActionResult<ResumenContabilidad>> Resumen(
        [FromQuery] DateOnly? desde, [FromQuery] DateOnly? hasta, [FromQuery] bool conIva = true, CancellationToken ct = default)
    {
        var hoy = HoraTaller.Hoy();
        var d = desde ?? new DateOnly(hoy.Year, hoy.Month, 1);
        var h = hasta ?? d.AddMonths(1).AddDays(-1);
        if (h < d)
        {
            ModelState.AddModelError(nameof(hasta), "La fecha final no puede ser anterior a la inicial.");
            return ValidationProblem(ModelState);
        }
        var inicio = HoraTaller.InicioDe(d);
        var fin = HoraTaller.InicioDe(h.AddDays(1));
        var primerMes = new DateOnly(h.Year, h.Month, 1).AddMonths(-11);

        // El volumen de un taller es pequeño: se cargan las órdenes no canceladas con sus líneas y se calcula en memoria.
        var ordenes = (await db.OrdenesTrabajo.AsNoTracking()
                .Where(o => o.Estado != EstadoOrden.Cancelado)
                .Include(o => o.Lineas)
                .Include(o => o.Vehiculo).ThenInclude(v => v.Cliente)
                .AsSplitQuery()
                .ToListAsync(ct))
            .Select(o => (Orden: o, Totales: Totales.De(o.Lineas)))
            .ToList();

        decimal Imp(Totales t) => conIva ? t.Total : t.BaseImponible;
        bool EnPeriodo(DateTimeOffset? f) => f is not null && f >= inicio && f < fin;
        var entregadas = ordenes.Where(x => x.Orden.Estado == EstadoOrden.Entregado && EnPeriodo(x.Orden.FechaSalida)).ToList();
        var cobradas = ordenes.Where(x => x.Orden.Pagado && EnPeriodo(x.Orden.FechaPago)).ToList();
        // Pendiente de cobro: trabajos terminados (listos o entregados) con importe y sin pagar, de cualquier fecha.
        var sinCobrar = ordenes
            .Where(x => !x.Orden.Pagado && x.Totales.Total > 0 && x.Orden.Estado is EstadoOrden.Entregado or EstadoOrden.Listo)
            .OrderBy(x => x.Orden.FechaSalida ?? x.Orden.FechaEntrada)
            .ToList();

        decimal Base(OrdenTrabajo o, TipoLinea tipo) => o.Lineas.Where(l => l.Tipo == tipo).Sum(l => l.BaseImponible);

        var gastos = await db.Gastos.AsNoTracking().Where(g => g.Fecha >= primerMes || (g.Fecha >= d && g.Fecha <= h))
            .Select(g => new { g.Fecha, g.Categoria, g.Importe, g.OrdenTrabajoId }).ToListAsync(ct);
        var gastosPeriodo = gastos.Where(g => g.Fecha >= d && g.Fecha <= h).ToList();

        // Cada orden reparte su importe a partes iguales entre sus tipos de servicio.
        var porServicio = entregadas
            .SelectMany(x => (x.Orden.Servicios.Count == 0 ? [TipoServicio.Otro] : x.Orden.Servicios.Distinct().ToList())
                .Select(s => (Servicio: s, Importe: Imp(x.Totales) / Math.Max(1, x.Orden.Servicios.Distinct().Count()))))
            .GroupBy(x => x.Servicio)
            .Select(g => new ImporteServicio(g.Key, Math.Round(g.Sum(x => x.Importe), 2)))
            .OrderByDescending(x => x.Importe)
            .ToList();

        var clientes = entregadas
            .GroupBy(x => (x.Orden.Vehiculo.ClienteId, x.Orden.Vehiculo.Cliente.Nombre))
            .Select(g => new ClienteImporte(g.Key.ClienteId, g.Key.Nombre, g.Sum(x => Imp(x.Totales)), g.Count()))
            .OrderByDescending(x => x.Importe)
            .Take(5)
            .ToList();

        DateOnly Mes(DateTimeOffset f) { var l = HoraTaller.FechaDe(f); return new DateOnly(l.Year, l.Month, 1); }
        var meses = Enumerable.Range(0, 12).Select(i => primerMes.AddMonths(i)).Select(m => new MesContable(
            m,
            ordenes.Where(x => x.Orden.Estado == EstadoOrden.Entregado && x.Orden.FechaSalida is { } f && Mes(f) == m).Sum(x => Imp(x.Totales)),
            ordenes.Where(x => x.Orden.Pagado && x.Orden.FechaPago is { } f && Mes(f) == m).Sum(x => Imp(x.Totales)),
            gastos.Where(g => g.Fecha.Year == m.Year && g.Fecha.Month == m.Month).Sum(g => g.Importe))).ToList();

        OrdenContable Fila((OrdenTrabajo Orden, Totales Totales) x) => new(
            x.Orden.Id, x.Orden.FechaSalida, $"{x.Orden.Vehiculo.Marca} {x.Orden.Vehiculo.Modelo}".Trim(),
            x.Orden.Vehiculo.Matricula ?? x.Orden.Vehiculo.Bastidor, x.Orden.Vehiculo.ClienteId, x.Orden.Vehiculo.Cliente.Nombre,
            Imp(x.Totales), x.Totales.Coste, x.Totales.Margen, x.Orden.Pagado, x.Orden.FechaPago, x.Orden.Estado);

        var cobrado = cobradas.Sum(x => Imp(x.Totales));
        var totalGastos = gastosPeriodo.Sum(g => g.Importe);
        // Beneficio: lo cobrado menos el coste real de las piezas de esas órdenes (según sus líneas) y los gastos generales.
        // Las compras ligadas a una orden no se restan otra vez: su coste ya está en las líneas de la orden.
        var costePiezasCobradas = cobradas.Sum(x => x.Totales.Coste);
        var gastosGenerales = gastosPeriodo.Where(g => g.OrdenTrabajoId is null).Sum(g => g.Importe);
        return new ResumenContabilidad(
            d, h,
            entregadas.Sum(x => Imp(x.Totales)), cobrado,
            sinCobrar.Sum(x => Imp(x.Totales)), sinCobrar.Count,
            entregadas.Count,
            entregadas.Sum(x => Base(x.Orden, TipoLinea.ManoObra)),
            entregadas.Sum(x => Base(x.Orden, TipoLinea.Pieza)),
            entregadas.Sum(x => x.Totales.Coste),
            entregadas.Sum(x => x.Totales.Margen),
            totalGastos, cobrado - totalGastos,
            gastosPeriodo.GroupBy(g => g.Categoria)
                .Select(g => new ImporteCategoria(g.Key, g.Sum(x => x.Importe), g.Count()))
                .OrderByDescending(x => x.Importe).ToList(),
            porServicio, clientes, meses,
            entregadas.OrderByDescending(x => x.Orden.FechaSalida).Select(Fila).ToList(),
            sinCobrar.Select(Fila).ToList(),
            conIva,
            costePiezasCobradas, gastosGenerales, cobrado - costePiezasCobradas - gastosGenerales);
    }

    [HttpGet("ajustes")]
    public async Task<AjustesContabilidad> Ajustes(CancellationToken ct)
    {
        var datos = await db.DatosTaller.AsNoTracking().FirstOrDefaultAsync(ct);
        return datos is null ? new AjustesContabilidad(21m) : Ajustes(datos);
    }

    private static AjustesContabilidad Ajustes(DatosTaller d) => new(d.IvaPorDefecto, d.RazonSocial, d.Nif, d.PieFactura);

    [HttpPut("ajustes")]
    public async Task<ActionResult<AjustesContabilidad>> GuardarAjustes(AjustesContabilidad req, CancellationToken ct)
    {
        var datos = await db.DatosTaller.FirstOrDefaultAsync(ct);
        if (datos is null)
        {
            return NotFound();
        }
        datos.IvaPorDefecto = Math.Round(req.IvaPorDefecto, 2);
        datos.RazonSocial = Normalizar.Texto(req.RazonSocial);
        datos.Nif = Normalizar.Texto(req.Nif)?.ToUpperInvariant().Replace(" ", "").Replace("-", "");
        datos.PieFactura = Normalizar.Texto(req.PieFactura);
        await db.SaveChangesAsync(ct);
        return Ajustes(datos);
    }
}
