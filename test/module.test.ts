/**
 * WARNING!!!
 * The tests in this unit are supposed to run sequentially because they depend on the Matterbridge/Matter state.
 * Is not possible for timing reasons to create and destroy a Matter node each test to keep isolation.
 */

import path from 'node:path';

import { jest } from '@jest/globals';
import type { MatterbridgeEndpoint, PlatformMatterbridge } from 'matterbridge';
import { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

import { EMPTY_CARD_ENERGY_WH } from '../src/modbus/registers.js';
import type { GoEClient, GoEStatus } from '../src/modbus/types.js';
import initializePlugin, { GoEPlatform, type GoEPlatformConfig } from '../src/module.js';

const mockStatus: GoEStatus = {
  carState: 1,
  allow: 1,
  error: 0,
  powerTotalMw: null,
  voltageMv: null,
  currentMa: null,
  sessionEnergyWh: null,
  totalEnergyMwh: 36_000_000,
  serial: '206540',
  hostname: 'C2Home_Gemini_206540',
  unlockedBy: 0,
  rfidUid: null,
  cardEnergyWh: [...EMPTY_CARD_ENERGY_WH],
};

const createMockClient = (): GoEClient => ({
  connect: jest.fn(async () => {}),
  close: jest.fn(async () => {}),
  readStatus: jest.fn(async () => mockStatus),
  setForceState: jest.fn(async () => {}),
  setAmperage: jest.fn(async () => {}),
});

const mockMatterbridge: PlatformMatterbridge = {
  systemInformation: {
    interfaceName: 'eth0',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    ipv4Address: '192.168.1.1',
    ipv6Address: 'fd78:cbf8:4939:746:a96:8277:346f:416e',
    osRelease: 'x.y.z',
    nodeVersion: '22.10.0',
    hostname: 'matterbridge',
    user: 'jest',
    osType: 'Linux',
    osPlatform: 'linux',
    osArch: 'x64',
    totalMemory: '0 B',
    freeMemory: '0 B',
    systemUptime: '0s',
    processUptime: '0s',
    cpuUsage: '0%',
    processCpuUsage: '0%',
    rss: '0 B',
    heapTotal: '0 B',
    heapUsed: '0 B',
  },
  uuid: '00000000-0000-0000-0000-000000000000',
  rootDirectory: path.join('.cache', 'jest', 'GoEPlugin'),
  homeDirectory: path.join('.cache', 'jest', 'GoEPlugin'),
  matterbridgeDirectory: path.join('.cache', 'jest', 'GoEPlugin', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'jest', 'GoEPlugin', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'jest', 'GoEPlugin', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'jest', 'GoEPlugin', 'node_modules'),
  matterbridgeVersion: '3.10.9',
  matterbridgeLatestVersion: '3.10.9',
  matterbridgeDevVersion: '3.10.9',
  frontendVersion: '3.0.0',
  bridgeMode: 'bridge',
  restartMode: 'docker',
  virtualMode: 'mounted_switch',
  aggregatorVendorId: VendorId(0xfff1),
  aggregatorVendorName: 'Matterbridge',
  aggregatorProductId: 0x8000,
  aggregatorProductName: 'Matterbridge Jest Aggregator',
};

const mockLog = {
  fatal: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  notice: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
} as unknown as AnsiLogger;

const mockConfig: GoEPlatformConfig = {
  name: 'matterbridge-go-e',
  type: 'DynamicPlatform',
  version: '0.1.0',
  chargers: [
    {
      host: '192.168.71.121',
      port: 502,
      unitId: 1,
      name: 'C2Home_Gemini_206540',
      serial: '206540',
    },
  ],
  pollInterval: 60_000,
  debug: true,
  unregisterOnShutdown: false,
};

const addBridgedEndpoint = jest.fn(async (_pluginName: string, _device: MatterbridgeEndpoint) => {});
const removeBridgedEndpoint = jest.fn(async (_pluginName: string, _device: MatterbridgeEndpoint) => {});
const removeAllBridgedEndpoints = jest.fn(async (_pluginName: string) => {});
const registerVirtualDevice = jest.fn(async (_name: string, _type: 'light' | 'outlet' | 'switch' | 'mounted_switch', _callback: () => Promise<void>) => {});

jest.spyOn(AnsiLogger.prototype, 'log').mockImplementation(() => {});

describe('matterbridge-go-e platform', () => {
  let instance: GoEPlatform;
  let mockClient: GoEClient;

  beforeAll(async () => {
    mockClient = createMockClient();
    instance = new GoEPlatform(mockMatterbridge, mockLog, mockConfig, () => mockClient);
    // @ts-expect-error Accessing private method for testing purposes
    instance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await instance.ready;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await instance.onShutdown();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it('should throw when matterbridge version is too old', () => {
    expect(() => new GoEPlatform({ ...mockMatterbridge, matterbridgeVersion: '2.0.0' }, mockLog, mockConfig, () => mockClient)).toThrow(
      'This plugin requires Matterbridge version >= "3.10.9".',
    );
  });

  it('should create an instance via initializePlugin', () => {
    const plugin = initializePlugin(mockMatterbridge, mockLog, mockConfig);
    expect(plugin).toBeInstanceOf(GoEPlatform);
  });

  it('should start and register one EVSE', async () => {
    await instance.onStart('jest');
    expect(mockClient.connect).toHaveBeenCalled();
    expect(addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(instance.getDevices()).toHaveLength(1);
  });

  it('should configure devices from Modbus status', async () => {
    await instance.onStart('jest');
    const electricalSensor = instance.getDevices()[0]?.getChildEndpointById('ElectricalSensor');
    if (!electricalSensor) {
      throw new Error('ElectricalSensor child endpoint missing');
    }
    const updateSpy = jest.spyOn(electricalSensor, 'updateAttribute');

    await instance.onConfigure();
    expect(mockClient.readStatus).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('Configured EVSE'));
    expect(updateSpy).toHaveBeenCalledWith('ElectricalEnergyMeasurement', 'cumulativeEnergyImported', { energy: 36_000_000 }, expect.anything());
  });

  it('should handle EVSE disable and enable commands', async () => {
    await instance.onStart('jest');
    const device = instance.getDevices()[0];
    await device.executeCommandHandler('EnergyEvse.disable', {}, 'energyEvse', {} as never, device);
    await device.executeCommandHandler(
      'EnergyEvse.enableCharging',
      {
        chargingEnabledUntil: null,
        minimumChargeCurrent: 6000,
        maximumChargeCurrent: 16_000,
      },
      'energyEvse',
      {} as never,
      device,
    );
    expect(mockClient.setForceState).toHaveBeenCalledWith(1);
    expect(mockClient.setAmperage).toHaveBeenCalledWith(16);
    expect(mockClient.setForceState).toHaveBeenCalledWith(2);
  });

  it('should mark charger offline and reconnect when Modbus fails', async () => {
    await instance.onStart('jest');
    jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('ECONNRESET'));
    await instance.onConfigure();
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('went offline'));

    jest.mocked(mockClient.readStatus).mockResolvedValue(mockStatus);
    await instance.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('is back online'));
    expect(instance.getDevices()).toHaveLength(1);
  });

  it('should defer registration when charger is unreachable at startup', async () => {
    const failingClient = createMockClient();
    jest.mocked(failingClient.connect).mockRejectedValue(new Error('connect EHOSTUNREACH'));
    const failingInstance = new GoEPlatform(mockMatterbridge, mockLog, mockConfig, () => failingClient);
    // @ts-expect-error Accessing private method for testing purposes
    failingInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await failingInstance.ready;

    await failingInstance.onStart('jest');

    expect(failingInstance.getDevices()).toHaveLength(0);
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Will keep retrying in the background.'));
    await failingInstance.onShutdown();
  }, 15_000);

  it('should warn when no chargers are configured', async () => {
    const { chargers: _chargers, ...rest } = mockConfig;
    const emptyConfig: GoEPlatformConfig = { ...rest, discovery: false };
    const emptyInstance = new GoEPlatform(mockMatterbridge, mockLog, emptyConfig, () => mockClient);
    // @ts-expect-error Accessing private method for testing purposes
    emptyInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await emptyInstance.ready;
    await emptyInstance.onStart();
    expect(mockLog.warn).toHaveBeenCalledWith('No go-e chargers configured or discovered.');
    await emptyInstance.onShutdown();
  });

  it('should change logger level', async () => {
    await instance.onChangeLoggerLevel(LogLevel.DEBUG);
    expect(mockLog.info).toHaveBeenCalledWith('onChangeLoggerLevel called with: debug');
  });

  it('should shutdown and optionally unregister devices', async () => {
    await instance.onStart('jest');
    await instance.onShutdown('jest');
    expect(mockClient.close).toHaveBeenCalled();
    expect(removeAllBridgedEndpoints).not.toHaveBeenCalled();

    mockConfig.unregisterOnShutdown = true;
    await instance.onStart('jest');
    await instance.onShutdown();
    expect(removeAllBridgedEndpoints).toHaveBeenCalled();
    mockConfig.unregisterOnShutdown = false;
  });

  it('should log when close or unregister fails during shutdown', async () => {
    await instance.onStart('jest');
    jest.mocked(mockClient.close).mockRejectedValueOnce(new Error('close failed'));
    jest.mocked(removeBridgedEndpoint).mockRejectedValueOnce(new Error('unregister failed'));
    await instance.onShutdown('jest');
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Error closing Modbus client'));
    expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('Error unregistering EVSE'));
  });

  it('should apply electrical metrics and default enable-charging current', async () => {
    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      powerTotalMw: 3_600_000,
      voltageMv: 230_000,
      currentMa: 16_000,
      sessionEnergyWh: 1500,
    });
    await instance.onStart('jest');
    const device = instance.getDevices()[0];
    const electricalSensor = device.getChildEndpointById('ElectricalSensor');
    if (!electricalSensor) {
      throw new Error('ElectricalSensor child endpoint missing');
    }
    const sensorSpy = jest.spyOn(electricalSensor, 'updateAttribute');
    await instance.onConfigure();
    expect(sensorSpy).toHaveBeenCalledWith('ElectricalPowerMeasurement', 'activePower', 3_600_000, expect.anything());
    expect(sensorSpy).toHaveBeenCalledWith('ElectricalPowerMeasurement', 'voltage', 230_000, expect.anything());
    expect(sensorSpy).toHaveBeenCalledWith('ElectricalPowerMeasurement', 'activeCurrent', 16_000, expect.anything());

    await device.executeCommandHandler('EnergyEvse.enableCharging', {} as never, 'energyEvse', {} as never, device);
    expect(mockClient.setAmperage).toHaveBeenCalledWith(16);
    expect(mockClient.setForceState).toHaveBeenCalledWith(2);
  });

  it('should skip electrical updates when the child endpoint is missing', async () => {
    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      totalEnergyMwh: null,
    });
    await instance.onStart('jest');
    await instance.onConfigure();
    const device = instance.getDevices()[0];
    const childSpy = jest.spyOn(device, 'getChildEndpointById').mockReturnValue(null as never);
    await instance.onConfigure();
    jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('ECONNRESET'));
    await instance.onConfigure();
    expect(instance.getDevices()).toHaveLength(1);
    childSpy.mockRestore();
  });

  it('should reject EVSE commands while the charger is offline', async () => {
    await instance.onStart('jest');
    jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('ECONNRESET'));
    await instance.onConfigure();
    const device = instance.getDevices()[0];
    await expect(device.executeCommandHandler('EnergyEvse.disable', {}, 'energyEvse', {} as never, device)).rejects.toThrow('is offline');
    await expect(device.executeCommandHandler('EnergyEvse.enableCharging', {} as never, 'energyEvse', {} as never, device)).rejects.toThrow('is offline');
  });

  it('should ignore a second offline mark and failed reconnect close errors', async () => {
    await instance.onStart('jest');
    jest.mocked(mockClient.close).mockRejectedValueOnce(new Error('close failed'));
    jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('ECONNRESET'));
    await instance.onConfigure();

    // @ts-expect-error Accessing private runtime map for testing purposes
    const runtime = [...instance.runtimes.values()][0];
    // @ts-expect-error Accessing private method for testing purposes
    await instance.markChargerOffline(runtime, new Error('already offline'));

    jest.mocked(mockClient.close).mockRejectedValueOnce(new Error('close failed'));
    jest.mocked(mockClient.connect).mockImplementationOnce(async () => {});
    jest.mocked(mockClient.readStatus).mockResolvedValue(mockStatus);
    await instance.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('is back online'));

    jest.mocked(mockClient.connect).mockRejectedValueOnce(new Error('still down'));
    jest.mocked(mockClient.close).mockRejectedValueOnce(new Error('close failed'));
    jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('ECONNRESET'));
    await instance.onConfigure();
    jest.mocked(mockClient.connect).mockRejectedValueOnce(new Error('still down'));
    jest.mocked(mockClient.close).mockRejectedValueOnce(new Error('close failed'));
    await instance.onConfigure();
  });

  it('should poll chargers, including pending registration retries', async () => {
    const callbacks: Array<() => void> = [];
    const intervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((handler: Parameters<typeof setInterval>[0]) => {
      if (typeof handler === 'function') {
        callbacks.push(handler as () => void);
      }
      return 1 as unknown as ReturnType<typeof setInterval>;
    });

    try {
      await instance.onStart('jest');
      expect(callbacks.length).toBeGreaterThan(0);
      // @ts-expect-error Accessing private method for testing purposes
      const pollSpy = jest.spyOn(instance, 'pollAll').mockImplementation(async () => {});
      callbacks[0]();
      expect(pollSpy).toHaveBeenCalled();
      pollSpy.mockRestore();

      jest.mocked(mockClient.readStatus).mockResolvedValue(mockStatus);
      // @ts-expect-error Accessing private method for testing purposes
      await instance.pollAll();
      expect(mockClient.readStatus).toHaveBeenCalled();

      jest.mocked(mockClient.readStatus).mockRejectedValueOnce(new Error('timeout'));
      // @ts-expect-error Accessing private method for testing purposes
      await instance.pollAll();
      expect(mockLog.warn).toHaveBeenCalledWith(expect.stringContaining('went offline'));

      jest.mocked(mockClient.connect).mockImplementation(async () => {});
      jest.mocked(mockClient.readStatus).mockResolvedValue(mockStatus);
      // @ts-expect-error Accessing private method for testing purposes
      await instance.pollAll();
      expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('is back online'));
    } finally {
      intervalSpy.mockRestore();
    }
  });

  it('should register a pending charger on a later poll', async () => {
    const pendingClient = createMockClient();
    jest
      .mocked(pendingClient.connect)
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockRejectedValueOnce(new Error('down'))
      .mockImplementation(async () => {});
    const pendingInstance = new GoEPlatform(mockMatterbridge, mockLog, mockConfig, () => pendingClient);
    // @ts-expect-error Accessing private method for testing purposes
    pendingInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await pendingInstance.ready;
    await pendingInstance.onStart('jest');
    expect(pendingInstance.getDevices()).toHaveLength(0);

    // @ts-expect-error Accessing private method for testing purposes
    await pendingInstance.pollAll();
    expect(pendingInstance.getDevices()).toHaveLength(1);
    await pendingInstance.onShutdown();
  }, 15_000);

  it('should use status identity and default connection settings', async () => {
    const minimalConfig: GoEPlatformConfig = {
      ...mockConfig,
      chargers: [{ host: '10.0.0.9' }] as GoEPlatformConfig['chargers'],
    };
    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      hostname: undefined as unknown as string,
      serial: undefined as unknown as string,
    });
    const minimalInstance = new GoEPlatform(mockMatterbridge, mockLog, minimalConfig, () => mockClient);
    // @ts-expect-error Accessing private method for testing purposes
    minimalInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await minimalInstance.ready;
    await minimalInstance.onStart('jest');
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('go-e 10.0.0.9'));
    await minimalInstance.onShutdown();
  });

  it('should queue a charger with no port after a single failed attempt', async () => {
    const failingClient = createMockClient();
    jest.mocked(failingClient.connect).mockRejectedValue(new Error('down'));
    const pendingInstance = new GoEPlatform(mockMatterbridge, mockLog, mockConfig, () => failingClient);
    // @ts-expect-error Accessing private method for testing purposes
    pendingInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await pendingInstance.ready;
    // @ts-expect-error Accessing private method for testing purposes
    await pendingInstance.tryRegisterCharger({ host: '10.0.0.4' }, 1);
    expect(pendingInstance.getDevices()).toHaveLength(0);
    // @ts-expect-error Accessing private method for testing purposes
    await pendingInstance.pollAll();
    expect(pendingInstance.getDevices()).toHaveLength(0);
    await pendingInstance.onShutdown();
  });

  it('should close a failed startup connection even if close rejects', async () => {
    const failingClient = createMockClient();
    jest.mocked(failingClient.connect).mockRejectedValue(new Error('connect EHOSTUNREACH'));
    jest.mocked(failingClient.close).mockRejectedValue(new Error('close failed'));
    const failingInstance = new GoEPlatform(mockMatterbridge, mockLog, { ...mockConfig, pollInterval: undefined }, () => failingClient);
    // @ts-expect-error Accessing private method for testing purposes
    failingInstance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await failingInstance.ready;
    await failingInstance.onStart('jest');
    expect(failingInstance.getDevices()).toHaveLength(0);
    await failingInstance.onShutdown();
  }, 15_000);

  it('should log an RFID scan for an out-of-range unlock slot', async () => {
    const uid = Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]);
    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      unlockedBy: 11,
      rfidUid: uid,
      cardEnergyWh: [...EMPTY_CARD_ENERGY_WH],
    });
    await instance.onStart('jest');
    const device = instance.getDevices()[0] as MatterbridgeEndpoint & {
      triggerRfidEvent?: (uid: Uint8Array, log?: unknown) => Promise<boolean>;
    };
    device.triggerRfidEvent = jest.fn(async () => true);
    await instance.onConfigure();
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('uid=04a1b2c3 card=11'));
  });

  it('should emit an RFID event when a new UID is scanned and on a new card session', async () => {
    jest.mocked(mockClient.readStatus).mockResolvedValue(mockStatus);
    await instance.onStart('jest');
    const device = instance.getDevices()[0] as MatterbridgeEndpoint & {
      triggerRfidEvent?: (uid: Uint8Array, log?: unknown) => Promise<boolean>;
    };
    const triggerRfidEvent = jest.fn(async () => true);
    device.triggerRfidEvent = triggerRfidEvent;

    const uid = Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]);
    const cardEnergyWh = [12_500, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      unlockedBy: 1,
      rfidUid: uid,
      cardEnergyWh,
    });
    await instance.onConfigure();
    expect(triggerRfidEvent).toHaveBeenCalledWith(uid, expect.anything());
    expect(mockLog.info).toHaveBeenCalledWith(expect.stringContaining('uid=04a1b2c3 card=1'));

    triggerRfidEvent.mockClear();
    await instance.onConfigure();
    expect(triggerRfidEvent).not.toHaveBeenCalled();

    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      unlockedBy: 0,
      rfidUid: uid,
      cardEnergyWh,
    });
    await instance.onConfigure();
    expect(triggerRfidEvent).not.toHaveBeenCalled();

    jest.mocked(mockClient.readStatus).mockResolvedValue({
      ...mockStatus,
      unlockedBy: 1,
      rfidUid: uid,
      cardEnergyWh,
    });
    await instance.onConfigure();
    expect(triggerRfidEvent).toHaveBeenCalledTimes(1);
  });
});
