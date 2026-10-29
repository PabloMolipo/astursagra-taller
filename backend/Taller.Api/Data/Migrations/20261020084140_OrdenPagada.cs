using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class OrdenPagada : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "FechaPago",
                table: "OrdenesTrabajo",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Pagado",
                table: "OrdenesTrabajo",
                type: "boolean",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "FechaPago",
                table: "OrdenesTrabajo");

            migrationBuilder.DropColumn(
                name: "Pagado",
                table: "OrdenesTrabajo");
        }
    }
}
