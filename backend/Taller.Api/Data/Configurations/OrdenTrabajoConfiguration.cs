using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class OrdenTrabajoConfiguration : IEntityTypeConfiguration<OrdenTrabajo>
{
    public void Configure(EntityTypeBuilder<OrdenTrabajo> builder)
    {
        builder.ToTable("OrdenesTrabajo");

        builder.Property(o => o.Estado).HasConversion<string>().HasMaxLength(20);
        builder.PrimitiveCollection(o => o.Servicios).ElementType().HasConversion<string>();
        builder.Property(o => o.MotivoEntrada).HasMaxLength(2000);
        builder.Property(o => o.Diagnostico).HasMaxLength(4000);

        builder.HasIndex(o => o.Estado);
        builder.HasIndex(o => o.FechaEntrada);

        builder.HasOne(o => o.Vehiculo)
            .WithMany(v => v.Ordenes)
            .HasForeignKey(o => o.VehiculoId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
