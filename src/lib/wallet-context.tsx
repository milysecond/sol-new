// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createPasskeyWallet, recoverPasskeyWallet } from "./passkey-wallet";
import { useNetwork } from "./network";
import { analytics } from "./analytics";
import { getUsdcBalance } from "./usdc";

export interface WalletEntry {
  pubkey: string;
  credentialId: string;
  label: string;
}

interface WalletState {
  publicKey: string | null;
  walletLabel: string | null;
  wallets: WalletEntry[];
  balance: number | null;
  usdcBalance: number | null;
  loading: boolean;
  error: string | null;
  connect: (username?: string) => Promise<void>;
  recover: () => Promise<void>;
  switchWallet: (pubkey: string) => void;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  airdropping: boolean;
  airdropDone: boolean;
  handleAirdrop: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  publicKey: null,
  walletLabel: null,
  wallets: [],
  balance: null,
  usdcBalance: null,
  loading: false,
  error: null,
  connect: async () => {},
  recover: async () => {},
  switchWallet: () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
  airdropping: false,
  airdropDone: false,
  handleAirdrop: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function loadWallets(): WalletEntry[] {
  try {
    return JSON.parse(localStorage.getItem("sol.new.wallets") || "[]");
  } catch {
    return [];
  }
}

function saveWallets(wallets: WalletEntry[]) {
  localStorage.setItem("sol.new.wallets", JSON.stringify(wallets));
}

function upsertWallet(entry: WalletEntry): WalletEntry[] {
  const wallets = loadWallets();
  const idx = wallets.findIndex((w) => w.pubkey === entry.pubkey);
  if (idx >= 0) wallets[idx] = entry;
  else wallets.push(entry);
  saveWallets(wallets);
  return wallets;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rpc, network } = useNetwork();

  // Restore from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("sol.new.wallet");
    const savedLabel = localStorage.getItem("sol.new.walletLabel");
    const savedWallets = loadWallets();
    if (saved) {
      setPublicKey(saved);
      setWalletLabel(savedLabel || null);
    }
    setWallets(savedWallets);
  }, []);

  const refreshBalance = useCallback(async () => {
    const key = publicKey || localStorage.getItem("sol.new.wallet");
    if (!key) return;
    try {
      const conn = new Connection(rpc, "confirmed");
      const pubkey = new PublicKey(key);
      const [solLamports, usdc] = await Promise.all([
        conn.getBalance(pubkey),
        getUsdcBalance(conn, pubkey, network as "mainnet" | "devnet"),
      ]);
      setBalance(solLamports / LAMPORTS_PER_SOL);
      setUsdcBalance(usdc);
    } catch {
      setBalance(null);
      setUsdcBalance(null);
    }
  }, [publicKey, rpc, network]);

  useEffect(() => {
    if (!publicKey) return;
    setBalance(null);
    setUsdcBalance(null);
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
      const label = username?.trim() || `Wallet ${Date.now()}`;
      const result = await createPasskeyWallet(label);
      const entry: WalletEntry = { pubkey: result.publicKey, credentialId: result.credentialId, label };
      const updated = upsertWallet(entry);
      setPublicKey(result.publicKey);
      setWalletLabel(label);
      setWallets(updated);
      localStorage.setItem("sol.new.wallet", result.publicKey);
      localStorage.setItem("sol.new.credentialId", result.credentialId);
      localStorage.setItem("sol.new.walletLabel", label);
      fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: result.publicKey, credentialId: result.credentialId }) }).catch(() => {});
      analytics.walletCreated(result.publicKey);
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "We couldn't set up your wallet. Try again."));
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
      const existing = loadWallets().find((w) => w.credentialId === result.credentialId || w.pubkey === result.publicKey);
      const label = existing?.label || `Wallet ${result.publicKey.slice(0, 4)}…${result.publicKey.slice(-4)}`;
      const entry: WalletEntry = { pubkey: result.publicKey, credentialId: result.credentialId, label };
      const updated = upsertWallet(entry);
      setPublicKey(result.publicKey);
      setWalletLabel(label);
      setWallets(updated);
      localStorage.setItem("sol.new.wallet", result.publicKey);
      localStorage.setItem("sol.new.credentialId", result.credentialId);
      localStorage.setItem("sol.new.walletLabel", label);
      fetch("/api/wallet", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ publicKey: result.publicKey }) }).catch(() => {});
      analytics.walletRecovered();
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "We couldn't find your wallet. Try creating a new one."));
    } finally {
      setLoading(false);
    }
  };

  const switchWallet = (pubkey: string) => {
    const entry = loadWallets().find((w) => w.pubkey === pubkey);
    if (!entry) return;
    setPublicKey(entry.pubkey);
    setWalletLabel(entry.label);
    setBalance(null);
    setUsdcBalance(null);
    localStorage.setItem("sol.new.wallet", entry.pubkey);
    localStorage.setItem("sol.new.credentialId", entry.credentialId);
    localStorage.setItem("sol.new.walletLabel", entry.label);
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
    setWalletLabel(null);
    setBalance(null);
    setUsdcBalance(null);
    localStorage.removeItem("sol.new.wallet");
    localStorage.removeItem("sol.new.credentialId");
    localStorage.removeItem("sol.new.walletLabel");
    // Keep sol.new.wallets so user can switch back later
  };

  return (
    <WalletContext.Provider value={{ publicKey, walletLabel, wallets, balance, usdcBalance, loading, error, connect, recover, switchWallet, disconnect, refreshBalance, airdropping, airdropDone, handleAirdrop }}>
      {children}
    </WalletContext.Provider>
  );
}
