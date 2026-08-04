"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  Check,
  Copy,
  ExternalLink,
  MapPin,
  Plus,
  QrCode,
  Share2,
  Sparkles,
} from "lucide-react";
import QRCode from "qrcode";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import type { PoapDrop } from "@/lib/poap";
import { poapClaimUrl } from "@/lib/poap";

export default function PoapPage() {
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<"create" | "mine">("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [maxClaims, setMaxClaims] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ drop: PoapDrop; url: string } | null>(null);
  const [drops, setDrops] = useState<PoapDrop[]>([]);
  const [loadingMine, setLoadingMine] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const loadMine = useCallback(async () => {
    if (!publicKey) {
      setDrops([]);
      return;
    }
    setLoadingMine(true);
    try {
      const r = await fetch(`/api/poap?issuer=${encodeURIComponent(publicKey)}`, {
        cache: "no-store",
      });
      const d = (await r.json()) as { drops?: PoapDrop[] };
      setDrops(d.drops || []);
    } catch {
      setDrops([]);
    } finally {
      setLoadingMine(false);
    }
  }, [publicKey]);

  useEffect(() => {
    if (tab === "mine") void loadMine();
  }, [tab, loadMine]);

  useEffect(() => {
    if (!created?.url || !canvasRef.current) return;
    void QRCode.toCanvas(canvasRef.current, created.url, {
      width: 200,
      margin: 1,
      color: { dark: "#000000", light: "#ffffff" },
    });
  }, [created?.url]);

  const create = async () => {
    if (!publicKey) return;
    const t = title.trim();
    if (t.length < 2) {
      setError("Give your drop a title");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/poap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          imageUrl: imageUrl.trim() || undefined,
          issuer: publicKey,
          maxClaims: maxClaims.trim() ? Number(maxClaims) : null,
        }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        drop?: PoapDrop;
        url?: string;
        error?: string;
      };
      if (!r.ok || !d.drop || !d.url) throw new Error(d.error || "Create failed");
      const origin = typeof window !== "undefined" ? window.location.origin : "https://sol.new";
      setCreated({ drop: d.drop, url: poapClaimUrl(d.drop.code, origin) });
      setTab("create");
      void loadMine();
    } catch (e) {
      setError(friendlyError(e, "Couldn't create drop"));
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const share = async (url: string, name: string) => {
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: `Claim my POAP: ${name}`, url });
      } else {
        await copyUrl(url);
      }
    } catch {
      /* cancel */
    }
  };

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-md mx-auto px-3 sm:px-4 pt-5 sm:pt-8 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-12">
        <PageTransition>
          <div className="space-y-5">
            <div className="text-center space-y-1.5">
              <AnimatedIcon icon={Award} size={32} className="text-violet-500" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">POAP</h1>
              <p className="text-xs sm:text-sm text-gray-500 dark:text-white/50">
                Proof you were there · mint a memory · drop a claim link
              </p>
            </div>

            {/* How it works */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { n: "1", t: "Mint", d: "Name the moment" },
                { n: "2", t: "Drop", d: "Share link / QR" },
                { n: "3", t: "Claim", d: "Face ID collect" },
              ].map((s) => (
                <div
                  key={s.n}
                  className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] px-2 py-3"
                >
                  <p className="text-[10px] font-mono text-violet-500">{s.n}</p>
                  <p className="text-sm font-semibold">{s.t}</p>
                  <p className="text-[10px] text-gray-500">{s.d}</p>
                </div>
              ))}
            </div>

            <div className="flex rounded-xl bg-black/5 dark:bg-white/5 p-1">
              {(
                [
                  ["create", "Create drop"],
                  ["mine", "My drops"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                    tab === id
                      ? "bg-white dark:bg-white/10 shadow-sm text-gray-900 dark:text-white"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <ConnectGate action="create POAP drops">
              {tab === "create" && !created && (
                <div className="space-y-3 rounded-2xl border border-black/10 dark:border-white/10 p-4">
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Title *</span>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Solana Meetup Melbourne"
                      maxLength={80}
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Story</span>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="What happened? Who was there?"
                      rows={3}
                      maxLength={500}
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm resize-none"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Location
                    </span>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Optional"
                      maxLength={120}
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Image URL</span>
                    <input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://… (optional art)"
                      maxLength={500}
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm font-mono text-xs"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-gray-500">Max claims</span>
                    <input
                      value={maxClaims}
                      onChange={(e) => setMaxClaims(e.target.value.replace(/\D/g, ""))}
                      placeholder="Unlimited"
                      inputMode="numeric"
                      className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm"
                    />
                  </label>

                  {error && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                      {error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => void create()}
                    disabled={busy || !title.trim()}
                    className="w-full min-h-[48px] rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold flex items-center justify-center gap-2"
                  >
                    {busy ? (
                      <Spinner size={18} />
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Create drop
                      </>
                    )}
                  </button>
                </div>
              )}

              {tab === "create" && created && (
                <div className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-center">
                  <div className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-sm font-semibold">
                    <Check className="w-4 h-4" /> Drop live
                  </div>
                  <h2 className="text-lg font-bold">{created.drop.title}</h2>
                  <p className="text-xs font-mono text-gray-500 break-all">{created.url}</p>
                  <div className="flex justify-center">
                    <canvas
                      ref={canvasRef}
                      className="rounded-xl border border-black/10 dark:border-white/10 bg-white"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyUrl(created.url)}
                      className="flex-1 min-h-[44px] rounded-xl bg-black/5 dark:bg-white/10 text-sm font-medium flex items-center justify-center gap-1.5"
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied" : "Copy link"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void share(created.url, created.drop.title)}
                      className="flex-1 min-h-[44px] rounded-xl bg-violet-600 text-white text-sm font-medium flex items-center justify-center gap-1.5"
                    >
                      <Share2 className="w-4 h-4" /> Share
                    </button>
                  </div>
                  <Link
                    href={`/poap/${created.drop.code}`}
                    className="inline-flex items-center gap-1 text-sm text-violet-600 dark:text-violet-400"
                  >
                    Open claim page <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setCreated(null);
                      setTitle("");
                      setDescription("");
                      setLocation("");
                      setImageUrl("");
                      setMaxClaims("");
                    }}
                    className="block w-full text-xs text-gray-500 mt-2"
                  >
                    Create another
                  </button>
                </div>
              )}

              {tab === "mine" && (
                <div className="space-y-3">
                  {loadingMine && (
                    <div className="flex justify-center py-8">
                      <Spinner size={24} />
                    </div>
                  )}
                  {!loadingMine && drops.length === 0 && (
                    <p className="text-center text-sm text-gray-500 py-8">
                      No drops yet — create one above.
                    </p>
                  )}
                  {drops.map((d) => {
                    const origin =
                      typeof window !== "undefined" ? window.location.origin : "https://sol.new";
                    const url = poapClaimUrl(d.code, origin);
                    return (
                      <div
                        key={d.code}
                        className="rounded-2xl border border-black/10 dark:border-white/10 p-3 space-y-2"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-12 h-12 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0 overflow-hidden">
                            {d.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={d.imageUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Sparkles className="w-5 h-5 text-violet-500" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-sm truncate">{d.title}</p>
                            <p className="text-[11px] text-gray-500">
                              {d.claimCount}
                              {d.maxClaims != null ? ` / ${d.maxClaims}` : ""} claimed ·{" "}
                              <span className="font-mono">{d.code}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Link
                            href={`/poap/${d.code}`}
                            className="flex-1 min-h-[40px] rounded-xl bg-violet-600/90 text-white text-sm font-medium flex items-center justify-center gap-1"
                          >
                            <QrCode className="w-3.5 h-3.5" /> Open
                          </Link>
                          <button
                            type="button"
                            onClick={() => void copyUrl(url)}
                            className="flex-1 min-h-[40px] rounded-xl bg-black/5 dark:bg-white/10 text-sm font-medium"
                          >
                            Copy link
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ConnectGate>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
