using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class ServicioConfiguration : IEntityTypeConfiguration<Servicio>
{
    public void Configure(EntityTypeBuilder<Servicio> builder)
    {
        builder.Property(s => s.Slug).HasMaxLength(120);
        builder.Property(s => s.Titulo).HasMaxLength(120);
        builder.Property(s => s.Resumen).HasMaxLength(300);
        builder.Property(s => s.Descripcion).HasMaxLength(4000);
        builder.Property(s => s.Icono).HasMaxLength(30);
        builder.HasIndex(s => s.Slug).IsUnique();
    }
}

public class TrabajoRealizadoConfiguration : IEntityTypeConfiguration<TrabajoRealizado>
{
    public void Configure(EntityTypeBuilder<TrabajoRealizado> builder)
    {
        builder.ToTable("TrabajosRealizados");
        builder.Property(t => t.Slug).HasMaxLength(160);
        builder.Property(t => t.Titulo).HasMaxLength(160);
        builder.Property(t => t.Resumen).HasMaxLength(400);
        builder.Property(t => t.Descripcion).HasMaxLength(8000);
        builder.Property(t => t.Vehiculo).HasMaxLength(120);
        builder.Property(t => t.TipoVehiculo).HasConversion<string>().HasMaxLength(30);
        builder.PrimitiveCollection(t => t.Servicios).ElementType().HasConversion<string>();
        builder.HasIndex(t => t.Slug).IsUnique();
        builder.HasIndex(t => new { t.Publicado, t.Fecha });
    }
}

public class FotoTrabajoConfiguration : IEntityTypeConfiguration<FotoTrabajo>
{
    public void Configure(EntityTypeBuilder<FotoTrabajo> builder)
    {
        builder.ToTable("FotosTrabajo");
        builder.Property(f => f.Archivo).HasMaxLength(100);
        builder.Property(f => f.Pie).HasMaxLength(300);
        builder.HasOne(f => f.TrabajoRealizado)
            .WithMany(t => t.Fotos)
            .HasForeignKey(f => f.TrabajoRealizadoId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}

public class DatosTallerConfiguration : IEntityTypeConfiguration<DatosTaller>
{
    public void Configure(EntityTypeBuilder<DatosTaller> builder)
    {
        builder.ToTable("DatosTaller");
        builder.Property(d => d.Id).ValueGeneratedNever();
        builder.Property(d => d.Nombre).HasMaxLength(120);
        builder.Property(d => d.Lema).HasMaxLength(200);
        builder.Property(d => d.Presentacion).HasMaxLength(4000);
        builder.Property(d => d.Telefono).HasMaxLength(30);
        builder.Property(d => d.WhatsApp).HasMaxLength(30);
        builder.Property(d => d.Email).HasMaxLength(200);
        builder.Property(d => d.Direccion).HasMaxLength(300);
        builder.Property(d => d.CodigoPostal).HasMaxLength(10);
        builder.Property(d => d.Poblacion).HasMaxLength(100);
        builder.Property(d => d.Provincia).HasMaxLength(100);
        builder.Property(d => d.RazonSocial).HasMaxLength(200);
        builder.Property(d => d.Nif).HasMaxLength(20);
        builder.Property(d => d.PieFactura).HasMaxLength(1000);
        builder.Property(d => d.Horario).HasMaxLength(500);
        builder.Property(d => d.IvaPorDefecto).HasPrecision(5, 2);
        builder.Property(d => d.UrlMapa).HasMaxLength(1000);
    }
}
