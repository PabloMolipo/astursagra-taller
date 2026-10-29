using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Domain;

namespace Taller.Api.Data;

public class TallerDbContext(DbContextOptions<TallerDbContext> options) : IdentityDbContext<Usuario>(options)
{
    public DbSet<Cliente> Clientes => Set<Cliente>();
    public DbSet<Vehiculo> Vehiculos => Set<Vehiculo>();
    public DbSet<OrdenTrabajo> OrdenesTrabajo => Set<OrdenTrabajo>();
    public DbSet<LineaTrabajo> LineasTrabajo => Set<LineaTrabajo>();
    public DbSet<MultimediaOrden> MultimediaOrdenes => Set<MultimediaOrden>();

    // Web pública
    public DbSet<Servicio> Servicios => Set<Servicio>();
    public DbSet<TrabajoRealizado> TrabajosRealizados => Set<TrabajoRealizado>();
    public DbSet<FotoTrabajo> FotosTrabajo => Set<FotoTrabajo>();
    public DbSet<DatosTaller> DatosTaller => Set<DatosTaller>();

    // Diagnóstico
    public DbSet<FichaDiagnosis> FichasDiagnosis => Set<FichaDiagnosis>();
    public DbSet<CodigoLeido> CodigosLeidos => Set<CodigoLeido>();
    public DbSet<AdjuntoDiagnosis> AdjuntosDiagnosis => Set<AdjuntoDiagnosis>();
    public DbSet<CodigoAveria> CodigosAveria => Set<CodigoAveria>();
    public DbSet<ValorReferencia> ValoresReferencia => Set<ValorReferencia>();
    public DbSet<DocumentoTecnico> DocumentosTecnicos => Set<DocumentoTecnico>();
    public DbSet<EnlacePortal> EnlacesPortal => Set<EnlacePortal>();
    public DbSet<CatalogoDespiece> CatalogosDespiece => Set<CatalogoDespiece>();
    public DbSet<ConsultaMatricula> ConsultasMatricula => Set<ConsultaMatricula>();
    public DbSet<ConversacionMecanico> ConversacionesMecanico => Set<ConversacionMecanico>();
    public DbSet<MensajeMecanico> MensajesMecanico => Set<MensajeMecanico>();
    public DbSet<UsoDocumentoAsistente> UsosDocumentoAsistente => Set<UsoDocumentoAsistente>();
    public DbSet<EstadoSincronizacion> EstadoSincronizacion => Set<EstadoSincronizacion>();
    public DbSet<Reprogramacion> Reprogramaciones => Set<Reprogramacion>();
    public DbSet<Gasto> Gastos => Set<Gasto>();
    public DbSet<Factura> Facturas => Set<Factura>();
    public DbSet<Visita> Visitas => Set<Visita>();
    public DbSet<ArchivoReprogramacion> ArchivosReprogramacion => Set<ArchivoReprogramacion>();
    public DbSet<CarpetaSharePoint> CarpetasSharePoint => Set<CarpetaSharePoint>();
    public DbSet<SesionAsistente> SesionesAsistente => Set<SesionAsistente>();
    public DbSet<MensajeAsistente> MensajesAsistente => Set<MensajeAsistente>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Tablas de Identity (AspNetUsers, AspNetRoles…).
        base.OnModelCreating(modelBuilder);
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TallerDbContext).Assembly);
    }
}
