using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ConsultasMatricula : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConsultasMatricula",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Matricula = table.Column<string>(type: "character varying(15)", maxLength: 15, nullable: false),
                    Moto = table.Column<bool>(type: "boolean", nullable: false),
                    Respuesta = table.Column<string>(type: "character varying(20000)", maxLength: 20000, nullable: false),
                    Fecha = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    Usuario = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsultasMatricula", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConsultasMatricula_Matricula_Moto",
                table: "ConsultasMatricula",
                columns: new[] { "Matricula", "Moto" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConsultasMatricula");
        }
    }
}
