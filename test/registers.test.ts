import { ampRawToMa, clamp, powerRawToMw, readAsciiRegisters, readUint32Be, sessionEnergyRawToWh, totalEnergyRawToMwh } from '../src/modbus/registers.js';

describe('go-e register helpers', () => {
  it('should read uint32 big-endian words and default missing registers to 0', () => {
    expect(readUint32Be([5, 32320], 0)).toBe(360000);
    expect(readUint32Be([], 0)).toBe(0);
    expect(readUint32Be([1], 0)).toBe(65_536);
  });

  it('should decode ASCII registers and ignore missing or null words', () => {
    expect(readAsciiRegisters([0x3230, 0x3635, 0x3430, 0, 0, 0], 0, 6)).toBe('206540');
    expect(readAsciiRegisters([], 0, 1)).toBe('');
  });

  it('should scale power, current, and energy', () => {
    expect(powerRawToMw(360000)).toBe(3_600_000);
    expect(ampRawToMa(160)).toBe(16_000);
    expect(sessionEnergyRawToWh(100_000)).toBeCloseTo(277.78, 1);
    expect(totalEnergyRawToMwh(360)).toBe(36_000_000);
    expect(totalEnergyRawToMwh(0)).toBe(0);
  });

  it('should clamp values', () => {
    expect(clamp(40, 6, 32)).toBe(32);
    expect(clamp(4, 6, 32)).toBe(6);
    expect(clamp(16, 6, 32)).toBe(16);
  });
});
