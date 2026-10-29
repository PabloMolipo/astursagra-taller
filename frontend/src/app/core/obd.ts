import { Injectable, signal } from '@angular/core';
import { EstadoCodigo } from './models';

// Tipos mínimos de Web Serial (Chrome/Edge); TypeScript aún no los incluye.
interface PuertoSerie {
  open(opciones: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}
interface WebSerial {
  requestPort(opciones?: object): Promise<PuertoSerie>;
}

/** Canal con el adaptador: envía un comando y devuelve la respuesta hasta el prompt '>'. */
interface Transporte {
  enviar(comando: string, esperaMs: number): Promise<string>;
  cerrar(): Promise<void>;
}

export type EstadoLector = 'desconectado' | 'conectando' | 'conectado' | 'error';

export interface CodigoObd {
  codigo: string;
  estado: EstadoCodigo;
}

export interface Pid {
  pid: string;
  nombre: string;
  unidad: string;
  /** Convierte los bytes de datos (A, B…) en el valor. */
  formula: (b: number[]) => number;
  decimales: number;
}

/** PIDs del modo 01 (SAE J1979) más útiles en el taller. */
export const PIDS: Pid[] = [
  { pid: '0C', nombre: 'Régimen motor', unidad: 'rpm', formula: b => (256 * b[0] + b[1]) / 4, decimales: 0 },
  { pid: '0D', nombre: 'Velocidad', unidad: 'km/h', formula: b => b[0], decimales: 0 },
  { pid: '05', nombre: 'Temperatura refrigerante', unidad: '°C', formula: b => b[0] - 40, decimales: 0 },
  { pid: '5C', nombre: 'Temperatura aceite', unidad: '°C', formula: b => b[0] - 40, decimales: 0 },
  { pid: '0F', nombre: 'Temperatura aire admisión', unidad: '°C', formula: b => b[0] - 40, decimales: 0 },
  { pid: '04', nombre: 'Carga calculada', unidad: '%', formula: b => (b[0] * 100) / 255, decimales: 0 },
  { pid: '11', nombre: 'Posición mariposa', unidad: '%', formula: b => (b[0] * 100) / 255, decimales: 0 },
  { pid: '0B', nombre: 'Presión colector (MAP)', unidad: 'kPa', formula: b => b[0], decimales: 0 },
  { pid: '33', nombre: 'Presión barométrica', unidad: 'kPa', formula: b => b[0], decimales: 0 },
  { pid: '10', nombre: 'Caudal de aire (MAF)', unidad: 'g/s', formula: b => (256 * b[0] + b[1]) / 100, decimales: 1 },
  { pid: '42', nombre: 'Tensión módulo de control', unidad: 'V', formula: b => (256 * b[0] + b[1]) / 1000, decimales: 2 },
  { pid: '2F', nombre: 'Nivel de combustible', unidad: '%', formula: b => (b[0] * 100) / 255, decimales: 0 },
  { pid: '5E', nombre: 'Consumo de combustible', unidad: 'L/h', formula: b => (256 * b[0] + b[1]) / 20, decimales: 1 }
];

const MODOS_DTC: Record<'03' | '07' | '0A', { respuesta: number; estado: EstadoCodigo }> = {
  '03': { respuesta: 0x43, estado: 'Activo' },
  '07': { respuesta: 0x47, estado: 'Pendiente' },
  '0A': { respuesta: 0x4a, estado: 'Permanente' }
};

/**
 * Lector OBD-II con adaptador ELM327 (USB o Bluetooth emparejado como puerto COM) mediante Web Serial.
 * Solo datos genéricos OBD (motor y emisiones): no sustituye a la máquina de diagnosis de marca.
 */
@Injectable({ providedIn: 'root' })
export class LectorObd {
  readonly estado = signal<EstadoLector>('desconectado');
  readonly protocolo = signal<string | null>(null);
  readonly tension = signal<string | null>(null);
  readonly demo = signal(false);
  readonly error = signal<string | null>(null);

  private transporte?: Transporte;
  private esCan = true;
  private cola: Promise<unknown> = Promise.resolve();

  static disponible(): boolean {
    return typeof navigator !== 'undefined' && 'serial' in navigator;
  }

  async conectar(baudios: number, demo = false) {
    this.error.set(null);
    this.estado.set('conectando');
    try {
      this.transporte = demo ? new Simulador() : await TransporteSerie.abrir(baudios);
      this.demo.set(demo);

      await this.comando('ATZ', 2500);
      for (const c of ['ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATAT1', 'ATSP0']) {
        await this.comando(c);
      }
      // La primera petición fuerza la búsqueda automática del protocolo.
      const prueba = await this.comando('0100', 10000);
      if (/UNABLE TO CONNECT|NO DATA|ERROR/i.test(prueba.join(' '))) {
        throw new Error('El adaptador responde, pero el vehículo no. Pon el contacto y vuelve a intentarlo.');
      }
      const dp = (await this.comando('ATDPN')).join('').replace(/^A/, '');
      this.esCan = /^[6-9A-C]$/i.test(dp);
      this.protocolo.set((await this.comando('ATDP')).join(' ').replace(/^AUTO,\s*/i, ''));
      this.tension.set((await this.comando('ATRV')).join(''));
      this.estado.set('conectado');
    } catch (e) {
      this.estado.set('error');
      this.error.set(e instanceof Error ? e.message : String(e));
      await this.desconectar(false);
    }
  }

  async desconectar(reiniciarEstado = true) {
    try {
      await this.transporte?.cerrar();
    } catch {
      // El puerto puede estar ya cerrado (adaptador desenchufado).
    }
    this.transporte = undefined;
    if (reiniciarEstado) {
      this.estado.set('desconectado');
      this.protocolo.set(null);
      this.tension.set(null);
    }
  }

  async leerVin(): Promise<string | null> {
    const lineas = await this.comando('0902', 6000);
    return decodificarVin(lineas, this.esCan);
  }

  async leerCodigos(modo: '03' | '07' | '0A'): Promise<CodigoObd[]> {
    const lineas = await this.comando(modo, 6000);
    const { respuesta, estado } = MODOS_DTC[modo];
    return decodificarDtc(lineas, respuesta, this.esCan).map(codigo => ({ codigo, estado }));
  }

  /** Modo 04: borra códigos y datos congelados, y reinicia los monitores de preparación. */
  async borrarCodigos(): Promise<boolean> {
    const lineas = await this.comando('04', 6000);
    return lineas.some(l => l.startsWith('44'));
  }

  /** PIDs del modo 01 que la centralita dice soportar (consulta 0100, 0120, 0140). */
  async pidsSoportados(): Promise<Set<string>> {
    const soportados = new Set<string>();
    for (const base of [0x00, 0x20, 0x40]) {
      const pid = base.toString(16).padStart(2, '0').toUpperCase();
      const bytes = datosPid(await this.comando(`01${pid}`), pid);
      if (!bytes || bytes.length < 4) {
        break;
      }
      for (let i = 0; i < 32; i++) {
        if (bytes[i >> 3] & (0x80 >> (i & 7))) {
          soportados.add((base + i + 1).toString(16).padStart(2, '0').toUpperCase());
        }
      }
      if (!soportados.has((base + 0x20).toString(16).padStart(2, '0').toUpperCase())) {
        break;
      }
    }
    return soportados;
  }

  async leerPid(p: Pid): Promise<number | null> {
    const bytes = datosPid(await this.comando(`01${p.pid}`), p.pid);
    return bytes ? p.formula(bytes) : null;
  }

  /** Los comandos se envían de uno en uno: el ELM327 no admite peticiones simultáneas. */
  private comando(cmd: string, esperaMs = 3000): Promise<string[]> {
    const ejecucion = this.cola.then(async () => {
      if (!this.transporte) {
        throw new Error('El lector no está conectado.');
      }
      const respuesta = await this.transporte.enviar(cmd, esperaMs);
      return respuesta
        .split(/[\r\n]+/)
        .map(l => l.trim())
        .filter(l => l !== '' && l !== cmd && !/^(SEARCHING|BUS INIT)/i.test(l));
    });
    this.cola = ejecucion.catch(() => undefined);
    return ejecucion;
  }
}

/** Puerto serie real. Lee en segundo plano y entrega la respuesta al llegar el prompt '>'. */
class TransporteSerie implements Transporte {
  private bufer = '';
  private lector?: ReadableStreamDefaultReader<Uint8Array>;
  private activo = true;

  private constructor(private readonly puerto: PuertoSerie) {}

  static async abrir(baudios: number): Promise<TransporteSerie> {
    const serial = (navigator as Navigator & { serial?: WebSerial }).serial;
    if (!serial) {
      throw new Error('Este navegador no permite conectar adaptadores OBD. Usa Chrome o Edge en un ordenador.');
    }
    const puerto = await serial.requestPort();
    await puerto.open({ baudRate: baudios });
    const t = new TransporteSerie(puerto);
    void t.leer();
    return t;
  }

  private async leer() {
    const decodificador = new TextDecoder();
    this.lector = this.puerto.readable?.getReader();
    while (this.activo && this.lector) {
      const { value, done } = await this.lector.read();
      if (done) {
        break;
      }
      this.bufer += decodificador.decode(value, { stream: true });
    }
  }

  async enviar(comando: string, esperaMs: number): Promise<string> {
    this.bufer = '';
    const escritor = this.puerto.writable!.getWriter();
    await escritor.write(new TextEncoder().encode(`${comando}\r`));
    escritor.releaseLock();

    const limite = Date.now() + esperaMs;
    while (!this.bufer.includes('>')) {
      if (Date.now() > limite) {
        throw new Error(`Sin respuesta del adaptador a ${comando}. Revisa la conexión y la velocidad (baudios).`);
      }
      await new Promise(r => setTimeout(r, 20));
    }
    const respuesta = this.bufer.slice(0, this.bufer.indexOf('>'));
    this.bufer = '';
    return respuesta;
  }

  async cerrar() {
    this.activo = false;
    await this.lector?.cancel().catch(() => undefined);
    this.lector?.releaseLock();
    await this.puerto.close();
  }
}

/** Coche simulado (CAN 11 bits, 500 kbaud) para probar la pantalla sin adaptador. */
class Simulador implements Transporte {
  private rpm = 820;
  private borrados = false;

  async enviar(comando: string): Promise<string> {
    await new Promise(r => setTimeout(r, 60));
    const c = comando.toUpperCase();
    if (c === 'ATZ') return 'ELM327 v1.5\r\r';
    if (c === 'ATDPN') return 'A6\r\r';
    if (c === 'ATDP') return 'AUTO, ISO 15765-4 (CAN 11/500)\r\r';
    if (c === 'ATRV') return '12.6V\r\r';
    if (c.startsWith('AT')) return 'OK\r\r';
    if (c === '0100') return 'SEARCHING...\r4100BE3FB813\r\r';
    if (c === '0120') return '4120A007B019\r\r';
    if (c === '0140') return '4140FED08000\r\r';
    if (c === '0902') return '014\r0:490201575657\r1:5A5A5A314B5A41\r2:4D303132333435\r\r';
    // P0401 y P0299 almacenados; P0171 pendiente.
    if (c === '03') return this.borrados ? '4300\r\r' : '430204010299\r\r';
    if (c === '07') return this.borrados ? '4700\r\r' : '47010171\r\r';
    if (c === '0A') return '4A00\r\r';
    if (c === '04') {
      this.borrados = true;
      return '44\r\r';
    }
    if (c.startsWith('01')) {
      this.rpm = Math.max(780, Math.min(3200, this.rpm + (Math.random() - 0.45) * 120));
      const r = Math.round(this.rpm * 4);
      const valores: Record<string, string> = {
        '0C': hex(r >> 8) + hex(r & 0xff),
        '0D': '00',
        '05': hex(88 + 40),
        '5C': hex(92 + 40),
        '0F': hex(31 + 40),
        '04': hex(Math.round(55 + Math.random() * 20)),
        '11': hex(38),
        '0B': hex(Math.round(98 + Math.random() * 6)),
        '33': hex(101),
        '10': hex(0) + hex(Math.round(380 + Math.random() * 40) & 0xff),
        '42': hex(0x36) + hex(0x6a),
        '2F': hex(150)
      };
      const pid = c.slice(2);
      return valores[pid] ? `41${pid}${valores[pid]}\r\r` : 'NO DATA\r\r';
    }
    return '?\r\r';
  }

  async cerrar() {}
}

function hex(n: number) {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0').toUpperCase();
}

/**
 * Agrupa las líneas de respuesta en mensajes. En CAN, una respuesta larga llega en varias tramas
 * ("014" = longitud, "0:…", "1:…"); cada otra línea es un mensaje de una centralita.
 */
function mensajes(lineas: string[]): string[] {
  const resultado: string[] = [];
  let multitrama = '';
  for (const linea of lineas.map(l => l.replace(/\s+/g, '').toUpperCase())) {
    if (/^[0-9A-F]{3}$/.test(linea)) {
      if (multitrama) resultado.push(multitrama);
      multitrama = '';
      continue;
    }
    const trama = /^[0-9A-F]:([0-9A-F]+)$/.exec(linea);
    if (trama) {
      multitrama += trama[1];
    } else if (/^[0-9A-F]+$/.test(linea)) {
      resultado.push(linea);
    }
  }
  if (multitrama) resultado.push(multitrama);
  return resultado;
}

function bytes(hexa: string): number[] {
  const b: number[] = [];
  for (let i = 0; i + 1 < hexa.length; i += 2) {
    b.push(parseInt(hexa.slice(i, i + 2), 16));
  }
  return b;
}

/** Dos bytes → "P0401": los 2 bits altos dan la letra, los 2 siguientes el primer dígito. */
export function codigoDeBytes(a: number, b: number): string {
  const letra = 'PCBU'[a >> 6];
  return `${letra}${(a >> 4) & 0x3}${(a & 0x0f).toString(16)}${b.toString(16).padStart(2, '0')}`.toUpperCase();
}

export function decodificarDtc(lineas: string[], servicio: number, esCan: boolean): string[] {
  if (lineas.some(l => /NO DATA/i.test(l))) {
    return [];
  }
  const codigos = new Set<string>();
  for (const m of mensajes(lineas)) {
    const b = bytes(m);
    if (b[0] !== servicio) {
      continue;
    }
    // CAN: [servicio, nº de códigos, pares…]; protocolos antiguos: [servicio, 3 pares por línea].
    const datos = esCan ? b.slice(2, 2 + 2 * b[1]) : b.slice(1);
    for (let i = 0; i + 1 < datos.length; i += 2) {
      if (datos[i] === 0 && datos[i + 1] === 0) {
        continue;
      }
      codigos.add(codigoDeBytes(datos[i], datos[i + 1]));
    }
  }
  return [...codigos];
}

function datosPid(lineas: string[], pid: string): number[] | null {
  for (const m of mensajes(lineas)) {
    if (m.startsWith(`41${pid}`)) {
      return bytes(m.slice(4));
    }
  }
  return null;
}

export function decodificarVin(lineas: string[], esCan: boolean): string | null {
  const ms = mensajes(lineas);
  let hexa = '';
  if (esCan) {
    const m = ms.find(x => x.startsWith('4902'));
    hexa = m ? m.slice(6) : ''; // 49 02 + nº de elementos
  } else {
    hexa = ms.filter(x => x.startsWith('4902')).map(x => x.slice(6)).join('');
  }
  const texto = bytes(hexa).map(c => String.fromCharCode(c)).join('').replace(/[^A-HJ-NPR-Z0-9]/g, '');
  return texto.length >= 17 ? texto.slice(-17) : null;
}
