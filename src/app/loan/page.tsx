"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

export default function LoanPage() {
  const { publicKey, balance, usdcBalance, refreshBalance } = useWallet();
  const { rpc, network } = useNetwork();
  const [tab, setTab] = useState<Tab>("lend");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [earnTokens, setEarnTokens] = useState<EarnToken[]>([]);
  const [earnPositions, setEarnPositions] = useState<unknown[]>([]);
  const [borrowVaults, setBorrowVaults] = useState<BorrowVault[]>([]);
  const [borrowPositions, setBorrowPositions] = useState<unknown[]>([]);
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
        setEarnPositions(Array.isArray(data.positions) ? data.positions : []);
        if (!selectedEarn && tokens[0]?.assetAddress) {
          setSelectedEarn(tokens[0].assetAddress);
        }
      } else {
        const vaults = Array.isArray(data.vaults) ? data.vaults : [];
        setBorrowVaults(vaults);
        setBorrowPositions(Array.isArray(data.positions) ? data.positions : []);
        if (selectedVault == null && vaults[0]?.id != null) {
          setSelectedVault(vaults[0].id);
        }
      }
    } catch (e) {
      setError(friendlyError(e, "Could not load loan markets"));
    } finally {
      setLoading(false);
    }
  }, [tab, publicKey, network, selectedEarn, selectedVault]);

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
        setError(
          "SOL collateral needs WSOL in your wallet first. Supply USDC vaults, or wrap SOL externally for now."
        );
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

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-24 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-4 py-6 sm:py-10">
        <PageTransition>
          <div className="w-full max-w-lg space-y-6">
            <div className="text-center space-y-2">
              <AnimatedIcon icon={Landmark} size={36} className="text-emerald-500" />
              <h1 className="text-3xl font-bold tracking-tight">Lend & borrow</h1>
              <p className="text-sm text-gray-500 dark:text-white/50">
                Supply to earn yield, or borrow against collateral. Passkey-secured.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
              {(["lend", "borrow"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTab(t);
                    setSig(null);
                    setError(null);
                  }}
                  className={`rounded-lg py-2.5 text-sm font-semibold capitalize transition cursor-pointer ${
                    tab === t
                      ? "bg-white dark:bg-white/10 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-white/45 hover:text-gray-800 dark:hover:text-white/70"
                  }`}
                >
                  {t === "lend" ? "Supply" : "Borrow"}
                </button>
              ))}
            </div>

            {network === "devnet" && (
              <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                Switch to <strong>live</strong> network to use loan markets.
              </div>
            )}

            {configured === false && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                Loan markets are not configured on this deployment.
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-16">
                <Spinner size={28} className="text-emerald-500" />
              </div>
            ) : (
              <ConnectGate action={tab === "lend" ? "supply assets" : "borrow"}>
                {tab === "lend" ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wide">
                        Asset
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {earnTokens.map((t) => {
                          const mint = t.assetAddress;
                          const sym = t.asset?.uiSymbol || t.asset?.symbol || t.uiSymbol || t.symbol;
                          const active = (selectedEarn || earnToken?.assetAddress) === mint;
                          return (
                            <button
                              key={mint + t.id}
                              type="button"
                              onClick={() => setSelectedEarn(mint)}
                              className={`rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${
                                active
                                  ? "border-emerald-500/50 bg-emerald-500/10"
                                  : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] hover:border-black/20"
                              }`}
                            >
                              <p className="font-semibold text-sm">{sym}</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                                {bpsToPct(t.totalRate)} APY
                              </p>
                            </button>
                          );
                        })}
                        {earnTokens.length === 0 && (
                          <p className="col-span-full text-sm text-gray-400">No vaults loaded.</p>
                        )}
                      </div>
                    </div>

                    {earnToken && (
                      <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-3 text-xs text-gray-500 dark:text-white/45 space-y-1">
                        <p>
                          Supply {bpsToPct(earnToken.supplyRate)} · Rewards{" "}
                          {bpsToPct(earnToken.rewardsRate)} · Total{" "}
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {bpsToPct(earnToken.totalRate)}
                          </span>
                        </p>
                        <p>
                          Withdrawable ~{" "}
                          {formatBaseUnits(
                            earnToken.liquiditySupplyData?.withdrawable,
                            earnToken.asset?.decimals ?? earnToken.decimals
                          )}{" "}
                          {earnToken.asset?.uiSymbol || earnToken.symbol}
                        </p>
                      </div>
                    )}

                    {earnPositions.length > 0 && (
                      <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 space-y-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase">
                          Your positions
                        </p>
                        <pre className="text-[11px] font-mono text-gray-600 dark:text-white/50 overflow-x-auto max-h-28">
                          {JSON.stringify(earnPositions, null, 0).slice(0, 400)}
                        </pre>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5">
                      {(["deposit", "withdraw"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAction(a)}
                          className={`rounded-lg py-2 text-sm font-medium capitalize cursor-pointer ${
                            action === a
                              ? "bg-emerald-500 text-white"
                              : "text-gray-500 dark:text-white/50"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>

                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
                        <span>Amount</span>
                        <span>
                          Wallet:{" "}
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
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-4 py-3.5 font-mono text-lg focus:outline-none focus:border-emerald-500/50"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={busy || !earnToken || network === "devnet"}
                      onClick={() => void submitEarn()}
                      className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold py-3.5 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Working…
                        </>
                      ) : (
                        `${action === "deposit" ? "Supply" : "Withdraw"} ${
                          earnToken?.asset?.uiSymbol || earnToken?.symbol || ""
                        }`
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase tracking-wide">
                        Market
                      </p>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {borrowVaults.slice(0, 24).map((v) => {
                          const active = (selectedVault ?? vault?.id) === v.id;
                          const col = v.supplyToken.uiSymbol || v.supplyToken.symbol;
                          const debt = v.borrowToken.uiSymbol || v.borrowToken.symbol;
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setSelectedVault(v.id)}
                              className={`w-full rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${
                                active
                                  ? "border-emerald-500/50 bg-emerald-500/10"
                                  : "border-black/10 dark:border-white/10 hover:border-black/20"
                              }`}
                            >
                              <div className="flex justify-between gap-2">
                                <p className="font-semibold text-sm">
                                  {col} → {debt}
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                                  {bpsToPct(v.borrowRate)} borrow
                                </p>
                              </div>
                              <p className="text-[11px] text-gray-500 dark:text-white/40 mt-0.5">
                                LTV {(Number(v.collateralFactor || 0) / 10).toFixed(0)}% · Liq{" "}
                                {(Number(v.liquidationThreshold || 0) / 10).toFixed(0)}% · Supply{" "}
                                {bpsToPct(v.supplyRate)}
                              </p>
                            </button>
                          );
                        })}
                        {borrowVaults.length === 0 && (
                          <p className="text-sm text-gray-400">No borrow markets loaded.</p>
                        )}
                      </div>
                    </div>

                    {borrowPositions.length > 0 && (
                      <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 space-y-1">
                        <p className="text-xs font-medium text-gray-500 dark:text-white/40 uppercase">
                          Your positions (NFT id)
                        </p>
                        <pre className="text-[11px] font-mono text-gray-600 dark:text-white/50 overflow-x-auto max-h-28">
                          {JSON.stringify(borrowPositions, null, 0).slice(0, 500)}
                        </pre>
                      </div>
                    )}

                    <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5">
                      {(["deposit", "borrow", "repay", "withdraw"] as const).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setBorrowAction(a)}
                          className={`rounded-lg py-2 text-[11px] font-medium capitalize cursor-pointer ${
                            borrowAction === a
                              ? "bg-emerald-500 text-white"
                              : "text-gray-500 dark:text-white/50"
                          }`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-gray-500 dark:text-white/40">Position id</label>
                        <input
                          type="text"
                          value={positionId}
                          onChange={(e) => setPositionId(e.target.value.replace(/[^\d]/g, ""))}
                          placeholder="0 = new"
                          className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      {(borrowAction === "deposit" || borrowAction === "withdraw") && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500 dark:text-white/40">
                            Collateral ({vault?.supplyToken.uiSymbol || "—"})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={colAmount}
                            onChange={(e) => setColAmount(e.target.value)}
                            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      )}
                      {(borrowAction === "borrow" || borrowAction === "repay") && (
                        <div className="space-y-1">
                          <label className="text-xs text-gray-500 dark:text-white/40">
                            Debt ({vault?.borrowToken.uiSymbol || "—"})
                          </label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={debtAmount}
                            onChange={(e) => setDebtAmount(e.target.value)}
                            className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 font-mono text-sm focus:outline-none focus:border-emerald-500/50"
                          />
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busy || !vault || network === "devnet"}
                      onClick={() => void submitBorrow()}
                      className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-semibold py-3.5 transition cursor-pointer flex items-center justify-center gap-2 capitalize"
                    >
                      {busy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Working…
                        </>
                      ) : (
                        borrowAction
                      )}
                    </button>
                    <p className="text-[11px] text-center text-gray-400 dark:text-white/30">
                      Borrow uses NFT positions. New position = id 0. Liquidation risk applies.
                    </p>
                  </div>
                )}
              </ConnectGate>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-500">
                {error}
              </div>
            )}
            {sig && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
                <p className="text-emerald-700 dark:text-emerald-300 font-medium">Confirmed</p>
                <a
                  href={`https://sol.new/receipt/${sig}`}
                  className="font-mono text-xs text-emerald-600 dark:text-emerald-400 break-all hover:underline"
                >
                  {sig}
                </a>
              </div>
            )}

            <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
              Smart-contract and liquidation risk. Not financial advice.
            </p>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
