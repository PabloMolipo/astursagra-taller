using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class ConversacionMecanicoConfiguration : IEntityTypeConfiguration<ConversacionMecanico>
{
    public void Configure(EntityTypeBuilder<ConversacionMecanico> builder)
    {
        builder.ToTable("ConversacionesMecanico");
        builder.Property(c => c.Titulo).HasMaxLength(120);
        builder.Property(c => c.Usuario).HasMaxLength(256);
        builder.HasIndex(c => new { c.Usuario, c.Actualizada });
        builder.HasIndex(c => new { c.OrdenTrabajoId, c.Usuario });
        // Al borrar la orden se borran sus conversaciones (y sus mensajes, en cascada).
        builder.HasOne<OrdenTrabajo>().WithMany().HasForeignKey(c => c.OrdenTrabajoId).OnDelete(DeleteBehavior.Cascade);
        builder.HasMany(c => c.Mensajes).WithOne().HasForeignKey(m => m.ConversacionMecanicoId).OnDelete(DeleteBehavior.Cascade);
    }
}

public class MensajeMecanicoConfiguration : IEntityTypeConfiguration<MensajeMecanico>
{
    public void Configure(EntityTypeBuilder<MensajeMecanico> builder)
    {
        builder.ToTable("MensajesMecanico");
        builder.Property(m => m.Texto).HasMaxLength(40000);
        builder.HasIndex(m => new { m.ConversacionMecanicoId, m.Id });
    }
}
