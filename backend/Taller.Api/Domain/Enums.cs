namespace Taller.Api.Domain;

public enum TipoCliente
{
    Particular,
    Empresa
}

public enum TipoVehiculo
{
    Turismo,
    Moto,
    Furgoneta,
    Camion,
    Tractor,
    MaquinariaAgricola,
    Otro
}

public enum EstadoOrden
{
    Recibido,
    EnDiagnostico,
    Presupuestado,
    EnReparacion,
    Listo,
    Entregado,
    Cancelado
}

public enum TipoServicio
{
    Mecanica,
    MecanicaMaquinaria,
    Electromecanica,
    Programacion,
    ChapaPintura,
    Mantenimiento,
    Diagnosis,
    Otro
}

public enum TipoLinea
{
    ManoObra,
    Pieza
}
