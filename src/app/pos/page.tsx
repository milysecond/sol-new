"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";
import {
  Check,
  Copy,
  Store,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import QRCode from "qrcode";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import {
  buildSolanaPayTransferUrl,
  findSignatureByReference,
  usdcMintForNetwork,
} from "@/lib/solana-pay";
import { playSfx } from "@/lib/sfx";
import { toast } from "@/lib/toast";

const QUICK = ["5", "10", "20", "50", "100"];
const TIPS = [
  { label: "No tip", pct: 0 },
  { label: "10%", pct: 10 },
  { label: "15%", pct: 15 },
  { label: "20%", pct: 20 },
];

type Phase = "entry" | "charge" | "paid";

function formatAmt(n: number, token: string) {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (token === "SOL") return n.toFixed(4).replace(/\.?0+$/, "");
  return n.toFixed(2);
}

export default function PosPage() {
  const { publicKey } = useWallet();
  const { network, rpc } = useNetwork();
  const connection = useMemo(() => new Connection(rpc, "confirmed"), [rpc]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<"SOL" | "USDC">("USDC");
  const [tipPct, setTipPct] = useState(0);
  const [note, setNote] = useState("");
  const [phase, setPhase] = useState<Phase>("entry");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [listening, setListening] = useState(false);
  const [muted, setMuted] = useState(false);
  const [totalPaid, setTotalPaid] = useState(0);

  const baseNum = useMemo(() => parseFloat(amount) || 0, [amount]);
  const tipAmt = useMemo(() => (baseNum * tipPct) / 100, [baseNum, tipPct]);
  const total = useMemo(() => baseNum + tipAmt, [baseNum, tipAmt]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setListening(false);
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const startCharge = useCallback(() => {
    if (!publicKey || total <= 0) return;
    const ref = Keypair.generate().publicKey;
    const amtStr = formatAmt(total, token);
    const url = buildSolanaPayTransferUrl({
      recipient: publicKey,
      amount: amtStr,
      label: note.trim() || "sol.new POS",
      message: tipPct > 0 ? `Includes ${tipPct}% tip` : undefined,
      reference: ref.toBase58(),
      splToken: token === "USDC" ? usdcMintForNetwork(network) : undefined,
      network,
    });
    setReference(ref.toBase58());
    setPayUrl(url);
    setSignature(null);
    setTotalPaid(total);
    setPhase("charge");
  }, [publicKey, total, token, note, tipPct, network]);

  // QR render
  useEffect(() => {
    if (!payUrl || !canvasRef.current || phase !== "charge") return;
    QRCode.toCanvas(canvasRef.current, payUrl, {
      width: 280,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
      errorCorrectionLevel: "M",
    }).catch(() => {});
  }, [payUrl, phase]);

  // Poll for payment
  useEffect(() => {
    if (phase !== "charge" || !reference || !connection) return;
    let cancelled = false;
    setListening(true);

    const tick = async () => {
      try {
        const refPk = new PublicKey(reference);
        const sig = await findSignatureByReference(connection, refPk, 12);
        if (sig && !cancelled) {
          stopPoll();
          setSignature(sig);
          setPhase("paid");
          if (!muted) {
            try {
              playSfx("money");
            } catch {
              /* ignore */
            }
          }
          toast.money("Payment received");
        }
      } catch {
        /* keep polling */
      }
    };

    void tick();
    pollRef.current = setInterval(() => void tick(), 2500);
    return () => {
      cancelled = true;
      stopPoll();
    };
  }, [phase, reference, connection, stopPoll, muted]);

  const appendDigit = (d: string) => {
    setAmount((prev) => {
      if (d === "." && prev.includes(".")) return prev;
      if (prev === "0" && d !== ".") return d;
      if (prev.length >= 12) return prev;
      return prev + d;
    });
  };

  const backspace = () => setAmount((p) => p.slice(0, -1));

  const copyPay = async () => {
    if (!payUrl) return;
    await navigator.clipboard.writeText(payUrl);
    setCopied(true);
    toast.success("Pay link copied");
    setTimeout(() => setCopied(false), 1500);
  };

  const reset = () => {
    stopPoll();
    setPhase("entry");
    setPayUrl(null);
    setReference(null);
    setSignature(null);
    setAmount("");
    setTipPct(0);
    setNote("");
  };

  const explorer =
    signature &&
    (network === "devnet"
      ? `/receipt/${signature}`
      : `/receipt/${signature}`);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="take payments">
          <div className="w-full sm:max-w-md space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 text-violet-500 text-xs font-semibold uppercase tracking-wide">
                  <Store className="w-3.5 h-3.5" /> Point of sale
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Charge</h1>
                <p className="text-sm text-gray-500 dark:text-white/45">
                  Solana Pay QR · tip · live confirm
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMuted((m) => !m)}
                className="p-2 rounded-lg bg-black/5 dark:bg-white/5 text-gray-500 hover:text-violet-500 transition cursor-pointer"
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {phase === "entry" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-4 py-6 text-center">
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Amount</p>
                  <p className="font-mono text-4xl sm:text-5xl font-bold tabular-nums tracking-tight">
                    {token === "USDC" ? "$" : "◎"}
                    {amount || "0"}
                  </p>
                  {tipPct > 0 && baseNum > 0 && (
                    <p className="text-sm text-violet-500 mt-2">
                      + {formatAmt(tipAmt, token)} tip →{" "}
                      <strong>
                        {token === "USDC" ? "$" : "◎"}
                        {formatAmt(total, token)}
                      </strong>
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  {(["USDC", "SOL"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setToken(t)}
                      className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition cursor-pointer ${
                        token === t
                          ? "bg-violet-600 text-white"
                          : "bg-black/5 dark:bg-white/5 text-gray-600 dark:text-white/60"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setAmount(q)}
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-black/5 dark:bg-white/5 hover:bg-violet-500/15 hover:text-violet-600 transition cursor-pointer"
                    >
                      {token === "USDC" ? `$${q}` : q}
                    </button>
                  ))}
                </div>

                {/* Numpad */}
                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => (k === "⌫" ? backspace() : appendDigit(k))}
                      className="py-3.5 rounded-xl text-lg font-semibold bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 active:scale-[0.98] transition cursor-pointer"
                    >
                      {k}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400">Tip</p>
                  <div className="flex gap-2">
                    {TIPS.map((t) => (
                      <button
                        key={t.pct}
                        type="button"
                        onClick={() => setTipPct(t.pct)}
                        className={`flex-1 text-xs font-semibold rounded-lg py-2 transition cursor-pointer ${
                          tipPct === t.pct
                            ? "bg-violet-600 text-white"
                            : "bg-black/5 dark:bg-white/5 text-gray-500"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Note (coffee, table 4…)"
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 48))}
                  className="w-full rounded-xl px-4 py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm"
                />

                <button
                  type="button"
                  disabled={total <= 0}
                  onClick={startCharge}
                  className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold rounded-xl py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                >
                  Charge {total > 0 ? `${formatAmt(total, token)} ${token}` : "…"}
                </button>

                <p className="text-center text-[11px] text-gray-400">
                  Need a simple link?{" "}
                  <Link href="/pay" className="text-violet-500 font-medium">
                    /pay
                  </Link>
                </p>
              </div>
            )}

            {phase === "charge" && payUrl && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-5 flex flex-col items-center gap-3">
                  <p className="text-xs uppercase tracking-wide text-violet-500 font-semibold">
                    Scan to pay
                  </p>
                  <div className="bg-white p-3 rounded-2xl shadow-sm">
                    <canvas ref={canvasRef} className="rounded-lg" />
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {token === "USDC" ? "$" : "◎"}
                    {formatAmt(totalPaid, token)}{" "}
                    <span className="text-base font-semibold text-gray-500">{token}</span>
                  </p>
                  {note && <p className="text-sm text-gray-500">{note}</p>}
                  <p className="text-xs text-gray-400 flex items-center gap-1.5">
                    {listening ? <Spinner size={12} /> : null}
                    Waiting for payment…
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => void copyPay()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-medium cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? "Copied" : "Copy Solana Pay link"}
                </button>

                <button
                  type="button"
                  onClick={reset}
                  className="w-full text-sm text-gray-500 hover:text-violet-500 transition cursor-pointer py-2"
                >
                  Cancel
                </button>
              </div>
            )}

            {phase === "paid" && (
              <div className="space-y-4 text-center">
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-8 space-y-3">
                  <div className="mx-auto w-14 h-14 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                    <Check className="w-8 h-8" strokeWidth={3} />
                  </div>
                  <h2 className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">Paid</h2>
                  <p className="text-xl font-mono font-semibold tabular-nums">
                    {token === "USDC" ? "$" : "◎"}
                    {formatAmt(totalPaid, token)} {token}
                  </p>
                  {note && <p className="text-sm text-gray-500">{note}</p>}
                  {explorer && (
                    <a
                      href={explorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block text-xs text-emerald-600 dark:text-emerald-400 underline"
                    >
                      View transaction
                    </a>
                  )}
                </div>
                <button
                  type="button"
                  onClick={reset}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" /> Next sale
                </button>
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
