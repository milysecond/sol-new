"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Coins, ArrowLeft, Check, Lock } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { uploadImage } from "@/lib/api";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";

type TokenView = {
  name: string;
  symbol: string;
  mint_address: string;
  wallet: string;
  metadata_uri: string | null;
  image_url: string | null;
};

type MetaJson = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  instagram?: string;
  github?: string;
  youtube?: string;
  tiktok?: string;
};

type SocialKey = "website" | "twitter" | "telegram" | "instagram" | "github" | "youtube" | "tiktok";

const SOCIAL_DEFS: { key: SocialKey; label: string; placeholder: string; icon: React.ReactNode }[] = [
  {
    key: "website",
    label: "Website",
    placeholder: "Website URL",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </svg>
    ),
  },
  {
    key: "twitter",
    label: "X",
    placeholder: "X handle (e.g. @soldotnew)",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    key: "telegram",
    label: "Telegram",
    placeholder: "Telegram link or @handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "Instagram handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
        <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    ),
  },
  {
    key: "github",
    label: "GitHub",
    placeholder: "GitHub URL or username",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
      </svg>
    ),
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "YouTube channel URL",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "TikTok handle",
    icon: (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
      </svg>
    ),
  },
];

export default function EditTokenMetadataPage() {
  const params = useParams<{ mint: string }>();
  const router = useRouter();
  const { publicKey } = useWallet();

  const [token, setToken] = useState<TokenView | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [metaWarning, setMetaWarning] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [activeSocials, setActiveSocials] = useState<Set<SocialKey>>(new Set());
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [github, setGithub] = useState("");
  const [youtube, setYoutube] = useState("");
  const [tiktok, setTiktok] = useState("");
  const socialState: Record<SocialKey, [string, (v: string) => void]> = {
    website: [website, setWebsite],
    twitter: [twitter, setTwitter],
    telegram: [telegram, setTelegram],
    instagram: [instagram, setInstagram],
    github: [github, setGithub],
    youtube: [youtube, setYoutube],
    tiktok: [tiktok, setTiktok],
  };

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setMetaWarning(null);
    (async () => {
      // Step 1: token row (required) — failure here blocks the form
      let tok: TokenView;
      try {
        const tokRes = await fetch(`/api/token/${params.mint}`);
        if (!tokRes.ok) throw new Error("Token not found");
        tok = (await tokRes.json()) as TokenView;
      } catch (e: unknown) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load token");
          setLoading(false);
        }
        return;
      }
      if (cancelled) return;
      setToken(tok);
      setName(tok.name || "");
      setTicker(tok.symbol || "");
      if (tok.image_url) setImageUrl(tok.image_url);

      // Step 2: metadata JSON read straight from our DB — no public URL fetch
      try {
        const metaRes = await fetch(`/api/token/${params.mint}/metadata`, { cache: "no-store" });
        if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);
        const payload = (await metaRes.json()) as { metadata: MetaJson | null; hostedExternally?: boolean };
        if (cancelled) return;
        if (payload.hostedExternally) {
          setMetaWarning(
            "This token's metadata is hosted off sol.new — you can still save new values, but they'll only show up if you re-point the on-chain URI."
          );
        } else if (payload.metadata) {
          const m = payload.metadata;
          setDescription(m.description || "");
          setImageUrl(m.image || tok.image_url || null);
          const next = new Set<SocialKey>();
          for (const def of SOCIAL_DEFS) {
            const v = m[def.key];
            if (typeof v === "string" && v.length > 0) {
              next.add(def.key);
              socialState[def.key][1](v);
            }
          }
          setActiveSocials(next);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setMetaWarning(
            (e instanceof Error ? e.message : "Couldn't load existing metadata") +
              " — you can still save new values."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.mint]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const isCreator = !!token && !!publicKey && token.wallet === publicKey;

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    setDone(false);
    try {
      let nextImage = imageUrl;
      if (imageFile) {
        const { url } = await uploadImage(imageFile);
        nextImage = url;
      }

      const updates: Record<string, string | null> = {
        description: description.trim() || null,
        image: nextImage || null,
      };
      for (const def of SOCIAL_DEFS) {
        const [val] = socialState[def.key];
        updates[def.key] = activeSocials.has(def.key) ? (val.trim() || null) : null;
      }

      const { keypair } = await getPasskeyKeypair();
      const nonce = Date.now();
      const message = `sol.new:update-metadata:${token.mint_address}:${nonce}`;
      const sig = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));

      const res = await fetch(`/api/token/${token.mint_address}/metadata`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signer: keypair.publicKey.toBase58(),
          signature: bs58.encode(sig),
          nonce,
          updates,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Update failed");

      setDone(true);
      setImageFile(null);
      setImagePreview(null);
      if (nextImage) setImageUrl(nextImage);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSubmitting(false);
    }
  };

  const inputDisabledClass =
    "w-full bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-500 dark:text-white/40 cursor-not-allowed";
  const inputClass =
    "w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition";
  const socialInputClass = inputClass.replace("py-3.5", "py-3") + " text-sm";

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        <ConnectGate action="edit a token">
          <PageTransition>
            <div className="w-full sm:max-w-lg space-y-4">
              <Link
                href={`/token/${params.mint}`}
                className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to token
              </Link>

              <div className="text-center space-y-1">
                <AnimatedIcon icon={Coins} size={32} className="text-orange-400" />
                <h1 className="text-2xl font-bold tracking-tight">Edit token</h1>
                <p className="text-gray-500 dark:text-white/50 text-sm">Update metadata for ${ticker || "—"}.</p>
              </div>

              {loading && (
                <div className="flex items-center justify-center py-16">
                  <Spinner size={24} className="text-orange-400" />
                </div>
              )}

              {!loading && loadError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">{loadError}</div>
              )}

              {!loading && token && !isCreator && (
                <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-5 py-6 text-center space-y-3">
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
                    Only the token's creator can edit its metadata.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-white/40 font-mono break-all">
                    Creator: {token.wallet}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-white/40">
                    Connect that wallet (Recover from the homepage if you have it) to make changes.
                  </p>
                  <Link
                    href={`/token/${params.mint}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-sm text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white transition"
                  >
                    Back to token
                  </Link>
                </div>
              )}

              {!loading && token && isCreator && (
                <>
                  {metaWarning && (
                    <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-600 dark:text-yellow-400">
                      {metaWarning}
                    </div>
                  )}

                  <fieldset disabled={submitting} className="space-y-4 contents">
                    <div className="relative">
                      <input
                        type="text"
                        value={name}
                        readOnly
                        className={inputDisabledClass}
                      />
                      <Lock className="w-3.5 h-3.5 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        value={ticker}
                        readOnly
                        className={`${inputDisabledClass} font-mono`}
                      />
                      <Lock className="w-3.5 h-3.5 absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30" />
                    </div>
                    <p className="text-[11px] text-gray-400 dark:text-white/30 -mt-2">
                      Name and ticker are locked on-chain.
                    </p>

                    <div className="pt-2">
                      <textarea
                        placeholder="Description (optional)"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={3}
                        className={`${inputClass} resize-none`}
                      />
                    </div>

                    <label
                      htmlFor="edit-token-image"
                      className="flex items-center justify-center w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-4 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition overflow-hidden"
                    >
                      {imagePreview ? (
                        <div className="flex items-center gap-3">
                          <img src={imagePreview} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          <span className="text-gray-500 dark:text-white/50 text-sm">{imageFile?.name}</span>
                        </div>
                      ) : imageUrl ? (
                        <div className="flex items-center gap-3">
                          <img src={imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                          <span className="text-gray-400 dark:text-white/30 text-sm">Tap to replace image</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-white/30 text-sm">Tap to upload token image</span>
                      )}
                    </label>
                    <input
                      id="edit-token-image"
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      onChange={handleFile}
                      className="sr-only"
                    />

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-white/30">Add links:</span>
                        {SOCIAL_DEFS.map(({ key, label, icon }) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const next = new Set(activeSocials);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              setActiveSocials(next);
                            }}
                            className={`p-2 rounded-lg border transition cursor-pointer ${
                              activeSocials.has(key)
                                ? "bg-orange-500/20 border-orange-400/50 text-orange-400"
                                : "bg-black/5 dark:bg-white/5 border-black/10 dark:border-white/10 text-gray-400 dark:text-white/40 hover:text-gray-600 dark:hover:text-white/60"
                            }`}
                            title={label}
                          >
                            {icon}
                          </button>
                        ))}
                      </div>

                      {SOCIAL_DEFS.map(({ key, placeholder }) => {
                        if (!activeSocials.has(key)) return null;
                        const [val, setter] = socialState[key];
                        return (
                          <input
                            key={key}
                            type="text"
                            placeholder={placeholder}
                            value={val}
                            onChange={(e) => setter(e.target.value)}
                            className={socialInputClass}
                          />
                        );
                      })}
                    </div>
                  </fieldset>

                  {error && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                      {error}
                    </div>
                  )}
                  {done && (
                    <div className="rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-500 flex items-center gap-2">
                      <Check className="w-4 h-4" /> Saved. Indexers may take a few minutes to refresh.
                    </div>
                  )}

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      onClick={submit}
                      disabled={submitting}
                      className="w-full bg-orange-500 hover:bg-orange-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Spinner size={16} className="text-white" /> Saving…
                        </>
                      ) : (
                        "Save changes"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push(`/token/${params.mint}`)}
                      disabled={submitting}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 hover:text-gray-900 dark:hover:text-white transition cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          </PageTransition>
        </ConnectGate>
      </main>
    </div>
  );
}
