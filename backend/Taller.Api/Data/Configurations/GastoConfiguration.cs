using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class GastoConfiguration : IEntityTypeConfiguration<Gasto>
{
    public void Configure(EntityTypeBuilder<Gasto> builder)
    {
        builder.ToTable("Gastos");

        builder.Property(g => g.Categoria).HasConversion<string>().HasMaxLength(30);
        builder.Property(g => g.MetodoPago).HasConversion<string>().HasMaxLength(20);
        builder.Property(g => g.Concepto).HasMaxLength(300);
        builder.Property(g => g.Proveedor).HasMaxLength(150);
        builder.Property(g => g.Importe).HasPrecision(12, 2);
        builder.Property(g => g.Notas).HasMaxLength(2000);
        builder.Property(g => g.Adjunto).HasMaxLength(100);
        builder.Property(g => g.AdjuntoNombre).HasMaxLength(255);
        builder.Property(g => g.AdjuntoTipo).HasMaxLength(100);

        builder.HasIndex(g => g.Fecha);
        builder.HasIndex(g => g.OrdenTrabajoId);

        // Si se borra la orden, la compra se conserva (sigue siendo un gasto real), sin la orden.
        builder.HasOne(g => g.OrdenTrabajo)
            .WithMany()
            .HasForeignKey(g => g.OrdenTrabajoId)
            .OnDelete(DeleteBehavior.SetNull);
    }
}
