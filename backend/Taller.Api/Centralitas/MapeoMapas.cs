using Taller.Api.Contracts;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Centralitas;

/// <summary>Validación y paso de formulario a definición de mapa (de una lectura o de la biblioteca), y a DTO.</summary>
public static class MapeoMapas
{
    /// <summary>Errores del formulario para un archivo de <paramref name="tamano"/> bytes: campo y mensaje.</summary>
    public static IEnumerable<(string Campo, string Error)> Errores(MapaRequest req, long tamano)
    {
        if (req.Direccion + (long)req.Columnas * req.Filas * AnalizadorBinario.Tamano(req.TipoDato) > tamano)
        {
            yield return (nameof(req.Direccion), "El mapa se sale del archivo: revisa la dirección, el tamaño y el tipo de dato.");
        }
        if (req.EjeXDireccion is { } x && x + (long)req.Columnas * AnalizadorBinario.Tamano(req.EjeXTipo) > tamano)
        {
            yield return (nameof(req.EjeXDireccion), "El eje X se sale del archivo.");
        }
        if (req.EjeYDireccion is { } y && y + (long)req.Filas * AnalizadorBinario.Tamano(req.EjeYTipo) > tamano)
        {
            yield return (nameof(req.EjeYDireccion), "El eje Y se sale del archivo.");
        }
        if (Valores(req.EjeXValores) is { } vx && vx != req.Columnas)
        {
            yield return (nameof(req.EjeXValores), $"El eje X tiene {vx} valores y el mapa {req.Columnas} columnas.");
        }
        if (req.Filas > 1 && Valores(req.EjeYValores) is { } vy && vy != req.Filas)
        {
            yield return (nameof(req.EjeYValores), $"El eje Y tiene {vy} valores y el mapa {req.Filas} filas.");
        }
        if (req.Factor == 0 || req.EjeXFactor == 0 || req.EjeYFactor == 0 || !double.IsFinite(req.Factor + req.Desplazamiento + req.EjeXFactor + req.EjeYFactor))
        {
            yield return (nameof(req.Factor), "Los factores deben ser números distintos de 0.");
        }
    }

    /// <summary>Número de valores fijos de un eje («;» entre ellos); null si no tiene.</summary>
    private static int? Valores(string? valores) => string.IsNullOrWhiteSpace(valores) ? null : valores.Split(';').Length;

    public static void Aplicar(DefinicionMapa m, MapaRequest req)
    {
        m.Nombre = req.Nombre.Trim();
        m.Grupo = req.Grupo;
        m.Direccion = req.Direccion;
        m.Columnas = req.Columnas;
        m.Filas = req.Filas;
        m.TipoDato = req.TipoDato;
        m.BigEndian = req.BigEndian;
        m.PorColumnas = req.Filas > 1 && req.PorColumnas;
        m.Factor = req.Factor;
        m.Desplazamiento = req.Desplazamiento;
        m.Unidad = Normalizar.Texto(req.Unidad);
        m.EjeXDireccion = req.EjeXDireccion;
        m.EjeXTipo = req.EjeXTipo;
        m.EjeXFactor = req.EjeXFactor;
        m.EjeXUnidad = Normalizar.Texto(req.EjeXUnidad);
        m.EjeYDireccion = req.Filas == 1 ? null : req.EjeYDireccion;
        m.EjeYTipo = req.EjeYTipo;
        m.EjeYFactor = req.EjeYFactor;
        m.EjeYUnidad = Normalizar.Texto(req.EjeYUnidad);
        m.EjeXDesplazamiento = req.EjeXDesplazamiento;
        m.EjeXValores = req.EjeXDireccion is null ? Normalizar.Texto(req.EjeXValores) : null;
        m.EjeYDesplazamiento = req.EjeYDesplazamiento;
        m.EjeYValores = req.Filas > 1 && req.EjeYDireccion is null ? Normalizar.Texto(req.EjeYValores) : null;
        m.Notas = Normalizar.Texto(req.Notas);
        m.Descripcion = Normalizar.Texto(req.Descripcion);
        m.EjeXNombre = Normalizar.Texto(req.EjeXNombre);
        m.EjeYNombre = req.Filas > 1 ? Normalizar.Texto(req.EjeYNombre) : null;
    }

    public static MapaDto ToDto(DefinicionMapa m, int id, OrigenMapa origen) => new(
        id, m.Nombre, origen, m.Grupo, m.Direccion, m.Columnas, m.Filas, m.TipoDato, m.BigEndian, m.PorColumnas, m.Factor, m.Desplazamiento, m.Unidad,
        m.EjeXDireccion, m.EjeXTipo, m.EjeXFactor, m.EjeXUnidad, m.EjeYDireccion, m.EjeYTipo, m.EjeYFactor, m.EjeYUnidad, m.Notas,
        m.EjeXDesplazamiento, m.EjeXValores, m.EjeYDesplazamiento, m.EjeYValores, m.Descripcion, m.EjeXNombre, m.EjeYNombre);
}
