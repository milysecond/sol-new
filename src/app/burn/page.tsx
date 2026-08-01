"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createCloseAccountInstruction,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Flame, Check } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";

type BurnAccount = {
  pubkey: string;
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  program: "spl" | "token2022";
  empty: boolean;
  rentLamports: number;
  rentSol: number;
};

const CHUNK = 8;

export default function BurnPage() {
  const { publicKey, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [accounts, setAccounts] = useState<BurnAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneSigs, setDoneSigs] = useState<string[]>([]);
  const [reclaimableSol, setReclaimableSol] = useState(0);
  const [emptyCount, setEmptyCount] = useState(0);
  const [showNonEmpty, setShowNonEmpty] = useState(false);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setLoading(true);
    setError(null);
    setDoneSigs([]);
    try {
      const res = await fetch(`/api/burn/scan?wallet=${encodeURIComponent(publicKey)}`, {
        cache: "no-store",
      });
      const data = (await res.json()) as {
        error?: string;
        accounts?: BurnAccount[];
        reclaimableSol?: number;
        emptyCount?: number;
      };
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setAccounts(data.accounts || []);
      setReclaimableSol(data.reclaimableSol || 0);
      setEmptyCount(data.emptyCount || 0);
      const emptyKeys = (data.accounts || []).filter((a) => a.empty).map((a) => a.pubkey);
      setSelected(new Set(emptyKeys));
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (publicKey && network === "mainnet") void scan();
  }, [publicKey, network, scan]);

  const visible = useMemo(
    () => accounts.filter((a) => a.empty || showNonEmpty),
    [accounts, showNonEmpty],
  );

  const selectedEmpty = useMemo(() => {
    return accounts.filter((a) => selected.has(a.pubkey) && a.empty);
  }, [accounts, selected]);

  const selectedRent = selectedEmpty.reduce((s, a) => s + a.rentSol, 0);

  const toggle = (pk: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pk)) next.delete(pk);
      else next.add(pk);
      return next;
    });
  };

  const closeSelected = async () => {
    if (!publicKey || selectedEmpty.length === 0) return;
    if (network !== "mainnet") {
      setError("Switch to mainnet to close accounts.");
      return;
    }
    setBusy(true);
    setError(null);
    setDoneSigs([]);
    try {
      const { keypair } = await getPasskeyKeypair(publicKey);
      const connection = new Connection(rpc, "confirmed");
      const owner = new PublicKey(publicKey);
      const sigs: string[] = [];

      for (let i = 0; i < selectedEmpty.length; i += CHUNK) {
        const chunk = selectedEmpty.slice(i, i + CHUNK);
        const tx = new Transaction();
        const ixs: TransactionInstruction[] = chunk.map((a) =>
          createCloseAccountInstruction(
            new PublicKey(a.pubkey),
            owner,
            owner,
            [],
            a.program === "token2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
          ),
        );
        tx.add(...ixs);
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        tx.recentBlockhash = blockhash;
        tx.feePayer = owner;
        tx.sign(keypair);
        const signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed",
        );
        sigs.push(signature);
      }

      setDoneSigs(sigs);
      await refreshBalance();
      await scan();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="reclaim rent">
          <PageTransition>
            <div className="w-full sm:max-w-lg space-y-6">
              <div className="text-center space-y-2">
                <Flame className="mx-auto text-orange-400" size={36} />
                <h1 className="text-3xl font-bold tracking-tight">Burn / reclaim</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">
                  Close empty token accounts and reclaim SOL rent. Passkey-signed.
                </p>
              </div>

              {network !== "mainnet" && (
                <p className="text-xs text-amber-500 text-center">
                  Switch to mainnet to scan and close accounts.
                </p>
              )}

              <div className="bg-orange-500/5 border border-orange-500/20 rounded-xl p-4 space-y-2 text-sm">
                <p>
                  Empty accounts: <span className="font-semibold">{emptyCount}</span>
                </p>
                <p>
                  Reclaimable (empty):{" "}
                  <span className="font-semibold text-orange-400">
                    ~{reclaimableSol.toFixed(4)} SOL
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => void scan()}
                  disabled={loading || !publicKey}
                  className="text-xs text-orange-400 hover:underline cursor-pointer disabled:opacity-40"
                >
                  {loading ? "Scanning…" : "Rescan"}
                </button>
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNonEmpty}
                  onChange={(e) => setShowNonEmpty(e.target.checked)}
                  className="rounded"
                />
                Show accounts with balance (close only when empty for now)
              </label>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Spinner size={28} />
                </div>
              ) : visible.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">
                  No empty token accounts found. Nice and clean.
                </p>
              ) : (
                <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
                  {visible.map((a) => (
                    <li
                      key={a.pubkey}
                      className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${
                        a.empty
                          ? "border-orange-500/20 bg-orange-500/5"
                          : "border-black/10 dark:border-white/10 opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={!a.empty || busy}
                        checked={selected.has(a.pubkey)}
                        onChange={() => toggle(a.pubkey)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs truncate">{a.mint}</p>
                        <p className="text-xs text-gray-500">
                          {a.empty ? "Empty" : `Balance ${a.uiAmount}`} · ~{a.rentSol.toFixed(5)} SOL
                          rent · {a.program}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                disabled={busy || selectedEmpty.length === 0}
                onClick={() => void closeSelected()}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
              >
                {busy ? <Spinner size={16} /> : <Flame size={16} />}
                Close {selectedEmpty.length} account
                {selectedEmpty.length === 1 ? "" : "s"}
                {selectedEmpty.length > 0
                  ? ` (~${selectedRent.toFixed(4)} SOL)`
                  : ""}
              </button>

              {doneSigs.length > 0 && (
                <div className="text-xs text-emerald-500 space-y-1">
                  <p className="flex items-center gap-1">
                    <Check size={14} /> Closed. {doneSigs.length} transaction
                    {doneSigs.length === 1 ? "" : "s"}.
                  </p>
                  {doneSigs.map((s) => (
                    <a
                      key={s}
                      href={`https://solscan.io/tx/${s}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block font-mono truncate hover:underline"
                    >
                      {s}
                    </a>
                  ))}
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 text-red-400 text-xs">
                  {error}
                </div>
              )}

              <p className="text-[11px] text-gray-400 text-center">
                Only empty token accounts are closed in v1. Burning tokens with balance comes later.
                Irreversible for closed accounts.
              </p>
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
