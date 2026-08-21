"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { analytics } from "./analytics";
import { addressPath } from "./explorer";

export type Network = "mainnet" | "devnet";

/**
 * Client-safe mainnet RPCs — Helius Fast first, PublicNode secondary,
 * aex402 last (x402-paywalled).
 */
export const MAINNET_RPC_POOL = [
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com",
  "https://velvet-hw7q70-fast-mainnet.helius-rpc.com",
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com",
  "https://solana.publicnode.com",
  "https://rpc.aex402.com",
] as const;

/**
 * Devnet: same-origin proxy first (uses server HELIUS_API_KEY),
 * then public fallback (often 429).
 */
/**
 * Devnet: browser-direct public first (CF worker IPs often blocked),
 * then same-origin proxy, then official public.
 */
export const DEVNET_RPC_POOL = [
  "https://solana-devnet.api.onfinality.io/public",
  "/api/rpc?network=devnet",
  ...(typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_DEVNET
    ? [process.env.NEXT_PUBLIC_RPC_DEVNET]
    : []),
  "https://api.devnet.solana.com",
] as const;

const RPC_PREF_KEY = "sol.new.rpc.mainnet";
const DEVNET_RPC_PREF_KEY = "sol.new.rpc.devnet";

export const RPC: Record<Network, string> = {
  mainnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_URL) ||
    MAINNET_RPC_POOL[0],
  devnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_DEVNET) ||
    DEVNET_RPC_POOL[0],
};

interface NetworkState {
  network: Network;
  rpc: string;
  /** Full mainnet pool (for manual failover). */
  mainnetPool: readonly string[];
  /** Force next mainnet RPC after errors. */
  rotateMainnetRpc: () => string;
  /** Force next devnet RPC after errors. */
  rotateDevnetRpc: () => string;
  /** In-app address page only (never external explorers). */
  explorerUrl: (address: string) => string;
  toggle: () => void;
}

const NetworkContext = createContext<NetworkState>({
  network: "mainnet",
  rpc: RPC.mainnet,
  mainnetPool: MAINNET_RPC_POOL,
  rotateMainnetRpc: () => MAINNET_RPC_POOL[0],
  rotateDevnetRpc: () => DEVNET_RPC_POOL[0],
  explorerUrl: (a) => addressPath(a),
  toggle: () => {},
});

export const useNetwork = () => useContext(NetworkContext);

function resolveRpcUrl(url: string): string {
  if (typeof window !== "undefined" && url.startsWith("/")) {
    return `${window.location.origin}${url}`;
  }
  return url;
}

async function probeRpc(url: string): Promise<boolean> {
  try {
    const res = await fetch(resolveRpcUrl(url), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "processed" }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { result?: unknown; error?: unknown };
    return j.result != null && !j.error;
  } catch {
    return false;
  }
}

function poolWithPreferred(
  pool: readonly string[],
  preferred?: string | null,
  envUrl?: string | null,
): string[] {
  const ordered: string[] = [];
  for (const u of [preferred, envUrl, ...pool]) {
    if (!u) continue;
    const n = u.replace(/\/+$/, "");
    if (!ordered.some((x) => x.replace(/\/+$/, "") === n)) ordered.push(n);
  }
  return ordered;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>("mainnet");
  const [mainnetRpc, setMainnetRpc] = useState<string>(RPC.mainnet);
  const [devnetRpc, setDevnetRpc] = useState<string>(RPC.devnet);

  useEffect(() => {
    const saved = localStorage.getItem("sol.new.network") as Network | null;
    if (saved === "devnet" || saved === "mainnet") setNetwork(saved);

    // Demote paywalled aex402 if it was sticky-preferred
    let pref = localStorage.getItem(RPC_PREF_KEY);
    if (pref && /aex402/i.test(pref)) {
      try {
        localStorage.removeItem(RPC_PREF_KEY);
      } catch {
        /* ignore */
      }
      pref = null;
    }
    let cancelled = false;

    (async () => {
      const envMain =
        typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RPC_URL?.trim() : "";
      const candidates = poolWithPreferred(MAINNET_RPC_POOL, pref, envMain);
      for (const url of candidates) {
        const ok = await probeRpc(url);
        if (cancelled) return;
        if (ok) {
          setMainnetRpc(url);
          try {
            localStorage.setItem(RPC_PREF_KEY, url);
          } catch {
            /* ignore */
          }
          break;
        }
      }

      const envDev =
        typeof process !== "undefined"
          ? process.env.NEXT_PUBLIC_RPC_DEVNET?.trim()
          : "";
      let dpref = localStorage.getItem(DEVNET_RPC_PREF_KEY);
      // Prefer proxy if sticky public endpoint is rate-limited
      if (dpref && /api\.devnet\.solana\.com/i.test(dpref)) {
        dpref = DEVNET_RPC_POOL[0];
      }
      const dCandidates = poolWithPreferred(DEVNET_RPC_POOL, dpref, envDev);
      for (const url of dCandidates) {
        const ok = await probeRpc(url);
        if (cancelled) return;
        if (ok) {
          setDevnetRpc(url);
          try {
            localStorage.setItem(DEVNET_RPC_PREF_KEY, url);
          } catch {
            /* ignore */
          }
          return;
        }
      }
      if (!cancelled) setDevnetRpc(dCandidates[0] || DEVNET_RPC_POOL[0]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const rotateMainnetRpc = useCallback(() => {
    const candidates = poolWithPreferred(
      MAINNET_RPC_POOL,
      typeof localStorage !== "undefined" ? localStorage.getItem(RPC_PREF_KEY) : null,
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RPC_URL?.trim() : null,
    );
    const cur = mainnetRpc.replace(/\/+$/, "");
    const idx = candidates.findIndex((u) => u.replace(/\/+$/, "") === cur);
    const next = candidates[(idx + 1) % candidates.length] || candidates[0]!;
    setMainnetRpc(next);
    try {
      localStorage.setItem(RPC_PREF_KEY, next);
    } catch {
      /* ignore */
    }
    return next;
  }, [mainnetRpc]);

  const rotateDevnetRpc = useCallback(() => {
    const candidates = poolWithPreferred(
      DEVNET_RPC_POOL,
      typeof localStorage !== "undefined"
        ? localStorage.getItem(DEVNET_RPC_PREF_KEY)
        : null,
      typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RPC_DEVNET?.trim() : null,
    );
    const cur = devnetRpc.replace(/\/+$/, "");
    const idx = candidates.findIndex((u) => u.replace(/\/+$/, "") === cur);
    const next = candidates[(idx + 1) % candidates.length] || candidates[0]!;
    setDevnetRpc(next);
    try {
      localStorage.setItem(DEVNET_RPC_PREF_KEY, next);
    } catch {
      /* ignore */
    }
    return next;
  }, [devnetRpc]);

  const toggle = () => {
    const next = network === "mainnet" ? "devnet" : "mainnet";
    setNetwork(next);
    localStorage.setItem("sol.new.network", next);
    analytics.networkSwitched(next);
  };

  const explorerUrl = (address: string) => addressPath(address);

  const rpc = resolveRpcUrl(network === "mainnet" ? mainnetRpc : devnetRpc);

  return (
    <NetworkContext.Provider
      value={{
        network,
        rpc,
        mainnetPool: MAINNET_RPC_POOL,
        rotateMainnetRpc,
        rotateDevnetRpc,
        explorerUrl,
        toggle,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
