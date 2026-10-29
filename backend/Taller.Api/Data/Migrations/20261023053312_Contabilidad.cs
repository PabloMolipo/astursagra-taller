using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Contabilidad : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "IvaPorDefecto",
                table: "DatosTaller",
                type: "numeric(5,2)",
                precision: 5,
                scale: 2,
                nullable: false,
                defaultValue: 21m);

            migrationBuilder.CreateTable(
                name: "Gastos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Fecha = table.Column<DateOnly>(type: "date", nullable: false),
                    Categoria = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Concepto = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Proveedor = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Importe = table.Column<decimal>(type: "numeric(12,2)", precision: 12, scale: 2, nullable: false),
                    MetodoPago = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Notas = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    OrdenTrabajoId = table.Column<int>(type: "integer", nullable: true),
                    Adjunto = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AdjuntoNombre = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    AdjuntoTipo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FechaAlta = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Gastos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Gastos_OrdenesTrabajo_OrdenTrabajoId",
                        column: x => x.OrdenTrabajoId,
                        principalTable: "OrdenesTrabajo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Gastos_Fecha",
                table: "Gastos",
                column: "Fecha");

            migrationBuilder.CreateIndex(
                name: "IX_Gastos_OrdenTrabajoId",
                table: "Gastos",
                column: "OrdenTrabajoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Gastos");

            migrationBuilder.DropColumn(
                name: "IvaPorDefecto",
                table: "DatosTaller");
        }
    }
}
