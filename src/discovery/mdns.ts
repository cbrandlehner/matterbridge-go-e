/**
 * @file mdns.ts
 * @description mDNS discovery for go-e chargers (_go-e._go-eCharger._tcp).
 */

import { Bonjour } from 'bonjour-service';
import type { Service } from 'bonjour-service';

import type { ChargerConnectionConfig } from '../modbus/types.js';

const DISCOVERY_TIMEOUT_MS = 5000;

/**
 * Discovers go-e chargers on the local network via mDNS.
 *
 * @returns {Promise<ChargerConnectionConfig[]>} Discovered charger connection configs.
 */
export async function discoverGoEChargers(): Promise<ChargerConnectionConfig[]> {
  const bonjour = new Bonjour();
  const discovered = new Map<string, ChargerConnectionConfig>();

  return new Promise((resolve) => {
    const browser = bonjour.find({ type: 'go-eCharger', protocol: 'tcp' });

    browser.on('up', (service: Service) => {
      const host = service.addresses?.find((address: string) => address.includes('.')) ?? service.host;
      const serial = service.txt?.serial ?? service.name;
      const name = service.txt?.friendly_name ?? service.name;

      if (!host) return;

      discovered.set(serial, {
        host,
        port: 502,
        unitId: 1,
        name,
        serial,
      });
    });

    setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve([...discovered.values()]);
    }, DISCOVERY_TIMEOUT_MS);
  });
}
