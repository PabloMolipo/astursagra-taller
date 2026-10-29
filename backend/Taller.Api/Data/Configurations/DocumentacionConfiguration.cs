using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class DocumentoTecnicoConfiguration : IEntityTypeConfiguration<DocumentoTecnico>
{
    public void Configure(EntityTypeBuilder<DocumentoTecnico> builder)
    {
        builder.ToTable("DocumentosTecnicos");
        builder.Property(d => d.Titulo).HasMaxLength(200);
        builder.Property(d => d.Tipo).HasConversion<string>().HasMaxLength(30);
        builder.Property(d => d.Marca).HasMaxLength(100);
        builder.Property(d => d.Modelo).HasMaxLength(100);
        builder.Property(d => d.Motor).HasMaxLength(30);
        builder.Property(d => d.Sistema).HasMaxLength(100);
        builder.Property(d => d.Notas).HasMaxLength(1000);
        builder.Property(d => d.Archivo).HasMaxLength(100);
        builder.Property(d => d.NombreOriginal).HasMaxLength(255);
        builder.Property(d => d.TipoContenido).HasMaxLength(100);
        builder.HasIndex(d => d.Marca);
        builder.Property(d => d.SharePointId).HasMaxLength(200);
        builder.Property(d => d.SharePointVersion).HasMaxLength(200);
        builder.Property(d => d.SharePointRuta).HasMaxLength(500);
        builder.HasIndex(d => d.SharePointId).IsUnique().HasFilter("\"SharePointId\" IS NOT NULL");
    }
}

public class EstadoSincronizacionConfiguration : IEntityTypeConfiguration<EstadoSincronizacion>
{
    public void Configure(EntityTypeBuilder<EstadoSincronizacion> builder)
    {
        builder.ToTable("EstadoSincronizacion");
        builder.Property(e => e.Id).ValueGeneratedNever();
        builder.Property(e => e.EnlaceDelta).HasMaxLength(4000);
        builder.Property(e => e.UltimoResultado).HasMaxLength(2000);
        builder.Property(e => e.Origen).HasMaxLength(1000);
        builder.Property(e => e.DriveId).HasMaxLength(200);
    }
}

public class EnlacePortalConfiguration : IEntityTypeConfiguration<EnlacePortal>
{
    public void Configure(EntityTypeBuilder<EnlacePortal> builder)
    {
        builder.ToTable("EnlacesPortal");
        builder.Property(e => e.Nombre).HasMaxLength(100);
        builder.Property(e => e.Url).HasMaxLength(1000);
        builder.Property(e => e.Marca).HasMaxLength(100);
    }
}

public class UsoDocumentoAsistenteConfiguration : IEntityTypeConfiguration<UsoDocumentoAsistente>
{
    public void Configure(EntityTypeBuilder<UsoDocumentoAsistente> builder)
    {
        builder.ToTable("UsosDocumentoAsistente");
        builder.HasKey(u => new { u.SesionAsistenteId, u.DocumentoTecnicoId });
        // Al borrar la conversación se libera el documento; el documento no se puede borrar mientras se use.
        builder.HasOne<SesionAsistente>().WithMany().HasForeignKey(u => u.SesionAsistenteId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<DocumentoTecnico>().WithMany().HasForeignKey(u => u.DocumentoTecnicoId).OnDelete(DeleteBehavior.Restrict);
    }
}

public class CatalogoDespieceConfiguration : IEntityTypeConfiguration<CatalogoDespiece>
{
    public void Configure(EntityTypeBuilder<CatalogoDespiece> builder)
    {
        builder.ToTable("CatalogosDespiece");
        builder.Property(c => c.Nombre).HasMaxLength(100);
        builder.Property(c => c.Descripcion).HasMaxLength(500);
        builder.Property(c => c.UrlVehiculo).HasMaxLength(1000);
        builder.Property(c => c.UrlReferencia).HasMaxLength(1000);
        builder.Property(c => c.Marcas).HasMaxLength(500);
        builder.Property(c => c.AliasMarcas).HasMaxLength(500);

        // Catálogos gratuitos comprobados (octubre de 2026); se pueden cambiar o quitar desde Diagnóstico → Documentación.
        builder.HasData(
            new CatalogoDespiece
            {
                Id = 1, Nombre = "RealOEM", Orden = 1, Marcas = "BMW, MINI",
                Descripcion = "Despieces originales de BMW y MINI (también motos BMW), con referencias. Se abre con los 7 últimos caracteres del bastidor.",
                UrlVehiculo = "https://www.realoem.com/bmw/enUS/select?vin={vin7}",
                UrlReferencia = "https://www.realoem.com/bmw/enUS/partxref?q={referencia}"
            },
            new CatalogoDespiece
            {
                Id = 2, Nombre = "PartSouq", Orden = 2,
                Descripcion = "Catálogos originales con despieces por grupos de muchas marcas (BMW, Mercedes, grupo VAG, Toyota, Nissan, Hyundai, Kia…). Se abre por bastidor.",
                UrlVehiculo = "https://partsouq.com/en/search/all?q={vin}",
                UrlReferencia = "https://partsouq.com/en/search/all?q={referencia}"
            },
            new CatalogoDespiece
            {
                Id = 3, Nombre = "7zap", Orden = 3,
                Descripcion = "Despieces de unas 70 marcas de turismos. Abre la marca; dentro se busca por bastidor (se copia al pulsar). La versión gratuita tiene límites.",
                UrlVehiculo = "https://7zap.com/es/catalog/cars/{marca-slug}/",
                AliasMarcas = "Mercedes-Benz=mercedes, Mercedes Benz=mercedes, VW=volkswagen"
            });
    }
}

public class ConsultaMatriculaConfiguration : IEntityTypeConfiguration<ConsultaMatricula>
{
    public void Configure(EntityTypeBuilder<ConsultaMatricula> builder)
    {
        builder.ToTable("ConsultasMatricula");
        builder.Property(c => c.Matricula).HasMaxLength(15);
        builder.Property(c => c.Respuesta).HasMaxLength(20000);
        builder.Property(c => c.Usuario).HasMaxLength(256);
        builder.HasIndex(c => new { c.Matricula, c.Moto }).IsUnique();
    }
}
