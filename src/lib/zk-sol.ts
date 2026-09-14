/**
 * zk.sol.new gateway. Browser never talks to the origin (CORS).
 * Relayer traffic is rewritten api3.privacycash.org → /api/zk/pc → zk.sol.new/v1/indexer.
 * Do not import privacycash into the Worker.
 */
export const ZK_SOL_ORIGIN = "https://zk.sol.new";
export const ZK_SOL_DOCS = "https://zk.sol.new/docs";
export const ZK_PC_PREFIX = "/api/zk/pc";
const API3 = "https://api3.privacycash.org";

export type ZkSolConfig = {
  withdraw_fee_rate?: number;
  withdraw_rent_fee?: number;
  deposit_fee_rate?: number;
  rent_fees?: Record<string, number>;
  minimum_withdrawal?: Record<string, number>;
  prices?: Record<string, number>;
};

export type ZkSolSnapshot = {
  ok: boolean;
  health?: { ok?: boolean };
  ready?: { ok?: boolean };
  config?: ZkSolConfig;
  relayer?: { success?: boolean; relayer?: { publicKey?: string } };
  docs: string;
  error?: string;
};

let patched = false;

export function zkSolRelayerActive(): boolean {
  return patched;
}

export function installZkSolRelayer() {
  if (typeof window === "undefined" || patched) return;
  patched = true;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (href.startsWith(API3)) {
      const rest = href.slice(API3.length) || "/";
      const next = `${ZK_PC_PREFIX}${rest.startsWith("/") ? rest : `/${rest}`}`;
      if (typeof input === "string" || input instanceof URL) {
        return orig(next, init);
      }
      return orig(new Request(next, input), init);
    }
    return orig(input, init);
  };
}

export async function fetchZkSolSnapshot(): Promise<ZkSolSnapshot> {
  const res = await fetch("/api/zk/config", { cache: "no-store" });
  const json = (await res.json()) as ZkSolSnapshot;
  if (!res.ok && !json.ok) {
    return { ok: false, docs: ZK_SOL_DOCS, error: json.error || `config ${res.status}` };
  }
  return json;
}
