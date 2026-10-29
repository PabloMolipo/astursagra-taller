using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class ValoresReferencia : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ValorReferenciaId",
                table: "Mediciones",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ValoresReferencia",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    Parametro = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Categoria = table.Column<string>(type: "character varying(60)", maxLength: 60, nullable: false),
                    Condicion = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Minimo = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: true),
                    Maximo = table.Column<decimal>(type: "numeric(12,3)", precision: 12, scale: 3, nullable: true),
                    Unidad = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Combustible = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Aplicacion = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PidObd = table.Column<string>(type: "character varying(4)", maxLength: 4, nullable: true),
                    Notas = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EsPropio = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ValoresReferencia", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Mediciones_ValorReferenciaId",
                table: "Mediciones",
                column: "ValorReferenciaId");

            migrationBuilder.CreateIndex(
                name: "IX_ValoresReferencia_Categoria",
                table: "ValoresReferencia",
                column: "Categoria");

            migrationBuilder.AddForeignKey(
                name: "FK_Mediciones_ValoresReferencia_ValorReferenciaId",
                table: "Mediciones",
                column: "ValorReferenciaId",
                principalTable: "ValoresReferencia",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Mediciones_ValoresReferencia_ValorReferenciaId",
                table: "Mediciones");

            migrationBuilder.DropTable(
                name: "ValoresReferencia");

            migrationBuilder.DropIndex(
                name: "IX_Mediciones_ValorReferenciaId",
                table: "Mediciones");

            migrationBuilder.DropColumn(
                name: "ValorReferenciaId",
                table: "Mediciones");
        }
    }
}
