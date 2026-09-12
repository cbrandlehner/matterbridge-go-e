/**
 * @file evse.ts
 * @description Matterbridge Evse factory that enables the EnergyEvse Rfid feature when the host supports it.
 */

import { Evse } from 'matterbridge/devices';
import type { AnsiLogger } from 'matterbridge/logger';

/** Constructor used to create an {@link Evse} (host class or test double). */
type EvseCtor = new (...args: unknown[]) => Evse;

/**
 * Narrows a class object to an Evse constructor.
 *
 * @param {object} ctor - Host `Evse` class or a test double.
 * @returns {EvseCtor} Construct signature used by {@link createGoEEvse}.
 */
function toEvseCtor(ctor: object): EvseCtor {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- host Evse and test doubles share no common construct signature
  return ctor as EvseCtor;
}

/**
 * Creates an EVSE endpoint and enables the EnergyEvse `Rfid` feature when available.
 *
 * Matterbridge 3.10.9+ accepts `EvseOptions` as the third argument and exposes
 * `triggerRfidEvent`. Older constructors treat that argument as `currentMode`,
 * so the options object is only passed when `triggerRfidEvent` exists.
 *
 * @param {string} deviceName - Matter device name.
 * @param {string} serial - Matter serial number.
 * @param {object} [EvseClass] - Evse constructor, overridable in tests.
 * @returns {Evse} EVSE endpoint.
 */
export function createGoEEvse(deviceName: string, serial: string, EvseClass: object = Evse): Evse {
  const Ctor = toEvseCtor(EvseClass);
  const hasRfidApi = typeof Reflect.get(Ctor.prototype, 'triggerRfidEvent') === 'function';
  return new Ctor(...(hasRfidApi ? [deviceName, serial, { rfid: true }] : [deviceName, serial]));
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
