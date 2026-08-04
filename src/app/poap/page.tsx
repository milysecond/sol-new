"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Award,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  MapPin,
  Navigation,
  Plus,
  QrCode,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import QRCode from "qrcode";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { friendlyError } from "@/lib/friendly-errors";
import { uploadImage } from "@/lib/api";
import type { PoapDrop } from "@/lib/poap";
import { DEFAULT_GEO_RADIUS_M, isGeoLocked, poapClaimUrl } from "@/lib/poap";

const RADIUS_PRESETS = [
  { m: 100, label: "100m" },
  { m: 200, label: "200m" },
  { m: 500, label: "500m" },
  { m: 1000, label: "1km" },
  { m: 5000, label: "5km" },
] as const;

function readPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location not supported on this device"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 15_000,
    });
  });
}

export default function PoapPage() {
  const { publicKey } = useWallet();
  const [tab, setTab] = useState<"create" | "mine">("create");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [maxClaims, setMaxClaims] = useState("");
  const [geoLock, setGeoLock] = useState(false);
  const [geoLat, setGeoLat] = useState<number | null>(null);
  const [geoLng, setGeoLng] = useState<number | null>(null);
  const [geoRadiusM, setGeoRadiusM] = useState(DEFAULT_GEO_RADIUS_M);
  const [geoBusy, setGeoBusy] = useState(false);
  const [venueQuery, setVenueQuery] = useState("");
  const [venueHits, setVenueHits] = useState<
    { label: string; lat: number; lng: number }[]
  >([]);
  const [venueSearching, setVenueSearching] = useState(false);
  const [pinnedLabel, setPinnedLabel] = useState<string | null>(null);
  const venueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    if (geoLock && (geoLat == null || geoLng == null)) {
      setError("Pin a location for geo-lock (Use my location)");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let finalImageUrl = imageUrl.trim() || undefined;
      // Upload pending file first (drag/drop or picker)
      if (imageFile) {
        setUploading(true);
        try {
          const up = await uploadImage(imageFile);
          finalImageUrl = up.url;
          setImageUrl(up.url);
        } finally {
          setUploading(false);
        }
      }

      const r = await fetch("/api/poap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: t,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          imageUrl: finalImageUrl,
          issuer: publicKey,
          maxClaims: maxClaims.trim() ? Number(maxClaims) : null,
          geoLock,
          geoLat: geoLock ? geoLat : null,
          geoLng: geoLock ? geoLng : null,
          geoRadiusM: geoLock ? geoRadiusM : null,
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
      setUploading(false);
    }
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageName(null);
    setImageUrl("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const acceptImageFile = (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Use a PNG, JPEG, GIF, or WebP image");
      return;
    }
    if (file.type === "image/svg+xml") {
      setError("SVG uploads aren’t allowed — use PNG or JPEG");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image too large (max 5MB)");
      return;
    }
    setError(null);
    setImageFile(file);
    setImageName(file.name);
    setImageUrl(""); // will upload on create
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptImageFile(e.target.files?.[0]);
  };

  const onDropImage = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    acceptImageFile(f);
  };

  const pinLocation = async () => {
    setGeoBusy(true);
    setError(null);
    try {
      const pos = await readPosition();
      setGeoLat(pos.coords.latitude);
      setGeoLng(pos.coords.longitude);
      setGeoLock(true);
      setPinnedLabel("Current location");
      setVenueHits([]);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "code" in e
          ? (e as GeolocationPositionError).code === 1
            ? "Location permission denied"
            : "Couldn't read location"
          : friendlyError(e, "Couldn't read location");
      setError(msg);
    } finally {
      setGeoBusy(false);
    }
  };

  const searchVenue = useCallback(async (q: string) => {
    const query = q.trim();
    if (query.length < 2) {
      setVenueHits([]);
      return;
    }
    setVenueSearching(true);
    try {
      const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`, {
        cache: "no-store",
      });
      const d = (await r.json()) as {
        hits?: { label: string; lat: number; lng: number }[];
        error?: string;
      };
      if (!r.ok) throw new Error(d.error || "Search failed");
      setVenueHits(d.hits || []);
    } catch (e) {
      setVenueHits([]);
      setError(friendlyError(e, "Couldn't find that place"));
    } finally {
      setVenueSearching(false);
    }
  }, []);

  const onVenueQuery = (v: string) => {
    setVenueQuery(v);
    if (venueTimer.current) clearTimeout(venueTimer.current);
    venueTimer.current = setTimeout(() => void searchVenue(v), 400);
  };

  const pickVenue = (hit: { label: string; lat: number; lng: number }) => {
    setGeoLat(hit.lat);
    setGeoLng(hit.lng);
    setGeoLock(true);
    setPinnedLabel(hit.label);
    setVenueQuery(hit.label);
    setVenueHits([]);
    // Fill human location label if empty
    if (!location.trim()) {
      const short = hit.label.split(",").slice(0, 2).join(",").trim();
      setLocation(short.slice(0, 120));
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
                On-chain SVG badge · mint a memory · drop a claim link
              </p>
            </div>

            {/* How it works */}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { n: "1", t: "Mint", d: "Name the moment" },
                { n: "2", t: "Drop", d: "Share link / QR" },
                { n: "3", t: "Claim", d: "cNFT to wallet" },
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
                    <span className="text-xs text-gray-500">Art (optional)</span>
                    <div
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileRef.current?.click();
                        }
                      }}
                      onClick={() => fileRef.current?.click()}
                      onDragEnter={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                      }}
                      onDrop={onDropImage}
                      className={`relative rounded-xl border border-dashed px-3 py-6 text-center cursor-pointer transition ${
                        dragOver
                          ? "border-violet-500 bg-violet-500/10"
                          : "border-black/15 dark:border-white/15 bg-black/5 dark:bg-white/5 hover:border-violet-400/50"
                      }`}
                    >
                      {imagePreview ? (
                        <div className="flex flex-col items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={imagePreview}
                            alt=""
                            className="w-24 h-24 rounded-xl object-cover border border-black/10 dark:border-white/10"
                          />
                          <p className="text-xs text-gray-500 truncate max-w-full px-2">
                            {imageName || "Image ready"}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              clearImage();
                            }}
                            className="inline-flex items-center gap-1 text-xs text-red-500"
                          >
                            <X className="w-3 h-3" /> Remove
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <ImagePlus className="w-7 h-7 text-violet-500 mx-auto" />
                          <p className="text-sm font-medium text-gray-700 dark:text-white/80">
                            Drag & drop art here
                          </p>
                          <p className="text-[11px] text-gray-400">
                            or tap to upload · PNG / JPEG / WebP · max 5MB
                          </p>
                        </div>
                      )}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={onFileInput}
                      className="sr-only"
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

                  {/* Geo-lock */}
                  <div className="rounded-xl border border-black/10 dark:border-white/10 p-3 space-y-2.5">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span className="text-sm font-medium flex items-center gap-1.5">
                        <Navigation className="w-4 h-4 text-violet-500" />
                        Geo-lock claim
                      </span>
                      <input
                        type="checkbox"
                        checked={geoLock}
                        onChange={(e) => {
                          setGeoLock(e.target.checked);
                          if (!e.target.checked) {
                            setGeoLat(null);
                            setGeoLng(null);
                            setPinnedLabel(null);
                            setVenueHits([]);
                          }
                        }}
                        className="w-4 h-4 accent-violet-600"
                      />
                    </label>
                    <p className="text-[11px] text-gray-500">
                      Claimers must be near the pin. Search a venue or use GPS.
                    </p>
                    {geoLock && (
                      <>
                        <label className="block space-y-1">
                          <span className="text-xs text-gray-500">Venue or address</span>
                          <div className="relative">
                            <input
                              value={venueQuery}
                              onChange={(e) => onVenueQuery(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void searchVenue(venueQuery);
                                }
                              }}
                              placeholder="e.g. Federation Square Melbourne"
                              className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-2.5 text-sm pr-9"
                            />
                            {venueSearching && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                                <Spinner size={14} />
                              </span>
                            )}
                          </div>
                        </label>
                        {venueHits.length > 0 && (
                          <ul className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden max-h-48 overflow-y-auto">
                            {venueHits.map((h) => (
                              <li key={`${h.lat},${h.lng},${h.label.slice(0, 40)}`}>
                                <button
                                  type="button"
                                  onClick={() => pickVenue(h)}
                                  className="w-full text-left px-3 py-2.5 text-xs hover:bg-violet-500/10 border-b border-black/5 dark:border-white/5 last:border-0"
                                >
                                  <span className="line-clamp-2 text-gray-800 dark:text-white/90">
                                    {h.label}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="flex items-center gap-2">
                          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                          <span className="text-[10px] text-gray-400">or</span>
                          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
                        </div>
                        <button
                          type="button"
                          onClick={() => void pinLocation()}
                          disabled={geoBusy}
                          className="w-full min-h-[40px] rounded-xl bg-violet-600/15 text-violet-700 dark:text-violet-300 text-sm font-medium flex items-center justify-center gap-2"
                        >
                          {geoBusy ? (
                            <Spinner size={16} />
                          ) : (
                            <MapPin className="w-4 h-4" />
                          )}
                          Use my GPS
                        </button>
                        {geoLat != null && geoLng != null && (
                          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-2 text-center">
                            {pinnedLabel && (
                              <p className="text-xs text-emerald-800 dark:text-emerald-200 line-clamp-2 mb-0.5">
                                📍 {pinnedLabel}
                              </p>
                            )}
                            <p className="text-[11px] font-mono text-gray-500">
                              {geoLat.toFixed(5)}, {geoLng.toFixed(5)}
                            </p>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {RADIUS_PRESETS.map((p) => (
                            <button
                              key={p.m}
                              type="button"
                              onClick={() => setGeoRadiusM(p.m)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                                geoRadiusM === p.m
                                  ? "bg-violet-600 text-white"
                                  : "bg-black/5 dark:bg-white/10 text-gray-600 dark:text-white/70"
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

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
                        {uploading ? "Uploading art…" : "Create drop"}
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
                      setImagePreview(null);
                      setImageName(null);
                      setImageFile(null);
                      setMaxClaims("");
                      setGeoLock(false);
                      setGeoLat(null);
                      setGeoLng(null);
                      setGeoRadiusM(DEFAULT_GEO_RADIUS_M);
                      setVenueQuery("");
                      setVenueHits([]);
                      setPinnedLabel(null);
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
                              {d.maxClaims != null ? ` / ${d.maxClaims}` : ""} claimed
                              {isGeoLocked(d)
                                ? ` · 📍 ${d.geoRadiusM ?? DEFAULT_GEO_RADIUS_M}m`
                                : ""}{" "}
                              · <span className="font-mono">{d.code}</span>
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
