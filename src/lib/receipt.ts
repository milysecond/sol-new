/** Shared types and helpers for sol.new/receipt */

export type ReceiptStatus = "confirmed" | "finalized" | "failed";
export type ReceiptType = "sol-transfer" | "spl-transfer" | "unknown";

export interface ReceiptData {
  signature: string;
  status: ReceiptStatus;
  timestamp: number;
  slot: number;
  /** Fee in lamports */
  fee: number;
  from: string;
  to: string | null;
  /** Raw amount: lamports for SOL, base units for SPL */
  amount: number;
  tokenSymbol: string;
  tokenMint: string | null;
  tokenDecimals: number;
  tokenLogoURI: string | null;
  usdValue: number | null;
  usdPrice: number | null;
  memo: string | null;
  programId: string;
  type: ReceiptType;
  error: string | null;
}

export function isValidSignature(sig: string): boolean {
  if (sig.length < 87 || sig.length > 88) return false;
  return /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/.test(sig);
}

export function shortAddr(s: string, chars = 4): string {
  if (!s || s.length <= chars * 2 + 1) return s;
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

export function shortSig(s: string, chars = 8): string {
  if (!s || s.length <= chars * 2 + 1) return s;
  return `${s.slice(0, chars)}…${s.slice(-chars)}`;
}

export function formatLamportsAsSol(lamports: number): string {
  const sol = lamports / 1e9;
  if (sol === 0) return "0";
  if (sol < 0.001) return sol.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
  if (sol < 1) return sol.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (sol < 1000) return sol.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return sol.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatTokenRaw(amount: number, decimals: number): string {
  const value = amount / Math.pow(10, decimals);
  if (value === 0) return "0";
  if (value < 0.001) return value.toFixed(Math.min(decimals, 12)).replace(/0+$/, "").replace(/\.$/, "");
  if (value < 1) return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (value < 1000) return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatReceiptAmount(tx: ReceiptData): string {
  if (tx.type === "sol-transfer") return formatLamportsAsSol(tx.amount);
  return formatTokenRaw(tx.amount, tx.tokenDecimals);
}

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatTimestamp(timestamp: number): string {
  if (!timestamp) return "Unknown time";
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  });
}

/** Recent mainnet sample (keeps demo working as old sigs leave RPC archives). */
export const EXAMPLE_TX =
  "57XdA1TLGEjtW7rP8CyNUutpZHiufu7tBBeuEQNod9xFCHzMfjGpcwRMhCg6DMYeRcH9FNMTYEA1KLFUezTXKRzE";

export async function fetchReceipt(signature: string): Promise<ReceiptData> {
  const res = await fetch(`/api/receipt?signature=${encodeURIComponent(signature)}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<ReceiptData>;
}
