using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Taller.Api.Domain;

namespace Taller.Api.Data.Configurations;

public class UsuarioConfiguration : IEntityTypeConfiguration<Usuario>
{
    public void Configure(EntityTypeBuilder<Usuario> builder)
    {
        // Un cliente tiene como mucho un acceso; si se borra el cliente, se borra su acceso.
        builder.HasIndex(u => u.ClienteId).IsUnique().HasFilter("\"ClienteId\" IS NOT NULL");
        builder.HasOne(u => u.Cliente)
            .WithOne()
            .HasForeignKey<Usuario>(u => u.ClienteId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
