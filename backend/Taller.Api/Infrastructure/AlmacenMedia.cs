namespace Taller.Api.Infrastructure;

/// <summary>Archivo admitido: extensión con la que se guarda y tipo MIME con el que se sirve.</summary>
public record TipoArchivo(string Extension, string TipoContenido);

/// <summary>
/// Guarda archivos subidos en una carpeta del servidor con nombre aleatorio, comprobando la firma del contenido
/// (no la extensión que diga el navegador).
/// </summary>
public abstract class AlmacenArchivos
{
    public string Carpeta { get; }
    public abstract long TamanoMaximo { get; }
    protected abstract bool Admite(TipoArchivo tipo);

    protected AlmacenArchivos(string ruta, IWebHostEnvironment env)
    {
        Carpeta = Path.GetFullPath(Path.IsPathRooted(ruta) ? ruta : Path.Combine(env.ContentRootPath, ruta));
        Directory.CreateDirectory(Carpeta);
    }

    /// <summary>Devuelve el nombre guardado y su tipo, o null si el archivo no es de un tipo admitido o es demasiado grande.</summary>
    public async Task<(string Nombre, TipoArchivo Tipo)?> GuardarAsync(IFormFile archivo, CancellationToken ct)
    {
        if (archivo.Length == 0 || archivo.Length > TamanoMaximo)
        {
            return null;
        }

        var cabecera = new byte[12];
        await using (var lectura = archivo.OpenReadStream())
        {
            var leidos = await lectura.ReadAtLeastAsync(cabecera, cabecera.Length, throwOnEndOfStream: false, ct);
            if (leidos < 5)
            {
                return null;
            }
        }

        var tipo = Detectar(cabecera);
        if (tipo is null || !Admite(tipo))
        {
            return null;
        }

        var nombre = $"{Guid.NewGuid():N}{tipo.Extension}";
        await using var destino = File.Create(Ruta(nombre));
        await archivo.CopyToAsync(destino, ct);
        return (nombre, tipo);
    }

    /// <summary>
    /// Guarda un contenido descargado (p. ej. de SharePoint). Mismas comprobaciones que una subida: firma del archivo y tamaño.
    /// </summary>
    public async Task<(string Nombre, TipoArchivo Tipo)?> GuardarAsync(Stream contenido, long tamano, CancellationToken ct)
    {
        if (tamano is <= 0 || tamano > TamanoMaximo)
        {
            return null;
        }

        var cabecera = new byte[12];
        var leidos = await contenido.ReadAtLeastAsync(cabecera, cabecera.Length, throwOnEndOfStream: false, ct);
        var tipo = leidos < 5 ? null : Detectar(cabecera);
        if (tipo is null || !Admite(tipo))
        {
            return null;
        }

        var nombre = $"{Guid.NewGuid():N}{tipo.Extension}";
        var ruta = Ruta(nombre);
        await using (var destino = File.Create(ruta))
        {
            await destino.WriteAsync(cabecera.AsMemory(0, leidos), ct);
            await contenido.CopyToAsync(destino, ct);
            if (destino.Length > TamanoMaximo)
            {
                destino.Close();
                File.Delete(ruta);
                return null;
            }
        }
        return (nombre, tipo);
    }

    /// <summary>Ruta física del archivo; el nombre viene de la BD, pero nunca se permite salir de la carpeta.</summary>
    public string Ruta(string archivo)
    {
        var ruta = Path.GetFullPath(Path.Combine(Carpeta, Path.GetFileName(archivo)));
        return ruta.StartsWith(Carpeta, StringComparison.OrdinalIgnoreCase) ? ruta : throw new InvalidOperationException("Ruta no válida.");
    }

    public void Borrar(string archivo)
    {
        var ruta = Ruta(archivo);
        if (File.Exists(ruta))
        {
            File.Delete(ruta);
        }
    }

    private static TipoArchivo? Detectar(ReadOnlySpan<byte> c) => c switch
    {
        [0xFF, 0xD8, 0xFF, ..] => new(".jpg", "image/jpeg"),
        [0x89, 0x50, 0x4E, 0x47, ..] => new(".png", "image/png"),
        [(byte)'R', (byte)'I', (byte)'F', (byte)'F', _, _, _, _, (byte)'W', (byte)'E', (byte)'B', (byte)'P'] => new(".webp", "image/webp"),
        [(byte)'%', (byte)'P', (byte)'D', (byte)'F', (byte)'-', ..] => new(".pdf", "application/pdf"),
        // ISO BMFF ("ftyp" en el byte 4): MOV de iPhone, MP4 y HEIC (este último no lo muestran los navegadores).
        [_, _, _, _, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'q', (byte)'t', ..] => new(".mov", "video/quicktime"),
        [_, _, _, _, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'h', (byte)'e', (byte)'i', _] => new(".heic", "image/heic"),
        [_, _, _, _, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'m', (byte)'i', (byte)'f', (byte)'1'] => new(".heic", "image/heic"),
        [_, _, _, _, (byte)'f', (byte)'t', (byte)'y', (byte)'p', ..] => new(".mp4", "video/mp4"),
        [0x1A, 0x45, 0xDF, 0xA3, ..] => new(".webm", "video/webm"),
        _ => null
    };
}

/// <summary>
/// Fotos y vídeos de la web pública (configurable con <c>Media:Ruta</c>), servidos sin autenticación en <c>/media</c>.
/// Fotos JPG, PNG o WebP de hasta 10 MB y vídeos MP4, MOV o WebM de hasta 300 MB.
/// </summary>
public class AlmacenMedia(IConfiguration config, IWebHostEnvironment env) : AlmacenArchivos(config["Media:Ruta"] ?? "media", env)
{
    /// <summary>Máximo por archivo (el de los vídeos); las fotos tienen su propio límite, <see cref="MaximoFoto"/>.</summary>
    public const long Maximo = 300 * 1024 * 1024;
    public const long MaximoFoto = 10 * 1024 * 1024;
    public const string RutaPublica = "/media";

    public override long TamanoMaximo => Maximo;
    protected override bool Admite(TipoArchivo tipo) =>
        tipo.TipoContenido is "image/jpeg" or "image/png" or "image/webp" or "video/mp4" or "video/quicktime" or "video/webm";

    public static string Url(string archivo) => $"{RutaPublica}/{archivo}";

    /// <summary>¿Es un vídeo? (por la extensión del archivo guardado, que pone el almacén según el contenido).</summary>
    public static bool EsVideo(string archivo) => Path.GetExtension(archivo).ToLowerInvariant() is ".mp4" or ".mov" or ".webm";
}

/// <summary>
/// Adjuntos privados (informes de diagnosis, fotos de averías). Configurable con <c>Privado:Ruta</c>.
/// No se sirven como estáticos: solo se descargan a través de la API con un usuario del taller.
/// </summary>
public class AlmacenPrivado(IConfiguration config, IWebHostEnvironment env) : AlmacenArchivos(config["Privado:Ruta"] ?? "privado", env)
{
    public const long Maximo = 25 * 1024 * 1024;

    public override long TamanoMaximo => Maximo;
    // Documentos e imágenes; los vídeos van al almacén de multimedia.
    protected override bool Admite(TipoArchivo tipo) => !tipo.TipoContenido.StartsWith("video/") && tipo.TipoContenido != "image/heic";
}

/// <summary>
/// Fotos y vídeos de las órdenes (<c>Multimedia:Ruta</c>, por defecto privado/multimedia). Privados: se sirven por la API
/// con permisos (taller, o el cliente de la orden si están marcados como visibles).
/// </summary>
public class AlmacenMultimedia(IConfiguration config, IWebHostEnvironment env) : AlmacenArchivos(config["Multimedia:Ruta"] ?? Path.Combine("privado", "multimedia"), env)
{
    public const long Maximo = 300L * 1024 * 1024;

    public override long TamanoMaximo => Maximo;
    protected override bool Admite(TipoArchivo tipo) =>
        tipo.TipoContenido is "image/jpeg" or "image/png" or "image/webp" or "video/mp4" or "video/quicktime" or "video/webm";

    /// <summary>Para dar un mensaje claro si llega una foto HEIC (formato del iPhone que los navegadores no muestran).</summary>
    public static bool EsHeic(ReadOnlySpan<byte> c) => c.Length >= 12 && c[4] == (byte)'f' && c[5] == (byte)'t' && c[6] == (byte)'y' && c[7] == (byte)'p' &&
        ((c[8] == (byte)'h' && c[9] == (byte)'e' && c[10] == (byte)'i') || (c[8] == (byte)'m' && c[9] == (byte)'i' && c[10] == (byte)'f'));
}
