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
  // Fresh wallets only know SOL until the on-chain asset list is loaded.
  TRANSACTION_UNKNOWN_MINT: "That token isn't loaded on your private balance yet. Try SOL, or refresh and try again.",
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
  // SDK TransactionError uses the code as `message`; a wrapped Error may lose `.code`.
  if (CODES[msg]) return CODES[msg]!;
  const lower = msg.toLowerCase();
  const UNREACHABLE = "The Ring couldn't be reached just then. Nothing was sent — try again in a moment.";
  // @solana/kit wraps HTTP 5xx as SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR (8100002),
  // often with a "decode this error by running npx @solana/errors" dump.
  if (
    /\b8100002\b/.test(msg) ||
    /solana error\s*#\s*8100002/i.test(msg) ||
    /decode this error/i.test(msg) ||
    /did not answer/.test(lower) ||
    /answered\s+5\d\d/.test(lower) ||
    /bad gateway/.test(lower) ||
    /network connection lost/.test(lower)
  ) {
    return UNREACHABLE;
  }
  // Tight Face ID / WebAuthn cancel only — "not allowed" also appears on
  // CORS and RPC-method refusals and must not be mapped to Face ID.
  const name = typeof anyE?.name === "string" ? anyE.name : "";
  if (
    name === "NotAllowedError" ||
    /notallowederror/i.test(msg) ||
    ((lower.includes("cancel") || lower.includes("aborted")) &&
      /face|webauthn|passkey|credential|user/.test(lower))
  ) {
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
