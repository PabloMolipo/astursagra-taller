using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class BibliotecaMapas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<double>(
                name: "EjeXDesplazamiento",
                table: "MapasCentralita",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "EjeXValores",
                table: "MapasCentralita",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<double>(
                name: "EjeYDesplazamiento",
                table: "MapasCentralita",
                type: "double precision",
                nullable: false,
                defaultValue: 0.0);

            migrationBuilder.AddColumn<string>(
                name: "EjeYValores",
                table: "MapasCentralita",
                type: "character varying(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "BibliotecasSoftware",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Clave = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Familia = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Software = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Referencia = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    FechaAlta = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Modificada = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BibliotecasSoftware", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MapasBiblioteca",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    BibliotecaSoftwareId = table.Column<int>(type: "integer", nullable: false),
                    Nombre = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Grupo = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
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
                    EjeXDesplazamiento = table.Column<double>(type: "double precision", nullable: false),
                    EjeXUnidad = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    EjeXValores = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    EjeYDireccion = table.Column<int>(type: "integer", nullable: true),
                    EjeYTipo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EjeYFactor = table.Column<double>(type: "double precision", nullable: false),
                    EjeYDesplazamiento = table.Column<double>(type: "double precision", nullable: false),
                    EjeYUnidad = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    EjeYValores = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Notas = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MapasBiblioteca", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MapasBiblioteca_BibliotecasSoftware_BibliotecaSoftwareId",
                        column: x => x.BibliotecaSoftwareId,
                        principalTable: "BibliotecasSoftware",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BibliotecasSoftware_Clave",
                table: "BibliotecasSoftware",
                column: "Clave",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MapasBiblioteca_BibliotecaSoftwareId_Direccion",
                table: "MapasBiblioteca",
                columns: new[] { "BibliotecaSoftwareId", "Direccion" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MapasBiblioteca");

            migrationBuilder.DropTable(
                name: "BibliotecasSoftware");

            migrationBuilder.DropColumn(
                name: "EjeXDesplazamiento",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "EjeXValores",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "EjeYDesplazamiento",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "EjeYValores",
                table: "MapasCentralita");
        }
    }
}
