"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownUp,
  ChevronDown,
  Loader2,
  Search,
  ArrowLeftRight,
} from "lucide-react";
import { VersionedTransaction } from "@solana/web3.js";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { friendlyError } from "@/lib/friendly-errors";
import { SOL_MINT, USDC_MINT } from "@/lib/jup-ultra";

type TokenOpt = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  icon?: string;
};

const PRESETS: TokenOpt[] = [
  {
    mint: SOL_MINT,
    symbol: "SOL",
    name: "Solana",
    decimals: 9,
  },
  {
    mint: USDC_MINT,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
  },
  {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    symbol: "BONK",
    name: "Bonk",
    decimals: 5,
  },
  {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    symbol: "JUP",
    name: "Jupiter",
    decimals: 6,
  },
];

const PCTS = [0.25, 0.5, 0.75, 1] as const;
const SOL_FEE_RESERVE = 0.01;

function toAtomic(ui: string, decimals: number): string | null {
  const n = Number(ui);
  if (!Number.isFinite(n) || n <= 0) return null;
  const s = n.toFixed(decimals);
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const raw = `${w}${frac}`.replace(/^0+/, "") || "0";
  return raw === "0" ? null : raw;
}

function fromAtomic(atomic: string | undefined, decimals: number): string {
  if (!atomic) return "—";
  const neg = atomic.startsWith("-");
  const d = neg ? atomic.slice(1) : atomic;
  const pad = d.padStart(decimals + 1, "0");
  const whole = pad.slice(0, -decimals) || "0";
  const frac = pad.slice(-decimals).replace(/0+$/, "");
  const out = frac ? `${whole}.${frac}` : whole;
  return neg ? `-${out}` : out;
}

function fmtUi(n: number | null | undefined, d = 4): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return n.toFixed(Math.min(d, n >= 1 ? 4 : 6)).replace(/\.?0+$/, "");
}

export default function SwapPage() {
  const { publicKey, balance, usdcBalance, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [from, setFrom] = useState<TokenOpt>(PRESETS[0]);
  const [to, setTo] = useState<TokenOpt>(PRESETS[1]);
  const [amount, setAmount] = useState("0.1");
  const [quoteOut, setQuoteOut] = useState<string | null>(null);
  const [impact, setImpact] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [picker, setPicker] = useState<"from" | "to" | null>(null);
  const [search, setSearch] = useState("");
  const [hits, setHits] = useState<TokenOpt[]>([]);
  const [searching, setSearching] = useState(false);
  const [fromBal, setFromBal] = useState<number | null>(null);
  const quoteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const maxFrom = useMemo(() => {
    if (from.mint === SOL_MINT) {
      return Math.max(0, (balance ?? 0) - SOL_FEE_RESERVE);
    }
    if (from.mint === USDC_MINT) return usdcBalance ?? 0;
    return fromBal ?? 0;
  }, [from.mint, balance, usdcBalance, fromBal]);

  // Load non-SOL/USDC balance via portfolio holdings when needed
  useEffect(() => {
    if (!publicKey) {
      setFromBal(null);
      return;
    }
    if (from.mint === SOL_MINT || from.mint === USDC_MINT) {
      setFromBal(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/portfolio?wallet=${encodeURIComponent(publicKey)}`)
      .then((r) => r.json())
      .then((raw) => {
        if (cancelled) return;
        const d = raw as { tokens?: { mint: string; uiAmount: number }[] };
        const t = (d.tokens || []).find((x) => x.mint === from.mint);
        setFromBal(t?.uiAmount ?? 0);
      })
      .catch(() => {
        if (!cancelled) setFromBal(0);
      });
    return () => {
      cancelled = true;
    };
  }, [publicKey, from.mint]);

  const fetchQuote = useCallback(async () => {
    if (!publicKey || network === "devnet") {
      setQuoteOut(null);
      return;
    }
    const atomic = toAtomic(amount, from.decimals);
    if (!atomic) {
      setQuoteOut(null);
      setImpact(null);
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        inputMint: from.mint,
        outputMint: to.mint,
        amount: atomic,
        taker: publicKey,
      });
      const res = await fetch(`/api/swap/order?${q}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        order?: {
          outAmount?: string;
          priceImpactPct?: string;
          transaction?: string;
          requestId?: string;
        };
      };
      if (!res.ok || !data.ok || !data.order) {
        setQuoteOut(null);
        setImpact(null);
        // Don't surface every keystroke error
        if (Number(amount) > 0) setError(data.error || "Quote failed");
        return;
      }
      setQuoteOut(fromAtomic(data.order.outAmount, to.decimals));
      const pi = data.order.priceImpactPct;
      setImpact(pi != null ? `${(Math.abs(Number(pi)) * 100).toFixed(3)}%` : null);
      setError(null);
    } catch (e) {
      setQuoteOut(null);
      setError(friendlyError(e, "Quote failed"));
    } finally {
      setQuoting(false);
    }
  }, [publicKey, network, amount, from, to]);

  useEffect(() => {
    if (quoteTimer.current) clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(() => void fetchQuote(), 450);
    return () => {
      if (quoteTimer.current) clearTimeout(quoteTimer.current);
    };
  }, [fetchQuote]);

  useEffect(() => {
    if (!picker) return;
    const q = search.trim();
    if (q.length < 1) {
      setHits(PRESETS);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      fetch(`/api/swap/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((raw) => {
          if (cancelled) return;
          const d = raw as {
            tokens?: {
              id: string;
              symbol?: string;
              name?: string;
              decimals?: number;
              icon?: string;
            }[];
          };
          const list = (d.tokens || []).map((t) => ({
            mint: t.id,
            symbol: t.symbol || t.id.slice(0, 4),
            name: t.name || t.symbol || "Token",
            decimals: t.decimals ?? 6,
            icon: t.icon,
          }));
          setHits(
            list.length
              ? list
              : PRESETS.filter(
                  (p) =>
                    p.symbol.toLowerCase().includes(q.toLowerCase()) ||
                    p.mint.toLowerCase().includes(q.toLowerCase())
                )
          );
        })
        .catch(() => {
          if (!cancelled) setHits(PRESETS);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, picker]);

  const flip = () => {
    setFrom(to);
    setTo(from);
    setQuoteOut(null);
    setSig(null);
  };

  const setPct = (p: number) => {
    const m = maxFrom;
    if (!(m > 0)) return;
    const v = m * p;
    const d = from.mint === SOL_MINT ? 6 : Math.min(from.decimals, 6);
    setAmount(v.toFixed(d).replace(/\.?0+$/, "") || "0");
  };

  const submit = async () => {
    if (!publicKey) return;
    if (network === "devnet") {
      setError("Swap is mainnet only. Switch to live.");
      return;
    }
    const atomic = toAtomic(amount, from.decimals);
    if (!atomic) {
      setError("Enter an amount");
      return;
    }
    const n = Number(amount);
    if (maxFrom > 0 && n > maxFrom + 1e-9) {
      setError(`Insufficient balance (have ${fmtUi(maxFrom)})`);
      return;
    }
    setBusy(true);
    setError(null);
    setSig(null);
    try {
      const q = new URLSearchParams({
        inputMint: from.mint,
        outputMint: to.mint,
        amount: atomic,
        taker: publicKey,
      });
      const oRes = await fetch(`/api/swap/order?${q}`, { cache: "no-store" });
      const oData = (await oRes.json()) as {
        ok?: boolean;
        error?: string;
        order?: { transaction?: string; requestId?: string; outAmount?: string };
      };
      if (!oRes.ok || !oData.order?.transaction || !oData.order.requestId) {
        throw new Error(oData.error || "Could not build swap");
      }

      const { keypair } = await getPasskeyKeypair();
      if (keypair.publicKey.toBase58() !== publicKey) {
        throw new Error("Passkey does not match connected wallet");
      }

      const tx = VersionedTransaction.deserialize(
        Buffer.from(oData.order.transaction, "base64")
      );
      tx.sign([keypair]);
      const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

      const eRes = await fetch("/api/swap/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signedTransaction,
          requestId: oData.order.requestId,
        }),
      });
      const eData = (await eRes.json()) as {
        ok?: boolean;
        error?: string;
        result?: { signature?: string; status?: string; code?: number };
      };
      if (!eRes.ok || !eData.ok) {
        throw new Error(eData.error || "Swap execute failed");
      }
      const signature =
        eData.result?.signature ||
        (typeof eData.result?.status === "string" ? eData.result.status : null);
      setSig(typeof signature === "string" ? signature : "confirmed");
      setQuoteOut(fromAtomic(oData.order.outAmount, to.decimals));
      await refreshBalance();
    } catch (e) {
      setError(friendlyError(e, "Swap failed"));
    } finally {
      setBusy(false);
    }
  };

  const pick = (t: TokenOpt) => {
    if (picker === "from") {
      if (t.mint === to.mint) setTo(from);
      setFrom(t);
    } else if (picker === "to") {
      if (t.mint === from.mint) setFrom(to);
      setTo(t);
    }
    setPicker(null);
    setSearch("");
    setSig(null);
  };

  const TokenBtn = ({
    side,
    token,
  }: {
    side: "from" | "to";
    token: TokenOpt;
  }) => (
    <button
      type="button"
      onClick={() => {
        setPicker(side);
        setSearch("");
        setHits(PRESETS);
      }}
      className="flex items-center gap-2 rounded-xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 px-3 py-2 min-h-[44px] cursor-pointer active:scale-[0.98]"
    >
      {token.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={token.icon} alt="" className="w-6 h-6 rounded-full" />
      ) : (
        <span className="w-6 h-6 rounded-full bg-purple-500/20 text-[10px] font-bold flex items-center justify-center text-purple-600 dark:text-purple-300">
          {token.symbol.slice(0, 2)}
        </span>
      )}
      <span className="font-semibold text-sm">{token.symbol}</span>
      <ChevronDown className="w-4 h-4 text-gray-400" />
    </button>
  );

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-3 sm:px-4 pt-5 sm:pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <PageTransition>
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <AnimatedIcon icon={ArrowLeftRight} size={32} className="text-purple-500" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Swap</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-white/50">
                Any token · passkey · Jupiter Ultra
              </p>
            </div>

            {network === "devnet" && (
              <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-3.5 py-3 text-sm text-amber-800 dark:text-amber-200">
                Switch to <strong>live</strong> to swap.
              </div>
            )}

            <ConnectGate action="swap tokens">
              <div className="space-y-3">
                {/* From */}
                <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3.5 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
                    <span>You pay</span>
                    <button
                      type="button"
                      className="tabular-nums hover:text-purple-500"
                      onClick={() => setPct(1)}
                    >
                      Bal {fmtUi(maxFrom)} {from.symbol}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        setAmount(e.target.value);
                        setSig(null);
                      }}
                      className="flex-1 bg-transparent text-2xl font-mono font-semibold outline-none min-w-0"
                      placeholder="0"
                    />
                    <TokenBtn side="from" token={from} />
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {PCTS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPct(p)}
                        disabled={!(maxFrom > 0)}
                        className="min-h-[36px] rounded-lg border border-black/10 dark:border-white/10 text-xs font-semibold disabled:opacity-40"
                      >
                        {p === 1 ? "Max" : `${p * 100}%`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex justify-center -my-1 relative z-10">
                  <button
                    type="button"
                    onClick={flip}
                    className="w-11 h-11 rounded-full border border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 shadow-sm flex items-center justify-center cursor-pointer active:scale-95"
                    aria-label="Flip"
                  >
                    <ArrowDownUp className="w-4 h-4 text-purple-500" />
                  </button>
                </div>

                {/* To */}
                <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-3.5 space-y-2">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-white/40">
                    <span>You receive</span>
                    {quoting && <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> quoting</span>}
                    {impact && !quoting && <span>Impact ~{impact}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-2xl font-mono font-semibold tabular-nums min-w-0 truncate">
                      {quoteOut ?? "—"}
                    </div>
                    <TokenBtn side="to" token={to} />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-500 break-words">
                    {error}
                  </div>
                )}
                {sig && (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-sm">
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">Swap submitted</p>
                    {sig !== "confirmed" && (
                      <a
                        href={`https://sol.new/receipt/${sig}`}
                        className="font-mono text-[11px] text-emerald-600 break-all hover:underline"
                      >
                        {sig}
                      </a>
                    )}
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    busy ||
                    network === "devnet" ||
                    !toAtomic(amount, from.decimals) ||
                    (maxFrom > 0 && Number(amount) > maxFrom + 1e-9)
                  }
                  onClick={() => void submit()}
                  className="w-full min-h-[52px] rounded-2xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2"
                >
                  {busy ? (
                    <>
                      <Spinner size={16} /> Swapping…
                    </>
                  ) : (
                    `Swap ${from.symbol} → ${to.symbol}`
                  )}
                </button>

                <p className="text-[11px] text-center text-gray-400 dark:text-white/30">
                  Routed via Jupiter Ultra · network + protocol fees apply
                </p>
              </div>
            </ConnectGate>
          </div>
        </PageTransition>
      </main>

      {/* Token picker sheet */}
      {picker && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 backdrop-blur-sm">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setPicker(null)}
          />
          <div className="relative w-full sm:max-w-md max-h-[75dvh] rounded-t-3xl sm:rounded-3xl bg-white dark:bg-zinc-950 border border-black/10 dark:border-white/10 shadow-xl flex flex-col">
            <div className="p-4 border-b border-black/5 dark:border-white/10 space-y-3">
              <p className="text-sm font-semibold">Select token</p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search symbol or mint"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto p-2 pb-6">
              {searching && (
                <div className="flex justify-center py-6">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                </div>
              )}
              {(hits.length ? hits : PRESETS).map((t) => (
                <button
                  key={t.mint}
                  type="button"
                  onClick={() => pick(t)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-left"
                >
                  {t.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.icon} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-purple-500/15 flex items-center justify-center text-xs font-bold">
                      {t.symbol.slice(0, 2)}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm">{t.symbol}</p>
                    <p className="text-xs text-gray-500 truncate">{t.name}</p>
                  </div>
                  <span className="font-mono text-[10px] text-gray-400">
                    {t.mint.slice(0, 4)}…
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
