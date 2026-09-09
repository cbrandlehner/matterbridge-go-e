import { jest } from '@jest/globals';
import type { AnsiLogger } from 'matterbridge/logger';

type RegisterResult = { data: number[] };

const mockLog = {
  fatal: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  notice: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

type MockModbusClient = {
  setTimeout: ReturnType<typeof jest.fn>;
  connectTCP: ReturnType<typeof jest.fn<(host: string, options: { port: number }) => Promise<void>>>;
  setID: ReturnType<typeof jest.fn<(id: number) => void>>;
  isOpen: boolean;
  destroy: ReturnType<typeof jest.fn<(callback?: () => void) => void>>;
  close: ReturnType<typeof jest.fn<(callback?: () => void) => void>>;
  readInputRegisters: ReturnType<typeof jest.fn<(address: number, length: number) => Promise<RegisterResult>>>;
  writeRegisters: ReturnType<typeof jest.fn<(address: number, values: number[]) => Promise<void>>>;
};

const createMockModbus = (): MockModbusClient => ({
  setTimeout: jest.fn(),
  connectTCP: jest.fn(async () => {}),
  setID: jest.fn(),
  isOpen: false,
  destroy: jest.fn((callback?: () => void) => {
    callback?.();
  }),
  close: jest.fn((callback?: () => void) => {
    callback?.();
  }),
  readInputRegisters: jest.fn(async (): Promise<RegisterResult> => ({ data: [] })),
  writeRegisters: jest.fn(async () => {}),
});

let mockModbus = createMockModbus();

jest.unstable_mockModule('modbus-serial', () => ({
  default: function MockModbusRTU(): MockModbusClient {
    return mockModbus;
  },
}));

const { createGoEClient, GoEModbusClient } = await import('../src/modbus/client.js');

/**
 * Packs a uint32 into two Modbus words (big-endian).
 */
function uint32Words(value: number): [number, number] {
  return [Math.floor(value / 65_536), value % 65_536];
}

/**
 * Encodes ASCII into consecutive uint16 registers.
 */
function encodeAscii(text: string, registerCount: number): number[] {
  const padded = text.padEnd(registerCount * 2, '\0');
  const registers: number[] = [];
  for (let index = 0; index < registerCount; index++) {
    const high = padded.charCodeAt(index * 2);
    const low = padded.charCodeAt(index * 2 + 1);
    registers.push(high * 256 + low);
  }
  return registers;
}

describe('GoEModbusClient', () => {
  beforeEach(() => {
    mockModbus = createMockModbus();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should create a client via createGoEClient', () => {
    const client = createGoEClient({ host: '127.0.0.1', port: 502, unitId: 1 }, mockLog);
    expect(client).toBeInstanceOf(GoEModbusClient);
    expect(mockModbus.setTimeout).toHaveBeenCalledWith(5000);
  });

  it('should connect over TCP and set the unit id', async () => {
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 3 }, mockLog);
    await client.connect();
    expect(mockModbus.connectTCP).toHaveBeenCalledWith('10.0.0.8', { port: 502 });
    expect(mockModbus.setID).toHaveBeenCalledWith(3);
    expect(mockLog.debug).toHaveBeenCalledWith('Connected to go-e Modbus at 10.0.0.8:502');
  });

  it('should destroy a never-opened socket and ignore duplicate close callbacks', async () => {
    mockModbus.isOpen = false;
    mockModbus.destroy.mockImplementation((callback?: () => void) => {
      callback?.();
      callback?.();
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await client.close();
    expect(mockModbus.destroy).toHaveBeenCalled();
  });

  it('should close an open connection', async () => {
    mockModbus.isOpen = true;
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await client.close();
    expect(mockModbus.close).toHaveBeenCalled();
    expect(mockModbus.destroy).not.toHaveBeenCalled();
  });

  it('should destroy an open connection when graceful close times out', async () => {
    jest.useFakeTimers();
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      /* never invokes the callback so the timeout path runs */
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const closing = client.close();
    await jest.advanceTimersByTimeAsync(5000);
    await closing;
    expect(mockModbus.destroy).toHaveBeenCalled();
  });

  it('should finish close when the timeout destroy throws', async () => {
    jest.useFakeTimers();
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      /* never invokes the callback so the timeout path runs */
    });
    mockModbus.destroy.mockImplementation(() => {
      throw new Error('destroy failed');
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const closing = client.close();
    await jest.advanceTimersByTimeAsync(5000);
    await closing;
    expect(mockModbus.destroy).toHaveBeenCalled();
  });

  it('should resolve close when the underlying client throws', async () => {
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      throw new Error('close failed');
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('should parse telemetry, energy, and identity registers', async () => {
    const telemetry = Array.from({ length: 22 }, () => 0);
    telemetry[0] = 2;
    telemetry[7] = 0;
    [telemetry[8], telemetry[9]] = uint32Words(230);
    [telemetry[14], telemetry[15]] = uint32Words(160);
    [telemetry[20], telemetry[21]] = uint32Words(360_000);

    const energy = Array.from({ length: 6 }, () => 0);
    [energy[0], energy[1]] = uint32Words(360);
    [energy[4], energy[5]] = uint32Words(100_000);

    mockModbus.readInputRegisters
      .mockResolvedValueOnce({ data: telemetry })
      .mockResolvedValueOnce({ data: [1] })
      .mockResolvedValueOnce({ data: energy })
      .mockResolvedValueOnce({ data: [...encodeAscii('206540', 6), ...encodeAscii('C2Home', 6)] });

    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const status = await client.readStatus();

    expect(status).toEqual({
      carState: 2,
      allow: 1,
      error: 0,
      powerTotalMw: 3_600_000,
      voltageMv: 230_000,
      currentMa: 16_000,
      sessionEnergyWh: expect.closeTo(277.78, 1),
      totalEnergyMwh: 36_000_000,
      serial: '206540',
      hostname: 'C2Home',
    });
  });

  it('should use config identity and null metrics when raw values are zero', async () => {
    mockModbus.readInputRegisters.mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] }).mockResolvedValueOnce({ data: [] });

    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1, name: 'Garage', serial: 'CFG001' }, mockLog);
    const status = await client.readStatus();

    expect(status).toEqual({
      carState: 0,
      allow: 0,
      error: 0,
      powerTotalMw: null,
      voltageMv: null,
      currentMa: null,
      sessionEnergyWh: null,
      totalEnergyMwh: 0,
      serial: 'CFG001',
      hostname: 'Garage',
    });
  });

  it('should write force state and amperage holding registers', async () => {
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await client.setForceState(2);
    await client.setAmperage(16);
    expect(mockModbus.writeRegisters).toHaveBeenCalledWith(337, [2]);
    expect(mockModbus.writeRegisters).toHaveBeenCalledWith(299, [16]);
    expect(mockLog.info).toHaveBeenCalledWith('Set go-e FORCE_STATE=2 on 10.0.0.8');
    expect(mockLog.info).toHaveBeenCalledWith('Set go-e AMPERE_VOLATILE=16A on 10.0.0.8');
  });
});
