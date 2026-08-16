"use client";

import { useMemo, type ReactNode } from "react";
import { AppProvider } from "@solana/connector/react";
import { getDefaultConfig, getDefaultMobileConfig } from "@solana/connector/headless";
import { MAINNET_RPC_POOL } from "@/lib/network";

/**
 * Solana ConnectorKit provider — Wallet Standard discovery
 * (Phantom, Solflare, Backpack, Glow, Coinbase, mobile MWA, etc.)
 */
export function SolanaConnectorProvider({ children }: { children: ReactNode }) {
  const connectorConfig = useMemo(() => {
    const mainnetRpc =
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_RPC_URL?.trim()) ||
      MAINNET_RPC_POOL[0];

    return getDefaultConfig({
      appName: "sol.new",
      appUrl: "https://sol.new",
      autoConnect: false,
      enableMobile: true,
      enableErrorBoundary: true,
      network: "mainnet",
      clusters: [
        {
          id: "solana:mainnet",
          label: "Mainnet",
          url: mainnetRpc,
        },
        {
          id: "solana:devnet",
          label: "Devnet",
          url:
            (typeof process !== "undefined" &&
              process.env.NEXT_PUBLIC_RPC_DEVNET?.trim()) ||
            "https://api.devnet.solana.com",
        },
      ],
      wallets: {
        // Prefer popular Solana wallets first; still show all Wallet Standard wallets
        featured: [
          "Phantom",
          "Solflare",
          "Backpack",
          "Glow",
          "Coinbase Wallet",
          "OKX Wallet",
          "Exodus",
          "Brave Wallet",
        ],
        // Hide non-Solana detectors that pollute the list
        denyList: ["Keplr", "MetaMask", "Ronin Wallet"],
      },
    });
  }, []);

  const mobile = useMemo(
    () =>
      getDefaultMobileConfig({
        appName: "sol.new",
        appUrl: "https://sol.new",
      }),
    [],
  );

  return (
    <AppProvider connectorConfig={connectorConfig} mobile={mobile}>
      {children}
    </AppProvider>
  );
}
