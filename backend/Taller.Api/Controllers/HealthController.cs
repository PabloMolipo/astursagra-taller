using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Taller.Api.Data;

namespace Taller.Api.Controllers;

[ApiController]
[AllowAnonymous]
[Route("api/[controller]")]
public class HealthController(TallerDbContext db) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var database = await db.Database.CanConnectAsync(ct);
        return Ok(new { status = "ok", database = database ? "up" : "down" });
    }
}
