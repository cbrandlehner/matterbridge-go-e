import path from 'node:path';

import { jest } from '@jest/globals';
import type { MatterbridgeEndpoint, PlatformMatterbridge } from 'matterbridge';
import type { AnsiLogger } from 'matterbridge/logger';
import { VendorId } from 'matterbridge/matter';

import { EMPTY_CARD_ENERGY_WH } from '../src/modbus/registers.js';
import type { GoEClient, GoEStatus } from '../src/modbus/types.js';

const discoverGoEChargers = jest.fn(async () => [
  {
    host: '10.0.0.8',
    port: 502,
    unitId: 1,
    name: 'Discovered',
    serial: 'DISC01',
  },
]);

jest.unstable_mockModule('../src/discovery/mdns.js', () => ({
  discoverGoEChargers,
}));

const { GoEPlatform } = await import('../src/module.js');
type GoEPlatformConfig = import('../src/platform.js').GoEPlatformConfig;

const mockStatus: GoEStatus = {
  carState: 1,
  allow: 1,
  error: 0,
  powerTotalMw: null,
  voltageMv: null,
  currentMa: null,
  sessionEnergyWh: null,
  totalEnergyMwh: 0,
  serial: '206540',
  hostname: 'C2Home_Gemini_206540',
  unlockedBy: 0,
  rfidUid: null,
  cardEnergyWh: [...EMPTY_CARD_ENERGY_WH],
};

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
  rootDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery'),
  homeDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery'),
  matterbridgeDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery', '.matterbridge'),
  matterbridgePluginDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery', 'Matterbridge'),
  matterbridgeCertDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery', '.mattercert'),
  globalModulesDirectory: path.join('.cache', 'jest', 'GoEPluginDiscovery', 'node_modules'),
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

describe('go-e platform mDNS discovery', () => {
  it('should register chargers discovered via mDNS when none are configured', async () => {
    const mockClient: GoEClient = {
      connect: jest.fn(async () => {}),
      close: jest.fn(async () => {}),
      readStatus: jest.fn(async () => mockStatus),
      setForceState: jest.fn(async () => {}),
      setAmperage: jest.fn(async () => {}),
    };
    const config: GoEPlatformConfig = {
      name: 'matterbridge-go-e',
      type: 'DynamicPlatform',
      version: '0.1.0',
      discovery: true,
      chargers: [],
      debug: true,
      unregisterOnShutdown: false,
    };
    const addBridgedEndpoint = jest.fn(async (_pluginName: string, _device: MatterbridgeEndpoint) => {});
    const removeBridgedEndpoint = jest.fn(async (_pluginName: string, _device: MatterbridgeEndpoint) => {});
    const removeAllBridgedEndpoints = jest.fn(async (_pluginName: string) => {});
    const registerVirtualDevice = jest.fn(async (_name: string, _type: 'light' | 'outlet' | 'switch' | 'mounted_switch', _callback: () => Promise<void>) => {});

    const instance = new GoEPlatform(mockMatterbridge, mockLog, config, () => mockClient);
    // @ts-expect-error Accessing private method for testing purposes
    instance.setMatterNode(addBridgedEndpoint, removeBridgedEndpoint, removeAllBridgedEndpoints, registerVirtualDevice);
    await instance.ready;
    await instance.onStart('jest');

    expect(discoverGoEChargers).toHaveBeenCalled();
    expect(mockLog.info).toHaveBeenCalledWith('Discovering go-e chargers via mDNS...');
    expect(addBridgedEndpoint).toHaveBeenCalledTimes(1);
    expect(instance.getDevices()).toHaveLength(1);

    await instance.onShutdown();
  });
});
