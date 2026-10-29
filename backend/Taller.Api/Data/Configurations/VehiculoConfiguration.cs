using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class VehiculoConfiguration : IEntityTypeConfiguration<Vehiculo>
{
    public void Configure(EntityTypeBuilder<Vehiculo> builder)
    {
        builder.Property(v => v.Tipo).HasConversion<string>().HasMaxLength(30);
        builder.Property(v => v.Matricula).HasMaxLength(20);
        builder.Property(v => v.Bastidor).HasMaxLength(30);
        builder.Property(v => v.Marca).HasMaxLength(100);
        builder.Property(v => v.Modelo).HasMaxLength(100);
        builder.Property(v => v.Motor).HasMaxLength(30);
        builder.Property(v => v.Imagen).HasMaxLength(100);
        builder.Property(v => v.Color).HasMaxLength(40);

        builder.HasIndex(v => v.Matricula).IsUnique().HasFilter("\"Matricula\" IS NOT NULL");
        builder.HasIndex(v => v.Bastidor).IsUnique().HasFilter("\"Bastidor\" IS NOT NULL");

        builder.HasOne(v => v.Cliente)
            .WithMany(c => c.Vehiculos)
            .HasForeignKey(v => v.ClienteId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}
