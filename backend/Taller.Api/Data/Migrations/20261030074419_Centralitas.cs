using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Centralitas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Centralitas",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Tipo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    NombreArchivo = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Archivo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    Sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Familia = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Hardware = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Software = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Referencia = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    VehiculoId = table.Column<int>(type: "integer", nullable: true),
                    Notas = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    FechaAlta = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Centralitas", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Centralitas_Vehiculos_VehiculoId",
                        column: x => x.VehiculoId,
                        principalTable: "Vehiculos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "MapasCentralita",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    CentralitaId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Origen = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Direccion = table.Column<int>(type: "integer", nullable: false),
                    Columnas = table.Column<int>(type: "integer", nullable: false),
                    Filas = table.Column<int>(type: "integer", nullable: false),
                    TipoDato = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BigEndian = table.Column<bool>(type: "boolean", nullable: false),
                    PorColumnas = table.Column<bool>(type: "boolean", nullable: false),
                    Factor = table.Column<double>(type: "double precision", nullable: false),
                    Desplazamiento = table.Column<double>(type: "double precision", nullable: false),
                    Unidad = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    EjeXDireccion = table.Column<int>(type: "integer", nullable: true),
                    EjeXTipo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EjeXFactor = table.Column<double>(type: "double precision", nullable: false),
                    EjeXUnidad = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    EjeYDireccion = table.Column<int>(type: "integer", nullable: true),
                    EjeYTipo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EjeYFactor = table.Column<double>(type: "double precision", nullable: false),
                    EjeYUnidad = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Notas = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MapasCentralita", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MapasCentralita_Centralitas_CentralitaId",
                        column: x => x.CentralitaId,
                        principalTable: "Centralitas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Centralitas_Sha256",
                table: "Centralitas",
                column: "Sha256");

            migrationBuilder.CreateIndex(
                name: "IX_Centralitas_Tipo",
                table: "Centralitas",
                column: "Tipo");

            migrationBuilder.CreateIndex(
                name: "IX_Centralitas_VehiculoId",
                table: "Centralitas",
                column: "VehiculoId");

            migrationBuilder.CreateIndex(
                name: "IX_MapasCentralita_CentralitaId_Direccion",
                table: "MapasCentralita",
                columns: new[] { "CentralitaId", "Direccion" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MapasCentralita");

            migrationBuilder.DropTable(
                name: "Centralitas");
        }
    }
}
