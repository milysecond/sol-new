/**
 * Broadcast a signed tx. Prefer server /api/tx/send (paid RPC pool + failover).
 * Falls back to client Connection with rotate on 402/429.
 */
import { Connection, type Transaction, type VersionedTransaction } from "@solana/web3.js";

function b64FromTx(tx: Transaction | VersionedTransaction | Uint8Array): string {
  if (tx instanceof Uint8Array) {
    return Buffer.from(tx).toString("base64");
  }
  const raw = tx.serialize({
    requireAllSignatures: false,
    verifySignatures: false,
  });
  return Buffer.from(raw).toString("base64");
}

export async function broadcastSignedTx(
  tx: Transaction | VersionedTransaction | Uint8Array,
  opts?: {
    rpc?: string;
    rotateMainnetRpc?: () => string;
    skipPreflight?: boolean;
  },
): Promise<string> {
  const b64 = b64FromTx(tx);

  // 1) Server path — paid pool, handles aex402 402
  try {
    const res = await fetch("/api/tx/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction: b64,
        skipPreflight: Boolean(opts?.skipPreflight),
      }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      signature?: string;
      error?: string;
    };
    if (res.ok && data.signature) return data.signature;
    // if server says network busy, try client fallback once
    if (!res.ok && data.error && !/busy|rate|402|payment/i.test(data.error)) {
      throw new Error(data.error);
    }
  } catch (e) {
    // fall through unless hard error we rethrow
    if (e instanceof Error && /Missing|too large|Invalid/i.test(e.message)) throw e;
  }

  // 2) Client path with rotation
  let rpc = opts?.rpc;
  if (!rpc) throw new Error("No RPC available to broadcast transaction");
  const tried = new Set<string>();
  let lastErr: Error | null = null;

  for (let i = 0; i < 4; i++) {
    if (tried.has(rpc)) break;
    tried.add(rpc);
    try {
      const conn = new Connection(rpc, "confirmed");
      const raw =
        tx instanceof Uint8Array
          ? tx
          : tx.serialize({ requireAllSignatures: false, verifySignatures: false });
      return await conn.sendRawTransaction(raw, {
        skipPreflight: Boolean(opts?.skipPreflight),
        maxRetries: 3,
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message.toLowerCase();
      if (
        msg.includes("402") ||
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("payment required") ||
        msg.includes("pay $")
      ) {
        if (opts?.rotateMainnetRpc) {
          rpc = opts.rotateMainnetRpc();
          continue;
        }
      }
      throw lastErr;
    }
  }
  throw lastErr || new Error("Failed to broadcast transaction");
}
