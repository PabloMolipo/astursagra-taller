using Microsoft.EntityFrameworkCore;
using Taller.Api.Domain;

namespace Taller.Api.Data;

/// <summary>
/// Contenido de partida de la web pública y de la biblioteca de códigos de avería. Se crea una sola vez, la primera vez que arranca la API
/// (cuando aún no existen los datos del taller); después todo se edita desde Gestión → Web.
/// </summary>
public static class ContenidoInicial
{
    public static DatosTaller Datos() => new()
    {
        Nombre = "AsturSagra",
        Lema = "Reparación de vehículos",
        Presentacion = "Taller mecánico en La Sagra (Toledo) con raíces asturianas. Reparamos y mantenemos todo tipo de " +
                       "vehículos: turismos, furgonetas, motos, camiones, tractores y maquinaria agrícola.",
        Poblacion = "La Sagra",
        Provincia = "Toledo",
        Horario = "Lunes a viernes: 9:00 – 14:00 y 16:00 – 19:30"
    };

    private static readonly (string Slug, string Titulo, string Icono, string Resumen)[] Servicios =
    [
        ("mecanica-general", "Mecánica general", "motor",
            "Distribución, embrague, frenos, suspensión, dirección, motor y transmisión."),
        ("electromecanica", "Electromecánica", "electrica",
            "Averías eléctricas, arranque y carga, sensores, iluminación y confort."),
        ("diagnosis-y-programacion", "Diagnosis y programación", "programacion",
            "Diagnosis electrónica, programación de centralitas y llaves, DPF, EGR y AdBlue."),
        ("chapa-y-pintura", "Chapa y pintura", "chapa",
            "Reparación de golpes, pintura y puesta a punto de la carrocería."),
        ("mantenimiento", "Mantenimiento", "mantenimiento",
            "Aceite y filtros, revisiones periódicas y preparación de la ITV."),
        ("agricola-e-industrial", "Agrícola e industrial", "agricola",
            "Tractores, maquinaria agrícola, camiones y furgonetas de trabajo.")
    ];

    public static async Task CrearSiFaltaAsync(TallerDbContext db)
    {
        // La biblioteca de códigos se rellena aparte: también en bases de datos que ya tenían la web.
        if (!await db.CodigosAveria.AnyAsync(c => !c.EsPropio))
        {
            var existentes = (await db.CodigosAveria.Select(c => c.Codigo).ToListAsync()).ToHashSet();
            db.CodigosAveria.AddRange(Diagnostico.CodigosGenericos.Lista
                .Where(g => !existentes.Contains(g.Codigo))
                .Select(g => new CodigoAveria { Codigo = g.Codigo, Sistema = g.Sistema, Descripcion = g.Descripcion }));
            await db.SaveChangesAsync();
        }

        // Valores de referencia genéricos (los genéricos no se borran desde la aplicación, solo se corrigen).
        if (!await db.ValoresReferencia.AnyAsync(v => !v.EsPropio))
        {
            db.ValoresReferencia.AddRange(Diagnostico.ReferenciasGenericas.Lista.Select(Diagnostico.ReferenciasGenericas.AEntidad));
            await db.SaveChangesAsync();
        }

        if (await db.DatosTaller.AnyAsync())
        {
            return;
        }

        db.DatosTaller.Add(Datos());
        db.Servicios.AddRange(Servicios.Select((s, i) => new Servicio
        {
            Slug = s.Slug,
            Titulo = s.Titulo,
            Resumen = s.Resumen,
            Icono = s.Icono,
            Orden = i,
            Publicado = true
        }));
        await db.SaveChangesAsync();
    }
}
