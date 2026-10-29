using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class LineaTrabajoConfiguration : IEntityTypeConfiguration<LineaTrabajo>
{
    public void Configure(EntityTypeBuilder<LineaTrabajo> builder)
    {
        builder.ToTable("LineasTrabajo");

        builder.Property(l => l.Tipo).HasConversion<string>().HasMaxLength(20);
        builder.Property(l => l.Descripcion).HasMaxLength(500);
        builder.Property(l => l.Referencia).HasMaxLength(100);
        builder.Property(l => l.Cantidad).HasPrecision(10, 2);
        builder.Property(l => l.PrecioUnitario).HasPrecision(10, 2);
        builder.Property(l => l.DescuentoPorcentaje).HasPrecision(5, 2);
        builder.Property(l => l.IvaPorcentaje).HasPrecision(5, 2);
        builder.Property(l => l.CosteUnitario).HasPrecision(10, 2);

        builder.Ignore(l => l.BaseImponible);
        builder.Ignore(l => l.Iva);
        builder.Ignore(l => l.Coste);

        builder.HasOne(l => l.OrdenTrabajo)
            .WithMany(o => o.Lineas)
            .HasForeignKey(l => l.OrdenTrabajoId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
