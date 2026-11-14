using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ImportacionesXdf : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ImportacionesXdf",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    BibliotecaSoftwareId = table.Column<int>(type: "integer", nullable: true),
                    CentralitaId = table.Column<int>(type: "integer", nullable: true),
                    Titulo = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    NombreArchivo = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Archivo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    Importados = table.Column<int>(type: "integer", nullable: false),
                    Omitidos = table.Column<int>(type: "integer", nullable: false),
                    Avisos = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: true),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportacionesXdf", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ImportacionesXdf_BibliotecasSoftware_BibliotecaSoftwareId",
                        column: x => x.BibliotecaSoftwareId,
                        principalTable: "BibliotecasSoftware",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_ImportacionesXdf_Centralitas_CentralitaId",
                        column: x => x.CentralitaId,
                        principalTable: "Centralitas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ImportacionesXdf_BibliotecaSoftwareId",
                table: "ImportacionesXdf",
                column: "BibliotecaSoftwareId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportacionesXdf_CentralitaId",
                table: "ImportacionesXdf",
                column: "CentralitaId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ImportacionesXdf");
        }
    }
}
