import { friendlyError } from "@/lib/friendly-errors";

/** Plain-language copy for Float program errors a launcher can hit. */
const BY_CODE: Record<number, string> = {
  6003: "That fee tier isn't available. Pick one of the tiers shown — its platform hasn't been created.",
  6005: "Float has paused new launches. Coins already live can still trade. Try again later.",
  6006: "That quote token is turned off for new launches. Pick another enabled asset.",
  6009: "Ticker must be 1–10 letters or digits.",
  6010: "Name or metadata URI is too long. Shorten the name (32 characters) or use a shorter metadata link.",
  6011: "That ticker is still protected and can't be taken over yet. Wait, or pick another ticker.",
  6030: "The mint address doesn't match this launch. Try again.",
  6039: "The ticker takeover now costs more than the cap on this launch, so it didn't go through and the takeover fee was not charged. Check the price and launch again.",
};

const BY_NAME: Record<string, string> = {
  InvalidFeeTier: BY_CODE[6003],
  LaunchesPaused: BY_CODE[6005],
  QuoteDisabled: BY_CODE[6006],
  InvalidTicker: BY_CODE[6009],
  InvalidMetadata: BY_CODE[6010],
  TickerProtected: BY_CODE[6011],
  InvalidCoinMint: BY_CODE[6030],
  TakeoverFeeTooHigh: BY_CODE[6039],
};

function codeFromMessage(msg: string): number | null {
  const named = msg.match(/Error Number:\s*(\d+)/);
  if (named) return Number(named[1]);
  const custom = msg.match(/"Custom"\s*:\s*(\d+)/);
  if (custom) return Number(custom[1]);
  const hex = msg.match(/custom program error:\s*0x([0-9a-f]+)/i);
  if (hex) return parseInt(hex[1], 16);
  return null;
}

export function explainFloatError(e: unknown, fallback?: string): string {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const code = codeFromMessage(msg);
  if (code != null && BY_CODE[code]) return BY_CODE[code];
  for (const [name, text] of Object.entries(BY_NAME)) {
    if (msg.includes(name)) return text;
  }
  return friendlyError(e, fallback);
}
