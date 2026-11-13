/**
 * HTTP confirmation for Ring transactions.
 *
 * The SPR client's `confirmTransaction` polls `getSignatureStatuses` over our
 * HTTP proxy, but it uses the short indexer poll (11 attempts, ~52s) and
 * `retryErrors: false`, so a single RPC blip after sendTransaction already
 * succeeded aborts with CLIENT_RPC ("didn't confirm in time"). The link stays
 * marked "funding". This helper retries transient errors, searches history on
 * later attempts, and waits long enough for a mainnet confirmation.
 */

export type SignatureStatus = {
  err: unknown | null;
  confirmationStatus?: string | null;
  slot?: bigint | number | null;
};

export type SignatureStatusRpc = {
  getSignatureStatuses: (
    signature: string,
    opts: { searchTransactionHistory: boolean },
  ) => Promise<SignatureStatus | null>;
};

export type ConfirmOptions = {
  timeoutMs?: number;
  intervalMs?: number;
  historyAfterMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export const RING_CONFIRM_TIMEOUT_MS = 90_000;
export const RING_CONFIRM_INTERVAL_MS = 1_500;
export const RING_CONFIRM_HISTORY_AFTER_MS = 8_000;

export class RingConfirmError extends Error {
  readonly code: string;
  readonly signature: string;
  constructor(code: string, signature: string, message: string) {
    super(message);
    this.name = "RingConfirmError";
    this.code = code;
    this.signature = signature;
  }
}

function slotOf(status: SignatureStatus): bigint {
  const s = status.slot;
  if (typeof s === "bigint") return s;
  if (typeof s === "number" && Number.isFinite(s)) return BigInt(Math.trunc(s));
  return BigInt(0);
}

export function confirmationReached(status: SignatureStatus | null | undefined, commitment: "confirmed" | "finalized" = "confirmed"): boolean {
  if (!status || status.err != null) return false;
  const c = status.confirmationStatus;
  if (c === "finalized") return true;
  if (commitment === "confirmed" && (c === "confirmed" || c === "finalized")) return true;
  return false;
}

function isTransient(e: unknown): boolean {
  if (e instanceof RingConfirmError) return false;
  return true;
}

/**
 * Poll `getSignatureStatuses` until the signature is confirmed or `timeoutMs`.
 * After `historyAfterMs`, later polls also search transaction history so a
 * landed tx isn't missed just because it left the recent-status cache.
 */
export async function confirmRpcSignature(
  rpc: SignatureStatusRpc,
  signature: string,
  opts: ConfirmOptions = {},
): Promise<bigint> {
  const timeoutMs = opts.timeoutMs ?? RING_CONFIRM_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? RING_CONFIRM_INTERVAL_MS;
  const historyAfterMs = opts.historyAfterMs ?? RING_CONFIRM_HISTORY_AFTER_MS;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = now();
  let lastError: unknown;

  for (;;) {
    const elapsed = now() - start;
    const searchTransactionHistory = elapsed >= historyAfterMs;
    try {
      const status = await rpc.getSignatureStatuses(signature, { searchTransactionHistory });
      if (status?.err != null) {
        throw new RingConfirmError("CLIENT_RPC", signature, "The transaction failed on-chain.");
      }
      if (confirmationReached(status)) return slotOf(status!);
      lastError = undefined;
    } catch (e) {
      if (e instanceof RingConfirmError) throw e;
      if (!isTransient(e)) throw e;
      lastError = e;
    }
    if (now() - start >= timeoutMs) {
      // One last history search before giving up, in case it landed on the
      // final interval.
      try {
        const status = await rpc.getSignatureStatuses(signature, { searchTransactionHistory: true });
        if (status?.err != null) {
          throw new RingConfirmError("CLIENT_RPC", signature, "The transaction failed on-chain.");
        }
        if (confirmationReached(status)) return slotOf(status!);
      } catch (e) {
        if (e instanceof RingConfirmError) throw e;
        lastError = e;
      }
      throw new RingConfirmError(
        "CLIENT_RPC",
        signature,
        lastError
          ? "The transaction was sent but confirmation timed out. Check the link before retrying."
          : "Solana didn't confirm that in time. Check the link before retrying.",
      );
    }
    const remaining = timeoutMs - (now() - start);
    if (remaining > 0) await sleep(Math.min(intervalMs, remaining));
  }
}
