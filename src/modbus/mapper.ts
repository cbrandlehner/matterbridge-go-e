/**
 * @file mapper.ts
 * @description Maps go-e Modbus status values to Matter EnergyEvse attributes.
 */

import { EnergyEvse } from 'matterbridge/matter/clusters';

import type { GoEStatus } from './types.js';

/** Matter attribute updates derived from a go-e status snapshot. */
export type MatterEvseUpdates = {
  state: EnergyEvse.State;
  supplyState: EnergyEvse.SupplyState;
  faultState: EnergyEvse.FaultState;
  activePower: number | null;
  voltage: number | null;
  current: number | null;
  sessionEnergyWh: number | null;
};

/**
 * Maps go-e CAR_STATE to Matter EnergyEvse.State.
 *
 * @param {number} carState - go-e car state register value.
 * @returns {EnergyEvse.State} Matter EVSE state.
 */
export function mapCarState(carState: number): EnergyEvse.State {
  switch (carState) {
    case 1:
      return EnergyEvse.State.NotPluggedIn;
    case 2:
      return EnergyEvse.State.PluggedInCharging;
    case 3:
      return EnergyEvse.State.PluggedInDemand;
    case 4:
      return EnergyEvse.State.PluggedInNoDemand;
    default:
      return EnergyEvse.State.Fault;
  }
}

/**
 * Maps go-e ERROR register values to Matter EnergyEvse.FaultState.
 *
 * @param {number} error - go-e error code (0 = no error).
 * @returns {EnergyEvse.FaultState} Matter fault state.
 */
export function mapGoEErrorToFaultState(error: number): EnergyEvse.FaultState {
  if (error === 0) {
    return EnergyEvse.FaultState.NoError;
  }
  switch (error) {
    case 1:
    case 8:
      return EnergyEvse.FaultState.GroundFault;
    case 3:
      return EnergyEvse.FaultState.PowerQuality;
    default:
      return EnergyEvse.FaultState.Other;
  }
}

/**
 * Maps go-e ALLOW register to Matter EnergyEvse.SupplyState.
 *
 * @param {number} allow - go-e allow charging flag (0 or 1).
 * @returns {EnergyEvse.SupplyState} Matter supply state.
 */
export function mapAllowToSupplyState(allow: number): EnergyEvse.SupplyState {
  return allow === 1 ? EnergyEvse.SupplyState.ChargingEnabled : EnergyEvse.SupplyState.Disabled;
}

/**
 * Builds Matter attribute updates from a go-e status snapshot.
 *
 * @param {GoEStatus} status - go-e status snapshot.
 * @returns {MatterEvseUpdates} Matter attribute values.
 */
export function mapStatusToMatter(status: GoEStatus): MatterEvseUpdates {
  return {
    state: mapCarState(status.carState),
    supplyState: mapAllowToSupplyState(status.allow),
    faultState: mapGoEErrorToFaultState(status.error),
    activePower: status.powerTotalMw,
    voltage: status.voltageMv,
    current: status.currentMa,
    sessionEnergyWh: status.sessionEnergyWh,
  };
}

/**
 * Matter attribute values used when the go-e charger is unreachable.
 *
 * @returns {MatterEvseUpdates} Offline EVSE attribute snapshot.
 */
export function mapOfflineToMatter(): MatterEvseUpdates {
  return {
    state: EnergyEvse.State.Fault,
    supplyState: EnergyEvse.SupplyState.Disabled,
    faultState: EnergyEvse.FaultState.Other,
    activePower: null,
    voltage: null,
    current: null,
    sessionEnergyWh: null,
  };
}
