/**
 * @file registers.ts
 * @description go-e Modbus register addresses and value scaling helpers.
 */

/** Input register: car connection / charging state. */
export const INPUT_CAR_STATE = 100;

/** Input register: fault code. */
export const INPUT_ERROR = 107;

/** Input register block start for voltage, current, and total power. */
export const INPUT_VOLT_L1 = 108;

/** Input register: total power (uint32, two registers). */
export const INPUT_POWER_TOTAL = 120;

/** Input register: session energy (uint32, two registers). */
export const INPUT_ENERGY_CHARGE = 132;

/** Input register: allow charging flag (mirrors holding ALLOW). */
export const INPUT_ALLOW = 200;

/** Input register: serial number ASCII (6 registers). */
export const INPUT_SERIAL = 304;

/** Input register: hostname ASCII (6 registers). */
export const INPUT_HOSTNAME = 310;

/** Holding register: volatile amperage setpoint (6–32 A). */
export const HOLDING_AMPERE_VOLATILE = 299;

/** Holding register: force state (0=auto, 1=off, 2=on). */
export const HOLDING_FORCE_STATE = 337;

/**
 * Combines two uint16 Modbus words into a uint32 (big-endian word order).
 *
 * @param {number[]} data - Register data buffer.
 * @param {number} index - Index of the high word.
 * @returns {number} Combined 32-bit value.
 */
export function readUint32Be(data: number[], index: number): number {
  const high = data[index] ?? 0;
  const low = data[index + 1] ?? 0;
  return high * 65_536 + low;
}

/**
 * Decodes ASCII text from consecutive uint16 Modbus registers.
 *
 * @param {number[]} data - Register data buffer.
 * @param {number} index - Start index in the buffer.
 * @param {number} registerCount - Number of registers to decode.
 * @returns {string} Trimmed ASCII string.
 */
export function readAsciiRegisters(data: number[], index: number, registerCount: number): string {
  const bytes: number[] = [];
  for (let i = 0; i < registerCount; i++) {
    const value = data[index + i] ?? 0;
    bytes.push(Math.floor(value / 256), value % 256);
  }
  return String.fromCharCode(...bytes)
    .replaceAll('\0', '')
    .trim();
}

/**
 * Converts go-e POWER_TOTAL raw value to milliwatts.
 *
 * @param {number} raw - Raw register value (0.01 W units).
 * @returns {number} Power in milliwatts.
 */
export function powerRawToMw(raw: number): number {
  return raw * 10;
}

/**
 * Converts go-e amp raw value (0.1 A) to milliamps.
 *
 * @param {number} raw - Raw amp value from a phase register.
 * @returns {number} Current in milliamps.
 */
export function ampRawToMa(raw: number): number {
  return raw * 100;
}

/**
 * Converts go-e ENERGY_CHARGE (deka-watt-seconds) to watt-hours.
 *
 * @param {number} raw - Raw session energy value.
 * @returns {number} Energy in Wh.
 */
export function sessionEnergyRawToWh(raw: number): number {
  return (raw * 10) / 3600;
}

/**
 * Clamps a number between min and max.
 *
 * @param {number} value - Input value.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @returns {number} Clamped value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
