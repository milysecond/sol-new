import { RAYDIUM_CURVE_FEE_UNITS, TAKEOVER_STEPS } from "./constants";
import type { FloatConfig, TickerRecord } from "./codec";

export type TakeoverQuote = {
  /** Ticker account does not exist yet. */
  free: boolean;
  /** Inside the protection window. A launch cannot pay to take it. */
  protected: boolean;
  /** Lamports the program would charge right now. 0 when free. */
  lamports: bigint;
  /** Seconds until the price steps down, when known. */
  nextInSecs: number | null;
  nextLamports: bigint | null;
};

export function quoteTakeover(opts: {
  config: Pick<FloatConfig, "tickerTakeoverLamports" | "tickerProtectSecs">;
  ticker: TickerRecord | null;
  nowSecs: number;
}): TakeoverQuote {
  if (!opts.ticker) {
    return { free: true, protected: false, lamports: BigInt(0), nextInSecs: null, nextLamports: null };
  }
  const age = BigInt(Math.floor(opts.nowSecs)) - opts.ticker.claimedAt;
  if (age < opts.config.tickerProtectSecs) {
    return {
      free: false,
      protected: true,
      lamports: BigInt(0),
      nextInSecs: Number(opts.config.tickerProtectSecs - age),
      nextLamports: null,
    };
  }
  const ageNum = age > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(age);
  const idx = TAKEOVER_STEPS.findIndex((step) => ageNum <= step.maxAgeSecs);
  if (idx < 0) {
    return {
      free: false,
      protected: false,
      lamports: opts.config.tickerTakeoverLamports,
      nextInSecs: null,
      nextLamports: null,
    };
  }
  const step = TAKEOVER_STEPS[idx];
  const next = TAKEOVER_STEPS[idx + 1]?.lamports ?? opts.config.tickerTakeoverLamports;
  return {
    free: false,
    protected: false,
    lamports: step.lamports,
    nextInSecs: step.maxAgeSecs - ageNum + 1,
    nextLamports: next,
  };
}

/** Trader-facing percent: Float tier rate plus Raydium's 0.25% curve fee. */
export function totalFeePercent(tierUnits: bigint): number {
  return Number(tierUnits + RAYDIUM_CURVE_FEE_UNITS) / 10_000;
}

export function formatFeePercent(tierUnits: bigint): string {
  const pct = totalFeePercent(tierUnits);
  const text = pct.toFixed(2).replace(/\.?0+$/, "");
  return `${text}%`;
}

export function lamportsToSolString(lamports: bigint): string {
  const neg = lamports < BigInt(0);
  const v = neg ? -lamports : lamports;
  const whole = v / BigInt(1_000_000_000);
  const frac = (v % BigInt(1_000_000_000)).toString().padStart(9, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${frac ? `.${frac}` : ""}`;
}

/** Parse a SOL amount (up to 9 decimals) into lamports. Null when the text isn't a number. */
export function solStringToLamports(input: string): bigint | null {
  const s = input.trim();
  if (!/^\d+(\.\d{0,9})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "000000000").slice(0, 9);
  return BigInt(whole) * BigInt(1_000_000_000) + BigInt(fracPadded);
}
