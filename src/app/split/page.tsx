"use client";

import { useState, useMemo } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Users, Check, Minus, Plus, Copy, QrCode, ArrowLeft, Receipt } from "lucide-react";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import QRCode from "qrcode";

const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const TOKENS = ["SOL", "USDC"];
const TIPS = [0, 10, 15, 20];

type Share = { name: string; amount: string; url: string; qr: string };

function decimalsFor(token: string) {
  return token === "USDC" ? 2 : 4;
}

function fmt(n: number, decimals: number) {
  return n.toFixed(decimals).replace(/\.?0+$/, "");
}

// Split `total` into `n` parts that sum exactly to `total` at the given precision.
function splitEven(total: number, n: number, decimals: number): number[] {
  const unit = Math.pow(10, decimals);
  const totalUnits = Math.round(total * unit);
  const base = Math.floor(totalUnits / n);
  const rem = totalUnits - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < rem ? 1 : 0)) / unit);
}

function buildSolanaPayUrl(recipient: string, amount: string, token: string, label: string, network: string) {
  const base = `solana:${recipient}`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", amount);
  if (label) params.set("label", label);
  if (token === "USDC") {
    params.set("spl-token", network === "devnet" ? USDC_DEVNET : USDC_MAINNET);
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function SplitPage() {
  const [total, setTotal] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("SOL");
  const [tip, setTip] = useState(0);
  const [people, setPeople] = useState(2);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [paid, setPaid] = useState<Set<number>>(new Set());
  const [openQr, setOpenQr] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);

  const { publicKey } = useWallet();
  const { network } = useNetwork();

  const dec = decimalsFor(token);
  const sym = token === "USDC" ? "$" : "◎";

  const totalNum = parseFloat(total) || 0;
  const grandTotal = totalNum * (1 + tip / 100);
  const perPersonPreview = useMemo(() => {
    if (!grandTotal || people < 1) return 0;
    return splitEven(grandTotal, people, dec)[0];
  }, [grandTotal, people, dec]);

  const handleGenerate = async () => {
    if (!grandTotal || !publicKey || people < 1) return;
    setGenerating(true);
    try {
      const amounts = splitEven(grandTotal, people, dec);
      const built = await Promise.all(
        amounts.map(async (a, i) => {
          const amount = fmt(a, dec);
          const name = people === 1 ? "Total" : `Person ${i + 1}`;
          const url = buildSolanaPayUrl(publicKey, amount, token, label, network);
          const qr = await QRCode.toDataURL(url, {
            width: 320,
            margin: 2,
            color: { dark: "#000000", light: "#ffffff" },
          });
          return { name, amount, url, qr };
        })
      );
      setShares(built);
      setPaid(new Set());
      setOpenQr(null);
    } finally {
      setGenerating(false);
    }
  };

  const copyLink = (i: number, url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(i);
    setTimeout(() => setCopied((c) => (c === i ? null : c)), 2000);
  };

  const togglePaid = (i: number) => {
    setPaid((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const reset = () => {
    setShares(null);
    setPaid(new Set());
    setOpenQr(null);
    setTotal("");
    setLabel("");
    setTip(0);
  };

  const collected = shares
    ? shares.reduce((sum, s, i) => sum + (paid.has(i) ? parseFloat(s.amount) : 0), 0)
    : 0;
  const allPaid = shares ? paid.size === shares.length : false;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="split a bill">
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-8">
            <div className="text-center space-y-3">
              <AnimatedIcon icon={Users} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Split a bill</h1>
              <p className="text-gray-500 dark:text-white/50">
                Share the total evenly. Everyone scans, you get paid.
              </p>
            </div>

            {!shares ? (
              <div className="space-y-5">
                {/* Total */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1.5 uppercase tracking-wider">
                    Bill total
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono">
                      {sym}
                    </span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={total}
                      onChange={(e) => setTotal(e.target.value.replace(/[^0-9.]/g, ""))}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono text-2xl"
                    />
                  </div>
                </div>

                {/* Label */}
                <input
                  type="text"
                  placeholder="What's it for? (optional)"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition"
                />

                {/* Token */}
                <div className="flex gap-2">
                  {TOKENS.map((t) => (
                    <button
                      key={t}
                      onClick={() => setToken(t)}
                      className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                        token === t
                          ? "bg-purple-500/20 border-purple-400/50 text-purple-500 dark:text-purple-300"
                          : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                {/* Tip */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1.5 uppercase tracking-wider">
                    Add a tip
                  </label>
                  <div className="flex gap-2">
                    {TIPS.map((t) => (
                      <button
                        key={t}
                        onClick={() => setTip(t)}
                        className={`flex-1 border rounded-xl px-3 py-2 text-sm transition cursor-pointer ${
                          tip === t
                            ? "bg-purple-500/20 border-purple-400/50 text-purple-500 dark:text-purple-300"
                            : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:border-black/20 dark:hover:border-white/20"
                        }`}
                      >
                        {t === 0 ? "None" : `${t}%`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* People stepper */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-white/40 mb-1.5 uppercase tracking-wider">
                    Split between
                  </label>
                  <div className="flex items-center justify-between bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5">
                    <button
                      onClick={() => setPeople((p) => Math.max(1, p - 1))}
                      className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/20 transition cursor-pointer active:scale-95"
                      aria-label="Fewer people"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <div className="text-center">
                      <div className="text-2xl font-bold tabular-nums">{people}</div>
                      <div className="text-[11px] text-gray-500 dark:text-white/40">people</div>
                    </div>
                    <button
                      onClick={() => setPeople((p) => Math.min(50, p + 1))}
                      className="w-10 h-10 rounded-lg bg-black/5 dark:bg-white/10 flex items-center justify-center text-gray-700 dark:text-white/70 hover:bg-black/10 dark:hover:bg-white/20 transition cursor-pointer active:scale-95"
                      aria-label="More people"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Live preview */}
                {grandTotal > 0 && (
                  <div className="rounded-xl bg-purple-500/5 border border-purple-400/20 px-4 py-3 flex items-center justify-between">
                    <span className="text-sm text-gray-600 dark:text-white/60">Each person pays</span>
                    <span className="font-mono font-semibold text-purple-500 dark:text-purple-300 text-lg">
                      {sym}{fmt(perPersonPreview, dec)} {token}
                    </span>
                  </div>
                )}

                <button
                  onClick={handleGenerate}
                  disabled={!grandTotal || generating}
                  className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  {generating ? "Building links…" : `Create ${people} payment link${people === 1 ? "" : "s"}`}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary header */}
                <button
                  onClick={reset}
                  className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" /> New split
                </button>

                <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-white/50">
                      <Receipt className="w-4 h-4" />
                      {label || "Bill"}
                    </div>
                    <div className="font-mono font-semibold">
                      {sym}{fmt(grandTotal, dec)} {token}
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-400 transition-all duration-300"
                      style={{ width: `${(paid.size / shares.length) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500 dark:text-white/50">
                    <span>{paid.size} of {shares.length} paid</span>
                    <span className="font-mono">{sym}{fmt(collected, dec)} collected</span>
                  </div>
                </div>

                {allPaid && (
                  <div className="rounded-xl bg-green-500/10 border border-green-400/30 px-4 py-3 text-center text-green-600 dark:text-green-400 text-sm font-medium flex items-center justify-center gap-2">
                    <Check className="w-4 h-4" /> All settled up — nice!
                  </div>
                )}

                {/* Shares */}
                <div className="space-y-2.5">
                  {shares.map((s, i) => {
                    const isPaid = paid.has(i);
                    const qrOpen = openQr === i;
                    return (
                      <div
                        key={i}
                        className={`rounded-2xl border transition ${
                          isPaid
                            ? "border-green-400/30 bg-green-500/5"
                            : "border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02]"
                        }`}
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <button
                            onClick={() => togglePaid(i)}
                            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition cursor-pointer ${
                              isPaid
                                ? "bg-green-500 border-green-500 text-white"
                                : "border-black/20 dark:border-white/20 hover:border-purple-400"
                            }`}
                            aria-label={isPaid ? "Mark unpaid" : "Mark paid"}
                          >
                            {isPaid && <Check className="w-4 h-4" />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${isPaid ? "line-through text-gray-400 dark:text-white/40" : ""}`}>
                              {s.name}
                            </div>
                            <div className="font-mono text-sm text-gray-500 dark:text-white/50">
                              {sym}{s.amount} {token}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => setOpenQr(qrOpen ? null : i)}
                              className={`w-9 h-9 rounded-lg flex items-center justify-center transition cursor-pointer ${
                                qrOpen
                                  ? "bg-purple-500/20 text-purple-500 dark:text-purple-300"
                                  : "bg-black/5 dark:bg-white/10 text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white"
                              }`}
                              aria-label="Show QR"
                            >
                              <QrCode className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => copyLink(i, s.url)}
                              className="w-9 h-9 rounded-lg bg-black/5 dark:bg-white/10 text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white flex items-center justify-center transition cursor-pointer"
                              aria-label="Copy link"
                            >
                              {copied === i ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        {qrOpen && (
                          <div className="px-4 pb-4 flex flex-col items-center gap-3 border-t border-black/5 dark:border-white/5 pt-4">
                            <img src={s.qr} alt={`QR for ${s.name}`} className="w-48 h-48 rounded-xl" />
                            <p className="text-xs text-gray-400 dark:text-white/40 text-center">
                              Scan with any Solana wallet to pay {sym}{s.amount} {token}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
