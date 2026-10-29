using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Documentacion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Motor",
                table: "Vehiculos",
                type: "character varying(30)",
                maxLength: 30,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "DocumentosTecnicos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Tipo = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    Marca = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Modelo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Motor = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    AnioDesde = table.Column<int>(type: "integer", nullable: true),
                    AnioHasta = table.Column<int>(type: "integer", nullable: true),
                    Sistema = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Notas = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Archivo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NombreOriginal = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TipoContenido = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    FechaAlta = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentosTecnicos", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EnlacesPortal",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Nombre = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Url = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Marca = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Orden = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EnlacesPortal", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UsosDocumentoAsistente",
                columns: table => new
                {
                    SesionAsistenteId = table.Column<int>(type: "integer", nullable: false),
                    DocumentoTecnicoId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UsosDocumentoAsistente", x => new { x.SesionAsistenteId, x.DocumentoTecnicoId });
                    table.ForeignKey(
                        name: "FK_UsosDocumentoAsistente_DocumentosTecnicos_DocumentoTecnicoId",
                        column: x => x.DocumentoTecnicoId,
                        principalTable: "DocumentosTecnicos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_UsosDocumentoAsistente_SesionesAsistente_SesionAsistenteId",
                        column: x => x.SesionAsistenteId,
                        principalTable: "SesionesAsistente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_DocumentosTecnicos_Marca",
                table: "DocumentosTecnicos",
                column: "Marca");

            migrationBuilder.CreateIndex(
                name: "IX_UsosDocumentoAsistente_DocumentoTecnicoId",
                table: "UsosDocumentoAsistente",
                column: "DocumentoTecnicoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EnlacesPortal");

            migrationBuilder.DropTable(
                name: "UsosDocumentoAsistente");

            migrationBuilder.DropTable(
                name: "DocumentosTecnicos");

            migrationBuilder.DropColumn(
                name: "Motor",
                table: "Vehiculos");
        }
    }
}
