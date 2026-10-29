using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Taller.Api.Auth;
using Taller.Api.Contracts;
using Taller.Api.Data;
using Taller.Api.Domain;
using Taller.Api.Infrastructure;

namespace Taller.Api.Controllers;

[ApiController]
[Authorize(Roles = Roles.Taller)]
[Route("api/clientes")]
public class ClientesController(TallerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IReadOnlyList<ClienteListItem>> Listar([FromQuery] string? q, CancellationToken ct)
    {
        var query = db.Clientes.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(q))
        {
            var patron = $"%{q.Trim()}%";
            query = query.Where(c =>
                EF.Functions.ILike(c.Nombre, patron) ||
                EF.Functions.ILike(c.NifCif!, patron) ||
                EF.Functions.ILike(c.Telefono!, patron));
        }

        return await query
            .OrderBy(c => c.Nombre)
            .Take(200)
            .Select(c => new ClienteListItem(c.Id, c.Tipo, c.Nombre, c.NifCif, c.Telefono, c.Poblacion, c.Vehiculos.Count))
            .ToListAsync(ct);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<ClienteDetalle>> Obtener(int id, CancellationToken ct)
    {
        var c = await db.Clientes.AsNoTracking()
            .Include(c => c.Vehiculos)
            .FirstOrDefaultAsync(c => c.Id == id, ct);

        if (c is null)
        {
            return NotFound();
        }

        return ToDetalle(c);
    }

    [HttpPost]
    public async Task<ActionResult<ClienteDetalle>> Crear(ClienteRequest req, CancellationToken ct)
    {
        var cliente = new Cliente { Nombre = "", FechaAlta = DateTimeOffset.UtcNow };
        Aplicar(cliente, req);
        db.Clientes.Add(cliente);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(Obtener), new { id = cliente.Id }, ToDetalle(cliente));
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<ClienteDetalle>> Actualizar(int id, ClienteRequest req, CancellationToken ct)
    {
        var cliente = await db.Clientes.Include(c => c.Vehiculos).FirstOrDefaultAsync(c => c.Id == id, ct);
        if (cliente is null)
        {
            return NotFound();
        }

        Aplicar(cliente, req);
        await db.SaveChangesAsync(ct);
        return ToDetalle(cliente);
    }

    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Eliminar(int id, CancellationToken ct)
    {
        var borrados = await db.Clientes.Where(c => c.Id == id).ExecuteDeleteAsync(ct);
        return borrados == 0 ? NotFound() : NoContent();
    }

    private static void Aplicar(Cliente c, ClienteRequest req)
    {
        c.Tipo = req.Tipo;
        c.Nombre = req.Nombre.Trim();
        c.NifCif = Normalizar.Codigo(req.NifCif);
        c.Telefono = Normalizar.Texto(req.Telefono);
        c.Email = Normalizar.Texto(req.Email);
        c.Direccion = Normalizar.Texto(req.Direccion);
        c.CodigoPostal = Normalizar.Texto(req.CodigoPostal);
        c.Poblacion = Normalizar.Texto(req.Poblacion);
        c.Provincia = Normalizar.Texto(req.Provincia);
        c.Notas = Normalizar.Texto(req.Notas);
    }

    private static ClienteDetalle ToDetalle(Cliente c) => new(
        c.Id, c.Tipo, c.Nombre, c.NifCif, c.Telefono, c.Email, c.Direccion, c.CodigoPostal,
        c.Poblacion, c.Provincia, c.Notas, c.FechaAlta,
        c.Vehiculos
            .OrderBy(v => v.Marca)
            .Select(v => new VehiculoListItem(v.Id, v.Tipo, v.Matricula, v.Bastidor, v.Marca, v.Modelo, v.Anio, c.Id, c.Nombre, v.Motor))
            .ToList());
}
