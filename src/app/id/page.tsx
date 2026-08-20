"use client";
import { useState, useEffect, useRef } from "react";
import { Search, CheckCircle, XCircle, ExternalLink, ArrowRight } from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";

type CheckResult = {
  available: boolean;
  name: string;
  priceUsd: number;
  domainKey: string;
  error?: string;
};

export default function IdPage() {
  const [input, setInput] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [status, setStatus] = useState<"idle" | "auth" | "building" | "signing" | "confirming" | "done" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { publicKey } = useWallet();
  const { rpc } = useNetwork();

  const normalized = input.toLowerCase().replace(/\.sol$/, "").trim();

  useEffect(() => {
    if (!normalized || normalized.length < 1) {
      setResult(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setChecking(true);
      setResult(null);
      try {
        const res = await fetch(`/api/id/check?name=${encodeURIComponent(normalized)}`);
        const data = (await res.json()) as CheckResult;
        setResult(data);
      } catch {
        setResult(null);
      } finally {
        setChecking(false);
      }
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [normalized]);

  const handleRegister = async () => {
    if (!result?.available || !publicKey) return;
    setTxError(null);
    try {
      setStatus("auth");
      const { getPasskeyKeypair } = await import("@/lib/passkey-wallet");
      const { keypair } = await getPasskeyKeypair();

      setStatus("building");
      const res = await fetch("/api/id/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized, buyerWallet: keypair.publicKey.toBase58() }),
      });
      const data = await res.json() as { ok: boolean; error?: string; tx: string; lastValidBlockHeight: number };
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to build transaction");

      setStatus("signing");
      const { Connection, Transaction } = await import("@solana/web3.js");
      const connection = new Connection(rpc, "confirmed");
      const txBytes = Buffer.from(data.tx, "base64");
      const tx = Transaction.from(txBytes);
      tx.sign(keypair);

      setStatus("confirming");
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(
        { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: data.lastValidBlockHeight },
        "confirmed",
      );

      setStatus("done");
    } catch (e: unknown) {
      setTxError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status === "auth" || status === "building" || status === "signing" || status === "confirming";

  const statusLabel = {
    auth: "Authenticating…",
    building: "Building transaction…",
    signing: "Signing…",
    confirming: "Confirming on-chain…",
    done: "Registered!",
    error: "Failed",
    idle: "",
  }[status];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-0 py-8 sm:py-12 lg:py-16 w-full min-w-0">
        <PageTransition>
          <div className="app-shell py-5 sm:py-8 lg:py-10 space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <AnimatedIcon icon={Search} size={32} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Solana names</h1>
              <p className="text-gray-500 dark:text-white/50 text-sm">
                Register .sol · look up .sol · .sns · .bonk · .skr
              </p>
            </div>

            {/* Resolve any name */}
            <div className="rounded-2xl border border-purple-400/25 bg-purple-500/5 p-4 space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-white/40">
                Look up
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  id="id-lookup"
                  placeholder="metasal.sol · name.sns · name.skr · name.bonk"
                  className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-purple-400/50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) window.location.href = `/id/${encodeURIComponent(v)}`;
                    }
                  }}
                />
                <button
                  type="button"
                  className="rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-4 py-2"
                  onClick={() => {
                    const el = document.getElementById("id-lookup") as HTMLInputElement | null;
                    const v = el?.value.trim();
                    if (v) window.location.href = `/id/${encodeURIComponent(v)}`;
                  }}
                >
                  Open
                </button>
              </div>
            </div>

            {/* Register .sol */}
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700 dark:text-white/70">Register a .sol</p>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => { setInput(e.target.value); setStatus("idle"); setTxError(null); }}
                placeholder="yourname"
                autoFocus
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 pr-24 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-lg"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono">.sol</span>
            </div>

            {/* Result */}
            {checking && (
              <div className="flex items-center gap-2 text-gray-500 dark:text-white/40 text-sm">
                <Spinner size={20} /> Checking…
              </div>
            )}

            {result && !checking && (
              <div className={`rounded-2xl border p-5 space-y-4 ${result.available ? "border-green-400/30 bg-green-500/5" : "border-red-400/30 bg-red-500/5"}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {result.available
                      ? <CheckCircle size={18} className="text-green-400" />
                      : <XCircle size={18} className="text-red-400" />}
                    <span className="font-semibold text-lg">{result.name}.sol</span>
                  </div>
                  {result.available && (
                    <span className="text-green-400 font-mono text-sm">${result.priceUsd} USDC</span>
                  )}
                </div>

                {result.available ? (
                  <>
                    <div className="text-xs text-gray-500 dark:text-white/40 space-y-1">
                      <p>Yearly registration. Renewal required to keep the domain.</p>
                      <p>Payment is in USDC — make sure your wallet has enough.</p>
                    </div>

                    {status === "done" ? (
                      <div className="flex flex-col items-center gap-3 py-2">
                        <div className="flex items-center gap-2 text-green-400 font-semibold">
                          <CheckCircle size={18} /> {result.name}.sol is yours!
                        </div>
                        <a
                          href={`/scan?address=${result.domainKey}`}
                          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white transition"
                        >
                          View on scan <ExternalLink size={12} />
                        </a>
                      </div>
                    ) : (
                      <button
                        onClick={handleRegister}
                        disabled={busy || !publicKey}
                        className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {busy ? (
                          <><Spinner size={20} /> {statusLabel}</>
                        ) : !publicKey ? (
                          "Connect wallet to register"
                        ) : (
                          <>Register {result.name}.sol <ArrowRight size={15} /></>
                        )}
                      </button>
                    )}

                    {txError && <p className="text-red-400 text-xs break-all">{txError}</p>}
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-500 dark:text-white/50">This domain is already taken.</p>
                    </div>
                    <a
                      href={`/id/${encodeURIComponent(result.name + ".sol")}`}
                      className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-purple-400/40 text-purple-400 hover:bg-purple-500/10 text-sm font-medium py-2.5 transition"
                    >
                      Open {result.name}.sol profile <ExternalLink size={12} />
                    </a>
                    <a
                      href={`/address/${result.domainKey}`}
                      className="text-sm text-gray-500 dark:text-white/50 hover:text-gray-900 dark:hover:text-white flex items-center justify-center gap-1 transition"
                    >
                      View domain account <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Price guide */}
            {!result && !checking && (
              <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-5">
                <p className="text-xs text-gray-500 dark:text-white/40 mb-3 font-medium uppercase tracking-wider">Pricing</p>
                <div className="grid grid-cols-5 gap-2 text-center text-sm">
                  {[
                    { chars: "1", price: "$750" },
                    { chars: "2", price: "$700" },
                    { chars: "3", price: "$640" },
                    { chars: "4", price: "$160" },
                    { chars: "5+", price: "$20" },
                  ].map(({ chars, price }) => (
                    <div key={chars} className="space-y-1">
                      <p className="font-mono text-gray-900 dark:text-white font-semibold">{price}</p>
                      <p className="text-gray-400 dark:text-white/30 text-xs">{chars} char{chars === "1" ? "" : "s"}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
