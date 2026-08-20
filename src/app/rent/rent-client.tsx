"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Transaction } from "@solana/web3.js";
import {
  Coins,
  RefreshCw,
  Copy,
  Check,
  Flame,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PageShell } from "@/components/page-shell";
import { Spinner } from "@/components/spinner";
import { ConnectGate } from "@/components/connect-gate";
import { toast } from "@/lib/toast";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import {
  ensureDocumentFocusForPasskey,
  getPasskeyKeypair,
} from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { txPath } from "@/lib/explorer";

type Pack = {
  space: number;
  lamports: number;
  sol: number;
  usd: number | null;
};

type RentPayload = {
  ok?: boolean;
  error?: string;
  price?: number;
  rentLamports?: number;
  rentInSol?: number;
  rentInUsd?: number | null;
  tokenAccount?: Pack;
  systemAccount?: Pack;
  custom?: Pack;
  note?: string;
};

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

function fmtLamports(n: number) {
  return n.toLocaleString("en-US");
}

function fmtSol(n: number) {
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toFixed(9).replace(/0+$/, "").replace(/\.$/, "");
}

function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

function Row({
  label,
  sub,
  lamports,
  sol,
  usd,
  accent,
}: {
  label: string;
  sub?: string;
  lamports: number;
  sol: number;
  usd: number | null | undefined;
  accent?: "violet" | "emerald" | "rose";
}) {
  const solCls =
    accent === "emerald"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "rose"
        ? "text-rose-600 dark:text-rose-400"
        : "text-violet-600 dark:text-violet-400";

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 space-y-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {label}
          </p>
          {sub && (
            <p className="text-[11px] text-gray-500 dark:text-white/40">{sub}</p>
          )}
        </div>
        <p className={`text-xl font-bold tabular-nums shrink-0 ${solCls}`}>
          {fmtUsd(usd)}
        </p>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span className="font-mono text-gray-800 dark:text-white/85 tabular-nums">
          {fmtLamports(lamports)}{" "}
          <span className="text-gray-400 text-xs">lamports</span>
        </span>
        <span className={`font-mono font-semibold tabular-nums ${solCls}`}>
          {fmtSol(sol)} SOL
        </span>
      </div>
    </div>
  );
}

export default function RentPage() {
  const { publicKey, refreshBalance, walletKind } = useWallet();
  const { network } = useNetwork();
  const [data, setData] = useState<RentPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [space, setSpace] = useState("");
  const [copied, setCopied] = useState(false);

  // closer
  const [accounts, setAccounts] = useState<BurnAccount[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [gasless, setGasless] = useState(false);
  const [doneSigs, setDoneSigs] = useState<string[]>([]);
  const [reclaimableSol, setReclaimableSol] = useState(0);
  const [emptyCount, setEmptyCount] = useState(0);

  const load = useCallback(async (customSpace?: string) => {
    setLoading(true);
    setError(null);
    try {
      const qs =
        customSpace && /^\d+$/.test(customSpace.trim())
          ? `?space=${encodeURIComponent(customSpace.trim())}`
          : "";
      const r = await fetch(`/api/rent${qs}`, { cache: "no-store" });
      const j = (await r.json()) as RentPayload;
      if (!r.ok || j.ok === false) {
        throw new Error(j.error || "Failed to load rent");
      }
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSponsor = useCallback(async () => {
    try {
      const r = await fetch("/api/rent/close", { cache: "no-store" });
      const j = (await r.json()) as { sponsored?: boolean; ok?: boolean };
      setGasless(Boolean(j.sponsored || j.ok));
    } catch {
      setGasless(false);
    }
  }, []);

  const scan = useCallback(async () => {
    if (!publicKey) return;
    setScanning(true);
    setCloseError(null);
    setDoneSigs([]);
    try {
      const res = await fetch(
        `/api/burn/scan?wallet=${encodeURIComponent(publicKey)}`,
        { cache: "no-store" },
      );
      const j = (await res.json()) as {
        error?: string;
        accounts?: BurnAccount[];
        reclaimableSol?: number;
        emptyCount?: number;
      };
      if (!res.ok) throw new Error(j.error || "Scan failed");
      setAccounts(j.accounts || []);
      setReclaimableSol(j.reclaimableSol || 0);
      setEmptyCount(j.emptyCount || 0);
      setSelected(
        new Set((j.accounts || []).filter((a) => a.empty).map((a) => a.pubkey)),
      );
    } catch (e) {
      setCloseError(friendlyError(e));
    } finally {
      setScanning(false);
    }
  }, [publicKey]);

  useEffect(() => {
    void load();
    void loadSponsor();
  }, [load, loadSponsor]);

  useEffect(() => {
    if (publicKey && network === "mainnet") void scan();
  }, [publicKey, network, scan]);

  const emptySelected = useMemo(
    () => accounts.filter((a) => a.empty && selected.has(a.pubkey)),
    [accounts, selected],
  );
  const selectedRent = emptySelected.reduce((s, a) => s + a.rentSol, 0);

  const toggle = (pk: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(pk)) n.delete(pk);
      else n.add(pk);
      return n;
    });
  };

  const closeSelected = async () => {
    if (!publicKey || emptySelected.length === 0) return;
    if (network !== "mainnet") {
      setCloseError("Switch to mainnet");
      return;
    }
    if (walletKind === "external") {
      setCloseError("Use passkey wallet for gasless close (or /burn with your wallet).");
      return;
    }
    setClosing(true);
    setCloseError(null);
    setDoneSigs([]);
    try {
      await ensureDocumentFocusForPasskey();
      const { keypair } = await getPasskeyKeypair(publicKey);

      const buildRes = await fetch("/api/rent/close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: publicKey,
          accounts: emptySelected.map((a) => a.pubkey),
          network: "mainnet",
        }),
      });
      const build = (await buildRes.json()) as {
        error?: string;
        gasless?: boolean;
        feePayer?: string;
        batches?: { transaction: string; accounts: string[] }[];
        transaction?: string;
      };
      if (!buildRes.ok || !build.batches?.length) {
        throw new Error(build.error || "Could not build close transaction");
      }

      const sigs: string[] = [];
      for (const batch of build.batches) {
        const tx = Transaction.from(Buffer.from(batch.transaction, "base64"));
        tx.partialSign(keypair);

        if (build.gasless && build.feePayer) {
          const serialized = Buffer.from(
            tx.serialize({
              requireAllSignatures: false,
              verifySignatures: false,
            }),
          ).toString("base64");
          const sub = await fetch("/api/rent/close", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transaction: serialized,
              network: "mainnet",
            }),
          });
          const sj = (await sub.json()) as {
            ok?: boolean;
            signature?: string;
            error?: string;
          };
          if (!sub.ok || !sj.signature) {
            throw new Error(sj.error || "Sponsor send failed");
          }
          sigs.push(sj.signature);
        } else {
          // Self-pay: owner is fee payer — fully signed
          const b64 = Buffer.from(
            tx.serialize({ requireAllSignatures: true }),
          ).toString("base64");
          const send = await fetch("/api/tx/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ transaction: b64 }),
          });
          const sd = (await send.json()) as {
            signature?: string;
            error?: string;
          };
          if (!send.ok || !sd.signature) {
            throw new Error(sd.error || "Send failed");
          }
          sigs.push(sd.signature);
        }
      }

      setDoneSigs(sigs);
      toast.money(
        `Reclaimed ~${selectedRent.toFixed(4)} SOL${build.gasless ? " · gasless" : ""}`,
      );
      await refreshBalance();
      await scan();
    } catch (e) {
      setCloseError(friendlyError(e, "Couldn't close accounts"));
    } finally {
      setClosing(false);
    }
  };

  const token = data?.tokenAccount;
  const system = data?.systemAccount;
  const primaryLamports = token?.lamports ?? data?.rentLamports ?? 0;

  const copyLamports = async () => {
    try {
      await navigator.clipboard.writeText(String(primaryLamports));
      setCopied(true);
      toast.success("Lamports copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <PageShell max="md" innerClassName="space-y-6 py-8 sm:py-12">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-violet-500/15 text-violet-500 mx-auto">
            <Coins className="w-6 h-6" />
          </div>
          <p className="text-[11px] uppercase tracking-wider text-violet-500 font-semibold">
            Rent
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            SOLANA Minimum Rent
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/45">
            Live costs · reclaim empty accounts gasless
          </p>
        </div>

        {/* ── Min rent calculator ───────────────────────────────────── */}
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] p-5 sm:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">Account opening cost</p>
            <button
              type="button"
              onClick={() => void load(space)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline disabled:opacity-50 min-h-[36px] px-2"
            >
              {loading ? <Spinner size={14} /> : <RefreshCw size={14} />}
              Refresh
            </button>
          </div>

          {error && (
            <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-400">
              <Spinner size={18} /> Loading rent…
            </div>
          )}

          {data && token && (
            <div className="space-y-3">
              <Row
                label="Token account"
                sub={`${token.space} bytes · SPL ATA`}
                lamports={token.lamports}
                sol={token.sol}
                usd={token.usd}
                accent="emerald"
              />
              {system && (
                <Row
                  label="System account"
                  sub={`${system.space} bytes · empty account`}
                  lamports={system.lamports}
                  sol={system.sol}
                  usd={system.usd}
                  accent="rose"
                />
              )}

              <div className="flex justify-between items-center gap-3 pt-1 border-t border-black/5 dark:border-white/10">
                <span className="text-sm font-medium text-gray-600 dark:text-white/60">
                  SOL price
                </span>
                <span className="text-xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                  {data.price ? `$${data.price.toFixed(2)}` : "—"}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void copyLamports()}
                className="w-full min-h-[44px] rounded-xl border border-black/10 dark:border-white/10 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-black/5 dark:hover:bg-white/5"
              >
                {copied ? (
                  <Check size={16} className="text-emerald-500" />
                ) : (
                  <Copy size={16} />
                )}
                Copy token rent lamports
              </button>

              <p className="text-[11px] text-gray-500 dark:text-white/40 text-center leading-relaxed">
                {data.note ||
                  "Minimum rent is refunded in full when you close the account."}
              </p>
            </div>
          )}
        </div>

        <details className="rounded-2xl border border-black/10 dark:border-white/10 px-4 py-3">
          <summary className="text-sm font-medium cursor-pointer list-none flex items-center justify-between">
            <span>Custom account size</span>
            <span className="text-xs text-gray-400">bytes</span>
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min={0}
              max={10000000}
              inputMode="numeric"
              placeholder="e.g. 165"
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="flex-1 min-h-[44px] rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 px-3 text-sm font-mono"
            />
            <button
              type="button"
              onClick={() => void load(space)}
              disabled={loading || !space.trim()}
              className="min-h-[44px] px-4 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white text-sm font-semibold"
            >
              Calc
            </button>
          </div>
          {data?.custom && (
            <div className="mt-3">
              <Row
                label={`Custom (${data.custom.space} bytes)`}
                lamports={data.custom.lamports}
                sol={data.custom.sol}
                usd={data.custom.usd}
              />
            </div>
          )}
        </details>

        {/* ── Gasless account closer ──────────────────────────────── */}
        <div className="rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/10 via-transparent to-violet-500/5 p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-xl bg-orange-500/15 text-orange-500 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold">Close empty accounts</h2>
                {gasless && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Zap size={10} /> Gasless
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 dark:text-white/50 mt-0.5">
                Reclaim SOL rent from empty token accounts.
                {gasless
                  ? " sol.new pays the network fee — you need no SOL."
                  : " Passkey signs; you pay a tiny network fee if sponsor is off."}
              </p>
            </div>
          </div>

          <ConnectGate action="reclaim rent">
            {network !== "mainnet" && (
              <p className="text-xs text-amber-500">
                Switch to mainnet to scan and close accounts.
              </p>
            )}

            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 px-4 py-3 text-sm space-y-1">
              <p>
                Empty accounts:{" "}
                <span className="font-semibold">{emptyCount}</span>
              </p>
              <p>
                Reclaimable:{" "}
                <span className="font-semibold text-orange-500">
                  ~{reclaimableSol.toFixed(4)} SOL
                </span>
                {data?.price
                  ? ` · ~$${((reclaimableSol * data.price) || 0).toFixed(2)}`
                  : ""}
              </p>
              <button
                type="button"
                onClick={() => void scan()}
                disabled={scanning || !publicKey}
                className="text-xs text-orange-500 hover:underline disabled:opacity-40"
              >
                {scanning ? "Scanning…" : "Rescan wallet"}
              </button>
            </div>

            {scanning && (
              <div className="flex justify-center py-8">
                <Spinner size={24} />
              </div>
            )}

            {!scanning && emptyCount === 0 && publicKey && network === "mainnet" && (
              <p className="text-center text-sm text-gray-400 py-4">
                No empty token accounts — nothing to reclaim.
              </p>
            )}

            {!scanning && accounts.filter((a) => a.empty).length > 0 && (
              <ul className="space-y-2 max-h-[40vh] overflow-y-auto">
                {accounts
                  .filter((a) => a.empty)
                  .map((a) => (
                    <li
                      key={a.pubkey}
                      className="flex items-start gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        disabled={closing}
                        checked={selected.has(a.pubkey)}
                        onChange={() => toggle(a.pubkey)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs truncate">{a.mint}</p>
                        <p className="text-xs text-gray-500">
                          Empty · ~{a.rentSol.toFixed(5)} SOL · {a.program}
                        </p>
                      </div>
                    </li>
                  ))}
              </ul>
            )}

            <button
              type="button"
              disabled={
                closing ||
                emptySelected.length === 0 ||
                network !== "mainnet"
              }
              onClick={() => void closeSelected()}
              className="w-full min-h-[52px] rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-semibold inline-flex items-center justify-center gap-2"
            >
              {closing ? (
                <Spinner size={16} />
              ) : (
                <>
                  <Flame size={16} />
                  {gasless && <Zap size={14} />}
                </>
              )}
              Close {emptySelected.length || ""} account
              {emptySelected.length === 1 ? "" : "s"}
              {emptySelected.length > 0
                ? ` · ~${selectedRent.toFixed(4)} SOL`
                : ""}
              {gasless && emptySelected.length > 0 ? " · free fee" : ""}
            </button>

            {doneSigs.length > 0 && (
              <div className="text-xs text-emerald-500 space-y-1">
                <p className="flex items-center gap-1 font-medium">
                  <Check size={14} /> Closed · {doneSigs.length} tx
                  {doneSigs.length === 1 ? "" : "s"}
                </p>
                {doneSigs.map((s) => (
                  <Link
                    key={s}
                    href={txPath(s)}
                    className="block font-mono truncate hover:underline"
                  >
                    {s}
                  </Link>
                ))}
              </div>
            )}

            {closeError && (
              <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
                {closeError}
              </div>
            )}

            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              Only empty token accounts. Rent returns to your wallet.
              {gasless
                ? " Network fee sponsored by sol.new (same idea as freerent / Kora paymaster)."
                : ""}{" "}
              Full burn tools also on{" "}
              <Link href="/burn" className="text-orange-500 hover:underline">
                /burn
              </Link>
              .
            </p>
          </ConnectGate>
        </div>
      </PageShell>
    </div>
  );
}
