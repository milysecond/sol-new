"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Award, Check, MapPin, Sparkles } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import type { PoapDrop } from "@/lib/poap";

export default function PoapClaimPage() {
  const params = useParams();
  const code = String(params?.code || "").toLowerCase();
  const { publicKey } = useWallet();
  const [drop, setDrop] = useState<PoapDrop | null>(null);
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [already, setAlready] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/poap/${encodeURIComponent(code)}`, { cache: "no-store" });
        const d = (await r.json()) as {
          drop?: PoapDrop;
          open?: boolean;
          reason?: string;
          error?: string;
        };
        if (!r.ok || !d.drop) throw new Error(d.error || "Not found");
        if (cancelled) return;
        setDrop(d.drop);
        setOpen(d.open !== false);
        setReason(d.reason);
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Drop not found"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const claim = async () => {
    if (!publicKey || !drop) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/poap/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        already?: boolean;
        drop?: PoapDrop;
        error?: string;
      };
      if (!r.ok || !d.ok) throw new Error(d.error || "Claim failed");
      if (d.drop) setDrop(d.drop);
      setClaimed(true);
      setAlready(!!d.already);
    } catch (e) {
      setError(friendlyError(e, "Couldn't claim"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-3 sm:px-4 pt-5 sm:pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <PageTransition>
          {loading && (
            <div className="flex justify-center py-20">
              <Spinner size={28} />
            </div>
          )}

          {!loading && error && !drop && (
            <div className="text-center space-y-3 py-16">
              <Award className="w-10 h-10 text-gray-400 mx-auto" />
              <p className="text-red-500 dark:text-red-400">{error}</p>
              <Link href="/poap" className="text-sm text-violet-600">
                Create a drop
              </Link>
            </div>
          )}

          {drop && (
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-violet-500 font-semibold">
                  POAP drop
                </p>
                <h1 className="text-2xl font-bold tracking-tight">{drop.title}</h1>
                {drop.location && (
                  <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                    <MapPin className="w-3 h-3" /> {drop.location}
                  </p>
                )}
              </div>

              <div className="relative mx-auto w-56 h-56 rounded-3xl overflow-hidden border border-black/10 dark:border-white/10 shadow-lg bg-gradient-to-br from-violet-600 to-fuchsia-500 flex items-center justify-center">
                {drop.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={drop.imageUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                ) : (
                  <div className="text-center text-white px-4">
                    <Sparkles className="w-10 h-10 mx-auto mb-2 opacity-90" />
                    <p className="font-bold text-lg leading-tight">{drop.title}</p>
                  </div>
                )}
              </div>

              {drop.description && (
                <p className="text-sm text-gray-600 dark:text-white/70 text-center whitespace-pre-wrap">
                  {drop.description}
                </p>
              )}

              <p className="text-center text-[11px] text-gray-400">
                {drop.claimCount}
                {drop.maxClaims != null ? ` / ${drop.maxClaims}` : ""} claimed
              </p>

              {(claimed || already) && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center space-y-1">
                  <Check className="w-6 h-6 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {already ? "Already in your collection" : "Claimed — you're on the list"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {publicKey?.slice(0, 4)}…{publicKey?.slice(-4)}
                  </p>
                </div>
              )}

              {!claimed && !already && (
                <>
                  {!open && (
                    <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-800 dark:text-amber-200 text-center">
                      {reason || "This drop is closed"}
                    </div>
                  )}
                  {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400 text-center">
                      {error}
                    </div>
                  )}
                  <ConnectGate action="claim this POAP">
                    <button
                      type="button"
                      onClick={() => void claim()}
                      disabled={busy || !open}
                      className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-base flex items-center justify-center gap-2"
                    >
                      {busy ? <Spinner size={20} /> : <Award className="w-5 h-5" />}
                      {busy ? "Claiming…" : "Claim POAP"}
                    </button>
                  </ConnectGate>
                </>
              )}

              <p className="text-center text-[11px] text-gray-400">
                Issuer {drop.issuer.slice(0, 4)}…{drop.issuer.slice(-4)} ·{" "}
                <Link href="/poap" className="text-violet-500">
                  Make your own
                </Link>
              </p>
            </div>
          )}
        </PageTransition>
      </main>
    </div>
  );
}
