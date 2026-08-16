// @ts-nocheck
"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  createPasskeyWallet,
  recoverPasskeyWallet,
  identifyPasskeyWallet,
  provePasskeyWallet,
  signalPasskeyUserDetails,
} from "./passkey-wallet";
import { useNetwork } from "./network";
import { analytics } from "./analytics";
import { getUsdcBalance } from "./usdc";

export interface WalletEntry {
  pubkey: string;
  credentialId: string;
  label: string;
  /** WebAuthn user handle (base64) — enables renaming the passkey in browser settings */
  userId?: string;
}

export type WalletBalances = Record<string, { sol: number; usdc: number }>;

interface WalletState {
  publicKey: string | null;
  walletLabel: string | null;
  wallets: WalletEntry[];
  walletBalances: WalletBalances;
  balance: number | null;
  usdcBalance: number | null;
  loading: boolean;
  error: string | null;
  connect: (username?: string | { createNew?: boolean }) => Promise<void>;
  recover: (opts?: { forcePicker?: boolean; forAddress?: string }) => Promise<void>;
  /** Probe one passkey from the full OS list; returns address (does not auto-activate). */
  identify: () => Promise<{ publicKey: string; credentialId: string; sol: number; usdc: number }>;
  /** Save/activate a discovered wallet with a label. */
  activateWallet: (entry: WalletEntry) => void;
  renameWallet: (pubkey: string, label: string) => void;
  removeWallet: (pubkey: string) => void;
  switchWallet: (pubkey: string) => void | Promise<void>;
  refreshWalletListBalances: () => Promise<void>;
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
  walletBalances: {},
  balance: null,
  usdcBalance: null,
  loading: false,
  error: null,
  connect: async () => {},
  recover: async () => {},
  identify: async () => ({ publicKey: "", credentialId: "", sol: 0, usdc: 0 }),
  activateWallet: () => {},
  renameWallet: () => {},
  removeWallet: () => {},
  switchWallet: () => {},
  refreshWalletListBalances: async () => {},
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
  if (idx >= 0) {
    wallets[idx] = {
      ...wallets[idx],
      ...entry,
      label: entry.label || wallets[idx].label,
      credentialId: entry.credentialId || wallets[idx].credentialId,
      userId: entry.userId || wallets[idx].userId,
    };
  } else wallets.push(entry);
  saveWallets(wallets);
  return wallets;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletEntry[]>([]);
  const [walletBalances, setWalletBalances] = useState<WalletBalances>({});
  const [balance, setBalance] = useState<number | null>(null);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { rpc, network } = useNetwork();

  useEffect(() => {
    const saved = localStorage.getItem("sol.new.wallet");
    const savedWallets = loadWallets().map((w) => ({ ...w, label: w.pubkey }));
    if (savedWallets.length) saveWallets(savedWallets);
    if (saved) {
      setPublicKey(saved);
      setWalletLabel(saved);
      localStorage.setItem("sol.new.walletLabel", saved);
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
      setWalletBalances((prev) => ({
        ...prev,
        [key]: { sol: solLamports / LAMPORTS_PER_SOL, usdc },
      }));
    } catch {
      setBalance(null);
      setUsdcBalance(null);
    }
  }, [publicKey, rpc, network]);

  const refreshWalletListBalances = useCallback(async () => {
    const list = loadWallets();
    if (!list.length) return;
    try {
      const conn = new Connection(rpc, "confirmed");
      const next: WalletBalances = {};
      // Batch in chunks of 10
      for (let i = 0; i < list.length; i += 10) {
        const chunk = list.slice(i, i + 10);
        await Promise.all(
          chunk.map(async (w) => {
            try {
              const pk = new PublicKey(w.pubkey);
              const [solLamports, usdc] = await Promise.all([
                conn.getBalance(pk),
                getUsdcBalance(conn, pk, network as "mainnet" | "devnet"),
              ]);
              next[w.pubkey] = { sol: solLamports / LAMPORTS_PER_SOL, usdc };
            } catch {
              next[w.pubkey] = { sol: 0, usdc: 0 };
            }
          })
        );
      }
      setWalletBalances((prev) => ({ ...prev, ...next }));
    } catch {
      /* ignore */
    }
  }, [rpc, network]);

  useEffect(() => {
    if (!publicKey) return;
    setBalance(null);
    setUsdcBalance(null);
    refreshBalance();
    const interval = setInterval(refreshBalance, 15000);
    return () => clearInterval(interval);
  }, [publicKey, refreshBalance, network]);

  useEffect(() => {
    if (wallets.length) void refreshWalletListBalances();
  }, [wallets.length, network]); // eslint-disable-line react-hooks/exhaustive-deps

  const activateWallet = (entry: WalletEntry) => {
    // Wallet name === address (product rule)
    const labeled: WalletEntry = { ...entry, label: entry.pubkey };
    const updated = upsertWallet(labeled);
    setWallets(updated);
    setPublicKey(labeled.pubkey);
    setWalletLabel(labeled.pubkey);
    setBalance(null);
    setUsdcBalance(null);
    localStorage.setItem("sol.new.wallet", labeled.pubkey);
    localStorage.setItem("sol.new.walletLabel", labeled.pubkey);
    // Never leave a stale credentialId from a previous wallet
    if (labeled.credentialId) {
      localStorage.setItem("sol.new.credentialId", labeled.credentialId);
    } else {
      localStorage.removeItem("sol.new.credentialId");
    }
  };

  const connect = async (username?: string | { createNew?: boolean }) => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }

      const createNew =
        typeof username === "object" && username?.createNew === true;

      // Default Connect = unlock existing passkey. Only mint a new key when asked.
      if (!createNew) {
        const list = loadWallets();
        const forcePicker =
          list.length !== 1 || !list[0]?.credentialId;
        try {
          const result = await recoverPasskeyWallet({
            forcePicker,
            // If exactly one saved wallet with a credential, pin to it
            forAddress:
              list.length === 1 && list[0]?.credentialId
                ? list[0].pubkey
                : undefined,
          });
          activateWallet({
            pubkey: result.publicKey,
            credentialId: result.credentialId,
            label: result.publicKey,
          });
          fetch("/api/wallet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              publicKey: result.publicKey,
              credentialId: result.credentialId,
            }),
          }).catch(() => {});
          analytics.walletRecovered();
          return;
        } catch (e) {
          // No existing passkey / cancelled — only fall through to create if none saved
          const msg = e instanceof Error ? e.message.toLowerCase() : "";
          const cancelled =
            msg.includes("cancel") ||
            msg.includes("not allowed") ||
            msg.includes("abort");
          if (list.length > 0 || cancelled) {
            throw e;
          }
          // Fresh device with zero wallets: create below
        }
      }

      const result = await createPasskeyWallet(
        typeof username === "string" ? username : undefined,
      );
      activateWallet({
        pubkey: result.publicKey,
        credentialId: result.credentialId,
        label: result.publicKey,
        userId: result.userId,
      });
      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: result.publicKey,
          credentialId: result.credentialId,
        }),
      }).catch(() => {});
      analytics.walletCreated(result.publicKey);
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(
        friendlyError(
          e,
          "Couldn't connect. Use your existing passkey, or Create only if you need a new wallet.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const recover = async (opts?: { forcePicker?: boolean; forAddress?: string }) => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }
      const result = await recoverPasskeyWallet({
        forcePicker: opts?.forcePicker,
        forAddress: opts?.forAddress,
      });
      activateWallet({
        pubkey: result.publicKey,
        credentialId: result.credentialId,
        label: result.publicKey,
      });
      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: result.publicKey,
          credentialId: result.credentialId,
        }),
      }).catch(() => {});
      analytics.walletRecovered();
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(
        friendlyError(
          e,
          "We couldn't unlock that passkey. Try Find wallet, or pick the passkey whose name is your address.",
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  const identify = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!window.PublicKeyCredential) {
        throw new Error("Passkeys require HTTPS.");
      }
      const result = await identifyPasskeyWallet();
      const conn = new Connection(rpc, "confirmed");
      const pk = new PublicKey(result.publicKey);
      const [solLamports, usdc] = await Promise.all([
        conn.getBalance(pk),
        getUsdcBalance(conn, pk, network as "mainnet" | "devnet"),
      ]);
      const sol = solLamports / LAMPORTS_PER_SOL;
      setWalletBalances((prev) => ({
        ...prev,
        [result.publicKey]: { sol, usdc },
      }));
      const updated = upsertWallet({
        pubkey: result.publicKey,
        credentialId: result.credentialId,
        label: result.publicKey,
      });
      setWallets(updated);
      return { publicKey: result.publicKey, credentialId: result.credentialId, sol, usdc };
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(friendlyError(e, "Couldn't read that passkey. Try another."));
      throw e;
    } finally {
      setLoading(false);
    }
  };

  const renameWallet = (pubkey: string, _label: string) => {
    // Name is always the address
    const list = loadWallets();
    const idx = list.findIndex((w) => w.pubkey === pubkey);
    if (idx < 0) return;
    list[idx] = { ...list[idx], label: pubkey };
    saveWallets(list);
    setWallets([...list]);
    if (publicKey === pubkey) {
      setWalletLabel(pubkey);
      localStorage.setItem("sol.new.walletLabel", pubkey);
    }
    const entry = list[idx];
    if (entry.userId) {
      void signalPasskeyUserDetails({
        userId: entry.userId,
        name: pubkey,
        displayName: pubkey,
      });
    }
  };

  const removeWallet = (pubkey: string) => {
    const list = loadWallets().filter((w) => w.pubkey !== pubkey);
    saveWallets(list);
    setWallets(list);
    if (publicKey === pubkey) {
      setPublicKey(null);
      setWalletLabel(null);
      setBalance(null);
      setUsdcBalance(null);
      localStorage.removeItem("sol.new.wallet");
      localStorage.removeItem("sol.new.credentialId");
      localStorage.removeItem("sol.new.walletLabel");
    }
  };

  const switchWallet = async (pubkey: string) => {
    const entry = loadWallets().find((w) => w.pubkey === pubkey);
    if (!entry) return;
    if (publicKey === pubkey) return;

    // Require passkey signature (challenge) before activating another wallet
    setError(null);
    setLoading(true);
    try {
      const { toast } = await import("@/lib/toast");
      toast.info(
        `Authenticate to switch to ${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`,
      );

      const result = await provePasskeyWallet(pubkey);
      if (result.publicKey !== pubkey) {
        throw new Error("Passkey does not match that wallet");
      }

      activateWallet({
        pubkey: result.publicKey,
        credentialId: result.credentialId,
        label: result.publicKey,
        userId: entry.userId,
      });

      fetch("/api/wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: result.publicKey,
          credentialId: result.credentialId,
        }),
      }).catch(() => {});

      toast.success(`Switched to ${pubkey.slice(0, 4)}…${pubkey.slice(-4)}`);
    } catch (e) {
      const { friendlyError } = await import("./friendly-errors");
      setError(
        friendlyError(
          e,
          `Sign with the passkey for ${pubkey.slice(0, 4)}…${pubkey.slice(-4)} to switch.`,
        ),
      );
      try {
        const { toast } = await import("@/lib/toast");
        toast.error("Wallet switch cancelled or passkey mismatch");
      } catch {
        /* ignore */
      }
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
      const { toast } = await import("@/lib/toast");
      toast.money("0.1 SOL airdropped!");
      setTimeout(() => setAirdropDone(false), 3000);
    } catch {
      const { toast } = await import("@/lib/toast");
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
  };

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        walletLabel,
        wallets,
        walletBalances,
        balance,
        usdcBalance,
        loading,
        error,
        connect,
        recover,
        identify,
        activateWallet,
        renameWallet,
        removeWallet,
        switchWallet,
        refreshWalletListBalances,
        disconnect,
        refreshBalance,
        airdropping,
        airdropDone,
        handleAirdrop,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}
