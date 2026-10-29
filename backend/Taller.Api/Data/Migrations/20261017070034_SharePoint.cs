using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class SharePoint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "EliminadoEnSharePoint",
                table: "DocumentosTecnicos",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SharePointId",
                table: "DocumentosTecnicos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointRuta",
                table: "DocumentosTecnicos",
                type: "character varying(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SharePointVersion",
                table: "DocumentosTecnicos",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EstadoSincronizacion",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false),
                    EnlaceDelta = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    UltimaSincronizacion = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    UltimoResultado = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    UltimaConError = table.Column<bool>(type: "boolean", nullable: false),
                    Origen = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EstadoSincronizacion", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentosTecnicos_SharePointId",
                table: "DocumentosTecnicos",
                column: "SharePointId",
                unique: true,
                filter: "\"SharePointId\" IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EstadoSincronizacion");

            migrationBuilder.DropIndex(
                name: "IX_DocumentosTecnicos_SharePointId",
                table: "DocumentosTecnicos");

            migrationBuilder.DropColumn(
                name: "EliminadoEnSharePoint",
                table: "DocumentosTecnicos");

            migrationBuilder.DropColumn(
                name: "SharePointId",
                table: "DocumentosTecnicos");

            migrationBuilder.DropColumn(
                name: "SharePointRuta",
                table: "DocumentosTecnicos");

            migrationBuilder.DropColumn(
                name: "SharePointVersion",
                table: "DocumentosTecnicos");
        }
    }
}
