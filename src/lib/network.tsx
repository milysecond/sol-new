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
 * Client-safe mainnet RPCs — Helius Fast dedicated endpoints only.
 * Order: healthy backups first; cassandra last (often exhausted).
 * Never fall back to free public Solana RPC.
 */
export const MAINNET_RPC_POOL = [
  "https://rpc.aex402.com",
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com",
  "https://velvet-hw7q70-fast-mainnet.helius-rpc.com",
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com",
] as const;

const RPC_PREF_KEY = "sol.new.rpc.mainnet";

export const RPC: Record<Network, string> = {
  mainnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_URL) ||
    MAINNET_RPC_POOL[0],
  devnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_DEVNET) ||
    "https://api.devnet.solana.com",
};

interface NetworkState {
  network: Network;
  rpc: string;
  /** Full mainnet pool (for manual failover). */
  mainnetPool: readonly string[];
  /** Force next mainnet RPC after errors. */
  rotateMainnetRpc: () => string;
  /** In-app address page only (never external explorers). */
  explorerUrl: (address: string) => string;
  toggle: () => void;
}

const NetworkContext = createContext<NetworkState>({
  network: "mainnet",
  rpc: RPC.mainnet,
  mainnetPool: MAINNET_RPC_POOL,
  rotateMainnetRpc: () => MAINNET_RPC_POOL[0],
  explorerUrl: (a) => addressPath(a),
  toggle: () => {},
});

export const useNetwork = () => useContext(NetworkContext);

async function probeRpc(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getSlot",
        params: [{ commitment: "processed" }],
      }),
      signal: AbortSignal.timeout(6_000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { result?: unknown; error?: unknown };
    return j.result != null && !j.error;
  } catch {
    return false;
  }
}

function poolWithPreferred(preferred?: string | null): string[] {
  const base = [...MAINNET_RPC_POOL];
  const env =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_RPC_URL?.trim() : "";
  const ordered: string[] = [];
  for (const u of [preferred, env, ...base]) {
    if (!u) continue;
    const n = u.replace(/\/+$/, "");
    if (!ordered.some((x) => x.replace(/\/+$/, "") === n)) ordered.push(n);
  }
  return ordered;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>("mainnet");
  const [mainnetRpc, setMainnetRpc] = useState<string>(RPC.mainnet);

  useEffect(() => {
    const saved = localStorage.getItem("sol.new.network") as Network | null;
    if (saved === "devnet" || saved === "mainnet") setNetwork(saved);

    const pref = localStorage.getItem(RPC_PREF_KEY);
    let cancelled = false;

    (async () => {
      const candidates = poolWithPreferred(pref);
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
          return;
        }
      }
      // all failed — keep first candidate
      if (!cancelled) setMainnetRpc(candidates[0] || MAINNET_RPC_POOL[0]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const rotateMainnetRpc = useCallback(() => {
    const candidates = poolWithPreferred(
      typeof localStorage !== "undefined"
        ? localStorage.getItem(RPC_PREF_KEY)
        : null,
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

  const toggle = () => {
    const next = network === "mainnet" ? "devnet" : "mainnet";
    setNetwork(next);
    localStorage.setItem("sol.new.network", next);
    analytics.networkSwitched(next);
  };

  const explorerUrl = (address: string) => addressPath(address);

  const rpc = network === "mainnet" ? mainnetRpc : RPC.devnet;

  return (
    <NetworkContext.Provider
      value={{
        network,
        rpc,
        mainnetPool: MAINNET_RPC_POOL,
        rotateMainnetRpc,
        explorerUrl,
        toggle,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
