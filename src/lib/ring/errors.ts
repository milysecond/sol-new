/** Plain-language errors for Ring flows. Never echoes endpoint URLs. */

export class RingNeedsWithdrawalError extends Error {
  constructor(public readonly recipient: string) {
    super("That address isn't on the Ring yet, so this would be a public withdrawal.");
    this.name = "RingNeedsWithdrawalError";
  }
}

export class RingMergeFirstError extends Error {
  constructor(maxInputs: number) {
    super(`This amount needs more than ${maxInputs} notes in one proof. Merge your notes first, then try again.`);
    this.name = "RingMergeFirstError";
  }
}

const CODES: Record<string, string> = {
  WALLET_RECIPIENT_NOT_REGISTERED: "That address isn't on the Ring yet. Sending to it is a public withdrawal.",
  WALLET_USER_RECORD_KEYS_MISMATCH:
    "This address is already registered on the Ring with different keys (another app). sol.new won't overwrite them.",
  WALLET_USER_RECORD_NULLIFIER_KEY_MISMATCH: "This address is registered on the Ring with different keys.",
  WALLET_TOO_MANY_INPUTS: "Too many notes for one proof. Merge your notes first.",
  WALLET_INSUFFICIENT_FUNDS: "Not enough private balance for that.",
  WALLET_USER_REGISTRY_RECORD_NOT_FOUND: "Set up your private balance first.",
  CLIENT_TIMEOUT: "The Ring indexer took too long. Try again in a moment.",
  CLIENT_RPC: "Solana didn't confirm that in time. Check your history before retrying.",
  wasm_merge_too_wide: "That merge is too wide for this browser. Merge fewer notes.",
  wasm_out_of_memory: "This device ran out of memory while proving. Close other tabs and try again.",
};

export function explainRingError(e: unknown): string {
  if (e instanceof RingNeedsWithdrawalError || e instanceof RingMergeFirstError) return e.message;
  const anyE = e as { code?: unknown; message?: unknown; name?: unknown } | null;
  const code = typeof anyE?.code === "string" ? anyE.code : "";
  if (code && CODES[code]) return CODES[code]!;
  const msg = typeof anyE?.message === "string" ? anyE.message : String(e ?? "");
  const lower = msg.toLowerCase();
  if (lower.includes("cancel") || lower.includes("notallowed") || lower.includes("not allowed")) {
    return "Face ID was cancelled. Nothing was sent.";
  }
  if (lower.includes("insufficient") && lower.includes("lamports")) {
    return "Not enough public SOL for the network fee.";
  }
  if (lower.includes("not configured")) return "Ring isn't switched on for this deployment yet.";
  // Strip anything that looks like a URL before showing it.
  const clean = msg.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 220);
  return clean || "Something went wrong on the Ring. Nothing was sent.";
}
