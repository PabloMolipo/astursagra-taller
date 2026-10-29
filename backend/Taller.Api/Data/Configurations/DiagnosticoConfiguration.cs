using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class FichaDiagnosisConfiguration : IEntityTypeConfiguration<FichaDiagnosis>
{
    public void Configure(EntityTypeBuilder<FichaDiagnosis> builder)
    {
        builder.ToTable("FichasDiagnosis");
        builder.Property(f => f.Sintomas).HasMaxLength(4000);
        builder.Property(f => f.Conclusion).HasMaxLength(4000);
        builder.HasIndex(f => f.OrdenTrabajoId).IsUnique();
        builder.HasOne(f => f.OrdenTrabajo).WithOne().HasForeignKey<FichaDiagnosis>(f => f.OrdenTrabajoId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(f => f.Codigos).WithOne().HasForeignKey(c => c.FichaDiagnosisId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(f => f.Mediciones).WithOne().HasForeignKey(m => m.FichaDiagnosisId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(f => f.Pruebas).WithOne().HasForeignKey(p => p.FichaDiagnosisId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(f => f.Adjuntos).WithOne(a => a.FichaDiagnosis).HasForeignKey(a => a.FichaDiagnosisId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class CodigoLeidoConfiguration : IEntityTypeConfiguration<CodigoLeido>
{
    public void Configure(EntityTypeBuilder<CodigoLeido> builder)
    {
        builder.ToTable("CodigosLeidos");
        builder.Property(c => c.Codigo).HasMaxLength(10);
        builder.Property(c => c.Descripcion).HasMaxLength(300);
        builder.Property(c => c.Estado).HasConversion<string>().HasMaxLength(20);
        builder.Property(c => c.Nota).HasMaxLength(500);
        // Para buscar casos del taller por código.
        builder.HasIndex(c => c.Codigo);
    }
}

public class MedicionConfiguration : IEntityTypeConfiguration<Medicion>
{
    public void Configure(EntityTypeBuilder<Medicion> builder)
    {
        builder.ToTable("Mediciones");
        builder.Property(m => m.Parametro).HasMaxLength(150);
        builder.Property(m => m.Valor).HasMaxLength(60);
        builder.Property(m => m.Unidad).HasMaxLength(20);
        builder.Property(m => m.ValorEsperado).HasMaxLength(60);
        builder.Property(m => m.Resultado).HasConversion<string>().HasMaxLength(20);
        builder.Property(m => m.Nota).HasMaxLength(500);
        // Si se borra la referencia, la medición se conserva sin enlace.
        builder.HasOne(m => m.ValorReferencia).WithMany().HasForeignKey(m => m.ValorReferenciaId).OnDelete(DeleteBehavior.SetNull);
    }
}

public class ValorReferenciaConfiguration : IEntityTypeConfiguration<ValorReferencia>
{
    public void Configure(EntityTypeBuilder<ValorReferencia> builder)
    {
        builder.ToTable("ValoresReferencia");
        builder.Property(v => v.Parametro).HasMaxLength(150);
        builder.Property(v => v.Categoria).HasMaxLength(60);
        builder.Property(v => v.Condicion).HasMaxLength(200);
        builder.Property(v => v.Minimo).HasPrecision(12, 3);
        builder.Property(v => v.Maximo).HasPrecision(12, 3);
        builder.Property(v => v.Unidad).HasMaxLength(20);
        builder.Property(v => v.Combustible).HasConversion<string>().HasMaxLength(20);
        builder.Property(v => v.Aplicacion).HasMaxLength(200);
        builder.Property(v => v.PidObd).HasMaxLength(4);
        builder.Property(v => v.Notas).HasMaxLength(1000);
        builder.HasIndex(v => v.Categoria);
    }
}

public class PruebaDiagnosisConfiguration : IEntityTypeConfiguration<PruebaDiagnosis>
{
    public void Configure(EntityTypeBuilder<PruebaDiagnosis> builder)
    {
        builder.ToTable("PruebasDiagnosis");
        builder.Property(p => p.Descripcion).HasMaxLength(500);
        builder.Property(p => p.Resultado).HasMaxLength(1000);
    }
}

public class AdjuntoDiagnosisConfiguration : IEntityTypeConfiguration<AdjuntoDiagnosis>
{
    public void Configure(EntityTypeBuilder<AdjuntoDiagnosis> builder)
    {
        builder.ToTable("AdjuntosDiagnosis");
        builder.Property(a => a.Archivo).HasMaxLength(100);
        builder.Property(a => a.NombreOriginal).HasMaxLength(255);
        builder.Property(a => a.TipoContenido).HasMaxLength(100);
    }
}

public class CodigoAveriaConfiguration : IEntityTypeConfiguration<CodigoAveria>
{
    public void Configure(EntityTypeBuilder<CodigoAveria> builder)
    {
        builder.ToTable("CodigosAveria");
        builder.HasKey(c => c.Codigo);
        builder.Property(c => c.Codigo).HasMaxLength(10);
        builder.Property(c => c.Descripcion).HasMaxLength(300);
        builder.Property(c => c.Sistema).HasMaxLength(60);
        builder.Property(c => c.Notas).HasMaxLength(4000);
    }
}

public class SesionAsistenteConfiguration : IEntityTypeConfiguration<SesionAsistente>
{
    public void Configure(EntityTypeBuilder<SesionAsistente> builder)
    {
        builder.ToTable("SesionesAsistente");
        builder.Property(s => s.Titulo).HasMaxLength(200);
        builder.Property(s => s.HuellaFicha).HasMaxLength(64);
        builder.HasOne(s => s.OrdenTrabajo).WithMany().HasForeignKey(s => s.OrdenTrabajoId).OnDelete(DeleteBehavior.SetNull);
        builder.HasMany(s => s.Mensajes).WithOne().HasForeignKey(m => m.SesionAsistenteId).OnDelete(DeleteBehavior.Cascade);
        builder.HasIndex(s => s.FechaActualizacion);
    }
}

public class MensajeAsistenteConfiguration : IEntityTypeConfiguration<MensajeAsistente>
{
    public void Configure(EntityTypeBuilder<MensajeAsistente> builder)
    {
        builder.ToTable("MensajesAsistente");
        builder.Property(m => m.Rol).HasMaxLength(10);
        builder.Property(m => m.BloquesJson).HasColumnType("text");
        builder.HasIndex(m => new { m.SesionAsistenteId, m.Orden }).IsUnique();
    }
}
