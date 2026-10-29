using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class VisitaConfiguration : IEntityTypeConfiguration<Visita>
{
    public void Configure(EntityTypeBuilder<Visita> builder)
    {
        builder.ToTable("Visitas");
        builder.Property(v => v.Ruta).HasMaxLength(200);
        builder.Property(v => v.Tipo).HasConversion<string>().HasMaxLength(10);
        builder.Property(v => v.Visitante).HasMaxLength(32);
        builder.Property(v => v.Pais).HasMaxLength(2);
        builder.Property(v => v.Region).HasMaxLength(2);
        builder.Property(v => v.Ciudad).HasMaxLength(100);
        builder.Property(v => v.Origen).HasMaxLength(100);
        builder.HasIndex(v => v.Fecha);
    }
}
