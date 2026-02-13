"use client";

import { useNetwork } from "@/lib/network";
import { useEffect, useState } from "react";

export function FaucetFooter() {
  const { network } = useNetwork();
  const [faucet, setFaucet] = useState<{ address: string; balance: number | null } | null>(null);

  useEffect(() => {
    if (network !== "devnet") { setFaucet(null); return; }
    fetch("/api/airdrop")
      .then((r) => r.json())
      .then(setFaucet)
      .catch(() => {});
  }, [network]);

  if (network !== "devnet" || !faucet) return null;

  return (
    <div className="flex items-center justify-center gap-3 px-6 py-2 bg-yellow-500/5 border-t border-yellow-500/10 text-xs text-yellow-500/60">
      <span>🚰 Faucet</span>
      <span className="font-mono">{faucet.address.slice(0, 4)}...{faucet.address.slice(-4)}</span>
      {faucet.balance !== null && (
        <span className="font-mono">{faucet.balance.toFixed(2)} SOL</span>
      )}
      <a
        href={`https://solscan.io/account/${faucet.address}?cluster=devnet`}
        target="_blank"
        className="hover:text-yellow-400 transition"
      >
        ↗
      </a>
    </div>
  );
}
