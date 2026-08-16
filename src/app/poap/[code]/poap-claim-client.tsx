"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Award, Check, ExternalLink, MapPin, Navigation, Sparkles } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import type { PoapDrop } from "@/lib/poap";
import { DEFAULT_GEO_RADIUS_M, isGeoLocked } from "@/lib/poap";

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location not supported — try Safari/Chrome on a phone"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 10_000,
    });
  });
}

export default function PoapClaimPage() {
  const params = useParams();
  const code = String(params?.code || "").toLowerCase();
  const { publicKey } = useWallet();
  const [drop, setDrop] = useState<PoapDrop | null>(null);
  const [open, setOpen] = useState(true);
  const [reason, setReason] = useState<string | undefined>();
  const [geoLocked, setGeoLocked] = useState(false);
  const [geoRadiusM, setGeoRadiusM] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [already, setAlready] = useState(false);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [assetId, setAssetId] = useState<string | null>(null);
  const [mintSig, setMintSig] = useState<string | null>(null);
  const [onchain, setOnchain] = useState(false);
  const [mintNote, setMintNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const q = publicKey ? `?wallet=${encodeURIComponent(publicKey)}` : "";
        const r = await fetch(`/api/poap/${encodeURIComponent(code)}${q}`, {
          cache: "no-store",
        });
        const d = (await r.json()) as {
          drop?: PoapDrop;
          open?: boolean;
          reason?: string;
          geoLocked?: boolean;
          geoRadiusM?: number | null;
          claim?: {
            claimedAt: string;
            assetId: string | null;
            mintSignature: string | null;
          } | null;
          error?: string;
        };
        if (!r.ok || !d.drop) throw new Error(d.error || "Not found");
        if (cancelled) return;
        setDrop(d.drop);
        setOpen(d.open !== false);
        setReason(d.reason);
        setGeoLocked(!!d.geoLocked || isGeoLocked(d.drop));
        setGeoRadiusM(d.geoRadiusM ?? d.drop.geoRadiusM ?? DEFAULT_GEO_RADIUS_M);
        if (d.claim) {
          setClaimed(true);
          setAlready(true);
          setAssetId(d.claim.assetId);
          setMintSig(d.claim.mintSignature);
          setOnchain(Boolean(d.claim.assetId));
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, "Drop not found"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, publicKey]);

  const claim = async () => {
    if (!publicKey || !drop) return;
    setBusy(true);
    setError(null);
    setDistanceM(null);
    setMintNote(null);
    try {
      let lat: number | undefined;
      let lng: number | undefined;
      let accuracyM: number | undefined;

      if (geoLocked || isGeoLocked(drop)) {
        const pos = await readPosition();
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        accuracyM =
          typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : undefined;
      }

      const r = await fetch(`/api/poap/${encodeURIComponent(code)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, lat, lng, accuracyM }),
      });
      const d = (await r.json()) as {
        ok?: boolean;
        already?: boolean;
        drop?: PoapDrop;
        error?: string;
        distanceM?: number;
        assetId?: string | null;
        mintSignature?: string | null;
        onchain?: boolean;
        mintError?: string;
      };
      if (!r.ok || !d.ok) {
        if (typeof d.distanceM === "number") setDistanceM(d.distanceM);
        throw new Error(d.error || "Claim failed");
      }
      if (d.drop) setDrop(d.drop);
      if (typeof d.distanceM === "number") setDistanceM(d.distanceM);
      setClaimed(true);
      setAlready(!!d.already);
      setAssetId(d.assetId ?? null);
      setMintSig(d.mintSignature ?? null);
      setOnchain(!!d.onchain);
      if (d.mintError) setMintNote(d.mintError);
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
                  On-chain POAP
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
                  <img
                    src={drop.imageUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
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

              {(geoLocked || isGeoLocked(drop)) && (
                <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5 text-center text-sm text-violet-800 dark:text-violet-200 flex items-center justify-center gap-2">
                  <Navigation className="w-4 h-4 shrink-0" />
                  Geo-locked · within {geoRadiusM ?? DEFAULT_GEO_RADIUS_M}m
                </div>
              )}

              <p className="text-center text-[11px] text-gray-400">
                {drop.claimCount}
                {drop.maxClaims != null ? ` / ${drop.maxClaims}` : ""} claimed · compressed NFT
              </p>

              {(claimed || already) && (
                <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-center space-y-2">
                  <Check className="w-6 h-6 text-emerald-500 mx-auto" />
                  <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                    {already && onchain
                      ? "Already in your wallet"
                      : onchain
                        ? "Minted on-chain"
                        : already
                          ? "Claim recorded"
                          : "Claimed"}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {publicKey?.slice(0, 4)}…{publicKey?.slice(-4)}
                  </p>
                  {distanceM != null && (
                    <p className="text-[11px] text-gray-400">~{Math.round(distanceM)}m from pin</p>
                  )}
                  {onchain && assetId && (
                    <div className="pt-1 space-y-1.5">
                      <p className="text-[11px] font-mono text-gray-500 break-all px-2">
                        {assetId.slice(0, 8)}…{assetId.slice(-8)}
                      </p>
                      <div className="flex gap-2 justify-center flex-wrap">
                        <a
                          href={`https://xray.helius.xyz/token/${assetId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400"
                        >
                          View NFT <ExternalLink className="w-3 h-3" />
                        </a>
                        {mintSig && (
                          <a
                            href={`/receipt/${mintSig}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"
                          >
                            Tx <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <Link
                          href="/nfts"
                          className="inline-flex items-center gap-1 text-xs font-medium text-gray-500"
                        >
                          My NFTs
                        </Link>
                      </div>
                    </div>
                  )}
                  {mintNote && (
                    <p className="text-xs text-amber-700 dark:text-amber-300">{mintNote}</p>
                  )}
                  {!onchain && (
                    <button
                      type="button"
                      onClick={() => void claim()}
                      disabled={busy}
                      className="mt-1 text-xs text-violet-600 font-medium"
                    >
                      {busy ? "Minting…" : "Finish on-chain mint"}
                    </button>
                  )}
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
                      {distanceM != null && (
                        <span className="block text-xs mt-1 opacity-80">
                          ~{Math.round(distanceM)}m away
                        </span>
                      )}
                    </div>
                  )}
                  <ConnectGate action="claim this POAP">
                    <button
                      type="button"
                      onClick={() => void claim()}
                      disabled={busy || !open}
                      className="w-full min-h-[52px] rounded-2xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white font-semibold text-base flex items-center justify-center gap-2"
                    >
                      {busy ? (
                        <Spinner size={20} state="composing" label="Minting" />
                      ) : geoLocked || isGeoLocked(drop) ? (
                        <Navigation className="w-5 h-5" />
                      ) : (
                        <Award className="w-5 h-5" />
                      )}
                      {busy
                        ? "Minting on-chain…"
                        : geoLocked || isGeoLocked(drop)
                          ? "Claim + mint (uses GPS)"
                          : "Claim + mint NFT"}
                    </button>
                  </ConnectGate>
                  <p className="text-[10px] text-center text-gray-400">
                    Free cNFT · on-chain SVG art baked into metadata
                  </p>
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
