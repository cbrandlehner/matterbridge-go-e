/**
 * @file evse.ts
 * @description Matterbridge Evse factory that enables the EnergyEvse Rfid feature when the host supports it.
 */

import { Evse } from 'matterbridge/devices';
import type { AnsiLogger } from 'matterbridge/logger';

/** Evse constructor that accepts Matterbridge 3.10.9 `EvseOptions` as the third argument. */
export type RfidEvseConstructor = new (name: string, serial: string, options?: { rfid: boolean }) => Evse;

/**
 * Creates an EVSE endpoint and enables the EnergyEvse `Rfid` feature when available.
 *
 * Matterbridge 3.10.9+ accepts `EvseOptions` as the third argument and exposes
 * `triggerRfidEvent`. Older constructors treat that argument as `currentMode`,
 * so the options object is only passed when `triggerRfidEvent` exists.
 *
 * @param {string} deviceName - Matter device name.
 * @param {string} serial - Matter serial number.
 * @param {RfidEvseConstructor} [EvseClass] - Evse constructor, overridable in tests.
 * @returns {Evse} EVSE endpoint.
 */
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- EvseOptions exists only on Matterbridge >= 3.10.9
export function createGoEEvse(deviceName: string, serial: string, EvseClass: RfidEvseConstructor = Evse as unknown as RfidEvseConstructor): Evse {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- triggerRfidEvent exists only on Matterbridge >= 3.10.9
  const hasRfidApi = typeof (EvseClass.prototype as { triggerRfidEvent?: unknown }).triggerRfidEvent === 'function';
  if (!hasRfidApi) {
    return new EvseClass(deviceName, serial);
  }
  return new EvseClass(deviceName, serial, { rfid: true });
}

/**
 * Emits a Matter EnergyEvse `Rfid` event on a 3.10.9+ Evse endpoint.
 *
 * @param {Evse} evse - EVSE endpoint created by {@link createGoEEvse}.
 * @param {Uint8Array} uid - RFID UID of length 4, 7, or 10.
 * @param {AnsiLogger} log - Logger forwarded to Matterbridge.
 * @returns {Promise<void>} Resolves after the host RFID helper returns.
 */
export async function emitRfidEvent(evse: Evse, uid: Uint8Array, log: AnsiLogger): Promise<void> {
  const triggerRfidEvent: unknown = Reflect.get(evse, 'triggerRfidEvent');
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- host RFID helper is not in the 3.9.x Evse typings
  await (triggerRfidEvent as (this: Evse, uid: Uint8Array, log?: AnsiLogger) => Promise<boolean>).call(evse, uid, log);
}
