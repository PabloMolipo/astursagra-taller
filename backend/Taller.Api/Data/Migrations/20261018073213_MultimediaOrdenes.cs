using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MultimediaOrdenes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MultimediaOrdenes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OrdenTrabajoId = table.Column<int>(type: "integer", nullable: false),
                    Etapa = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    VisibleCliente = table.Column<bool>(type: "boolean", nullable: false),
                    Archivo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NombreOriginal = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TipoContenido = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    SubidoPor = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MultimediaOrdenes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MultimediaOrdenes_OrdenesTrabajo_OrdenTrabajoId",
                        column: x => x.OrdenTrabajoId,
                        principalTable: "OrdenesTrabajo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MultimediaOrdenes_OrdenTrabajoId_Fecha",
                table: "MultimediaOrdenes",
                columns: new[] { "OrdenTrabajoId", "Fecha" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MultimediaOrdenes");
        }
    }
}
