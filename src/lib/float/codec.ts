import { PublicKey } from "@solana/web3.js";
import { readI64LE, readU64LE } from "./bytes";
import { CONFIG_DISCRIMINATOR, QUOTE_DISCRIMINATOR, TICKER_DISCRIMINATOR } from "./constants";

export type FeeSplit = {
  holdersBps: number;
  devBps: number;
  flagshipBps: number;
  tradersBps: number;
  treasuryBps: number;
};

export type FloatConfig = {
  admin: PublicKey;
  treasury: PublicKey;
  feeSplit: FeeSplit;
  /** Raw LaunchLab fee units per tier (10_000 = 1%). Length is tierCount. */
  tierFeeRates: bigint[];
  tierCount: number;
  platforms: PublicKey[];
  tickerTakeoverLamports: bigint;
  tickerProtectSecs: bigint;
  launchesPaused: boolean;
  coinSupply: bigint;
  curveSellBps: number;
};

export type QuoteAssetAccount = {
  mint: PublicKey;
  globalConfig: PublicKey;
  startFdv: bigint;
  enabled: boolean;
};

export type TickerRecord = {
  coinMint: PublicKey;
  creator: PublicKey;
  claimedAt: bigint;
  takeovers: number;
};

function pubkeyAt(data: Uint8Array, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function assertDisc(data: Uint8Array, disc: Buffer, name: string) {
  if (data.length < 8 || !Buffer.from(data.subarray(0, 8)).equals(disc)) {
    throw new Error(`Not a Float ${name} account`);
  }
}

export function decodeConfig(data: Uint8Array): FloatConfig {
  assertDisc(data, CONFIG_DISCRIMINATOR, "config");
  if (data.length < 272) throw new Error("Float config account is too short");
  let o = 8;
  const admin = pubkeyAt(data, o);
  o += 32;
  const treasury = pubkeyAt(data, o);
  o += 32;
  const feeSplit: FeeSplit = {
    holdersBps: data[o] + data[o + 1] * 256,
    devBps: data[o + 2] + data[o + 3] * 256,
    flagshipBps: data[o + 4] + data[o + 5] * 256,
    tradersBps: data[o + 6] + data[o + 7] * 256,
    treasuryBps: data[o + 8] + data[o + 9] * 256,
  };
  o += 10;
  const tierFeeRates = [0, 1, 2].map((i) => readU64LE(data, o + i * 8));
  o += 24;
  const tierCount = data[o];
  o += 1;
  const platforms = [0, 1, 2].map((i) => pubkeyAt(data, o + i * 32));
  o += 96;
  o += 32; // flagship mint
  o += 10; // swap guard
  const tickerTakeoverLamports = readU64LE(data, o);
  o += 8;
  const tickerProtectSecs = readI64LE(data, o);
  o += 8;
  const coinSupply = readU64LE(data, o);
  o += 8;
  const curveSellBps = data[o] + data[o + 1] * 256;
  o += 2;
  const launchesPaused = data[o] !== 0;
  return {
    admin,
    treasury,
    feeSplit,
    tierFeeRates: tierFeeRates.slice(0, tierCount),
    tierCount,
    platforms,
    tickerTakeoverLamports,
    tickerProtectSecs,
    launchesPaused,
    coinSupply,
    curveSellBps,
  };
}

export function decodeQuoteAsset(data: Uint8Array): QuoteAssetAccount {
  assertDisc(data, QUOTE_DISCRIMINATOR, "quote");
  if (data.length < 82) throw new Error("Float quote account is too short");
  return {
    mint: pubkeyAt(data, 8),
    globalConfig: pubkeyAt(data, 40),
    startFdv: readU64LE(data, 72),
    enabled: data[80] !== 0,
  };
}

export function decodeTickerRecord(data: Uint8Array): TickerRecord {
  assertDisc(data, TICKER_DISCRIMINATOR, "ticker");
  if (data.length < 85) throw new Error("Float ticker account is too short");
  return {
    coinMint: pubkeyAt(data, 8),
    creator: pubkeyAt(data, 40),
    claimedAt: readI64LE(data, 72),
    takeovers: Buffer.from(data.subarray(80, 84)).readUInt32LE(0),
  };
}

export function readBorshString(data: Uint8Array, offset: number): { value: string; offset: number } {
  const len = Buffer.from(data.subarray(offset, offset + 4)).readUInt32LE(0);
  const start = offset + 4;
  const end = start + len;
  return { value: Buffer.from(data.subarray(start, end)).toString("utf8"), offset: end };
}

/** Metaplex metadata name + symbol. Returns null when the account isn't metadata. */
export function readMetadataNameSymbol(data: Uint8Array): { name: string; symbol: string } | null {
  try {
    if (data.length < 70 || data[0] !== 4) return null;
    const o = 1 + 32 + 32;
    const name = readBorshString(data, o);
    const symbol = readBorshString(data, name.offset);
    const clean = (s: string) => s.replace(/\0/g, "").trim();
    const n = clean(name.value);
    const sym = clean(symbol.value);
    if (!n && !sym) return null;
    return { name: n, symbol: sym };
  } catch {
    return null;
  }
}

export function mintDecimals(data: Uint8Array): number | null {
  if (data.length < 45) return null;
  return data[44];
}
