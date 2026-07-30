"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Keypair,
} from "@solana/web3.js";
import { Landmark, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import {
  bpsToPct,
  formatBaseUnits,
  toBaseUnits,
  type EarnToken,
  type BorrowVault,
} from "@/lib/jup-lend";

const WSOL = "So11111111111111111111111111111111111111112";

async function signAndSendBase64(
  connection: Connection,
  b64: string,
  keypair: Keypair,
  feePayer: PublicKey
): Promise<string> {
  const raw = Buffer.from(b64, "base64");
  try {
    const vtx = VersionedTransaction.deserialize(raw);
    vtx.sign([keypair]);
    const sig = await connection.sendRawTransaction(vtx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    await connection.confirmTransaction(sig, "confirmed");
    return sig;
  } catch (first) {
    try {
      const tx = Transaction.from(raw);
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      if (!tx.feePayer) tx.feePayer = feePayer;
      tx.partialSign(keypair);
      const sig = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );
      return sig;
    } catch {
      throw first instanceof Error ? first : new Error(String(first));
    }
  }
}

type Tab = "lend" | "borrow";

type PosRow = {
  id?: number | string;
  vaultId?: number | string;
  supply?: string;
  borrow?: string;
  token?: { asset?: { uiSymbol?: string; symbol?: string; decimals?: number }; decimals?: number };
  underlyingAssets?: string;
  shares?: string;
};

function asPosRows(raw: unknown[]): PosRow[] {
  return raw.map((r) => (r && typeof r === "object" ? (r as PosRow) : {}));
}

export default function LoanPage() {
  const { publicKey, balance, usdcBalance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [tab, setTab] = useState<Tab>("lend");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnTokens, setEarnTokens] = useState<EarnToken[]>([]);
  const [earnPositions, setEarnPositions] = useState<PosRow[]>([]);
  const [borrowVaults, setBorrowVaults] = useState<BorrowVault[]>([]);
  const [borrowPositions, setBorrowPositions] = useState<PosRow[]>([]);
  const [selectedEarn, setSelectedEarn] = useState<string>("");
  const [selectedVault, setSelectedVault] = useState<number | null>(null);
  const [amount, setAmount] = useState("10");
  const [colAmount, setColAmount] = useState("0.1");
  const [debtAmount, setDebtAmount] = useState("5");
  const [action, setAction] = useState<"deposit" | "withdraw">("deposit");
  const [borrowAction, setBorrowAction] = useState<"deposit" | "borrow" | "repay" | "withdraw">(
    "deposit"
  );
  const [positionId, setPositionId] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const selectedEarnRef = useRef(selectedEarn);
  const selectedVaultRef = useRef(selectedVault);
  selectedEarnRef.current = selectedEarn;
  selectedVaultRef.current = selectedVault;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (network === "devnet") {
        setConfigured(true);
        setEarnTokens([]);
        setBorrowVaults([]);
        setLoading(false);
        return;
      }
      const q = new URLSearchParams({ mode: tab });
      if (publicKey) q.set("wallet", publicKey);
      const res = await fetch(`/api/loan?${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        configured?: boolean;
        error?: string;
        tokens?: EarnToken[];
        positions?: unknown[];
        vaults?: BorrowVault[];
      };
      setConfigured(data.configured !== false);
      if (!data.ok && data.configured === false) {
        setEarnTokens([]);
        setBorrowVaults([]);
        return;
      }
      if (tab === "lend") {
        const tokens = Array.isArray(data.tokens) ? data.tokens : [];
        setEarnTokens(tokens);
        setEarnPositions(asPosRows(Array.isArray(data.positions) ? data.positions : []));
        if (!selectedEarnRef.current && tokens[0]?.assetAddress) {
          setSelectedEarn(tokens[0].assetAddress);
        }
      } else {
        const vaults = Array.isArray(data.vaults) ? data.vaults : [];
        setBorrowVaults(vaults);
        setBorrowPositions(asPosRows(Array.isArray(data.positions) ? data.positions : []));
        if (selectedVaultRef.current == null && vaults[0]?.id != null) {
          setSelectedVault(vaults[0].id);
        }
      }
    } catch (e) {
      setError(friendlyError(e, "Could not load loan markets"));
    } finally {
      setLoading(false);
    }
  }, [tab, publicKey, network]);

  useEffect(() => {
    void load();
  }, [load]);

  const earnToken = useMemo(
    () => earnTokens.find((t) => t.assetAddress === selectedEarn) || earnTokens[0],
    [earnTokens, selectedEarn]
  );

  const vault = useMemo(
    () => borrowVaults.find((v) => v.id === selectedVault) || borrowVaults[0],
    [borrowVaults, selectedVault]
  );

  const submitEarn = async () => {
    if (!publicKey || !earnToken) return;
    if (network === "devnet") {
      setError("Loan markets are mainnet only. Switch to live.");
      return;
    }
    const decimals = earnToken.asset?.decimals ?? earnToken.decimals ?? 6;
    const base = toBaseUnits(amount, decimals);
    if (!base || base === "0") {
      setError("Enter a valid amount");
      return;
    }
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const { keypair } = await getPasskeyKeypair();
      if (keypair.publicKey.toBase58() !== publicKey) {
        throw new Error("Passkey does not match connected wallet");
      }
      const res = await fetch("/api/loan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "earn",
          action,
          wallet: publicKey,
          asset: earnToken.assetAddress,
          amount: base,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        transaction?: string;
        error?: string;
      };
      if (!res.ok || !data.transaction) throw new Error(data.error || "Build failed");
      const connection = new Connection(rpc, "confirmed");
      const signature = await signAndSendBase64(
        connection,
        data.transaction,
        keypair,
        keypair.publicKey
      );
      setSig(signature);
      await refreshBalance();
      await load();
    } catch (e) {
      setError(friendlyError(e, "Transaction failed"));
    } finally {
      setBusy(false);
    }
  };

  const submitBorrow = async () => {
    if (!publicKey || !vault) return;
    if (network === "devnet") {
      setError("Loan markets are mainnet only. Switch to live.");
      return;
    }
    const colDec = vault.supplyToken.decimals;
    const debtDec = vault.borrowToken.decimals;
    let col = "0";
    let debt = "0";

    if (borrowAction === "deposit" || borrowAction === "withdraw") {
      const b = toBaseUnits(colAmount, colDec);
      if (!b || b === "0") {
        setError("Enter collateral amount");
        return;
      }
      col = borrowAction === "withdraw" ? `-${b}` : b;
      if (vault.supplyToken.address === WSOL && borrowAction === "deposit") {
        setError("SOL collateral needs WSOL first. Prefer non-SOL markets, or wrap SOL.");
        return;
      }
    } else {
      const b = toBaseUnits(debtAmount, debtDec);
      if (!b || b === "0") {
        setError("Enter borrow/repay amount");
        return;
      }
      debt = borrowAction === "repay" ? `-${b}` : b;
    }

    const pos = Number(positionId);
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const { keypair } = await getPasskeyKeypair();
      if (keypair.publicKey.toBase58() !== publicKey) {
        throw new Error("Passkey does not match connected wallet");
      }
      const res = await fetch("/api/loan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "borrow",
          wallet: publicKey,
          vaultId: vault.id,
          positionId: Number.isFinite(pos) ? pos : 0,
          colAmount: col,
          debtAmount: debt,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        transaction?: string;
        nftId?: number;
        error?: string;
      };
      if (!res.ok || !data.transaction) throw new Error(data.error || "Build failed");
      const connection = new Connection(rpc, "confirmed");
      const signature = await signAndSendBase64(
        connection,
        data.transaction,
        keypair,
        keypair.publicKey
      );
      setSig(signature);
      if (data.nftId != null) setPositionId(String(data.nftId));
      await refreshBalance();
      await load();
    } catch (e) {
      setError(friendlyError(e, "Transaction failed"));
    } finally {
      setBusy(false);
    }
  };

  const primaryLabel =
    tab === "lend"
      ? busy
        ? "Working…"
        : `${action === "deposit" ? "Supply" : "Withdraw"} ${
            earnToken?.asset?.uiSymbol || earnToken?.symbol || ""
          }`
      : busy
        ? "Working…"
        : borrowAction.charAt(0).toUpperCase() + borrowAction.slice(1);

  const primaryDisabled =
    busy ||
    network === "devnet" ||
    (tab === "lend" ? !earnToken : !vault) ||
    configured === false;

  const onPrimary = () => {
    if (tab === "lend") void submitEarn();
    else void submitBorrow();
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col w-full max-w-lg mx-auto px-3 sm:px-4 pt-4 sm:pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-10">
        <PageTransition>
          <div className="w-full space-y-4 sm:space-y-6">
            {/* Header — compact on phone */}
            <div className="text-center space-y-1.5 sm:space-y-2 px-1">
              <AnimatedIcon icon={Landmark} size={32} className="text-emerald-500 sm:hidden" />
              <div className="hidden sm:block">
                <AnimatedIcon icon={Landmark} size={36} className="text-emerald-500" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Lend & borrow</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-white/50 text-pretty max-w-sm mx-auto">
                Supply for yield or borrow vs collateral. Face ID.
              </p>
            </div>

            {/* Main tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
              {(["lend", "borrow"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setSig(null);
                    setError(null);
                  }}
                  className={`min-h-[48px] rounded-xl text-sm font-semibold capitalize transition cursor-pointer active:scale-[0.98] ${
                    tab === t
                      ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-white/45"
                  }`}
                >
                  {t === "lend" ? "Supply" : "Borrow"}
                </button>
              ))}
            </div>

            {network === "devnet" && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                Switch to <strong>live</strong> for loan markets.
              </div>
            )}

            {configured === false && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-500">
                Loan markets not configured.
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-20">
                <Spinner size={28} className="text-emerald-500" />
              </div>
            ) : (
              <ConnectGate action={tab === "lend" ? "supply assets" : "borrow"}>
                {tab === "lend" ? (
                  <div className="space-y-4">
                    <section className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 px-0.5">
                        Asset
                      </p>
                      {/* Horizontal chip scroller on mobile */}
                      <div className="-mx-3 px-3 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 overscroll-x-contain">
                        {earnTokens.map((t) => {
                          const mint = t.assetAddress;
                          const sym =
                            t.asset?.uiSymbol || t.asset?.symbol || t.uiSymbol || t.symbol;
                          const active = (selectedEarn || earnToken?.assetAddress) === mint;
                          return (
                            <button
                              key={mint + t.id}
                              type="button"
                              onClick={() => setSelectedEarn(mint)}
                              className={`snap-start shrink-0 min-w-[7.5rem] min-h-[64px] rounded-2xl border px-3.5 py-3 text-left transition cursor-pointer active:scale-[0.98] ${
                                active
                                  ? "border-emerald-500/50 bg-emerald-500/10"
                                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                              }`}
                            >
                              <p className="font-semibold text-sm leading-tight">{sym}</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
                                {bpsToPct(t.totalRate)} APY
                              </p>
                            </button>
                          );
                        })}
                        {earnTokens.length === 0 && (
                          <p className="text-sm text-gray-400 py-3">No vaults loaded.</p>
                        )}
                      </div>
                    </section>

                    {earnToken && (
                      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-3.5 py-3 grid grid-cols-3 gap-2 text-center">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 dark:text-white/35">
                            Supply
                          </p>
                          <p className="text-sm font-semibold tabular-nums mt-0.5">
                            {bpsToPct(earnToken.supplyRate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 dark:text-white/35">
                            Rewards
                          </p>
                          <p className="text-sm font-semibold tabular-nums mt-0.5">
                            {bpsToPct(earnToken.rewardsRate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400 dark:text-white/35">
                            Total
                          </p>
                          <p className="text-sm font-semibold tabular-nums mt-0.5 text-emerald-600 dark:text-emerald-400">
                            {bpsToPct(earnToken.totalRate)}
                          </p>
                        </div>
                      </div>
                    )}

                    {earnPositions.length > 0 && (
                      <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 px-3.5 pt-3 pb-1.5">
                          Your supply
                        </p>
                        <ul className="divide-y divide-black/5 dark:divide-white/5">
                          {earnPositions.slice(0, 6).map((p, i) => {
                            const dec = p.token?.asset?.decimals ?? p.token?.decimals ?? 6;
                            const sym =
                              p.token?.asset?.uiSymbol || p.token?.asset?.symbol || "—";
                            const bal = p.underlyingAssets ?? p.shares;
                            return (
                              <li
                                key={i}
                                className="flex items-center justify-between gap-2 px-3.5 py-3 text-sm"
                              >
                                <span className="font-medium">{sym}</span>
                                <span className="font-mono tabular-nums text-gray-600 dark:text-white/60 text-xs sm:text-sm">
                                  {formatBaseUnits(bal, dec)}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5">
                      {(["deposit", "withdraw"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={`min-h-[44px] rounded-xl text-sm font-semibold capitalize cursor-pointer active:scale-[0.98] ${
                            action === a
                              ? "bg-emerald-500 text-white"
                              : "text-gray-500 dark:text-white/50"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-white/40 px-0.5">
                        <span>Amount</span>
                        <span className="tabular-nums">
                          {earnToken?.assetAddress?.includes("EPjF")
                            ? `${usdcBalance?.toFixed(2) ?? "—"} USDC`
                            : earnToken?.assetAddress === WSOL
                              ? `${balance?.toFixed(4) ?? "—"} SOL`
                              : "—"}
                        </span>
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        enterKeyHint="done"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3.5 font-mono text-base sm:text-lg focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <section className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 px-0.5">
                        Market
                      </p>
                      <div className="-mx-3 px-3 flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 overscroll-x-contain">
                        {borrowVaults.slice(0, 30).map((v) => {
                          const active = (selectedVault ?? vault?.id) === v.id;
                          const col = v.supplyToken.uiSymbol || v.supplyToken.symbol;
                          const debt = v.borrowToken.uiSymbol || v.borrowToken.symbol;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVault(v.id)}
                              className={`snap-start shrink-0 w-[min(78vw,18rem)] min-h-[76px] rounded-2xl border px-3.5 py-3 text-left transition cursor-pointer active:scale-[0.98] ${
                                active
                                  ? "border-emerald-500/50 bg-emerald-500/10"
                                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-sm leading-snug">
                                  {col}
                                  <span className="text-gray-400 dark:text-white/30 font-normal">
                                    {" "}
                                    →{" "}
                                  </span>
                                  {debt}
                                </p>
                                <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 tabular-nums shrink-0">
                                  {bpsToPct(v.borrowRate)}
                                </p>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-white/40 mt-1.5 leading-snug">
                                LTV {(Number(v.collateralFactor || 0) / 10).toFixed(0)}% · Liq{" "}
                                {(Number(v.liquidationThreshold || 0) / 10).toFixed(0)}%
                              </p>
                            </button>
                          );
                        })}
                        {borrowVaults.length === 0 && (
                          <p className="text-sm text-gray-400 py-3">No markets loaded.</p>
                        )}
                      </div>
                    </section>

                    {borrowPositions.length > 0 && (
                      <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-hidden">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 px-3.5 pt-3 pb-1.5">
                          Your positions
                        </p>
                        <ul className="divide-y divide-black/5 dark:divide-white/5">
                          {borrowPositions.slice(0, 8).map((p, i) => (
                            <li key={i}>
                              <button
                                type="button"
                                onClick={() => {
                                  if (p.id != null) setPositionId(String(p.id));
                                  if (p.vaultId != null) setSelectedVault(Number(p.vaultId));
                                }}
                                className="w-full flex items-center justify-between gap-2 px-3.5 py-3 text-left active:bg-black/5 dark:active:bg-white/5"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium">
                                    #{p.id ?? "?"} · vault {p.vaultId ?? "—"}
                                  </p>
                                  <p className="text-[11px] text-gray-500 dark:text-white/40 font-mono truncate">
                                    col {p.supply ?? "—"} · debt {p.borrow ?? "—"}
                                  </p>
                                </div>
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 shrink-0">
                                  Use
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1.5">
                      {(["deposit", "borrow", "repay", "withdraw"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setBorrowAction(a)}
                          className={`min-h-[48px] rounded-2xl text-sm font-semibold capitalize cursor-pointer active:scale-[0.98] border ${
                            borrowAction === a
                              ? "bg-emerald-500 text-white border-emerald-500"
                              : "text-gray-600 dark:text-white/60 border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03]"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs text-gray-500 dark:text-white/40 px-0.5">
                          Position id <span className="text-gray-400">(0 = new)</span>
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={positionId}
                          onChange={(e) => setPositionId(e.target.value.replace(/[^\d]/g, ""))}
                          className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3.5 font-mono text-base focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      {(borrowAction === "deposit" || borrowAction === "withdraw") && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-gray-500 dark:text-white/40 px-0.5">
                            Collateral ({vault?.supplyToken.uiSymbol || "—"})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            enterKeyHint="done"
                            value={colAmount}
                            onChange={(e) => setColAmount(e.target.value)}
                            className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3.5 font-mono text-base focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      )}
                      {(borrowAction === "borrow" || borrowAction === "repay") && (
                        <div className="space-y-1.5">
                          <label className="text-xs text-gray-500 dark:text-white/40 px-0.5">
                            Debt ({vault?.borrowToken.uiSymbol || "—"})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            enterKeyHint="done"
                            value={debtAmount}
                            onChange={(e) => setDebtAmount(e.target.value)}
                            className="w-full rounded-2xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3.5 font-mono text-base focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      )}
                    </div>

                    <p className="text-[11px] text-center text-gray-400 dark:text-white/30 px-2">
                      NFT positions · liquidation risk · not financial advice
                    </p>
                  </div>
                )}
              </ConnectGate>
            )}

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-3.5 py-3 text-sm text-red-500 break-words">
                {error}
              </div>
            )}
            {sig && (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-sm">
                <p className="text-emerald-700 dark:text-emerald-300 font-medium">Confirmed</p>
                <a
                  href={`https://sol.new/receipt/${sig}`}
                  className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 break-all hover:underline"
                >
                  {sig}
                </a>
              </div>
            )}

            {/* Desktop CTA (mobile uses sticky bar) */}
            {!loading && configured !== false && publicKey && (
              <button
                type="button"
                disabled={primaryDisabled}
                onClick={onPrimary}
                className="hidden sm:flex w-full rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold min-h-[52px] items-center justify-center gap-2 transition cursor-pointer"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {primaryLabel}
              </button>
            )}
          </div>
        </PageTransition>
      </main>

      {/* Sticky mobile action bar above bottom nav */}
      {!loading && configured !== false && publicKey && (
        <div className="sm:hidden fixed inset-x-0 bottom-[calc(3.75rem+env(safe-area-inset-bottom))] z-20 px-3 pb-2 pt-2 bg-gradient-to-t from-white via-white/95 to-transparent dark:from-black dark:via-black/95 pointer-events-none">
          <button
            type="button"
            disabled={primaryDisabled}
            onClick={onPrimary}
            className="pointer-events-auto w-full rounded-2xl bg-emerald-500 active:bg-emerald-400 disabled:opacity-40 text-white font-semibold min-h-[52px] flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
          >
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
            {primaryLabel}
          </button>
        </div>
      )}
    </div>
  );
}
