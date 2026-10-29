using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class MultimediaOrdenConfiguration : IEntityTypeConfiguration<MultimediaOrden>
{
    public void Configure(EntityTypeBuilder<MultimediaOrden> builder)
    {
        builder.ToTable("MultimediaOrdenes");
        builder.Property(m => m.Etapa).HasConversion<string>().HasMaxLength(20);
        builder.Property(m => m.Descripcion).HasMaxLength(500);
        builder.Property(m => m.Archivo).HasMaxLength(100);
        builder.Property(m => m.NombreOriginal).HasMaxLength(255);
        builder.Property(m => m.TipoContenido).HasMaxLength(100);
        builder.Property(m => m.SubidoPor).HasMaxLength(256);
        builder.HasOne(m => m.OrdenTrabajo).WithMany().HasForeignKey(m => m.OrdenTrabajoId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(m => new { m.OrdenTrabajoId, m.Fecha });
    }
}
