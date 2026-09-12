import { jest } from '@jest/globals';
import type { Evse } from 'matterbridge/devices';
import type { AnsiLogger } from 'matterbridge/logger';

import { createGoEEvse, emitRfidEvent, type RfidEvseConstructor } from '../src/evse.js';

class LegacyEvse {
  constructor(
    readonly name: string,
    readonly serial: string,
    readonly options?: { rfid: boolean },
  ) {}
}

class RfidEvse {
  async triggerRfidEvent(): Promise<boolean> {
    return true;
  }

  constructor(
    readonly name: string,
    readonly serial: string,
    readonly options?: { rfid: boolean },
  ) {}
}

describe('createGoEEvse', () => {
  it('should omit EvseOptions when the host has no RFID API', () => {
    const evse = createGoEEvse('Garage', '206540', LegacyEvse as unknown as RfidEvseConstructor);
    expect(evse).toBeInstanceOf(LegacyEvse);
    expect((evse as unknown as LegacyEvse).options).toBeUndefined();
  });

  it('should enable the Rfid feature when triggerRfidEvent exists', () => {
    const evse = createGoEEvse('Garage', '206540', RfidEvse as unknown as RfidEvseConstructor);
    expect(evse).toBeInstanceOf(RfidEvse);
    expect((evse as unknown as RfidEvse).options).toEqual({ rfid: true });
  });
});

describe('emitRfidEvent', () => {
  it('should forward the UID to triggerRfidEvent', async () => {
    const triggerRfidEvent = jest.fn(async () => true);
    const uid = Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]);
    const log = { debug: jest.fn() } as unknown as AnsiLogger;
    await emitRfidEvent({ triggerRfidEvent } as unknown as Evse, uid, log);
    expect(triggerRfidEvent).toHaveBeenCalledWith(uid, log);
  });
});
