"use client";

import { useNetwork } from "@/lib/network";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

type Treasury = { address: string; sol: number | null; irysSol: number | null };

export function FaucetFooter() {
  const { network } = useNetwork();
  const [faucet, setFaucet] = useState<{ address: string; balance: number | null } | null>(null);
  const [treasury, setTreasury] = useState<Treasury | null>(null);

  useEffect(() => {
    if (network !== "devnet") { setFaucet(null); setTreasury(null); return; }
    fetch("/api/airdrop")
      .then((r) => r.json())
      .then(setFaucet)
      .catch(() => {});
    fetch("/api/treasury-balance")
      .then((r) => r.json())
      .then(setTreasury)
      .catch(() => {});
  }, [network]);

  if (network !== "devnet") return null;
  if (!faucet && !treasury) return null;

  const treasuryLow =
    treasury &&
    ((treasury.sol ?? 0) < 0.01 && (treasury.irysSol ?? 0) < 0.01);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-6 py-2 bg-yellow-500/5 border-t border-yellow-500/10 text-xs text-yellow-500/60">
      {faucet && (
        <span className="flex items-center gap-2">
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
            <ExternalLink className="w-3 h-3 inline" />
          </a>
        </span>
      )}
      {treasury && (
        <span
          className={`flex items-center gap-2 ${treasuryLow ? "text-red-400" : ""}`}
          title={treasuryLow ? "Treasury empty — uploads will fail" : "Storage treasury"}
        >
          <span>🏦 Treasury</span>
          <span className="font-mono">{treasury.address.slice(0, 4)}...{treasury.address.slice(-4)}</span>
          {treasury.sol !== null && (
            <span className="font-mono">{treasury.sol.toFixed(4)} SOL</span>
          )}
          {treasury.irysSol !== null && (
            <span className="font-mono">· Irys {treasury.irysSol.toFixed(4)}</span>
          )}
          <a
            href={`https://solscan.io/account/${treasury.address}`}
            target="_blank"
            className="hover:text-yellow-400 transition"
          >
            <ExternalLink className="w-3 h-3 inline" />
          </a>
        </span>
      )}
    </div>
  );
}
