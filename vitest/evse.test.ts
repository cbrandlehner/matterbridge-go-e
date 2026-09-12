import { createGoEEvse, type RfidEvseConstructor } from '../src/evse.js';

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
  it('omits EvseOptions when the host has no RFID API', () => {
    const evse = createGoEEvse('Garage', '206540', LegacyEvse as unknown as RfidEvseConstructor);
    expect(evse).toBeInstanceOf(LegacyEvse);
    expect((evse as unknown as LegacyEvse).options).toBeUndefined();
  });

  it('enables the Rfid feature when triggerRfidEvent exists', () => {
    const evse = createGoEEvse('Garage', '206540', RfidEvse as unknown as RfidEvseConstructor);
    expect(evse).toBeInstanceOf(RfidEvse);
    expect((evse as unknown as RfidEvse).options).toEqual({ rfid: true });
  });
});
