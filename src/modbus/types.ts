/**
 * @file types.ts
 * @description Types for go-e Modbus status and plugin configuration.
 */

/** Connection settings for a single go-e charger. */
export type ChargerConnectionConfig = {
  host: string;
  port: number;
  unitId: number;
  name?: string;
  serial?: string;
};

/** Snapshot of go-e charger state read from Modbus input/holding registers. */
export type GoEStatus = {
  carState: number;
  allow: number;
  error: number;
  powerTotalMw: number | null;
  voltageMv: number | null;
  currentMa: number | null;
  sessionEnergyWh: number | null;
  serial: string;
  hostname: string;
};

/** Callback interface used by the platform to talk to a charger. */
export type GoEClient = {
  connect(): Promise<void>;
  close(): Promise<void>;
  readStatus(): Promise<GoEStatus>;
  setForceState(state: 0 | 1 | 2): Promise<void>;
  setAmperage(amps: number): Promise<void>;
};
