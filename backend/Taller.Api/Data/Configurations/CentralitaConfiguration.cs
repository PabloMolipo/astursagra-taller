using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class CentralitaConfiguration : IEntityTypeConfiguration<Centralita>
{
    public void Configure(EntityTypeBuilder<Centralita> builder)
    {
        builder.ToTable("Centralitas");
        builder.Property(c => c.Tipo).HasConversion<string>().HasMaxLength(20);
        builder.Property(c => c.Nombre).HasMaxLength(200);
        builder.Property(c => c.NombreArchivo).HasMaxLength(255);
        builder.Property(c => c.Archivo).HasMaxLength(100);
        builder.Property(c => c.Sha256).HasMaxLength(64);
        builder.Property(c => c.Familia).HasMaxLength(60);
        builder.Property(c => c.Hardware).HasMaxLength(60);
        builder.Property(c => c.Software).HasMaxLength(60);
        builder.Property(c => c.Referencia).HasMaxLength(60);
        builder.Property(c => c.Notas).HasMaxLength(4000);
        builder.HasIndex(c => c.Tipo);
        builder.HasIndex(c => c.VehiculoId);
        builder.HasIndex(c => c.Sha256);
        // Si se borra el vehículo, la lectura se conserva sin vincular.
        builder.HasOne(c => c.Vehiculo).WithMany().HasForeignKey(c => c.VehiculoId).OnDelete(DeleteBehavior.SetNull);
        builder.HasMany(c => c.Mapas).WithOne().HasForeignKey(m => m.CentralitaId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Centralita>().WithMany().HasForeignKey(c => c.ComparadaConId).OnDelete(DeleteBehavior.SetNull);
    }
}

/// <summary>Columnas comunes de las definiciones de mapas (de una lectura o de la biblioteca).</summary>
internal static class DefinicionMapaConfiguration
{
    public static void Configurar<T>(EntityTypeBuilder<T> builder) where T : DefinicionMapa
    {
        builder.Property(m => m.Nombre).HasMaxLength(200);
        builder.Property(m => m.Grupo).HasConversion<string>().HasMaxLength(20);
        builder.Property(m => m.TipoDato).HasConversion<string>().HasMaxLength(10);
        builder.Property(m => m.EjeXTipo).HasConversion<string>().HasMaxLength(10);
        builder.Property(m => m.EjeYTipo).HasConversion<string>().HasMaxLength(10);
        builder.Property(m => m.Unidad).HasMaxLength(30);
        builder.Property(m => m.EjeXUnidad).HasMaxLength(30);
        builder.Property(m => m.EjeYUnidad).HasMaxLength(30);
        builder.Property(m => m.EjeXValores).HasMaxLength(4000);
        builder.Property(m => m.EjeYValores).HasMaxLength(4000);
        builder.Property(m => m.Notas).HasMaxLength(2000);
        builder.Property(m => m.Descripcion).HasMaxLength(300);
        builder.Property(m => m.EjeXNombre).HasMaxLength(60);
        builder.Property(m => m.EjeYNombre).HasMaxLength(60);
    }
}

public class MapaCentralitaConfiguration : IEntityTypeConfiguration<MapaCentralita>
{
    public void Configure(EntityTypeBuilder<MapaCentralita> builder)
    {
        builder.ToTable("MapasCentralita");
        DefinicionMapaConfiguration.Configurar(builder);
        builder.Property(m => m.Origen).HasConversion<string>().HasMaxLength(20);
        builder.HasIndex(m => new { m.CentralitaId, m.Direccion });
    }
}

public class BibliotecaSoftwareConfiguration : IEntityTypeConfiguration<BibliotecaSoftware>
{
    public void Configure(EntityTypeBuilder<BibliotecaSoftware> builder)
    {
        builder.ToTable("BibliotecasSoftware");
        builder.Property(b => b.Clave).HasMaxLength(100);
        builder.Property(b => b.Familia).HasMaxLength(60);
        builder.Property(b => b.Software).HasMaxLength(60);
        builder.Property(b => b.Referencia).HasMaxLength(60);
        builder.HasIndex(b => b.Clave).IsUnique();
        builder.HasMany(b => b.Mapas).WithOne().HasForeignKey(m => m.BibliotecaSoftwareId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class MapaBibliotecaConfiguration : IEntityTypeConfiguration<MapaBiblioteca>
{
    public void Configure(EntityTypeBuilder<MapaBiblioteca> builder)
    {
        builder.ToTable("MapasBiblioteca");
        DefinicionMapaConfiguration.Configurar(builder);
        builder.HasIndex(m => new { m.BibliotecaSoftwareId, m.Direccion });
    }
}

public class ImportacionXdfConfiguration : IEntityTypeConfiguration<ImportacionXdf>
{
    public void Configure(EntityTypeBuilder<ImportacionXdf> builder)
    {
        builder.ToTable("ImportacionesXdf");
        builder.Property(i => i.Titulo).HasMaxLength(300);
        builder.Property(i => i.NombreArchivo).HasMaxLength(255);
        builder.Property(i => i.Archivo).HasMaxLength(100);
        builder.Property(i => i.Avisos).HasMaxLength(20000);
        // El registro se conserva aunque se borre la lectura; se borra con su biblioteca.
        builder.HasOne<BibliotecaSoftware>().WithMany().HasForeignKey(i => i.BibliotecaSoftwareId).OnDelete(DeleteBehavior.Cascade);
        builder.HasOne<Centralita>().WithMany().HasForeignKey(i => i.CentralitaId).OnDelete(DeleteBehavior.SetNull);
        builder.HasIndex(i => i.BibliotecaSoftwareId);
    }
}
