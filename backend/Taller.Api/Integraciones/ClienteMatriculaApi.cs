using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;

namespace Taller.Api.Integraciones;

/// <summary>
/// MatriculaAPI (matriculaapi.com, de regcheck.org.uk): datos de un vehículo español por su matrícula. De pago por consulta
/// (cuenta de prueba con 10 gratis). Sección <c>MatriculaApi</c>: Usuario (el nombre de la cuenta, que hace de clave; en
/// user-secrets o variables de entorno) y Url (para pruebas).
/// </summary>
public class OpcionesMatriculaApi
{
    public string? Usuario { get; set; }
    public string Url { get; set; } = "https://www.matriculaapi.com/api/reg.asmx";

    public bool Configurado => !string.IsNullOrWhiteSpace(Usuario);
}

public class ErrorMatricula(string mensaje, bool noEncontrado = false) : Exception(mensaje)
{
    public bool NoEncontrado { get; } = noEncontrado;
}

/// <summary>Datos útiles de la respuesta. Lo que el servicio no da queda a null (el bastidor no siempre viene).</summary>
public record DatosMatricula(
    string? Bastidor, string? Marca, string? Modelo, string? Variante, string? Descripcion, int? Anio, DateOnly? FechaMatriculacion,
    int? Cilindrada, string? Combustible, decimal? PotenciaCv, int? Puertas);

public class ClienteMatriculaApi(HttpClient http, OpcionesMatriculaApi opciones)
{
    /// <summary>Consulta el servicio y devuelve el JSON del vehículo tal cual (se guarda para no pagar dos veces).</summary>
    public async Task<string> ConsultarAsync(string matricula, bool moto, CancellationToken ct)
    {
        var operacion = moto ? "CheckMotorBikeSpain" : "CheckSpain";
        // El usuario de la cuenta va en la dirección (así lo pide el servicio): no se registra en ningún log.
        var url = $"{opciones.Url.TrimEnd('/')}/{operacion}?RegistrationNumber={Uri.EscapeDataString(matricula)}&username={Uri.EscapeDataString(opciones.Usuario ?? "")}";

        HttpResponseMessage respuesta;
        try
        {
            respuesta = await http.GetAsync(url, ct);
        }
        catch (Exception e) when (e is HttpRequestException or TaskCanceledException && !ct.IsCancellationRequested)
        {
            throw new ErrorMatricula("No se ha podido contactar con MatriculaAPI. Inténtalo más tarde.");
        }

        using (respuesta)
        {
            var cuerpo = await respuesta.Content.ReadAsStringAsync(ct);
            if (!respuesta.IsSuccessStatusCode)
            {
                throw Traducir(cuerpo);
            }

            string? json;
            try
            {
                json = XDocument.Parse(cuerpo).Descendants().FirstOrDefault(e => e.Name.LocalName == "vehicleJson")?.Value;
            }
            catch (System.Xml.XmlException)
            {
                throw new ErrorMatricula("MatriculaAPI ha devuelto una respuesta que no se entiende.");
            }
            if (string.IsNullOrWhiteSpace(json))
            {
                throw new ErrorMatricula("No se ha encontrado ningún vehículo con esa matrícula.", true);
            }
            return json;
        }
    }

    /// <summary>Los errores llegan como texto de una excepción SOAP; se traducen sin copiar su contenido.</summary>
    private static ErrorMatricula Traducir(string cuerpo)
    {
        var t = cuerpo.ToLowerInvariant();
        if (t.Contains("credit"))
            return new ErrorMatricula("No quedan consultas en la cuenta de MatriculaAPI: compra un bloque en matriculaapi.com.");
        if (t.Contains("username") || t.Contains("user name") || t.Contains("not registered") || t.Contains("invalid user"))
            return new ErrorMatricula("El usuario de MatriculaAPI no es válido. Revisa MatriculaApi:Usuario.");
        if (t.Contains("not found") || t.Contains("no vehicle") || t.Contains("no data") || t.Contains("no record") || t.Contains("not recognised"))
            return new ErrorMatricula("No se ha encontrado ningún vehículo con esa matrícula.", true);
        return new ErrorMatricula("MatriculaAPI no ha podido hacer la consulta. Inténtalo más tarde.");
    }

    /// <summary>
    /// Extrae los datos del JSON. El formato varía según el país, el tipo de vehículo y el proveedor del servicio,
    /// así que se prueban varios nombres por campo.
    /// </summary>
    public static DatosMatricula Interpretar(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;

        var bastidor = Texto(r, "VehicleIdentificationNumber", "VIN", "Vin", "Bastidor", "NumeroBastidor", "ChassisNumber", "NumeroChasis");
        bastidor = bastidor is null ? null : new string(bastidor.ToUpperInvariant().Where(char.IsAsciiLetterOrDigit).ToArray());
        if (bastidor is { Length: < 11 or > 17 })
        {
            bastidor = null;
        }

        var anio = Entero(r, "RegistrationYear");
        DateOnly? fecha = DateOnly.TryParseExact(Texto(r, "RegistrationDate"), ["dd/MM/yyyy", "d/M/yyyy", "yyyy-MM-dd"], CultureInfo.InvariantCulture, DateTimeStyles.None, out var f) ? f : null;
        var potencia = Texto(r, "DynamicPower", "Power");
        return new DatosMatricula(
            bastidor,
            Texto(r, "CarMake.CurrentTextValue", "MakeDescription.CurrentTextValue", "MakeDescription", "Make", "CarMake"),
            Texto(r, "CarModel.CurrentTextValue", "ModelDescription.CurrentTextValue", "ModelDescription", "Model", "CarModel"),
            Texto(r, "Variation", "Variant"),
            Texto(r, "Description"),
            anio is > 1900 and < 2100 ? anio : fecha?.Year,
            fecha,
            Entero(r, "EngineSize", "EngineSize.CurrentTextValue"),
            Texto(r, "Fuel", "FuelType.CurrentTextValue", "FuelType"),
            decimal.TryParse(potencia, NumberStyles.Number, CultureInfo.InvariantCulture, out var p) && p > 0 ? p : null,
            Entero(r, "Doors", "NumberOfDoors.CurrentTextValue", "NumberOfDoors"));
    }

    private static string? Texto(JsonElement raiz, params string[] rutas)
    {
        foreach (var ruta in rutas)
        {
            var e = raiz;
            var ok = true;
            foreach (var parte in ruta.Split('.'))
            {
                if (e.ValueKind != JsonValueKind.Object || !e.TryGetProperty(parte, out e))
                {
                    ok = false;
                    break;
                }
            }
            var valor = !ok ? null : e.ValueKind switch
            {
                JsonValueKind.String => e.GetString(),
                JsonValueKind.Number => e.GetRawText(),
                _ => null
            };
            if (!string.IsNullOrWhiteSpace(valor))
            {
                return valor.Trim();
            }
        }
        return null;
    }

    private static int? Entero(JsonElement raiz, params string[] rutas) =>
        int.TryParse(Texto(raiz, rutas)?.Split('.', ',')[0], NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) ? n : null;
}
