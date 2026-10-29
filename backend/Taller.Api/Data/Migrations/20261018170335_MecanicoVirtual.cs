using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MecanicoVirtual : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConversacionesMecanico",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Titulo = table.Column<string>(type: "character varying(120)", maxLength: 120, nullable: false),
                    Usuario = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Creada = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Actualizada = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversacionesMecanico", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MensajesMecanico",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ConversacionMecanicoId = table.Column<int>(type: "integer", nullable: false),
                    EsUsuario = table.Column<bool>(type: "boolean", nullable: false),
                    Texto = table.Column<string>(type: "character varying(40000)", maxLength: 40000, nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MensajesMecanico", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MensajesMecanico_ConversacionesMecanico_ConversacionMecanic~",
                        column: x => x.ConversacionMecanicoId,
                        principalTable: "ConversacionesMecanico",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConversacionesMecanico_Usuario_Actualizada",
                table: "ConversacionesMecanico",
                columns: new[] { "Usuario", "Actualizada" });

            migrationBuilder.CreateIndex(
                name: "IX_MensajesMecanico_ConversacionMecanicoId_Id",
                table: "MensajesMecanico",
                columns: new[] { "ConversacionMecanicoId", "Id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MensajesMecanico");

            migrationBuilder.DropTable(
                name: "ConversacionesMecanico");
        }
    }
}
