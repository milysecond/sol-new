"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Copy,
  CreditCard,
  ScanLine,
  Link2,
} from "lucide-react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import QRCode from "qrcode";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { QrScanner } from "@/components/qr-scanner";
import { SlideToSend } from "@/components/slide-to-send";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { useDefaultToken } from "@/lib/currency-pref";
import { getPasskeyKeypair, ensureDocumentFocusForPasskey } from "@/lib/passkey-wallet";
import {
  buildSolanaPayTransferUrl,
  isUsdcMint,
  parseSolanaPayUrl,
  usdcMintForNetwork,
  type ParsedSolanaPay,
} from "@/lib/solana-pay";
import { friendlyError } from "@/lib/friendly-errors";
import { toast } from "@/lib/toast";
import { playSfx } from "@/lib/sfx";

const TOKENS = ["SOL", "USDC"] as const;
const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

type Mode = "request" | "scan";

function short(a: string) {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export default function PayPage() {
  const [mode, setMode] = useState<Mode>("request");
  const { publicKey, balance, usdcBalance, refreshBalance, walletKind } = useWallet();
  const { network, rpc } = useNetwork();
  const [defaultToken] = useDefaultToken();

  // ── Request ──────────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState<string>("SOL");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setSelected(defaultToken);
  }, [defaultToken]);

  const handleCreate = () => {
    if (!amount || !publicKey) return;
    const url = buildSolanaPayTransferUrl({
      recipient: publicKey,
      amount,
      label: label || "sol.new",
      splToken: selected === "USDC" ? usdcMintForNetwork(network) : undefined,
      network,
    });
    setPayUrl(url);
  };

  useEffect(() => {
    if (!payUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payUrl, {
      width: 256,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch(() => {});
  }, [payUrl]);

  const copyLink = () => {
    if (!payUrl) return;
    void navigator.clipboard.writeText(payUrl);
    setCopied(true);
    toast.success("Pay link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const resetRequest = () => {
    setPayUrl(null);
    setAmount("");
    setLabel("");
    setCopied(false);
  };

  // ── Scan & pay ───────────────────────────────────────────────────────
  const [paste, setPaste] = useState("");
  const [parsed, setParsed] = useState<ParsedSolanaPay | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [scanActive, setScanActive] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "auth" | "sending" | "confirming" | "done" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [txId, setTxId] = useState<string | null>(null);

  useEffect(() => {
    setScanActive(mode === "scan" && !parsed && status === "idle");
  }, [mode, parsed, status]);

  const applyPayload = useCallback((text: string) => {
    const p = parseSolanaPayUrl(text);
    if (!p) {
      toast.error("Not a Solana Pay QR or address");
      return;
    }
    setParsed(p);
    setPayAmount(p.amount || "");
    setError(null);
    setStatus("idle");
    setTxId(null);
    try {
      playSfx("notify");
    } catch {
      /* ignore */
    }
    toast.success("Payment request loaded");
  }, []);

  const onScan = useCallback(
    (text: string) => {
      applyPayload(text);
    },
    [applyPayload],
  );

  const assetLabel = useMemo(() => {
    if (!parsed) return "";
    if (parsed.kind === "sol") return "SOL";
    if (parsed.splToken && isUsdcMint(parsed.splToken)) return "USDC";
    return "SPL";
  }, [parsed]);

  const sendPayment = async () => {
    if (!publicKey || !parsed) return;
    setError(null);
    setStatus("auth");
    try {
      const amt = parseFloat(payAmount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount");

      const to = new PublicKey(parsed.recipient);
      const from = new PublicKey(publicKey);
      if (to.equals(from)) throw new Error("This request is to your own wallet");

      ensureDocumentFocusForPasskey();
      setStatus("sending");

      const connection = new Connection(rpc, "confirmed");
      const tx = new Transaction();

      // Solana Pay references must be readonly keys on the tx
      const refKeys: PublicKey[] = [];
      for (const r of parsed.references) {
        try {
          refKeys.push(new PublicKey(r));
        } catch {
          /* skip bad ref */
        }
      }

      if (parsed.kind === "sol") {
        const lamports = Math.round(amt * LAMPORTS_PER_SOL);
        if (lamports <= 0) throw new Error("Invalid amount");
        const bal = Math.round((balance ?? 0) * LAMPORTS_PER_SOL);
        if (lamports + 10_000 > bal) throw new Error("Not enough SOL (need a little extra for fees)");
        tx.add(
          SystemProgram.transfer({
            fromPubkey: from,
            toPubkey: to,
            lamports,
          }),
        );
      } else {
        const mintStr = parsed.splToken!;
        if (!isUsdcMint(mintStr)) {
          throw new Error("Only SOL and USDC Solana Pay requests are supported for now");
        }
        const decimals = 6;
        const raw = BigInt(Math.round(amt * 10 ** decimals));
        if (raw <= BigInt(0)) throw new Error("Invalid amount");
        if ((usdcBalance ?? 0) + 1e-9 < amt) throw new Error("Not enough USDC");
        if ((balance ?? 0) < 0.002) throw new Error("Need a little SOL for network fees");

        const mint = new PublicKey(mintStr);
        const fromAta = getAssociatedTokenAddressSync(mint, from, false, TOKEN_PROGRAM_ID);
        const toAta = getAssociatedTokenAddressSync(mint, to, false, TOKEN_PROGRAM_ID);
        tx.add(
          createAssociatedTokenAccountIdempotentInstruction(from, toAta, to, mint, TOKEN_PROGRAM_ID),
          createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            from,
            raw,
            decimals,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      if (parsed.memo) {
        tx.add(
          new TransactionInstruction({
            keys: [{ pubkey: from, isSigner: true, isWritable: true }],
            programId: MEMO_PROGRAM,
            data: Uint8Array.from(new TextEncoder().encode(parsed.memo)) as unknown as Buffer,
          }),
        );
      }

      // Attach references as extra readonly non-signer keys on last ix (Solana Pay)
      if (refKeys.length && tx.instructions.length) {
        const last = tx.instructions[tx.instructions.length - 1];
        for (const r of refKeys) {
          last.keys.push({ pubkey: r, isSigner: false, isWritable: false });
        }
      }

      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = from;

      let signature: string;
      if (walletKind === "external") {
        setStatus("auth");
        const { signTransactionWithInjected } = await import("@/lib/external-wallet");
        const signed = await signTransactionWithInjected(tx);
        signature = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      } else {
        setStatus("auth");
        const { keypair } = await getPasskeyKeypair(publicKey);
        setStatus("sending");
        tx.sign(keypair);
        signature = await connection.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          maxRetries: 3,
        });
      }
      setStatus("confirming");
      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      setTxId(signature);
      setStatus("done");
      await refreshBalance();
      toast.money("Paid");
      try {
        playSfx("money");
      } catch {
        /* ignore */
      }
    } catch (e) {
      setStatus("error");
      setError(friendlyError(e, "Payment failed"));
      try {
        playSfx("error");
      } catch {
        /* ignore */
      }
    }
  };

  const resetScan = () => {
    setParsed(null);
    setPayAmount("");
    setPaste("");
    setStatus("idle");
    setError(null);
    setTxId(null);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full min-w-0 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <ConnectGate action="use payments">
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6">
            <div className="text-center space-y-2">
              <AnimatedIcon icon={CreditCard} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Pay</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">
                Request money or scan a Solana Pay QR to pay
              </p>
            </div>

            {/* Mode tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/5">
              {(
                [
                  { id: "request" as const, label: "Request", icon: Link2 },
                  { id: "scan" as const, label: "Scan & pay", icon: ScanLine },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setMode(t.id)}
                  className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-semibold transition cursor-pointer ${
                    mode === t.id
                      ? "bg-white dark:bg-white/15 text-purple-700 dark:text-purple-200 shadow-sm"
                      : "text-gray-500 dark:text-white/45"
                  }`}
                >
                  <t.icon size={16} />
                  {t.label}
                </button>
              ))}
            </div>

            {mode === "request" && (
              <>
                {payUrl ? (
                  <div className="space-y-4">
                    <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-6 flex flex-col items-center space-y-4">
                      <canvas ref={canvasRef} className="rounded-xl" />
                      <div className="text-center">
                        <p className="text-gray-900 dark:text-white font-semibold text-lg">
                          {amount} {selected}
                        </p>
                        {label && (
                          <p className="text-gray-500 dark:text-white/40 text-sm">{label}</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={copyLink}
                        className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        {copied ? (
                          <>
                            <Check className="w-4 h-4" /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" /> Copy link
                          </>
                        )}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={resetRequest}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition cursor-pointer"
                    >
                      Create another
                    </button>
                    <p className="text-center text-[11px] text-gray-400">
                      Retail counter?{" "}
                      <Link href="/pos" className="text-violet-500 font-medium">
                        Open POS
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono">
                        {selected === "SOL" ? "◎" : "$"}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-400/50 font-mono text-2xl"
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="What's it for? (optional)"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-400/50"
                    />
                    <div className="flex gap-2">
                      {TOKENS.map((token) => (
                        <button
                          key={token}
                          type="button"
                          onClick={() => setSelected(token)}
                          className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${
                            selected === token
                              ? "bg-purple-500/20 border-purple-400/50 text-purple-300"
                              : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60"
                          }`}
                        >
                          {token}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={!amount}
                      className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-40 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed"
                    >
                      Create {selected} link
                    </button>
                  </div>
                )}
              </>
            )}

            {mode === "scan" && (
              <div className="space-y-4">
                {!parsed && status !== "done" && (
                  <>
                    <QrScanner active={scanActive} onScan={onScan} />
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">Or paste Solana Pay link / address</p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={paste}
                          onChange={(e) => setPaste(e.target.value)}
                          placeholder="solana:…"
                          className="flex-1 rounded-xl px-3 py-2.5 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => applyPayload(paste)}
                          disabled={!paste.trim()}
                          className="px-4 rounded-xl bg-violet-600 text-white text-sm font-semibold disabled:opacity-40 cursor-pointer"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  </>
                )}

                {parsed && status !== "done" && (
                  <div className="space-y-4 rounded-2xl border border-violet-500/25 bg-violet-500/5 p-5">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-violet-500 font-semibold">
                        Pay to
                      </p>
                      <p className="font-mono text-sm break-all mt-1">{parsed.recipient}</p>
                      <p className="text-xs text-gray-400 mt-1">{short(parsed.recipient)}</p>
                    </div>
                    {parsed.label && (
                      <p className="text-sm font-medium">{parsed.label}</p>
                    )}
                    {parsed.message && (
                      <p className="text-xs text-gray-500">{parsed.message}</p>
                    )}

                    <div>
                      <label className="text-xs text-gray-400">Amount ({assetLabel})</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                        disabled={Boolean(parsed.amount)}
                        className="mt-1 w-full rounded-xl px-4 py-3 font-mono text-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 disabled:opacity-70"
                      />
                      {parsed.amount && (
                        <p className="text-[11px] text-gray-400 mt-1">Amount fixed by merchant</p>
                      )}
                    </div>

                    <p className="text-xs text-gray-500">
                      Your balance:{" "}
                      {assetLabel === "USDC"
                        ? `${(usdcBalance ?? 0).toFixed(2)} USDC`
                        : `${(balance ?? 0).toFixed(4)} SOL`}
                    </p>

                    {error && (
                      <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                        {error}
                      </div>
                    )}

                    {(status === "idle" || status === "error") && (
                      <SlideToSend
                        label={`Slide to pay ${payAmount || "…"} ${assetLabel}`}
                        onConfirm={() => void sendPayment()}
                      />
                    )}

                    {(status === "auth" || status === "sending" || status === "confirming") && (
                      <div className="flex items-center justify-center gap-2 py-4 text-sm text-violet-500">
                        <Spinner size={18} />
                        {status === "auth"
                          ? "Confirm with passkey…"
                          : status === "sending"
                            ? "Sending…"
                            : "Confirming…"}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={resetScan}
                      className="w-full text-sm text-gray-500 py-2 cursor-pointer"
                    >
                      Cancel · scan again
                    </button>
                  </div>
                )}

                {status === "done" && txId && (
                  <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center space-y-3">
                    <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                      <Check className="w-7 h-7" strokeWidth={3} />
                    </div>
                    <h2 className="text-xl font-bold text-emerald-700 dark:text-emerald-300">Paid</h2>
                    <p className="font-mono text-lg">
                      {payAmount} {assetLabel}
                    </p>
                    <Link
                      href={`/receipt?sig=${txId}`}
                      className="inline-block text-sm text-emerald-600 underline"
                    >
                      View receipt
                    </Link>
                    <button
                      type="button"
                      onClick={resetScan}
                      className="w-full mt-2 bg-violet-600 text-white font-semibold rounded-xl py-3 cursor-pointer"
                    >
                      Pay another
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
