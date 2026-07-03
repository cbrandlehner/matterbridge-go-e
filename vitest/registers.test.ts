import { ampRawToMa, clamp, powerRawToMw, readAsciiRegisters, readUint32Be, sessionEnergyRawToWh } from '../src/modbus/registers.js';

describe('go-e register helpers', () => {
  it('reads uint32 big-endian words', () => {
    expect(readUint32Be([5, 32320], 0)).toBe(360000);
  });

  it('decodes ASCII registers', () => {
    expect(readAsciiRegisters([0x3230, 0x3635, 0x3430, 0, 0, 0], 0, 6)).toBe('206540');
  });

  it('scales power, current, and session energy', () => {
    expect(powerRawToMw(360000)).toBe(3_600_000);
    expect(ampRawToMa(160)).toBe(16_000);
    expect(sessionEnergyRawToWh(100_000)).toBeCloseTo(277.78, 1);
  });

  it('clamps values', () => {
    expect(clamp(40, 6, 32)).toBe(32);
    expect(clamp(4, 6, 32)).toBe(6);
    expect(clamp(16, 6, 32)).toBe(16);
  });
});
