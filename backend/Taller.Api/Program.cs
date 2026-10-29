using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Taller.Api.Auth;
using Taller.Api.Data;
using Taller.Api.Diagnostico;
using Taller.Api.Domain;
using Taller.Api.Importacion;
using Taller.Api.Infrastructure;
using Taller.Api.Integraciones;

// Comandos de consola (en lugar de arrancar la API):
//   importar-excel <ruta.xlsx> [--hoja Taller] [--anio 2026] [--sin-agrupar] [--simular] [--reemplazar]
//   crear-usuario-taller <usuario>      Crea (o restablece) un usuario del taller con contraseña temporal.
//   sincronizar-sharepoint              Sincroniza la documentación y REPRO de SharePoint y termina (para un trabajo
//                                       programado: en Cloud Run, sin peticiones, el servicio apenas tiene CPU).
string[] comandos = ["importar-excel", "crear-usuario-taller", "sincronizar-sharepoint"];
var comando = args.Length > 0 && comandos.Contains(args[0]) ? args[0] : null;

var builder = WebApplication.CreateBuilder(comando is null ? args : []);

builder.Services.AddDbContext<TallerDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Taller")));

builder.Services.AddIdentity<Usuario, IdentityRole>(o =>
    {
        o.Password.RequiredLength = 8;
        o.Password.RequireDigit = true;
        o.Password.RequireLowercase = true;
        o.Password.RequireUppercase = false;
        o.Password.RequireNonAlphanumeric = false;
        o.Lockout.MaxFailedAccessAttempts = 5;
        o.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(10);
        o.Lockout.AllowedForNewUsers = true;
        o.User.RequireUniqueEmail = false;
    })
    .AddEntityFrameworkStores<TallerDbContext>()
    .AddErrorDescriber<ErroresIdentityEs>()
    .AddClaimsPrincipalFactory<TallerClaimsFactory>()
    .AddDefaultTokenProviders();

builder.Services.ConfigureApplicationCookie(o =>
{
    o.Cookie.Name = "astursagra.sesion";
    o.Cookie.HttpOnly = true;
    o.Cookie.SameSite = SameSiteMode.Strict;
    o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
    o.ExpireTimeSpan = TimeSpan.FromHours(8);
    o.SlidingExpiration = true;
    // Es una API: nada de redirigir a páginas de login, solo 401/403.
    o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
    o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
});

// Comprueba el sello de seguridad en cada petición: al restablecer o cambiar una contraseña,
// las sesiones abiertas con la anterior dejan de valer al momento (por defecto tardaría 30 minutos).
builder.Services.Configure<SecurityStampValidatorOptions>(o => o.ValidationInterval = TimeSpan.Zero);

// Por defecto todo exige sesión; lo público se marca con [AllowAnonymous].
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

builder.Services.AddControllers(o => o.Filters.Add<RequierePasswordDefinitiva>())
    .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddScoped<GestorAccesos>();
builder.Services.AddSingleton<AlmacenMedia>();
builder.Services.AddSingleton<AlmacenPrivado>();
builder.Services.AddSingleton<AlmacenMultimedia>();
builder.Services.AddSingleton<ClienteAnthropic>();
builder.Services.AddScoped<HistorialDiagnostico>();
builder.Services.AddScoped<DocumentacionTecnica>();

// SharePoint (Microsoft Graph): credenciales en la sección SharePoint de la configuración.
var opcionesSharePoint = builder.Configuration.GetSection("SharePoint").Get<OpcionesSharePoint>() ?? new OpcionesSharePoint();
builder.Services.AddSingleton(opcionesSharePoint);
builder.Services.AddSingleton(new ClienteGraph(new HttpClient { Timeout = TimeSpan.FromMinutes(5) }, opcionesSharePoint));
builder.Services.AddScoped<ArbolSharePoint>();
builder.Services.AddScoped<SincronizadorSharePoint>();
builder.Services.AddScoped<SincronizadorRepro>();

// MatriculaAPI (datos y bastidor por matrícula, de pago por consulta): usuario de la cuenta en MatriculaApi:Usuario.
var opcionesMatricula = builder.Configuration.GetSection("MatriculaApi").Get<OpcionesMatriculaApi>() ?? new OpcionesMatriculaApi();
builder.Services.AddSingleton(opcionesMatricula);
builder.Services.AddSingleton(new ClienteMatriculaApi(new HttpClient { Timeout = TimeSpan.FromSeconds(30) }, opcionesMatricula));

// Vinalfa (despiece original por bastidor): token de API de la suscripción en Vinalfa:Token.
var opcionesVinalfa = builder.Configuration.GetSection("Vinalfa").Get<OpcionesVinalfa>() ?? new OpcionesVinalfa();
builder.Services.AddSingleton(opcionesVinalfa);
builder.Services.AddSingleton(new ClienteVinalfa(new HttpClient { Timeout = TimeSpan.FromSeconds(30) }, opcionesVinalfa));
// Mecánico virtual (Gemini, modelo económico): clave en Gemini:ApiKey.
var opcionesGemini = builder.Configuration.GetSection("Gemini").Get<OpcionesGemini>() ?? new OpcionesGemini();
builder.Services.AddSingleton(opcionesGemini);
builder.Services.AddSingleton<MecanicoVirtual>();
builder.Services.AddSingleton<GeneradorImagenVehiculo>();
builder.Services.AddSingleton<ServicioSincronizacion>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ServicioSincronizacion>());

// Estadísticas de visitas a la web: zona por IP con una base de datos local (GeoIp:Ruta) y registro en segundo plano.
builder.Services.AddSingleton<Geolocalizador>();
builder.Services.AddSingleton<RegistroVisitas>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RegistroVisitas>());
builder.Services.AddScoped<AsistenteDiagnostico>();
// Detrás de un proxy (Cloud Run termina el HTTPS): se confía en X-Forwarded-Proto/For para saber que la petición
// llegó por HTTPS (cookies seguras, redirección) y la IP real del cliente.
builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

// Claves de las cookies de sesión: en producción se guardan en almacenamiento compartido (DataProtection:Ruta) para
// que las sesiones sigan valiendo tras un reinicio o entre instancias.
if (builder.Configuration["DataProtection:Ruta"] is { Length: > 0 } rutaClaves)
{
    builder.Services.AddDataProtection().SetApplicationName("astursagra").PersistKeysToFileSystem(Directory.CreateDirectory(rutaClaves));
}

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<DbExceptionHandler>();
// Learn more about configuring OpenAPI at https://aka.ms/aspnet/openapi
builder.Services.AddOpenApi();

var app = builder.Build();

app.UseForwardedHeaders();
app.UseExceptionHandler();

using (var scope = app.Services.CreateScope())
{
    if (app.Environment.IsDevelopment() || app.Configuration.GetValue<bool>("BaseDatos:MigrarAlArrancar"))
    {
        // En desarrollo (y en producción si se configura) se aplican las migraciones pendientes al arrancar.
        await scope.ServiceProvider.GetRequiredService<TallerDbContext>().Database.MigrateAsync();
    }

    await ContenidoInicial.CrearSiFaltaAsync(scope.ServiceProvider.GetRequiredService<TallerDbContext>());

    var roles = scope.ServiceProvider.GetRequiredService<RoleManager<IdentityRole>>();
    foreach (var rol in Roles.Todos)
    {
        if (!await roles.RoleExistsAsync(rol))
        {
            await roles.CreateAsync(new IdentityRole(rol));
        }
    }
}

switch (comando)
{
    case "importar-excel":
        return await ImportarExcelAsync(app, args);
    case "sincronizar-sharepoint":
        return await SincronizarSharePointAsync(app);
    case "crear-usuario-taller":
        return await CrearUsuarioTallerAsync(app, args);
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
}

app.UseHttpsRedirection();

// Páginas vistas de la web (no API ni archivos), para las estadísticas. El tipo de visitante sale de la cookie de sesión.
app.Use(async (ctx, next) =>
{
    if (RegistroVisitas.EsPagina(ctx.Request))
    {
        var sesion = await ctx.AuthenticateAsync(IdentityConstants.ApplicationScheme);
        var tipo = sesion.Principal?.IsInRole(Roles.Taller) == true ? TipoVisitante.Taller
            : sesion.Principal?.IsInRole(Roles.Cliente) == true ? TipoVisitante.Cliente
            : TipoVisitante.Publico;
        ctx.RequestServices.GetRequiredService<RegistroVisitas>().Anotar(ctx, tipo);
    }
    await next();
});

// Fotos de la web pública (antes de la autenticación: son públicas).
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(app.Services.GetRequiredService<AlmacenMedia>().Carpeta),
    RequestPath = AlmacenMedia.RutaPublica
});
// Una foto que no existe es un 404 (no un 401 ni la web). Va como rama aparte y no como endpoint: un endpoint en
// /media haría que el middleware de archivos estáticos dejara de servir las fotos que sí existen.
app.MapWhen(ctx => ctx.Request.Path.StartsWithSegments(AlmacenMedia.RutaPublica),
    rama => rama.Run(ctx => { ctx.Response.StatusCode = StatusCodes.Status404NotFound; return Task.CompletedTask; }));

// La web (Angular compilado en wwwroot, en producción). Las páginas no se cachean para que se vea cada despliegue;
// los .js/.css llevan un hash en el nombre y se cachean un año; logos e iconos, una hora.
app.UseDefaultFiles();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        var nombre = ctx.File.Name;
        ctx.Context.Response.Headers.CacheControl =
            nombre.EndsWith(".html", StringComparison.OrdinalIgnoreCase) ? "no-cache"
            : System.Text.RegularExpressions.Regex.IsMatch(nombre, @"-[A-Z0-9]{8,}.(js|css)$") ? "public, max-age=31536000, immutable"
            : "public, max-age=3600";
    }
});

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Rutas de la web (las resuelve Angular): cualquier dirección que no sea de la API ni un archivo devuelve index.html.
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? "wwwroot", "index.html")))
{
    app.MapFallback("/api/{**resto}", () => Results.NotFound()).AllowAnonymous();
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "no-cache"
    }).AllowAnonymous();
}

app.Run();
return 0;

static async Task<int> ImportarExcelAsync(WebApplication app, string[] args)
{
    if (args.Length < 2)
    {
        Console.WriteLine("Uso: importar-excel <ruta.xlsx> [--hoja Taller] [--anio 2026] [--sin-agrupar] [--simular] [--reemplazar]");
        return 1;
    }

    var hoja = Array.IndexOf(args, "--hoja") is var i and > 0 && i + 1 < args.Length ? args[i + 1] : "Taller";
    int? anio = Array.IndexOf(args, "--anio") is var j and > 0 && j + 1 < args.Length && int.TryParse(args[j + 1], out var a) ? a : null;
    var opciones = new ImportadorExcel.Opciones(
        args[1], hoja, args.Contains("--simular"), args.Contains("--reemplazar"), anio, args.Contains("--sin-agrupar"));

    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<TallerDbContext>();
    return await new ImportadorExcel(db, Console.Out).EjecutarAsync(opciones);
}

static async Task<int> SincronizarSharePointAsync(WebApplication app)
{
    var opciones = app.Services.GetRequiredService<OpcionesSharePoint>();
    if (!opciones.Configurado)
    {
        Console.WriteLine("SharePoint no está configurado (TenantId, ClientId, ClientSecret y SiteUrl).");
        return 1;
    }
    var codigo = 0;
    try
    {
        using var scope = app.Services.CreateScope();
        var r = await scope.ServiceProvider.GetRequiredService<SincronizadorSharePoint>().SincronizarAsync(_ => { }, CancellationToken.None);
        Console.WriteLine($"Documentación: {r}");
    }
    catch (Exception e)
    {
        Console.WriteLine($"Documentación: error. {(e is ErrorGraph ? e.Message : e.ToString())}");
        codigo = 1;
    }
    if (!string.IsNullOrWhiteSpace(opciones.BibliotecaRepro))
    {
        try
        {
            using var scope = app.Services.CreateScope();
            var r = await scope.ServiceProvider.GetRequiredService<SincronizadorRepro>().SincronizarAsync(_ => { }, CancellationToken.None);
            Console.WriteLine($"REPRO: {r.Nuevos} nuevas, {r.Actualizados} actualizadas, {r.Eliminados} eliminadas");
        }
        catch (Exception e)
        {
            Console.WriteLine($"REPRO: error. {(e is ErrorGraph ? e.Message : e.ToString())}");
            codigo = 1;
        }
    }
    return codigo;
}

static async Task<int> CrearUsuarioTallerAsync(WebApplication app, string[] args)
{
    if (args.Length < 2)
    {
        Console.WriteLine("Uso: crear-usuario-taller <usuario>");
        return 1;
    }

    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<Usuario>>();
    var accesos = scope.ServiceProvider.GetRequiredService<GestorAccesos>();
    var nombre = GestorAccesos.Normalizar(args[1]);

    var usuario = await users.FindByNameAsync(nombre);
    if (usuario is not null && !await users.IsInRoleAsync(usuario, Roles.Taller))
    {
        Console.WriteLine($"\"{nombre}\" existe pero no es un usuario del taller.");
        return 1;
    }

    var r = usuario is null ? await accesos.CrearAsync(nombre, Roles.Taller) : await accesos.RestablecerAsync(usuario);
    var resultado = r.Resultado;
    var password = r.PasswordTemporal;

    if (!resultado.Succeeded)
    {
        Console.WriteLine(string.Join("\n", resultado.Errors.Select(e => e.Description)));
        return 1;
    }

    Console.WriteLine($"Usuario del taller: {nombre}");
    Console.WriteLine($"Contraseña temporal: {password}");
    Console.WriteLine("Al entrar por primera vez tendrás que cambiarla.");
    return 0;
}
