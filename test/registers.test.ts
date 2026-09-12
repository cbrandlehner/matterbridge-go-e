import {
  ampRawToMa,
  clamp,
  decodeRfidUid,
  formatRfidUidHex,
  powerRawToMw,
  readAsciiRegisters,
  readBinaryRegisters,
  readCardEnergyWh,
  readFloat64Be,
  readUint32Be,
  sessionEnergyRawToWh,
  totalEnergyRawToMwh,
} from '../src/modbus/registers.js';

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

  it('should pack binary registers and decode RFID UIDs', () => {
    expect(readBinaryRegisters([0x04a1, 0xb2c3, 0, 0, 0], 0, 5)).toEqual(Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3, 0, 0, 0, 0, 0, 0]));
    expect(decodeRfidUid(Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(decodeRfidUid(Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3, 0, 0, 0, 0, 0, 0]))).toEqual(Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]));
    expect(decodeRfidUid(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 0, 0, 0]))).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7]));
    expect(decodeRfidUid(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toEqual(Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect(decodeRfidUid(Uint8Array.from([1, 2, 3]))).toBeNull();
    expect(formatRfidUidHex(Uint8Array.from([0x04, 0xa1, 0xb2, 0xc3]))).toBe('04a1b2c3');
    expect(formatRfidUidHex(null)).toBe('');
    expect(formatRfidUidHex(Uint8Array.from([]))).toBe('');
  });

  it('should read IEEE-754 float64 energy counters', () => {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setFloat64(0, 12_500, false);
    const words = [0, 0, 0, 0].map((_, index) => bytes[index * 2] * 256 + bytes[index * 2 + 1]);
    expect(readFloat64Be(words, 0)).toBe(12_500);
    expect(readFloat64Be([], 0)).toBe(0);
    const infWords = [0x7ff0, 0, 0, 0];
    expect(readFloat64Be(infWords, 0)).toBe(0);
    const block = [...words, ...Array.from({ length: 36 }, () => 0)];
    expect(readCardEnergyWh(block, 0)[0]).toBe(12_500);
    expect(readCardEnergyWh([], 0)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const negativeBytes = new Uint8Array(8);
    new DataView(negativeBytes.buffer).setFloat64(0, -5, false);
    const negativeWords = [0, 0, 0, 0].map((_, index) => negativeBytes[index * 2] * 256 + negativeBytes[index * 2 + 1]);
    expect(readCardEnergyWh(negativeWords, 0)[0]).toBe(0);
  });
});
