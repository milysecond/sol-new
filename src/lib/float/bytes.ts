/**
 * Little-endian integer helpers.
 * Next's client Buffer polyfill has no readBigInt64LE / writeBigUInt64LE,
 * so account decoding and instruction encoding go through these instead.
 */

const BYTE = BigInt(255);
const TWO_64 = BigInt(1) << BigInt(64);
const SIGN_64 = BigInt(1) << BigInt(63);

export function readU64LE(data: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value += BigInt(data[offset + i] ?? 0) << BigInt(i * 8);
  }
  return value;
}

export function readI64LE(data: Uint8Array, offset: number): bigint {
  const value = readU64LE(data, offset);
  return value >= SIGN_64 ? value - TWO_64 : value;
}

export function u64le(value: bigint): Buffer {
  let rest = value < BigInt(0) ? TWO_64 + value : value;
  const out = Buffer.alloc(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(rest & BYTE);
    rest >>= BigInt(8);
  }
  return out;
}
