import { EnergyEvse } from 'matterbridge/matter/clusters';

import { mapCarState, mapGoEErrorToFaultState, mapOfflineToMatter, mapStatusToMatter } from '../src/modbus/mapper.js';

describe('go-e mapper', () => {
  it('maps car states to Matter EVSE states', () => {
    expect(mapCarState(1)).toBe(EnergyEvse.State.NotPluggedIn);
    expect(mapCarState(2)).toBe(EnergyEvse.State.PluggedInCharging);
    expect(mapCarState(3)).toBe(EnergyEvse.State.PluggedInDemand);
    expect(mapCarState(4)).toBe(EnergyEvse.State.PluggedInNoDemand);
    expect(mapCarState(0)).toBe(EnergyEvse.State.Fault);
  });

  it('maps go-e errors to Matter fault states', () => {
    expect(mapGoEErrorToFaultState(0)).toBe(EnergyEvse.FaultState.NoError);
    expect(mapGoEErrorToFaultState(1)).toBe(EnergyEvse.FaultState.GroundFault);
    expect(mapGoEErrorToFaultState(3)).toBe(EnergyEvse.FaultState.PowerQuality);
    expect(mapGoEErrorToFaultState(10)).toBe(EnergyEvse.FaultState.Other);
  });

  it('maps a full status snapshot', () => {
    const updates = mapStatusToMatter({
      carState: 2,
      allow: 1,
      error: 0,
      powerTotalMw: 3600000,
      voltageMv: 230000,
      currentMa: 16000,
      sessionEnergyWh: 1500,
      serial: '206540',
      hostname: 'C2Home_Gemini_206540',
    });

    expect(updates.state).toBe(EnergyEvse.State.PluggedInCharging);
    expect(updates.supplyState).toBe(EnergyEvse.SupplyState.ChargingEnabled);
    expect(updates.faultState).toBe(EnergyEvse.FaultState.NoError);
    expect(updates.activePower).toBe(3600000);
    expect(updates.voltage).toBe(230000);
    expect(updates.current).toBe(16000);
    expect(updates.sessionEnergyWh).toBe(1500);
  });

  it('maps offline chargers to fault/disabled state', () => {
    const updates = mapOfflineToMatter();

    expect(updates.state).toBe(EnergyEvse.State.Fault);
    expect(updates.supplyState).toBe(EnergyEvse.SupplyState.Disabled);
    expect(updates.faultState).toBe(EnergyEvse.FaultState.Other);
    expect(updates.activePower).toBeNull();
    expect(updates.voltage).toBeNull();
    expect(updates.current).toBeNull();
    expect(updates.sessionEnergyWh).toBeNull();
  });
});
