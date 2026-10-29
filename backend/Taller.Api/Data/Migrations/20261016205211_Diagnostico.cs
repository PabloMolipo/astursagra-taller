using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Diagnostico : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CodigosAveria",
                columns: table => new
                {
                    Codigo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: false),
                    Sistema = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Notas = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    EsPropio = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CodigosAveria", x => x.Codigo);
                });

            migrationBuilder.CreateTable(
                name: "FichasDiagnosis",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OrdenTrabajoId = table.Column<int>(type: "integer", nullable: false),
                    Sintomas = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    Conclusion = table.Column<string>(type: "character varying(4000)", maxLength: 4000, nullable: true),
                    FechaActualizacion = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_FichasDiagnosis", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FichasDiagnosis_OrdenesTrabajo_OrdenTrabajoId",
                        column: x => x.OrdenTrabajoId,
                        principalTable: "OrdenesTrabajo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SesionesAsistente",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    OrdenTrabajoId = table.Column<int>(type: "integer", nullable: true),
                    Titulo = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FechaCreacion = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    FechaActualizacion = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    HuellaFicha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    TokensEntrada = table.Column<long>(type: "bigint", nullable: false),
                    TokensSalida = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SesionesAsistente", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SesionesAsistente_OrdenesTrabajo_OrdenTrabajoId",
                        column: x => x.OrdenTrabajoId,
                        principalTable: "OrdenesTrabajo",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "AdjuntosDiagnosis",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FichaDiagnosisId = table.Column<int>(type: "integer", nullable: false),
                    Archivo = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    NombreOriginal = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    TipoContenido = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AdjuntosDiagnosis", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdjuntosDiagnosis_FichasDiagnosis_FichaDiagnosisId",
                        column: x => x.FichaDiagnosisId,
                        principalTable: "FichasDiagnosis",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "CodigosLeidos",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FichaDiagnosisId = table.Column<int>(type: "integer", nullable: false),
                    Codigo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(300)", maxLength: 300, nullable: true),
                    Estado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Nota = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CodigosLeidos", x => x.Id);
                    table.ForeignKey(
                        name: "FK_CodigosLeidos_FichasDiagnosis_FichaDiagnosisId",
                        column: x => x.FichaDiagnosisId,
                        principalTable: "FichasDiagnosis",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Mediciones",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FichaDiagnosisId = table.Column<int>(type: "integer", nullable: false),
                    Parametro = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Valor = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Unidad = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ValorEsperado = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: true),
                    Resultado = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Nota = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Mediciones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Mediciones_FichasDiagnosis_FichaDiagnosisId",
                        column: x => x.FichaDiagnosisId,
                        principalTable: "FichasDiagnosis",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PruebasDiagnosis",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FichaDiagnosisId = table.Column<int>(type: "integer", nullable: false),
                    Descripcion = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    Resultado = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PruebasDiagnosis", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PruebasDiagnosis_FichasDiagnosis_FichaDiagnosisId",
                        column: x => x.FichaDiagnosisId,
                        principalTable: "FichasDiagnosis",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MensajesAsistente",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SesionAsistenteId = table.Column<int>(type: "integer", nullable: false),
                    Orden = table.Column<int>(type: "integer", nullable: false),
                    Rol = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    BloquesJson = table.Column<string>(type: "text", nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MensajesAsistente", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MensajesAsistente_SesionesAsistente_SesionAsistenteId",
                        column: x => x.SesionAsistenteId,
                        principalTable: "SesionesAsistente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdjuntosDiagnosis_FichaDiagnosisId",
                table: "AdjuntosDiagnosis",
                column: "FichaDiagnosisId");

            migrationBuilder.CreateIndex(
                name: "IX_CodigosLeidos_Codigo",
                table: "CodigosLeidos",
                column: "Codigo");

            migrationBuilder.CreateIndex(
                name: "IX_CodigosLeidos_FichaDiagnosisId",
                table: "CodigosLeidos",
                column: "FichaDiagnosisId");

            migrationBuilder.CreateIndex(
                name: "IX_FichasDiagnosis_OrdenTrabajoId",
                table: "FichasDiagnosis",
                column: "OrdenTrabajoId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Mediciones_FichaDiagnosisId",
                table: "Mediciones",
                column: "FichaDiagnosisId");

            migrationBuilder.CreateIndex(
                name: "IX_MensajesAsistente_SesionAsistenteId_Orden",
                table: "MensajesAsistente",
                columns: new[] { "SesionAsistenteId", "Orden" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PruebasDiagnosis_FichaDiagnosisId",
                table: "PruebasDiagnosis",
                column: "FichaDiagnosisId");

            migrationBuilder.CreateIndex(
                name: "IX_SesionesAsistente_FechaActualizacion",
                table: "SesionesAsistente",
                column: "FechaActualizacion");

            migrationBuilder.CreateIndex(
                name: "IX_SesionesAsistente_OrdenTrabajoId",
                table: "SesionesAsistente",
                column: "OrdenTrabajoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdjuntosDiagnosis");

            migrationBuilder.DropTable(
                name: "CodigosAveria");

            migrationBuilder.DropTable(
                name: "CodigosLeidos");

            migrationBuilder.DropTable(
                name: "Mediciones");

            migrationBuilder.DropTable(
                name: "MensajesAsistente");

            migrationBuilder.DropTable(
                name: "PruebasDiagnosis");

            migrationBuilder.DropTable(
                name: "SesionesAsistente");

            migrationBuilder.DropTable(
                name: "FichasDiagnosis");
        }
    }
}
