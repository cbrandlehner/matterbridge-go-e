#!/usr/bin/env node
/**
 * Quick Modbus TCP connectivity test for go-e charger.
 * Usage: node scripts/test-modbus.mjs [host] [port]
 */
import ModbusRTU from 'modbus-serial';

const host = process.argv[2] ?? '192.168.71.121';
const port = Number(process.argv[3] ?? 502);

const client = new ModbusRTU();
client.setTimeout(5000);

try {
  await client.connectTCP(host, { port });
  client.setID(1);

  const { data } = await client.readInputRegisters(100, 22);
  const energy = await client.readInputRegisters(128, 6);
  const carState = data[0];
  const error = data[7];
  const powerRaw = (data[20] << 16) | data[21];
  const totalRaw = (energy.data[0] << 16) | energy.data[1];

  console.log(`Connected to go-e at ${host}:${port}`);
  console.log(`  CAR_STATE (reg 100): ${carState}`);
  console.log(`  ERROR     (reg 107): ${error}`);
  console.log(`  POWER_RAW (reg 120-121): ${powerRaw} (×0.01 W)`);
  console.log(`  ENERGY_TOTAL (reg 128-129): ${totalRaw} (×0.1 kWh)`);

  client.close(() => process.exit(0));
} catch (err) {
  console.error(`Modbus test failed for ${host}:${port}`);
  console.error(err.message ?? err);
  console.error('');
  console.error('Ensure Modbus is enabled on the charger:');
  console.error(`  curl 'http://${host}/api/set?men=true'`);
  process.exit(1);
}
