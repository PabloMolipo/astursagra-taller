using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class LecturaComparada : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "ComparadaConId",
                table: "Centralitas",
                type: "integer",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Centralitas_ComparadaConId",
                table: "Centralitas",
                column: "ComparadaConId");

            migrationBuilder.AddForeignKey(
                name: "FK_Centralitas_Centralitas_ComparadaConId",
                table: "Centralitas",
                column: "ComparadaConId",
                principalTable: "Centralitas",
                principalColumn: "Id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Centralitas_Centralitas_ComparadaConId",
                table: "Centralitas");

            migrationBuilder.DropIndex(
                name: "IX_Centralitas_ComparadaConId",
                table: "Centralitas");

            migrationBuilder.DropColumn(
                name: "ComparadaConId",
                table: "Centralitas");
        }
    }
}
