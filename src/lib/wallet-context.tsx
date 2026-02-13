// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createPasskeyWallet, recoverPasskeyWallet } from "./passkey-wallet";

const RPC = "https://viviyan-bkj12u-fast-mainnet.helius-rpc.com";

interface WalletState {
  publicKey: string | null;
  balance: number | null;
  loading: boolean;
  error: string | null;
  connect: () => Promise<void>;
  recover: () => Promise<void>;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  publicKey: null,
  balance: null,
  loading: false,
  error: null,
  connect: async () => {},
  recover: async () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const conn = new Connection(RPC);
      const bal = await conn.getBalance(new PublicKey(key));
      setBalance(bal / LAMPORTS_PER_SOL);
    } catch {
      setBalance(null);
    }
  }, [publicKey]);

  // Fetch balance when publicKey changes
  useEffect(() => {
    if (publicKey) refreshBalance();
  }, [publicKey, refreshBalance]);

  const connect = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }
      const result = await createPasskeyWallet("sol.new user");
      setPublicKey(result.publicKey);
      localStorage.setItem("sol.new.wallet", result.publicKey);
      localStorage.setItem("sol.new.credentialId", result.credentialId);
      fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: result.publicKey, credentialId: result.credentialId }) }).catch(() => {});
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to recover wallet");
    } finally {
      setLoading(false);
    }
  };

  const disconnect = () => {
    setPublicKey(null);
    setBalance(null);
    localStorage.removeItem("sol.new.wallet");
    localStorage.removeItem("sol.new.credentialId");
  };

  return (
    <WalletContext.Provider value={{ publicKey, balance, loading, error, connect, recover, disconnect, refreshBalance }}>
      {children}
    </WalletContext.Provider>
  );
}
