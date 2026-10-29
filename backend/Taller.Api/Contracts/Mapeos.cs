using System.Linq.Expressions;
using Taller.Api.Domain;

namespace Taller.Api.Contracts;

public static class Mapeos
{
    public static readonly Expression<Func<Vehiculo, VehiculoListItem>> VehiculoListItem = v =>
        new VehiculoListItem(v.Id, v.Tipo, v.Matricula, v.Bastidor, v.Marca, v.Modelo, v.Anio, v.ClienteId, v.Cliente.Nombre, v.Motor);

    private static readonly Func<Vehiculo, VehiculoListItem> VehiculoListItemCompilado = VehiculoListItem.Compile();

    public static VehiculoListItem ToListItem(this Vehiculo v) => VehiculoListItemCompilado(v);

    /// <summary>Requiere Vehiculo, Vehiculo.Cliente y Lineas cargados.</summary>
    public static OrdenListItem ToListItem(this OrdenTrabajo o)
    {
        var totales = Totales.De(o.Lineas);
        return new(
            o.Id,
            o.Estado,
            o.Servicios,
            o.FechaEntrada,
            o.FechaPrevista,
            o.FechaSalida,
            o.VehiculoId,
            $"{o.Vehiculo.Marca} {o.Vehiculo.Modelo}".Trim(),
            o.Vehiculo.Matricula ?? o.Vehiculo.Bastidor,
            o.Vehiculo.ClienteId,
            o.Vehiculo.Cliente.Nombre,
            o.MotivoEntrada,
            totales.Total,
            totales.Margen,
            o.Vehiculo.Tipo,
            o.Pagado);
    }

    public static LineaDto ToDto(this LineaTrabajo l) => new(
        l.Id, l.Tipo, l.Descripcion, l.Referencia, l.Cantidad, l.PrecioUnitario,
        l.DescuentoPorcentaje, l.IvaPorcentaje, l.BaseImponible, l.Iva, l.CosteUnitario, l.Coste);

    /// <summary>Requiere Vehiculo, Vehiculo.Cliente y Lineas cargados.</summary>
    public static OrdenDetalle ToDetalle(this OrdenTrabajo o) => new(
        o.Id,
        o.Estado,
        o.Servicios,
        o.FechaEntrada,
        o.FechaPrevista,
        o.FechaSalida,
        o.MotivoEntrada,
        o.Diagnostico,
        o.KilometrosEntrada,
        o.HorasEntrada,
        o.Observaciones,
        o.Vehiculo.ToListItem(),
        o.Lineas.OrderBy(l => l.Id).Select(l => l.ToDto()).ToList(),
        Totales.De(o.Lineas),
        o.Pagado,
        o.FechaPago,
        o.Factura is null ? null : new FacturaResumen(o.Factura.Codigo, o.Factura.Fecha));
}
