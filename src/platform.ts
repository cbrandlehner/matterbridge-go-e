/**
 * @file platform.ts
 * @description Matterbridge DynamicPlatform for go-e EV chargers.
 */

import { type BasePlatformConfig, MatterbridgeDynamicPlatform, type PlatformMatterbridge } from 'matterbridge';
import { Evse } from 'matterbridge/devices';
import type { AnsiLogger, LogLevel } from 'matterbridge/logger';
import { DeviceEnergyManagement, EnergyEvse } from 'matterbridge/matter/clusters';

import { discoverGoEChargers } from './discovery/mdns.js';
import { createGoEClient } from './modbus/client.js';
import { mapOfflineToMatter, mapStatusToMatter } from './modbus/mapper.js';
import { clamp } from './modbus/registers.js';
import type { ChargerConnectionConfig, GoEClient } from './modbus/types.js';

/** Plugin configuration for matterbridge-go-e. */
export type GoEPlatformConfig = BasePlatformConfig & {
  discovery?: boolean;
  chargers?: ChargerConnectionConfig[];
  pollInterval?: number;
  debug?: boolean;
  unregisterOnShutdown?: boolean;
};

type ChargerRuntime = {
  config: ChargerConnectionConfig;
  client: GoEClient;
  evse: Evse;
  deviceId: string;
  connected: boolean;
};

const STARTUP_CONNECT_ATTEMPTS = 3;
const STARTUP_CONNECT_DELAY_MS = 2000;

/** Factory used to create Modbus clients (overridable in tests). */
export type GoEClientFactory = (config: ChargerConnectionConfig, log: AnsiLogger) => GoEClient;

/**
 * Matterbridge platform exposing go-e chargers as Matter EVSE devices.
 */
export class GoEPlatform extends MatterbridgeDynamicPlatform {
  private readonly clientFactory: GoEClientFactory;
  private readonly runtimes = new Map<string, ChargerRuntime>();
  private readonly pendingChargers = new Map<string, ChargerConnectionConfig>();
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * Creates the go-e platform instance.
   *
   * @param {PlatformMatterbridge} matterbridge - Matterbridge host API.
   * @param {AnsiLogger} log - Platform logger.
   * @param {GoEPlatformConfig} config - Plugin configuration.
   * @param {GoEClientFactory} [clientFactory] - Optional Modbus client factory.
   */
  constructor(matterbridge: PlatformMatterbridge, log: AnsiLogger, config: GoEPlatformConfig, clientFactory: GoEClientFactory = createGoEClient) {
    super(matterbridge, log, config);
    this.clientFactory = clientFactory;

    if (typeof this.verifyMatterbridgeVersion !== 'function' || !this.verifyMatterbridgeVersion('3.9.0')) {
      throw new Error(
        `This plugin requires Matterbridge version >= "3.9.0". Please update Matterbridge from ${this.matterbridge.matterbridgeVersion} to the latest version in the frontend."`,
      );
    }

    this.log.info('Initializing go-e platform...');
  }

  /** @inheritdoc */
  override async onStart(reason?: string): Promise<void> {
    this.log.info(`onStart called with reason: ${reason ?? 'none'}`);
    await this.ready;

    const chargers = await this.resolveChargers();
    if (chargers.length === 0) {
      this.log.warn('No go-e chargers configured or discovered.');
      return;
    }

    for (const chargerConfig of chargers) {
      await this.tryRegisterCharger(chargerConfig);
    }

    this.startPolling();
  }

  /** @inheritdoc */
  override async onConfigure(): Promise<void> {
    await super.onConfigure();
    this.log.info('onConfigure called');

    for (const runtime of this.runtimes.values()) {
      if (!runtime.connected) {
        await this.tryReconnectCharger(runtime);
        continue;
      }

      try {
        const status = await runtime.client.readStatus();
        await this.applyStatus(runtime.evse, status);
        this.log.info(`Configured EVSE ${runtime.evse.deviceName} (${runtime.config.host})`);
      } catch (error) {
        await this.markChargerOffline(runtime, error);
      }
    }
  }

  /** @inheritdoc */
  override async onChangeLoggerLevel(logLevel: LogLevel): Promise<void> {
    this.log.info(`onChangeLoggerLevel called with: ${logLevel}`);
    await Promise.resolve();
  }

  /** @inheritdoc */
  override async onShutdown(reason?: string): Promise<void> {
    this.stopPolling();

    for (const runtime of this.runtimes.values()) {
      await runtime.client.close().catch((error: unknown) => {
        this.log.warn(`Error closing Modbus client for ${runtime.config.host}: ${String(error)}`);
      });
      await this.unregisterDevice(runtime.evse).catch((error: unknown) => {
        this.log.warn(`Error unregistering EVSE ${runtime.evse.deviceName}: ${String(error)}`);
      });
    }
    this.runtimes.clear();
    this.pendingChargers.clear();

    await super.onShutdown(reason);
    this.log.info(`onShutdown called with reason: ${reason ?? 'none'}`);

    if (this.pluginConfig.unregisterOnShutdown) {
      await this.unregisterAllDevices();
    }
  }

  /**
   * Typed view of the plugin configuration.
   *
   * @returns {GoEPlatformConfig} Plugin configuration.
   */
  private get pluginConfig(): GoEPlatformConfig {
    return this.config as GoEPlatformConfig;
  }

  /**
   * Resolves charger list from config and optional mDNS discovery.
   *
   * @returns {Promise<ChargerConnectionConfig[]>} Charger connection configs.
   */
  private async resolveChargers(): Promise<ChargerConnectionConfig[]> {
    const configured = (this.pluginConfig.chargers ?? []).map((charger) => ({
      host: charger.host,
      port: charger.port ?? 502,
      unitId: charger.unitId ?? 1,
      name: charger.name,
      serial: charger.serial,
    }));

    if (configured.length > 0) {
      return configured;
    }

    if (this.pluginConfig.discovery) {
      this.log.info('Discovering go-e chargers via mDNS...');
      return discoverGoEChargers();
    }

    return [];
  }

  /**
   * Stable key for chargers awaiting first successful Modbus connection.
   *
   * @param {ChargerConnectionConfig} chargerConfig - Charger connection settings.
   * @returns {string} Pending charger key.
   */
  private pendingChargerKey(chargerConfig: ChargerConnectionConfig): string {
    return `${chargerConfig.host}:${chargerConfig.port ?? 502}`;
  }

  /**
   * Builds the runtime device id from a charger serial number.
   *
   * @param {string} serial - Charger serial number.
   * @returns {string} Runtime device id.
   */
  private runtimeDeviceId(serial: string): string {
    return `goe-${serial.replaceAll(/[^a-zA-Z0-9]/g, '')}`;
  }

  /**
   * Waits between connection attempts.
   *
   * @param {number} ms - Delay in milliseconds.
   */
  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  /**
   * Connects with retries, registers the EVSE, or queues the charger for later polling.
   *
   * @param {ChargerConnectionConfig} chargerConfig - Charger connection settings.
   * @param {number} [maxAttempts] - Number of connection attempts before deferring to polling.
   */
  private async tryRegisterCharger(chargerConfig: ChargerConnectionConfig, maxAttempts = STARTUP_CONNECT_ATTEMPTS): Promise<void> {
    const pendingKey = this.pendingChargerKey(chargerConfig);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.registerCharger(chargerConfig);
        this.pendingChargers.delete(pendingKey);
        return;
      } catch (error) {
        const message = String(error);
        if (attempt < maxAttempts) {
          this.log.warn(`go-e at ${chargerConfig.host} unavailable (attempt ${attempt}/${maxAttempts}): ${message}`);
          await this.delay(STARTUP_CONNECT_DELAY_MS);
          continue;
        }
        this.pendingChargers.set(pendingKey, chargerConfig);
        if (maxAttempts > 1) {
          this.log.warn(`go-e at ${chargerConfig.host} unavailable after ${maxAttempts} attempts: ${message}. Will keep retrying in the background.`);
        }
      }
    }
  }

  /**
   * Connects to a charger, creates an EVSE endpoint, and registers it.
   *
   * @param {ChargerConnectionConfig} chargerConfig - Charger connection settings.
   */
  private async registerCharger(chargerConfig: ChargerConnectionConfig): Promise<void> {
    const client = this.clientFactory(chargerConfig, this.log);

    try {
      await client.connect();
      const status = await client.readStatus();
      const deviceName = chargerConfig.name ?? status.hostname ?? `go-e ${chargerConfig.host}`;
      const serial = chargerConfig.serial ?? status.serial ?? chargerConfig.host;
      const deviceId = this.runtimeDeviceId(serial);

      const evse = new Evse(deviceName, serial);
      const runtime: ChargerRuntime = {
        config: chargerConfig,
        client,
        evse,
        deviceId,
        connected: true,
      };
      this.wireCommandHandlers(runtime);

      await this.registerDevice(evse);

      this.runtimes.set(deviceId, runtime);
      this.log.info(`Registered go-e EVSE ${deviceName} (${chargerConfig.host})`);
    } catch (error) {
      await client.close().catch(() => {
        // Ignore errors while closing a failed connection.
      });
      throw error;
    }
  }

  /**
   * Marks a charger runtime as offline and updates Matter attributes.
   *
   * @param {ChargerRuntime} runtime - Charger runtime that lost connectivity.
   * @param {unknown} error - Connection or Modbus error.
   */
  private async markChargerOffline(runtime: ChargerRuntime, error: unknown): Promise<void> {
    if (!runtime.connected) {
      return;
    }

    runtime.connected = false;
    await runtime.client.close().catch(() => {
      // Ignore errors while closing an offline connection.
    });
    this.log.warn(`go-e at ${runtime.config.host} went offline: ${String(error)}`);
    await this.applyOfflineStatus(runtime.evse);
  }

  /**
   * Attempts to restore Modbus connectivity for an offline charger.
   *
   * @param {ChargerRuntime} runtime - Offline charger runtime.
   */
  private async tryReconnectCharger(runtime: ChargerRuntime): Promise<void> {
    const client = this.clientFactory(runtime.config, this.log);

    try {
      await client.connect();
      const status = await client.readStatus();
      await runtime.client.close().catch(() => {
        // Ignore errors while replacing the Modbus client.
      });
      runtime.client = client;
      runtime.connected = true;
      await this.applyStatus(runtime.evse, status);
      this.log.info(`go-e at ${runtime.config.host} is back online`);
    } catch {
      await client.close().catch(() => {
        // Ignore errors while closing a failed reconnect attempt.
      });
    }
  }

  /**
   * Wires Matter EVSE commands to go-e Modbus writes.
   *
   * @param {ChargerRuntime} runtime - Charger runtime with live Modbus client.
   */
  private wireCommandHandlers(runtime: ChargerRuntime): void {
    runtime.evse.addCommandHandler('EnergyEvse.disable', async () => {
      if (!runtime.connected) {
        throw new Error(`go-e charger at ${runtime.config.host} is offline`);
      }
      await runtime.client.setForceState(1);
    });

    runtime.evse.addCommandHandler('EnergyEvse.enableCharging', async (data) => {
      if (!runtime.connected) {
        throw new Error(`go-e charger at ${runtime.config.host} is offline`);
      }
      const milliamps = Number(data.request.maximumChargeCurrent ?? 16_000);
      const amps = clamp(Math.round(milliamps / 1000), 6, 32);
      await runtime.client.setAmperage(amps);
      await runtime.client.setForceState(2);
    });
  }

  /**
   * Starts polling all chargers for status updates.
   */
  private startPolling(): void {
    const intervalMs = this.pluginConfig.pollInterval ?? 2000;
    this.pollTimer = setInterval(() => {
      void this.pollAll();
    }, intervalMs);
  }

  /**
   * Stops the status polling timer.
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /**
   * Polls all registered chargers and updates Matter attributes.
   */
  private async pollAll(): Promise<void> {
    for (const chargerConfig of this.pendingChargers.values()) {
      await this.tryRegisterCharger(chargerConfig, 1);
    }

    for (const runtime of this.runtimes.values()) {
      if (!runtime.connected) {
        await this.tryReconnectCharger(runtime);
        continue;
      }

      try {
        const status = await runtime.client.readStatus();
        await this.applyStatus(runtime.evse, status);
      } catch (error) {
        await this.markChargerOffline(runtime, error);
      }
    }
  }

  /**
   * Applies a go-e status snapshot to a Matter EVSE endpoint.
   *
   * @param {Evse} evse - Matter EVSE endpoint.
   * @param {import('./modbus/types.js').GoEStatus} status - go-e status snapshot.
   */
  private async applyStatus(evse: Evse, status: import('./modbus/types.js').GoEStatus): Promise<void> {
    const updates = mapStatusToMatter(status);

    await evse.updateAttribute(EnergyEvse, 'state', updates.state, this.log);
    await evse.updateAttribute(EnergyEvse, 'supplyState', updates.supplyState, this.log);
    await evse.updateAttribute(EnergyEvse, 'faultState', updates.faultState, this.log);

    const electricalSensor = evse.getChildEndpointById('ElectricalSensor');
    if (electricalSensor) {
      if (updates.activePower !== null) {
        await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'activePower', updates.activePower, this.log);
      }
      if (updates.voltage !== null) {
        await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'voltage', updates.voltage, this.log);
      }
      if (updates.current !== null) {
        await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'activeCurrent', updates.current, this.log);
      }
    }

    if (updates.sessionEnergyWh !== null) {
      await evse.updateAttribute(EnergyEvse, 'sessionEnergyCharged', updates.sessionEnergyWh * 1000, this.log);
    }

    await this.applyOnlineState(evse);
  }

  /**
   * Applies Matter attributes indicating the charger is unreachable.
   *
   * @param {Evse} evse - Matter EVSE endpoint.
   */
  private async applyOfflineStatus(evse: Evse): Promise<void> {
    const updates = mapOfflineToMatter();

    await evse.updateAttribute(EnergyEvse, 'state', updates.state, this.log);
    await evse.updateAttribute(EnergyEvse, 'supplyState', updates.supplyState, this.log);
    await evse.updateAttribute(EnergyEvse, 'faultState', updates.faultState, this.log);

    const electricalSensor = evse.getChildEndpointById('ElectricalSensor');
    if (electricalSensor) {
      await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'activePower', null, this.log);
      await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'voltage', null, this.log);
      await electricalSensor.updateAttribute('ElectricalPowerMeasurement', 'activeCurrent', null, this.log);
    }

    const energyManagement = evse.getChildEndpointById('DeviceEnergyManagement');
    if (energyManagement) {
      await energyManagement.updateAttribute('DeviceEnergyManagement', 'esaState', DeviceEnergyManagement.EsaState.Offline, this.log);
    }
  }

  /**
   * Marks the composed energy-management endpoint as online.
   *
   * @param {Evse} evse - Matter EVSE endpoint.
   */
  private async applyOnlineState(evse: Evse): Promise<void> {
    const energyManagement = evse.getChildEndpointById('DeviceEnergyManagement');
    if (energyManagement) {
      await energyManagement.updateAttribute('DeviceEnergyManagement', 'esaState', DeviceEnergyManagement.EsaState.Online, this.log);
    }
  }
}
