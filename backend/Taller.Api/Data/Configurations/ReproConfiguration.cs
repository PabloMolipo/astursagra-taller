using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class ReprogramacionConfiguration : IEntityTypeConfiguration<Reprogramacion>
{
    public void Configure(EntityTypeBuilder<Reprogramacion> builder)
    {
        builder.ToTable("Reprogramaciones");
        builder.Property(r => r.SharePointId).HasMaxLength(200);
        builder.Property(r => r.Nombre).HasMaxLength(400);
        builder.Property(r => r.WebUrl).HasMaxLength(2000);
        builder.Property(r => r.Notas).HasMaxLength(2000);
        builder.HasIndex(r => r.SharePointId).IsUnique();
        builder.HasIndex(r => r.VehiculoId);
        // Si se borra el vehículo, la reprogramación sigue (está en SharePoint) pero sin vincular.
        builder.HasOne(r => r.Vehiculo).WithMany().HasForeignKey(r => r.VehiculoId).OnDelete(DeleteBehavior.SetNull);
        builder.HasMany(r => r.Archivos).WithOne().HasForeignKey(a => a.ReprogramacionId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class ArchivoReprogramacionConfiguration : IEntityTypeConfiguration<ArchivoReprogramacion>
{
    public void Configure(EntityTypeBuilder<ArchivoReprogramacion> builder)
    {
        builder.ToTable("ArchivosReprogramacion");
        builder.Property(a => a.SharePointId).HasMaxLength(200);
        builder.Property(a => a.Nombre).HasMaxLength(400);
        builder.Property(a => a.Ruta).HasMaxLength(1000);
        builder.Property(a => a.WebUrl).HasMaxLength(2000);
        builder.HasIndex(a => a.SharePointId).IsUnique();
    }
}

public class CarpetaSharePointConfiguration : IEntityTypeConfiguration<CarpetaSharePoint>
{
    public void Configure(EntityTypeBuilder<CarpetaSharePoint> builder)
    {
        builder.ToTable("CarpetasSharePoint");
        builder.HasKey(c => new { c.DriveId, c.ItemId });
        builder.Property(c => c.DriveId).HasMaxLength(200);
        builder.Property(c => c.ItemId).HasMaxLength(200);
        builder.Property(c => c.PadreId).HasMaxLength(200);
        builder.Property(c => c.Nombre).HasMaxLength(400);
    }
}
