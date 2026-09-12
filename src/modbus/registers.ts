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

/** Input register: lifetime energy (uint32, two registers). */
export const INPUT_ENERGY_TOTAL = 128;

/** Input register: session energy (uint32, two registers). */
export const INPUT_ENERGY_CHARGE = 132;

/** Input register: allow charging flag (mirrors holding ALLOW). */
export const INPUT_ALLOW = 200;

/** Input register: RFID slot that unlocked the current charging session (1–10, 0 = none). */
export const INPUT_UNLOCKED_BY = 203;

/** Input register: serial number ASCII (6 registers). */
export const INPUT_SERIAL = 304;

/** Input register: hostname ASCII (6 registers). */
export const INPUT_HOSTNAME = 310;

/** Holding register: volatile amperage setpoint (6–32 A). */
export const HOLDING_AMPERE_VOLATILE = 299;

/** Holding register: force state (0=auto, 1=off, 2=on). */
export const HOLDING_FORCE_STATE = 337;

/** Input register: last scanned RFID UID (10 bytes / 5 registers, firmware 55.5+). */
export const INPUT_RFID_CARD = 327;

/** Number of Modbus registers that store the last scanned RFID UID. */
export const RFID_UID_REGISTER_COUNT = 5;

/** Number of learned RFID card energy slots (`ENERGY_CARD0`–`ENERGY_CARD9`). */
export const RFID_CARD_SLOTS = 10;

/** Number of Modbus registers per RFID card energy counter (IEEE-754 float64). */
export const ENERGY_CARD_REGISTER_COUNT = 4;

/** Contiguous RFID UID + card-energy block starting at {@link INPUT_RFID_CARD}. */
export const RFID_BLOCK_REGISTER_COUNT = RFID_UID_REGISTER_COUNT + RFID_CARD_SLOTS * ENERGY_CARD_REGISTER_COUNT;

/** Zeroed lifetime energy for all 10 RFID card slots, in watt-hours. */
export const EMPTY_CARD_ENERGY_WH: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

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
 * Packs consecutive uint16 Modbus registers into a big-endian byte array.
 *
 * Missing registers are treated as 0.
 *
 * @param {number[]} data - Register data buffer.
 * @param {number} index - Start index in the buffer.
 * @param {number} registerCount - Number of registers to pack.
 * @returns {Uint8Array} Packed bytes (`registerCount * 2` long).
 */
export function readBinaryRegisters(data: number[], index: number, registerCount: number): Uint8Array {
  const bytes = new Uint8Array(registerCount * 2);
  for (let i = 0; i < registerCount; i++) {
    const value = data[index + i] ?? 0;
    bytes[i * 2] = Math.floor(value / 256);
    bytes[i * 2 + 1] = value % 256;
  }
  return bytes;
}

/**
 * Reads an IEEE-754 float64 from four big-endian Modbus registers.
 *
 * Edge cases:
 *  - Missing registers are treated as 0
 *  - Non-finite values (NaN / Inf) return 0
 *
 * @param {number[]} data - Register data buffer.
 * @param {number} index - Index of the first (high) register.
 * @returns {number} Decoded float64 value.
 */
export function readFloat64Be(data: number[], index: number): number {
  const bytes = new Uint8Array(8);
  for (let wordIndex = 0; wordIndex < 4; wordIndex++) {
    const word = data[index + wordIndex] ?? 0;
    bytes[wordIndex * 2] = Math.floor(word / 256);
    bytes[wordIndex * 2 + 1] = word % 256;
  }
  const value = new DataView(bytes.buffer).getFloat64(0, false);
  return Number.isFinite(value) ? value : 0;
}

/**
 * Decodes a go-e `RFID_CARD` 10-byte field into a Matter RFID UID.
 *
 * 4-byte and 7-byte UIDs are stored left-aligned and padded with trailing zeros.
 * An all-zero field means no scan has been recorded.
 *
 * Edge cases:
 *  - Returns `null` when every byte is 0
 *  - Returns 4 bytes when bytes 4–9 are 0
 *  - Returns 7 bytes when bytes 7–9 are 0
 *  - Otherwise returns all 10 bytes
 *
 * @param {Uint8Array} bytes - 10-byte RFID_CARD payload.
 * @returns {Uint8Array | null} UID of length 4, 7, or 10, or `null` if empty.
 */
export function decodeRfidUid(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 10) {
    return null;
  }
  let isEmpty = true;
  for (let i = 0; i < 10; i++) {
    if (bytes[i] !== 0) {
      isEmpty = false;
      break;
    }
  }
  if (isEmpty) {
    return null;
  }
  const isFourByte = bytes[4] === 0 && bytes[5] === 0 && bytes[6] === 0 && bytes[7] === 0 && bytes[8] === 0 && bytes[9] === 0;
  if (isFourByte) {
    return Uint8Array.from(bytes.subarray(0, 4));
  }
  const isSevenByte = bytes[7] === 0 && bytes[8] === 0 && bytes[9] === 0;
  if (isSevenByte) {
    return Uint8Array.from(bytes.subarray(0, 7));
  }
  return Uint8Array.from(bytes.subarray(0, 10));
}

/**
 * Reads the 10 RFID card lifetime energy counters from a Modbus block.
 *
 * Values are IEEE-754 float64 watt-hours (go-e V3+). Negative or non-finite
 * values are treated as 0.
 *
 * @param {number[]} data - Register data buffer starting at the first energy word.
 * @param {number} index - Index of `ENERGY_CARD0`.
 * @returns {number[]} Length-10 array of card energy in Wh.
 */
export function readCardEnergyWh(data: number[], index: number): number[] {
  const energies = [...EMPTY_CARD_ENERGY_WH];
  for (let slot = 0; slot < RFID_CARD_SLOTS; slot++) {
    const value = readFloat64Be(data, index + slot * ENERGY_CARD_REGISTER_COUNT);
    energies[slot] = value > 0 ? value : 0;
  }
  return energies;
}

/**
 * Formats an RFID UID as lowercase hex without separators.
 *
 * @param {Uint8Array | null} uid - UID bytes, or `null` when no card is present.
 * @returns {string} Hex string, or an empty string when `uid` is empty.
 */
export function formatRfidUidHex(uid: Uint8Array | null): string {
  if (!uid || uid.length === 0) {
    return '';
  }
  return Array.from(uid, (byte) => byte.toString(16).padStart(2, '0')).join('');
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
 * Converts go-e ENERGY_TOTAL raw value (0.1 kWh units) to milliwatt-hours.
 *
 * @param {number} raw - Raw lifetime energy from ENERGY_TOTAL (0.1 kWh units).
 * @returns {number} Energy in milliwatt-hours.
 */
export function totalEnergyRawToMwh(raw: number): number {
  return raw * 100_000;
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
