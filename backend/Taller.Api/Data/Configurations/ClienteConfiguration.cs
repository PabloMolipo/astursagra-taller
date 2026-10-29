using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class ClienteConfiguration : IEntityTypeConfiguration<Cliente>
{
    public void Configure(EntityTypeBuilder<Cliente> builder)
    {
        builder.Property(c => c.Tipo).HasConversion<string>().HasMaxLength(20);
        builder.Property(c => c.Nombre).HasMaxLength(200);
        builder.Property(c => c.NifCif).HasMaxLength(20);
        builder.Property(c => c.Telefono).HasMaxLength(30);
        builder.Property(c => c.Email).HasMaxLength(200);
        builder.Property(c => c.Direccion).HasMaxLength(300);
        builder.Property(c => c.CodigoPostal).HasMaxLength(10);
        builder.Property(c => c.Poblacion).HasMaxLength(100);
        builder.Property(c => c.Provincia).HasMaxLength(100);

        builder.HasIndex(c => c.NifCif).IsUnique().HasFilter("\"NifCif\" IS NOT NULL");
        builder.HasIndex(c => c.Nombre);
    }
}
