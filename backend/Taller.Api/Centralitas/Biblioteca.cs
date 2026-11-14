using Microsoft.EntityFrameworkCore;
using Taller.Api.Data;
using Taller.Api.Domain;

namespace Taller.Api.Centralitas;

/// <summary>
/// Biblioteca de mapas con nombre por software: lo que se nombra (o importa) en una lectura se guarda para su software,
/// y se aplica solo a las demás lecturas del mismo software, que tienen los mapas en las mismas direcciones.
/// </summary>
public static class Biblioteca
{
    /// <summary>
    /// Clave del software: número de software (Bosch 1037…) o, si no se ha encontrado, la referencia (VAG 03L906018…),
    /// junto con el tamaño del archivo; null si no tiene ninguno de los dos (no se puede reutilizar).
    /// </summary>
    public static string? Clave(Centralita c) => (c.Software ?? c.Referencia) is { } id ? $"{id}|{c.Tamano}" : null;

    /// <summary>
    /// Aplica a la lectura (con sus mapas cargados) los mapas de la biblioteca de su software: sobre los detectados en la
    /// misma dirección y tamaño, y añade los que falten si caben. Los que ya tienen nombre en la lectura no se tocan.
    /// Devuelve cuántos ha aplicado.
    /// </summary>
    public static async Task<int> Aplicar(TallerDbContext db, Centralita c, CancellationToken ct)
    {
        if (Clave(c) is not { } clave)
        {
            return 0;
        }
        var mapas = await db.MapasBiblioteca.AsNoTracking()
            .Where(m => db.BibliotecasSoftware.Any(b => b.Id == m.BibliotecaSoftwareId && b.Clave == clave)).ToListAsync(ct);
        var aplicados = 0;
        foreach (var o in mapas)
        {
            var d = c.Mapas.FirstOrDefault(m => m.Direccion == o.Direccion && m.Columnas == o.Columnas && m.Filas == o.Filas);
            if (d?.Origen == OrigenMapa.Manual || !Cabe(o, c.Tamano))
            {
                continue;
            }
            if (d is null)
            {
                d = new MapaCentralita { Nombre = "" };
                c.Mapas.Add(d);
            }
            d.CopiarDe(o);
            d.Origen = OrigenMapa.Manual;
            aplicados++;
        }
        return aplicados;
    }

    /// <summary>
    /// Guarda (o actualiza, por dirección) los mapas en la biblioteca del software de la lectura y la devuelve (null si la
    /// lectura no tiene software). No guarda cambios.
    /// </summary>
    public static async Task<BibliotecaSoftware?> Guardar(TallerDbContext db, Centralita c, IEnumerable<MapaCentralita> mapas, CancellationToken ct)
    {
        if (Clave(c) is not { } clave)
        {
            return null;
        }
        var biblioteca = await db.BibliotecasSoftware.Include(b => b.Mapas).FirstOrDefaultAsync(b => b.Clave == clave, ct);
        if (biblioteca is null)
        {
            biblioteca = new BibliotecaSoftware
            {
                Clave = clave, Familia = c.Familia, Software = c.Software, Referencia = c.Referencia, Tamano = c.Tamano,
                FechaAlta = DateTimeOffset.UtcNow
            };
            db.BibliotecasSoftware.Add(biblioteca);
        }
        foreach (var m in mapas)
        {
            var b = biblioteca.Mapas.FirstOrDefault(x => x.Direccion == m.Direccion);
            if (b is null)
            {
                b = new MapaBiblioteca { Nombre = "" };
                biblioteca.Mapas.Add(b);
            }
            b.CopiarDe(m);
        }
        biblioteca.Familia ??= c.Familia;
        biblioteca.Modificada = DateTimeOffset.UtcNow;
        return biblioteca;
    }

    /// <summary>Quita de la biblioteca del software de la lectura el mapa de esa dirección (al borrarlo o moverlo). No guarda cambios.</summary>
    public static async Task Quitar(TallerDbContext db, Centralita c, int direccion, CancellationToken ct)
    {
        if (Clave(c) is not { } clave)
        {
            return;
        }
        var mapas = await db.MapasBiblioteca
            .Where(m => m.Direccion == direccion && db.BibliotecasSoftware.Any(b => b.Id == m.BibliotecaSoftwareId && b.Clave == clave)).ToListAsync(ct);
        db.MapasBiblioteca.RemoveRange(mapas);
    }

    /// <summary>Biblioteca del software de la lectura (id y número de mapas); null si aún no tiene.</summary>
    public static async Task<(int Id, int Mapas)?> Info(TallerDbContext db, Centralita c, CancellationToken ct)
    {
        if (Clave(c) is not { } clave)
        {
            return null;
        }
        var info = await db.BibliotecasSoftware.Where(b => b.Clave == clave).Select(b => new { b.Id, Mapas = b.Mapas.Count }).FirstOrDefaultAsync(ct);
        return info is null ? null : (info.Id, info.Mapas);
    }

    /// <summary>
    /// Aplica la biblioteca a una lectura de su software sobrescribiendo también los mapas con nombre en la misma
    /// dirección y tamaño (la biblioteca manda), y añade los que falten. Devuelve cuántos ha aplicado.
    /// </summary>
    public static int Sobrescribir(IEnumerable<MapaBiblioteca> mapas, Centralita c)
    {
        var aplicados = 0;
        foreach (var o in mapas.Where(m => Cabe(m, c.Tamano)))
        {
            var d = c.Mapas.FirstOrDefault(m => m.Direccion == o.Direccion && m.Columnas == o.Columnas && m.Filas == o.Filas);
            if (d is null)
            {
                d = new MapaCentralita { Nombre = "" };
                c.Mapas.Add(d);
            }
            d.CopiarDe(o);
            d.Origen = OrigenMapa.Manual;
            aplicados++;
        }
        return aplicados;
    }

    public static bool Cabe(DefinicionMapa m, long tamano) =>
        m.Direccion + (long)m.Columnas * m.Filas * AnalizadorBinario.Tamano(m.TipoDato) <= tamano
        && (m.EjeXDireccion is not { } x || x + (long)m.Columnas * AnalizadorBinario.Tamano(m.EjeXTipo) <= tamano)
        && (m.EjeYDireccion is not { } y || y + (long)m.Filas * AnalizadorBinario.Tamano(m.EjeYTipo) <= tamano);
}
