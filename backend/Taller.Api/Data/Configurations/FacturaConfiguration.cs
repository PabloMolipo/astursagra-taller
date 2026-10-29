using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class FacturaConfiguration : IEntityTypeConfiguration<Factura>
{
    public void Configure(EntityTypeBuilder<Factura> builder)
    {
        builder.ToTable("Facturas");

        builder.Property(f => f.Codigo).HasMaxLength(20);
        builder.Property(f => f.Total).HasPrecision(12, 2);
        builder.Property(f => f.Contenido).HasColumnType("jsonb");

        // La numeración es correlativa y única por año; una orden tiene como mucho una factura.
        builder.HasIndex(f => new { f.Anio, f.Numero }).IsUnique();
        builder.HasIndex(f => f.Codigo).IsUnique();
        builder.HasIndex(f => f.OrdenTrabajoId).IsUnique();

        // Una orden facturada no se puede borrar (la factura debe conservarse).
        builder.HasOne(f => f.OrdenTrabajo)
            .WithOne(o => o.Factura)
            .HasForeignKey<Factura>(f => f.OrdenTrabajoId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
