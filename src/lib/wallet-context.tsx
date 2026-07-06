// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { createPasskeyWallet, recoverPasskeyWallet } from "./passkey-wallet";
import { useNetwork } from "./network";
import { analytics } from "./analytics";
import { getUsdcBalance } from "./usdc";
import { LazorMount } from "@/components/lazor-mount";
import { makeLegacySigner, makeSmartSigner, type LazorHandle, type SolNewSigner } from "./wallet-signer";
import { WALLETS_V2_KEY, WALLET_TYPE_KEY, type WalletEntryV2, type WalletType } from "./wallet-types";

/** Legacy (v1) shape kept for migration + external imports. */
export interface WalletEntry {
  pubkey: string;
  credentialId: string;
  label: string;
}

interface WalletState {
  publicKey: string | null; // active wallet address (smart: the smart-wallet account)
  walletType: WalletType | null;
  walletLabel: string | null;
  wallets: WalletEntryV2[];
  balance: number | null;
  usdcBalance: number | null;
  loading: boolean;
  error: string | null;
  connect: (username?: string) => Promise<void>; // creates/reattaches a SMART wallet
  connectLegacy: (username?: string) => Promise<void>; // old ed25519 path (hidden from default UI)
  recover: () => Promise<void>; // classic (legacy) wallet recovery
  switchWallet: (address: string) => void;
  disconnect: () => void;
  refreshBalance: () => Promise<void>;
  signer: () => Promise<SolNewSigner>;
  airdropping: boolean;
  airdropDone: boolean;
  handleAirdrop: () => Promise<void>;
}

const WalletContext = createContext<WalletState>({
  publicKey: null,
  walletType: null,
  walletLabel: null,
  wallets: [],
  balance: null,
  usdcBalance: null,
  loading: false,
  error: null,
  connect: async () => {},
  connectLegacy: async () => {},
  recover: async () => {},
  switchWallet: () => {},
  disconnect: () => {},
  refreshBalance: async () => {},
  signer: async () => {
    throw new Error("wallet not connected");
  },
  airdropping: false,
  airdropDone: false,
  handleAirdrop: async () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

function loadWalletsV2(): WalletEntryV2[] {
  try {
    const v2 = localStorage.getItem(WALLETS_V2_KEY);
    if (v2) return JSON.parse(v2);
  } catch {}
  // One-time migration from the v1 array. v1 keys are left in place —
  // passkey-wallet.ts still reads them for the active legacy wallet, and
  // keeping them makes rolling back to a pre-v2 build safe.
  try {
    const v1: WalletEntry[] = JSON.parse(localStorage.getItem("sol.new.wallets") || "[]");
    const migrated: WalletEntryV2[] = v1.map((w) => ({
      v: 2,
      type: "legacy",
      address: w.pubkey,
      credentialId: w.credentialId,
      label: w.label,
    }));
    if (migrated.length) localStorage.setItem(WALLETS_V2_KEY, JSON.stringify(migrated));
    return migrated;
  } catch {
    return [];
  }
}

function saveWalletsV2(wallets: WalletEntryV2[]) {
  localStorage.setItem(WALLETS_V2_KEY, JSON.stringify(wallets));
}

function upsertWalletV2(entry: WalletEntryV2): WalletEntryV2[] {
  const wallets = loadWalletsV2();
  const idx = wallets.findIndex((w) => w.address === entry.address);
  if (idx >= 0) wallets[idx] = { ...wallets[idx], ...entry };
  else wallets.push(entry);
  saveWalletsV2(wallets);
  return wallets;
}

/** Keep the v1 mirror in sync for the active LEGACY wallet (passkey-wallet.ts reads these). */
function setActiveLegacyKeys(entry: WalletEntryV2 | null) {
  if (entry && entry.type === "legacy") {
    localStorage.setItem("sol.new.wallet", entry.address);
    localStorage.setItem("sol.new.credentialId", entry.credentialId);
    localStorage.setItem("sol.new.walletLabel", entry.label);
  } else {
    localStorage.removeItem("sol.new.wallet");
    localStorage.removeItem("sol.new.credentialId");
    localStorage.removeItem("sol.new.walletLabel");
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletEntryV2[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rpc, network } = useNetwork();

  // LazorKit hook interface, captured from the client-only mount below.
  // Ref (not state) so binder updates never cascade re-renders.
  const lazorRef = useRef<LazorHandle | null>(null);
  const captureLazor = useCallback((h: LazorHandle | null) => {
    lazorRef.current = h;
  }, []);

  // Restore from localStorage on mount
  useEffect(() => {
    const savedWallets = loadWalletsV2();
    setWallets(savedWallets);
    const savedType = (localStorage.getItem(WALLET_TYPE_KEY) as WalletType | null) ?? "legacy";
    const savedAddr =
      savedType === "legacy"
        ? localStorage.getItem("sol.new.wallet")
        : localStorage.getItem("sol.new.wallet.smart");
    if (savedAddr) {
      const entry = savedWallets.find((w) => w.address === savedAddr);
      setPublicKey(savedAddr);
      setWalletType(entry?.type ?? savedType);
      setWalletLabel(entry?.label ?? localStorage.getItem("sol.new.walletLabel"));
    }
  }, []);

  const refreshBalance = useCallback(async () => {
    const key = publicKey;
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

  const activate = (entry: WalletEntryV2) => {
    setPublicKey(entry.address);
    setWalletType(entry.type);
    setWalletLabel(entry.label);
    localStorage.setItem(WALLET_TYPE_KEY, entry.type);
    if (entry.type === "smart") {
      localStorage.setItem("sol.new.wallet.smart", entry.address);
      setActiveLegacyKeys(null);
    } else {
      localStorage.removeItem("sol.new.wallet.smart");
      setActiveLegacyKeys(entry);
    }
  };

  // Smart-wallet connect (default path for new wallets)
  const connect = async (username?: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) throw new Error("Passkeys require HTTPS.");
      const lazor = lazorRef.current;
      if (!lazor) throw new Error("Wallet engine is still loading — try again in a second.");
      const info = await lazor.connect({ feeMode: "paymaster" });
      const label = username?.trim() || `Wallet ${Date.now()}`;
      const entry: WalletEntryV2 = {
        v: 2,
        type: "smart",
        address: info.smartWallet,
        credentialId: info.credentialId,
        passkeyPubkey: btoa(String.fromCharCode(...info.passkeyPubkey)),
        label,
      };
      setWallets(upsertWalletV2(entry));
      activate(entry);
      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: entry.address,
          credentialId: entry.credentialId,
          walletType: "smart",
          passkeyPubkey: entry.passkeyPubkey,
        }),
      }).catch(() => {});
      analytics.walletCreated(entry.address);
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "We couldn't set up your wallet. Try again."));
    } finally {
      setLoading(false);
    }
  };

  // Legacy ed25519 path — kept for existing users / advanced option
  const connectLegacy = async (username?: string) => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) throw new Error("Passkeys require HTTPS.");
      const label = username?.trim() || `Wallet ${Date.now()}`;
      const result = await createPasskeyWallet(label);
      const entry: WalletEntryV2 = {
        v: 2,
        type: "legacy",
        address: result.publicKey,
        credentialId: result.credentialId,
        label,
      };
      setWallets(upsertWalletV2(entry));
      activate(entry);
      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: result.publicKey, credentialId: result.credentialId }),
      }).catch(() => {});
      analytics.walletCreated(result.publicKey);
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "We couldn't set up your wallet. Try again."));
    } finally {
      setLoading(false);
    }
  };

  // Classic recovery — existing (legacy) wallets only. Smart wallets reattach
  // through connect(): the portal recognises the passkey and returns the
  // existing smart wallet instead of creating a new one.
  const recover = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) throw new Error("Passkeys require HTTPS.");
      const result = await recoverPasskeyWallet();
      const existing = loadWalletsV2().find(
        (w) => w.credentialId === result.credentialId || w.address === result.publicKey,
      );
      const label = existing?.label || `Wallet ${result.publicKey.slice(0, 4)}…${result.publicKey.slice(-4)}`;
      const entry: WalletEntryV2 = {
        v: 2,
        type: "legacy",
        address: result.publicKey,
        credentialId: result.credentialId,
        label,
      };
      setWallets(upsertWalletV2(entry));
      activate(entry);
      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: result.publicKey }),
      }).catch(() => {});
      analytics.walletRecovered();
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "We couldn't find your wallet. Try creating a new one."));
    } finally {
      setLoading(false);
    }
  };

  const switchWallet = (address: string) => {
    const entry = loadWalletsV2().find((w) => w.address === address);
    if (!entry) return;
    setBalance(null);
    setUsdcBalance(null);
    activate(entry);
  };

  const signer = useCallback(async (): Promise<SolNewSigner> => {
    if (!publicKey || !walletType) throw new Error("Connect a wallet first.");
    if (walletType === "legacy") return makeLegacySigner(publicKey, rpc);
    const lazor = lazorRef.current;
    if (!lazor) throw new Error("Wallet engine is still loading — try again in a second.");
    const entry = loadWalletsV2().find((w) => w.address === publicKey);
    return makeSmartSigner(lazor, publicKey, entry?.credentialId ?? "", network as "mainnet" | "devnet");
  }, [publicKey, walletType, rpc, network]);

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
    if (walletType === "smart") lazorRef.current?.disconnect().catch(() => {});
    setPublicKey(null);
    setWalletType(null);
    setWalletLabel(null);
    setBalance(null);
    setUsdcBalance(null);
    setActiveLegacyKeys(null);
    localStorage.removeItem("sol.new.wallet.smart");
    localStorage.removeItem(WALLET_TYPE_KEY);
    // Keep sol.new.wallets.v2 so the user can switch back later
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        walletType,
        walletLabel,
        wallets,
        balance,
        usdcBalance,
        loading,
        error,
        connect,
        connectLegacy,
        recover,
        switchWallet,
        disconnect,
        refreshBalance,
        signer,
        airdropping,
        airdropDone,
        handleAirdrop,
      }}
    >
      <LazorMount onHandle={captureLazor} />
      {children}
    </WalletContext.Provider>
  );
}
