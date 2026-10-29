using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class MecanicoEnOrdenes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "OrdenTrabajoId",
                table: "ConversacionesMecanico",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConversacionesMecanico_OrdenTrabajoId_Usuario",
                table: "ConversacionesMecanico",
                columns: new[] { "OrdenTrabajoId", "Usuario" });

            migrationBuilder.AddForeignKey(
                name: "FK_ConversacionesMecanico_OrdenesTrabajo_OrdenTrabajoId",
                table: "ConversacionesMecanico",
                column: "OrdenTrabajoId",
                principalTable: "OrdenesTrabajo",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_ConversacionesMecanico_OrdenesTrabajo_OrdenTrabajoId",
                table: "ConversacionesMecanico");

            migrationBuilder.DropIndex(
                name: "IX_ConversacionesMecanico_OrdenTrabajoId_Usuario",
                table: "ConversacionesMecanico");

            migrationBuilder.DropColumn(
                name: "OrdenTrabajoId",
                table: "ConversacionesMecanico");
        }
    }
}
