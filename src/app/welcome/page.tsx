"use client";

import { useWallet } from "@/lib/wallet-context";
import { MarketingSplash } from "@/app/home/page";

/**
 * Always shows the marketing “Create anything” landing.
 * Not rewritten by middleware — use when you want the splash
 * (logged-out visitors, or anyone who opens /welcome deliberately).
 */
export default function WelcomePage() {
  const { publicKey, connect, loading } = useWallet();
  return (
    <MarketingSplash
      publicKey={publicKey}
      connect={connect}
      loading={loading}
    />
  );
}
