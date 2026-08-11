/**
 * On-chain account age from first confirmed signature (not Turso).
 */

import { mainnetRpcUrl } from "@/lib/rpc-server";

type Sig = { signature: string; blockTime: number | null; err: unknown | null };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(mainnetRpcUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12_000),
  });
  const j = (await res.json()) as { result?: T; error?: { message: string } };
  if (j.error) throw new Error(j.error.message);
  return j.result as T;
}

/**
 * Walk signature history until the oldest page.
 * Caps pages to avoid runaway RPC (default 25 × 1000 = 25k txs).
 */
export async function getOnChainCreatedAt(
  address: string,
  opts?: { maxPages?: number; pageSize?: number },
): Promise<string | null> {
  const maxPages = opts?.maxPages ?? 25;
  const pageSize = opts?.pageSize ?? 1000;
  let before: string | undefined;
  let oldest: Sig | null = null;

  try {
    for (let page = 0; page < maxPages; page++) {
      const params: { limit: number; before?: string } = { limit: pageSize };
      if (before) params.before = before;

      const sigs = await rpc<Sig[]>("getSignaturesForAddress", [address, params]);
      if (!Array.isArray(sigs) || sigs.length === 0) break;

      oldest = sigs[sigs.length - 1] ?? oldest;

      if (sigs.length < pageSize) break;
      before = sigs[sigs.length - 1]?.signature;
      if (!before) break;
    }
  } catch {
    return oldest?.blockTime
      ? new Date(oldest.blockTime * 1000).toISOString()
      : null;
  }

  if (oldest?.blockTime != null && oldest.blockTime > 0) {
    return new Date(oldest.blockTime * 1000).toISOString();
  }
  return null;
}

export function formatAge(iso: string | null | undefined): {
  relative: string;
  absolute: string;
} {
  if (!iso) return { relative: "unknown", absolute: "" };
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return { relative: "unknown", absolute: "" };
  const diff = Math.max(0, Math.floor((Date.now() - then) / 1000));
  let relative = "just now";
  if (diff >= 60 && diff < 3600) relative = `${Math.floor(diff / 60)}m ago`;
  else if (diff >= 3600 && diff < 86400) relative = `${Math.floor(diff / 3600)}h ago`;
  else if (diff >= 86400 && diff < 604800) relative = `${Math.floor(diff / 86400)}d ago`;
  else if (diff >= 604800 && diff < 2_592_000) relative = `${Math.floor(diff / 604800)}w ago`;
  else if (diff >= 2_592_000 && diff < 31_536_000)
    relative = `${Math.floor(diff / 2_592_000)}mo ago`;
  else if (diff >= 31_536_000) relative = `${Math.floor(diff / 31_536_000)}y ago`;

  const absolute = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(iso)) + " UTC";

  return { relative, absolute };
}
