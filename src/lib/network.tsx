"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { analytics } from "./analytics";

export type Network = "mainnet" | "devnet";

/**
 * Client-safe mainnet RPCs — Helius Fast dedicated endpoints only.
 * Never fall back to free public Solana RPC (api.mainnet-beta.solana.com, etc.).
 * Flux (keyed) stays server-only via `@/lib/rpc-server`.
 */
export const MAINNET_RPC_POOL = [
  "https://cassandra-bq5oqs-fast-mainnet.helius-rpc.com/",
  "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com",
] as const;

export const RPC: Record<Network, string> = {
  mainnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_URL) ||
    MAINNET_RPC_POOL[0],
  devnet:
    (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_DEVNET) ||
    "https://api.devnet.solana.com",
};

const EXPLORER: Record<Network, string> = {
  mainnet: "https://solscan.io",
  devnet: "https://solscan.io",
};

interface NetworkState {
  network: Network;
  rpc: string;
  explorerUrl: (address: string) => string;
  toggle: () => void;
}

const NetworkContext = createContext<NetworkState>({
  network: "mainnet",
  rpc: RPC.mainnet,
  explorerUrl: (a) => `${EXPLORER.mainnet}/account/${a}`,
  toggle: () => {},
});

export const useNetwork = () => useContext(NetworkContext);

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<Network>("mainnet");

  useEffect(() => {
    const saved = localStorage.getItem("sol.new.network") as Network | null;
    if (saved === "devnet" || saved === "mainnet") setNetwork(saved);
  }, []);

  const toggle = () => {
    const next = network === "mainnet" ? "devnet" : "mainnet";
    setNetwork(next);
    localStorage.setItem("sol.new.network", next);
    analytics.networkSwitched(next);
  };

  const explorerUrl = (address: string) =>
    network === "devnet"
      ? `${EXPLORER.devnet}/account/${address}?cluster=devnet`
      : `${EXPLORER.mainnet}/account/${address}`;

  return (
    <NetworkContext.Provider value={{ network, rpc: RPC[network], explorerUrl, toggle }}>
      {children}
    </NetworkContext.Provider>
  );
}
