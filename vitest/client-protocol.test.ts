import type { AnsiLogger } from 'matterbridge/logger';

type RegisterResult = { data: number[] };

const mockLog = {
  fatal: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  notice: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
} as unknown as AnsiLogger;

type MockModbusClient = {
  setTimeout: ReturnType<typeof vi.fn>;
  connectTCP: ReturnType<typeof vi.fn<(host: string, options: { port: number }) => Promise<void>>>;
  setID: ReturnType<typeof vi.fn<(id: number) => void>>;
  isOpen: boolean;
  destroy: ReturnType<typeof vi.fn<(callback?: () => void) => void>>;
  close: ReturnType<typeof vi.fn<(callback?: () => void) => void>>;
  readInputRegisters: ReturnType<typeof vi.fn<(address: number, length: number) => Promise<RegisterResult>>>;
  writeRegisters: ReturnType<typeof vi.fn<(address: number, values: number[]) => Promise<void>>>;
};

const modbusMocks = vi.hoisted(() => {
  const createMockModbus = (): MockModbusClient => ({
    setTimeout: vi.fn(),
    connectTCP: vi.fn(async () => {}),
    setID: vi.fn(),
    isOpen: false,
    destroy: vi.fn((callback?: () => void) => {
      callback?.();
    }),
    close: vi.fn((callback?: () => void) => {
      callback?.();
    }),
    readInputRegisters: vi.fn(async (): Promise<RegisterResult> => ({ data: [] })),
    writeRegisters: vi.fn(async () => {}),
  });

  let mockModbus = createMockModbus();
  return {
    getMockModbus: (): MockModbusClient => mockModbus,
    resetMockModbus: (): MockModbusClient => {
      mockModbus = createMockModbus();
      return mockModbus;
    },
  };
});

vi.mock('modbus-serial', () => ({
  default: function MockModbusRTU(): MockModbusClient {
    return modbusMocks.getMockModbus();
  },
}));

const { createGoEClient, GoEModbusClient } = await import('../src/modbus/client.js');

function uint32Words(value: number): [number, number] {
  return [Math.floor(value / 65_536), value % 65_536];
}

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

describe('GoEModbusClient protocol', () => {
  beforeEach(() => {
    modbusMocks.resetMockModbus();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create a client via createGoEClient', () => {
    const mockModbus = modbusMocks.getMockModbus();
    const client = createGoEClient({ host: '127.0.0.1', port: 502, unitId: 1 }, mockLog);
    expect(client).toBeInstanceOf(GoEModbusClient);
    expect(mockModbus.setTimeout).toHaveBeenCalledWith(5000);
  });

  it('should connect over TCP and set the unit id', async () => {
    const mockModbus = modbusMocks.getMockModbus();
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 3 }, mockLog);
    await client.connect();
    expect(mockModbus.connectTCP).toHaveBeenCalledWith('10.0.0.8', { port: 502 });
    expect(mockModbus.setID).toHaveBeenCalledWith(3);
    expect(mockLog.debug).toHaveBeenCalledWith('Connected to go-e Modbus at 10.0.0.8:502');
  });

  it('should destroy a never-opened socket and ignore duplicate close callbacks', async () => {
    const mockModbus = modbusMocks.getMockModbus();
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
    const mockModbus = modbusMocks.getMockModbus();
    mockModbus.isOpen = true;
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await client.close();
    expect(mockModbus.close).toHaveBeenCalled();
    expect(mockModbus.destroy).not.toHaveBeenCalled();
  });

  it('should destroy an open connection when graceful close times out', async () => {
    vi.useFakeTimers();
    const mockModbus = modbusMocks.getMockModbus();
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      /* never invokes the callback so the timeout path runs */
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const closing = client.close();
    await vi.advanceTimersByTimeAsync(5000);
    await closing;
    expect(mockModbus.destroy).toHaveBeenCalled();
  });

  it('should finish close when the timeout destroy throws', async () => {
    vi.useFakeTimers();
    const mockModbus = modbusMocks.getMockModbus();
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      /* never invokes the callback so the timeout path runs */
    });
    mockModbus.destroy.mockImplementation(() => {
      throw new Error('destroy failed');
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const closing = client.close();
    await vi.advanceTimersByTimeAsync(5000);
    await closing;
    expect(mockModbus.destroy).toHaveBeenCalled();
  });

  it('should resolve close when the underlying client throws', async () => {
    const mockModbus = modbusMocks.getMockModbus();
    mockModbus.isOpen = true;
    mockModbus.close.mockImplementation(() => {
      throw new Error('close failed');
    });
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('should parse telemetry, energy, and identity registers', async () => {
    const mockModbus = modbusMocks.getMockModbus();
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

    expect(status.carState).toBe(2);
    expect(status.allow).toBe(1);
    expect(status.error).toBe(0);
    expect(status.powerTotalMw).toBe(3_600_000);
    expect(status.voltageMv).toBe(230_000);
    expect(status.currentMa).toBe(16_000);
    expect(status.sessionEnergyWh).toBeCloseTo(277.78, 1);
    expect(status.totalEnergyMwh).toBe(36_000_000);
    expect(status.serial).toBe('206540');
    expect(status.hostname).toBe('C2Home');
    expect(status.unlockedBy).toBe(0);
    expect(status.rfidUid).toBeNull();
    expect(status.cardEnergyWh).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('should use config identity and null metrics when raw values are zero', async () => {
    const mockModbus = modbusMocks.getMockModbus();
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
      unlockedBy: 0,
      rfidUid: null,
      cardEnergyWh: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('should parse RFID unlock slot, UID, and card energy counters', async () => {
    const mockModbus = modbusMocks.getMockModbus();
    const telemetry = Array.from({ length: 22 }, () => 0);
    const energy = Array.from({ length: 6 }, () => 0);
    const uidWords = [0x04a1, 0xb2c3, 0, 0, 0];
    const energyBytes = new Uint8Array(8);
    new DataView(energyBytes.buffer).setFloat64(0, 12_500, false);
    const card0 = [0, 0, 0, 0].map((_, index) => energyBytes[index * 2] * 256 + energyBytes[index * 2 + 1]);
    const rfidBlock = [...uidWords, ...card0, ...Array.from({ length: 36 }, () => 0)];

    mockModbus.readInputRegisters
      .mockResolvedValueOnce({ data: telemetry })
      .mockResolvedValueOnce({ data: [1] })
      .mockResolvedValueOnce({ data: energy })
      .mockResolvedValueOnce({ data: [...encodeAscii('206540', 6), ...encodeAscii('C2Home', 6)] })
      .mockResolvedValueOnce({ data: [2] })
      .mockResolvedValueOnce({ data: rfidBlock });

    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    const status = await client.readStatus();

    expect(status.unlockedBy).toBe(2);
    expect(status.rfidUid).toEqual(Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]));
    expect(status.cardEnergyWh[0]).toBe(12_500);
    expect(status.cardEnergyWh[1]).toBe(0);
  });

  it('should keep the charger online when RFID registers are unavailable', async () => {
    const mockModbus = modbusMocks.getMockModbus();
    mockModbus.readInputRegisters
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockRejectedValueOnce(new Error('illegal data address'));

    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1, name: 'Garage', serial: 'CFG001' }, mockLog);
    const status = await client.readStatus();

    expect(status.unlockedBy).toBe(0);
    expect(status.rfidUid).toBeNull();
    expect(status.cardEnergyWh).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(mockLog.debug).toHaveBeenCalledWith(expect.stringContaining('RFID registers unavailable'));
  });

  it('should write force state and amperage holding registers', async () => {
    const mockModbus = modbusMocks.getMockModbus();
    const client = new GoEModbusClient({ host: '10.0.0.8', port: 502, unitId: 1 }, mockLog);
    await client.setForceState(2);
    await client.setAmperage(16);
    expect(mockModbus.writeRegisters).toHaveBeenCalledWith(337, [2]);
    expect(mockModbus.writeRegisters).toHaveBeenCalledWith(299, [16]);
    expect(mockLog.info).toHaveBeenCalledWith('Set go-e FORCE_STATE=2 on 10.0.0.8');
    expect(mockLog.info).toHaveBeenCalledWith('Set go-e AMPERE_VOLATILE=16A on 10.0.0.8');
  });
});
