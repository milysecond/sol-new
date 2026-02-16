// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createPasskeyWallet, recoverPasskeyWallet } from "./passkey-wallet";
import { useNetwork } from "./network";
import { analytics } from "./analytics";

interface WalletState {
  publicKey: string | null;
  balance: number | null;
  loading: boolean;
  error: string | null;
  connect: (username?: string) => Promise<void>;
  recover: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  airdropping: boolean;
  airdropDone: boolean;
  handleAirdrop: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  publicKey: null,
  balance: null,
  loading: false,
  error: null,
  connect: async (username?: string) => {},
  recover: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
  airdropping: false,
  airdropDone: false,
  handleAirdrop: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rpc, network } = useNetwork();

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("sol.new.wallet");
    if (saved) {
      setPublicKey(saved);
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    const key = publicKey || localStorage.getItem("sol.new.wallet");
    if (!key) return;
    try {
      const conn = new Connection(rpc);
      const bal = await conn.getBalance(new PublicKey(key));
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch {
      setBalance(null);
    }
  }, [publicKey, rpc]);

  // Fetch balance when publicKey or network changes, auto-refresh every 15s
  useEffect(() => {
    if (!publicKey) return;
    refreshBalance();
    const interval = setInterval(refreshBalance, 15000);
    return () => clearInterval(interval);
  }, [publicKey, refreshBalance, network]);

  const connect = async (username?: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }
      const name = username || `sol.new user ${Date.now()}`;
      const result = await createPasskeyWallet(name);
      setPublicKey(result.publicKey);
      localStorage.setItem("sol.new.wallet", result.publicKey);
      localStorage.setItem("sol.new.credentialId", result.credentialId);
      fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: result.publicKey, credentialId: result.credentialId }) }).catch(() => {});
      analytics.walletCreated(result.publicKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create passkey");
    } finally {
      setLoading(false);
    }
  };

  const recover = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }
      const result = await recoverPasskeyWallet();
      setPublicKey(result.publicKey);
      localStorage.setItem("sol.new.wallet", result.publicKey);
      fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: result.publicKey }) }).catch(() => {});
      analytics.walletRecovered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to recover wallet");
    } finally {
      setLoading(false);
    }
  };

  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

  const handleAirdrop = useCallback(async () => {
    if (!publicKey || network !== "devnet") return;
    setAirdropping(true);
    setAirdropDone(false);
    try {
      await fetch("/api/airdrop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey }),
      });
      await new Promise((r) => setTimeout(r, 3000));
      await refreshBalance();
      setAirdropDone(true);
      const { toast } = await import("sonner");
      toast.success("0.1 SOL airdropped!");
      try { new Audio("/chaching.mp3").play(); } catch {}
      setTimeout(() => setAirdropDone(false), 3000);
    } catch {
      const { toast } = await import("sonner");
      toast.error("Airdrop failed — try again");
    } finally {
      setAirdropping(false);
    }
  }, [publicKey, network, refreshBalance]);

  const disconnect = () => {
    setPublicKey(null);
    setBalance(null);
    localStorage.removeItem("sol.new.wallet");
    localStorage.removeItem("sol.new.credentialId");
  };

  return (
    <WalletContext.Provider value={{ publicKey, balance, loading, error, connect, recover, disconnect, refreshBalance, airdropping, airdropDone, handleAirdrop }}>
      {children}
    </WalletContext.Provider>
  );
}
