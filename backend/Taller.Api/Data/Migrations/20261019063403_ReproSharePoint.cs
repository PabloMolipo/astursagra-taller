using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ReproSharePoint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DriveId",
                table: "EstadoSincronizacion",
                type: "character varying(200)",
                maxLength: 200,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "CarpetasSharePoint",
                columns: table => new
                {
                    DriveId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ItemId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    PadreId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EsRaiz = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CarpetasSharePoint", x => new { x.DriveId, x.ItemId });
                });

            migrationBuilder.CreateTable(
                name: "Reprogramaciones",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    SharePointId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    WebUrl = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Modificada = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    VehiculoId = table.Column<int>(type: "integer", nullable: true),
                    VinculoManual = table.Column<bool>(type: "boolean", nullable: false),
                    Notas = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Reprogramaciones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Reprogramaciones_Vehiculos_VehiculoId",
                        column: x => x.VehiculoId,
                        principalTable: "Vehiculos",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "ArchivosReprogramacion",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ReprogramacionId = table.Column<int>(type: "integer", nullable: false),
                    SharePointId = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Nombre = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: false),
                    Ruta = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    Tamano = table.Column<long>(type: "bigint", nullable: false),
                    Modificado = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    WebUrl = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ArchivosReprogramacion", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ArchivosReprogramacion_Reprogramaciones_ReprogramacionId",
                        column: x => x.ReprogramacionId,
                        principalTable: "Reprogramaciones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ArchivosReprogramacion_ReprogramacionId",
                table: "ArchivosReprogramacion",
                column: "ReprogramacionId");

            migrationBuilder.CreateIndex(
                name: "IX_ArchivosReprogramacion_SharePointId",
                table: "ArchivosReprogramacion",
                column: "SharePointId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reprogramaciones_SharePointId",
                table: "Reprogramaciones",
                column: "SharePointId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Reprogramaciones_VehiculoId",
                table: "Reprogramaciones",
                column: "VehiculoId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ArchivosReprogramacion");

            migrationBuilder.DropTable(
                name: "CarpetasSharePoint");

            migrationBuilder.DropTable(
                name: "Reprogramaciones");

            migrationBuilder.DropColumn(
                name: "DriveId",
                table: "EstadoSincronizacion");
        }
    }
}
