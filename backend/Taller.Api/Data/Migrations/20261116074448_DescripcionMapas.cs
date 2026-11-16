using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Taller.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DescripcionMapas : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Descripcion",
                table: "MapasCentralita",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EjeXNombre",
                table: "MapasCentralita",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EjeYNombre",
                table: "MapasCentralita",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Descripcion",
                table: "MapasBiblioteca",
                type: "character varying(300)",
                maxLength: 300,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EjeXNombre",
                table: "MapasBiblioteca",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EjeYNombre",
                table: "MapasBiblioteca",
                type: "character varying(60)",
                maxLength: 60,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Descripcion",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "EjeXNombre",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "EjeYNombre",
                table: "MapasCentralita");

            migrationBuilder.DropColumn(
                name: "Descripcion",
                table: "MapasBiblioteca");

            migrationBuilder.DropColumn(
                name: "EjeXNombre",
                table: "MapasBiblioteca");

            migrationBuilder.DropColumn(
                name: "EjeYNombre",
                table: "MapasBiblioteca");
        }
    }
}
