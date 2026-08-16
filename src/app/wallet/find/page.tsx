"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  Fingerprint,
  Search,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import { formatQty, formatSol, formatUsd, useHideBalances } from "@/lib/privacy";

function short(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function normAddr(s: string) {
  return s.trim();
}

export default function WalletFindPage() {
  const [hideBalances] = useHideBalances();
  const {
    publicKey,
    wallets,
    walletBalances,
    loading,
    error,
    identify,
    activateWallet,
    renameWallet,
    removeWallet,
    switchWallet,
    refreshWalletListBalances,
  } = useWallet();

  const [target, setTarget] = useState("");
  const [last, setLast] = useState<{
    publicKey: string;
    credentialId: string;
    sol: number;
    usdc: number;
  } | null>(null);
  const [labelDraft, setLabelDraft] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [tried, setTried] = useState<string[]>([]);

  const targetNorm = normAddr(target);
  const match =
    last && targetNorm
      ? last.publicKey === targetNorm ||
        last.publicKey.toLowerCase() === targetNorm.toLowerCase()
      : false;

  const sorted = useMemo(() => {
    return [...wallets].sort((a, b) => {
      const ba = walletBalances[a.pubkey]?.sol ?? -1;
      const bb = walletBalances[b.pubkey]?.sol ?? -1;
      return bb - ba;
    });
  }, [wallets, walletBalances]);

  const onProbe = async () => {
    setLocalError(null);
    try {
      const hit = await identify();
      setLast(hit);
      setTried((t) => (t.includes(hit.publicKey) ? t : [...t, hit.publicKey]));
      setLabelDraft(hit.publicKey);
    } catch (e) {
      setLocalError(friendlyError(e, "Couldn't read that passkey."));
    }
  };

  const onUse = () => {
    if (!last) return;
    activateWallet({
      pubkey: last.publicKey,
      credentialId: last.credentialId,
      label: last.publicKey,
    });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-lg mx-auto px-3 sm:px-4 pt-5 pb-24 space-y-5">
        <PageTransition>
          <div className="text-center space-y-1.5">
            <Search className="mx-auto text-purple-500" size={28} />
            <h1 className="text-2xl font-bold tracking-tight">Find wallet</h1>
            <p className="text-sm text-gray-500 dark:text-white/50">
              Many passkeys? Tap <strong>Try a passkey</strong>, pick one from the list, and we show
              the Solana address + balance. Repeat until you hit the right one.
            </p>
          </div>

          <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 space-y-3">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Looking for address? (optional)
            </label>
            <input
              value={target}
              onChange={(e) => setTarget(e.target.value.trim())}
              placeholder="Paste full pubkey to auto-match"
              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 font-mono text-xs"
            />
            <button
              type="button"
              disabled={loading}
              onClick={() => void onProbe()}
              className="w-full min-h-[48px] rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner size={16} /> Opening passkeys…
                </>
              ) : (
                <>
                  <Fingerprint size={18} /> Try a passkey
                </>
              )}
            </button>
            <p className="text-[11px] text-gray-400 text-center">
              Pick a different passkey each time. Tried: {tried.length}
            </p>
          </div>

          {(localError || error) && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-500">
              {localError || error}
            </div>
          )}

          {last && (
            <div
              className={`rounded-2xl border p-4 space-y-3 ${
                match
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-black/10 dark:border-white/10"
              }`}
            >
              {match && (
                <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-300 flex items-center gap-1.5">
                  <Check size={16} /> This is your target address
                </p>
              )}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">Address</p>
                  <p className="font-mono text-sm break-all">{last.publicKey}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void copy(last.publicKey)}
                  className="shrink-0 p-2 rounded-lg border border-black/10 dark:border-white/10"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2">
                  <p className="text-[11px] text-gray-500">SOL</p>
                  <p className="font-mono font-semibold tabular-nums">{formatQty(hideBalances, last.sol, 6)}</p>
                </div>
                <div className="rounded-xl bg-black/5 dark:bg-white/5 px-3 py-2">
                  <p className="text-[11px] text-gray-500">USDC</p>
                  <p className="font-mono font-semibold tabular-nums">{formatQty(hideBalances, last.usdc, 2)}</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500">Wallet address (name)</p>
                <p className="mt-1 font-mono text-xs break-all rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5">
                  {last.publicKey}
                </p>
              </div>
              <button
                type="button"
                onClick={onUse}
                className="w-full min-h-[48px] rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                Use this wallet
              </button>
              {!match && targetNorm && (
                <p className="text-xs text-amber-600 dark:text-amber-300 text-center">
                  Not the target — try another passkey
                </p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Saved on this device ({sorted.length})
              </p>
              <button
                type="button"
                onClick={() => void refreshWalletListBalances()}
                className="text-xs text-purple-500"
              >
                Refresh balances
              </button>
            </div>
            {sorted.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">
                No saved wallets yet — try passkeys above.
              </p>
            )}
            <ul className="space-y-2">
              {sorted.map((w) => {
                const bal = walletBalances[w.pubkey];
                const active = w.pubkey === publicKey;
                const isTarget =
                  targetNorm &&
                  (w.pubkey === targetNorm ||
                    w.pubkey.toLowerCase() === targetNorm.toLowerCase());
                return (
                  <li
                    key={w.pubkey}
                    className={`rounded-2xl border px-3 py-3 space-y-2 ${
                      isTarget
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : active
                          ? "border-purple-500/40 bg-purple-500/5"
                          : "border-black/10 dark:border-white/10"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <WalletIcon className="w-4 h-4 text-purple-400 mt-1 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono font-semibold text-sm break-all" title={w.pubkey}>
                          {w.pubkey}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 tabular-nums">
                          {bal
                            ? hideBalances
                              ? "•••• SOL · $•••• USDC"
                              : `${bal.sol.toFixed(4)} SOL · $${bal.usdc.toFixed(2)} USDC`
                            : "—"}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => switchWallet(w.pubkey)}
                        className="flex-1 min-h-[40px] rounded-xl bg-purple-600/90 text-white text-sm font-medium"
                      >
                        {active ? "Active" : "Use"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void copy(w.pubkey)}
                        className="min-h-[40px] px-3 rounded-xl border border-black/10 dark:border-white/10"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove ${w.label} from this device list?`)) {
                            removeWallet(w.pubkey);
                          }
                        }}
                        className="min-h-[40px] px-3 rounded-xl border border-rose-500/20 text-rose-500"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <p className="text-center text-xs text-gray-400">
            <Link href="/wallet/send" className="text-purple-500 hover:underline">
              Back to send
            </Link>
            {" · "}
            <Link href="/address" className="text-purple-500 hover:underline">
              Lookup any address
            </Link>
          </p>
        </PageTransition>
      </main>
    </div>
  );
}
