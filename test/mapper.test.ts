import { EnergyEvse } from 'matterbridge/matter/clusters';

import { mapCarState, mapGoEErrorToFaultState, mapOfflineToMatter, mapStatusToMatter } from '../src/modbus/mapper.js';
import { EMPTY_CARD_ENERGY_WH } from '../src/modbus/registers.js';

describe('go-e mapper', () => {
  it('should map car states to Matter EVSE states', () => {
    expect(mapCarState(1)).toBe(EnergyEvse.State.NotPluggedIn);
    expect(mapCarState(2)).toBe(EnergyEvse.State.PluggedInCharging);
    expect(mapCarState(3)).toBe(EnergyEvse.State.PluggedInDemand);
    expect(mapCarState(4)).toBe(EnergyEvse.State.PluggedInNoDemand);
    expect(mapCarState(0)).toBe(EnergyEvse.State.Fault);
  });

  it('should map go-e errors to Matter fault states', () => {
    expect(mapGoEErrorToFaultState(0)).toBe(EnergyEvse.FaultState.NoError);
    expect(mapGoEErrorToFaultState(1)).toBe(EnergyEvse.FaultState.GroundFault);
    expect(mapGoEErrorToFaultState(8)).toBe(EnergyEvse.FaultState.GroundFault);
    expect(mapGoEErrorToFaultState(3)).toBe(EnergyEvse.FaultState.PowerQuality);
    expect(mapGoEErrorToFaultState(10)).toBe(EnergyEvse.FaultState.Other);
  });

  it('should map a full status snapshot including disabled supply', () => {
    const updates = mapStatusToMatter({
      carState: 2,
      allow: 0,
      error: 0,
      powerTotalMw: 3_600_000,
      voltageMv: 230_000,
      currentMa: 16_000,
      sessionEnergyWh: 1500,
      totalEnergyMwh: 36_000_000,
      serial: '206540',
      hostname: 'C2Home_Gemini_206540',
      unlockedBy: 0,
      rfidUid: null,
      cardEnergyWh: [...EMPTY_CARD_ENERGY_WH],
    });

    expect(updates.state).toBe(EnergyEvse.State.PluggedInCharging);
    expect(updates.supplyState).toBe(EnergyEvse.SupplyState.Disabled);
    expect(updates.faultState).toBe(EnergyEvse.FaultState.NoError);
    expect(updates.activePower).toBe(3_600_000);
    expect(updates.voltage).toBe(230_000);
    expect(updates.current).toBe(16_000);
    expect(updates.sessionEnergyWh).toBe(1500);
    expect(updates.totalEnergyMwh).toBe(36_000_000);
  });

  it('should map offline chargers to fault/disabled state', () => {
    const updates = mapOfflineToMatter();

    expect(updates.state).toBe(EnergyEvse.State.Fault);
    expect(updates.supplyState).toBe(EnergyEvse.SupplyState.Disabled);
    expect(updates.faultState).toBe(EnergyEvse.FaultState.Other);
    expect(updates.activePower).toBeNull();
    expect(updates.voltage).toBeNull();
    expect(updates.current).toBeNull();
    expect(updates.sessionEnergyWh).toBeNull();
    expect(updates.totalEnergyMwh).toBeNull();
  });
});
