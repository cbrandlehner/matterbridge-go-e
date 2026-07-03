/**
 * @file client.ts
 * @description Modbus TCP client for go-e Gemini/PRO chargers.
 */

import type { AnsiLogger } from 'matterbridge/logger';
import ModbusImport from 'modbus-serial';

import {
  HOLDING_AMPERE_VOLATILE,
  HOLDING_FORCE_STATE,
  INPUT_ALLOW,
  INPUT_CAR_STATE,
  INPUT_ENERGY_CHARGE,
  INPUT_ERROR,
  INPUT_POWER_TOTAL,
  INPUT_SERIAL,
  INPUT_VOLT_L1,
  ampRawToMa,
  powerRawToMw,
  readAsciiRegisters,
  readUint32Be,
  sessionEnergyRawToWh,
} from './registers.js';
import type { ChargerConnectionConfig, GoEClient, GoEStatus } from './types.js';

type ModbusClient = import('modbus-serial').default;

// modbus-serial default export is constructable at runtime but lacks a construct signature in its types.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- CJS default export typing gap
const ModbusRTU = ModbusImport as unknown as new () => ModbusClient;

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Modbus TCP client for a single go-e charger.
 */
export class GoEModbusClient implements GoEClient {
  private readonly client: ModbusClient = new ModbusRTU();

  /**
   * Creates a go-e Modbus client.
   *
   * @param {ChargerConnectionConfig} config - Charger connection settings.
   * @param {AnsiLogger} log - Logger instance.
   */
  constructor(
    private readonly config: ChargerConnectionConfig,
    private readonly log: AnsiLogger,
  ) {
    this.client.setTimeout(DEFAULT_TIMEOUT_MS);
  }

  /**
   * Opens the Modbus TCP connection.
   */
  async connect(): Promise<void> {
    await this.client.connectTCP(this.config.host, { port: this.config.port });
    this.client.setID(this.config.unitId);
    this.log.debug(`Connected to go-e Modbus at ${this.config.host}:${this.config.port}`);
  }

  /**
   * Closes the Modbus TCP connection.
   */
  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.client.close(() => resolve());
    });
  }

  /**
   * Reads the current charger status from Modbus registers.
   *
   * @returns {Promise<GoEStatus>} Parsed status snapshot.
   */
  async readStatus(): Promise<GoEStatus> {
    const telemetry = await this.client.readInputRegisters(INPUT_CAR_STATE, 22);
    const allow = await this.client.readInputRegisters(INPUT_ALLOW, 1);
    const session = await this.client.readInputRegisters(INPUT_ENERGY_CHARGE, 2);
    const identity = await this.client.readInputRegisters(INPUT_SERIAL, 12);

    const telemetryData = telemetry.data;
    const carState = telemetryData[0] ?? 0;
    const error = telemetryData[INPUT_ERROR - INPUT_CAR_STATE] ?? 0;
    const voltageRaw = readUint32Be(telemetryData, INPUT_VOLT_L1 - INPUT_CAR_STATE);
    const currentRaw = readUint32Be(telemetryData, INPUT_VOLT_L1 - INPUT_CAR_STATE + 6);
    const powerRaw = readUint32Be(telemetryData, INPUT_POWER_TOTAL - INPUT_CAR_STATE);
    const sessionRaw = readUint32Be(session.data, 0);

    const serialFromModbus = readAsciiRegisters(identity.data, 0, 6);
    const hostnameFromModbus = readAsciiRegisters(identity.data, 6, 6);

    return {
      carState,
      allow: allow.data[0] ?? 0,
      error,
      powerTotalMw: powerRaw > 0 ? powerRawToMw(powerRaw) : null,
      voltageMv: voltageRaw > 0 ? voltageRaw * 1000 : null,
      currentMa: currentRaw > 0 ? ampRawToMa(currentRaw) : null,
      sessionEnergyWh: sessionRaw > 0 ? sessionEnergyRawToWh(sessionRaw) : null,
      serial: this.config.serial ?? serialFromModbus,
      hostname: this.config.name ?? hostnameFromModbus,
    };
  }

  /**
   * Sets the go-e force state (0=auto, 1=off, 2=on).
   *
   * @param {0 | 1 | 2} state - Force state value.
   */
  async setForceState(state: 0 | 1 | 2): Promise<void> {
    await this.writeHoldingRegister(HOLDING_FORCE_STATE, state);
    this.log.info(`Set go-e FORCE_STATE=${state} on ${this.config.host}`);
  }

  /**
   * Sets the volatile charge current in whole amperes.
   *
   * @param {number} amps - Target current (6–32 A).
   */
  async setAmperage(amps: number): Promise<void> {
    await this.writeHoldingRegister(HOLDING_AMPERE_VOLATILE, amps);
    this.log.info(`Set go-e AMPERE_VOLATILE=${amps}A on ${this.config.host}`);
  }

  /**
   * Writes a single holding register using Modbus function 16.
   *
   * @param {number} address - Register address.
   * @param {number} value - Value to write.
   */
  private async writeHoldingRegister(address: number, value: number): Promise<void> {
    await this.client.writeRegisters(address, [value]);
  }
}

/**
 * Creates a Modbus client for a go-e charger.
 *
 * @param {ChargerConnectionConfig} config - Charger connection settings.
 * @param {AnsiLogger} log - Logger instance.
 * @returns {GoEClient} Modbus client instance.
 */
export function createGoEClient(config: ChargerConnectionConfig, log: AnsiLogger): GoEClient {
  return new GoEModbusClient(config, log);
}
