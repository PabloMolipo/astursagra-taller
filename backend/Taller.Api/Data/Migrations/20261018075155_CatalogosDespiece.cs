using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CatalogosDespiece : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CatalogosDespiece",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    UrlVehiculo = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    UrlReferencia = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Marcas = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    AliasMarcas = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Activo = table.Column<bool>(type: "boolean", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CatalogosDespiece", x => x.Id);
                });

            migrationBuilder.InsertData(
                table: "CatalogosDespiece",
                columns: new[] { "Id", "Activo", "AliasMarcas", "Descripcion", "Marcas", "Nombre", "Orden", "UrlReferencia", "UrlVehiculo" },
                values: new object[,]
                {
                    { 1, true, null, "Despieces originales de BMW y MINI (también motos BMW), con referencias. Se abre con los 7 últimos caracteres del bastidor.", "BMW, MINI", "RealOEM", 1, "https://www.realoem.com/bmw/enUS/partxref?q={referencia}", "https://www.realoem.com/bmw/enUS/select?vin={vin7}" },
                    { 2, true, null, "Catálogos originales con despieces por grupos de muchas marcas (BMW, Mercedes, grupo VAG, Toyota, Nissan, Hyundai, Kia…). Se abre por bastidor.", null, "PartSouq", 2, "https://partsouq.com/en/search/all?q={referencia}", "https://partsouq.com/en/search/all?q={vin}" },
                    { 3, true, "Mercedes-Benz=mercedes, Mercedes Benz=mercedes, VW=volkswagen", "Despieces de unas 70 marcas de turismos. Abre la marca; dentro se busca por bastidor (se copia al pulsar). La versión gratuita tiene límites.", null, "7zap", 3, null, "https://7zap.com/es/catalog/cars/{marca-slug}/" }
                });

            // Los catálogos precargados usan los ids 1-3: la secuencia sigue desde ahí para que los nuevos no choquen.
            migrationBuilder.Sql("SELECT setval(pg_get_serial_sequence('\"CatalogosDespiece\"', 'Id'), 3);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CatalogosDespiece");
        }
    }
}
