"use client";

import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useNetwork } from "@/lib/network";
import type { LazorHandle } from "@/lib/wallet-signer";

// LazorkitProvider and its store are client-only (localStorage-backed zustand
// persistence). Mounting them childless here — instead of wrapping the app —
// keeps SSR output for every page identical to today. The binder inside
// forwards the live hook interface up to WalletProvider via onHandle.

const Inner = dynamic(() => import("./lazor-mount-inner"), { ssr: false });

export function LazorMount({ onHandle }: { onHandle: (h: LazorHandle | null) => void }) {
  const { network } = useNetwork();
  useEffect(() => () => onHandle(null), [onHandle]);
  // Re-key on network toggle so LazorkitProvider reconnects with the right RPC.
  return <Inner key={network} network={network} onHandle={onHandle} />;
}
