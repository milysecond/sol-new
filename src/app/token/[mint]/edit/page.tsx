"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { uploadImage } from "@/lib/api";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";

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

export default function EditTokenMetadataPage() {
  const params = useParams<{ mint: string }>();
  const router = useRouter();
  const { publicKey } = useWallet();

  const [token, setToken] = useState<TokenView | null>(null);
  const [meta, setMeta] = useState<MetaJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [twitter, setTwitter] = useState("");
  const [telegram, setTelegram] = useState("");
  const [instagram, setInstagram] = useState("");
  const [github, setGithub] = useState("");
  const [youtube, setYoutube] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    (async () => {
      try {
        const tokRes = await fetch(`/api/token/${params.mint}`);
        if (!tokRes.ok) throw new Error("Token not found");
        const tok = (await tokRes.json()) as TokenView;
        if (cancelled) return;
        setToken(tok);

        if (!tok.metadata_uri) {
          throw new Error("This token's metadata isn't hosted on sol.new");
        }
        const metaRes = await fetch(tok.metadata_uri, { cache: "no-store" });
        if (metaRes.ok) {
          const m = (await metaRes.json()) as MetaJson;
          if (cancelled) return;
          setMeta(m);
          setDescription(m.description || "");
          setWebsite(m.website || "");
          setTwitter(m.twitter || "");
          setTelegram(m.telegram || "");
          setInstagram(m.instagram || "");
          setGithub(m.github || "");
          setYoutube(m.youtube || "");
          setTiktok(m.tiktok || "");
          setImageUrl(m.image || tok.image_url || null);
        }
      } catch (e: unknown) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.mint]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
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
        website: website.trim() || null,
        twitter: twitter.trim() || null,
        telegram: telegram.trim() || null,
        instagram: instagram.trim() || null,
        github: github.trim() || null,
        youtube: youtube.trim() || null,
        tiktok: tiktok.trim() || null,
      };

      // Sign the update with the creator's keypair so the server can verify
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

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 px-4 sm:px-6 py-6">
        <PageTransition>
          <div className="max-w-lg mx-auto space-y-5">
            <Link
              href={`/token/${params.mint}`}
              className="inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 hover:text-gray-900 dark:hover:text-white transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to token
            </Link>

            {loading && (
              <div className="flex items-center justify-center py-20">
                <Spinner size={24} className="text-orange-400" />
              </div>
            )}

            {!loading && loadError && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-5 py-8 text-center space-y-2">
                <p className="text-red-400 font-medium">Couldn't load this token</p>
                <p className="text-xs text-gray-500 dark:text-white/40">{loadError}</p>
              </div>
            )}

            {!loading && token && (
              <>
                <div className="space-y-1">
                  <h1 className="text-2xl font-bold tracking-tight">Edit metadata</h1>
                  <p className="text-sm text-gray-500 dark:text-white/40">
                    {token.name} <span className="font-mono">${token.symbol}</span>
                  </p>
                </div>

                {!isCreator && (
                  <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-xs text-yellow-600 dark:text-yellow-400">
                    Only the creator wallet (<span className="font-mono">{token.wallet.slice(0, 4)}…{token.wallet.slice(-4)}</span>) can edit. Connect that wallet to make changes.
                  </div>
                )}

                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-4 py-3 text-xs text-gray-500 dark:text-white/40">
                  <p>
                    Name, symbol, and the metadata URI are locked on-chain (immutable token).
                    You can update the off-chain JSON: image, description, social links.
                  </p>
                </div>

                <fieldset disabled={!isCreator || submitting} className="space-y-4 contents">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-white/40">Image</label>
                    <label
                      htmlFor="edit-token-image"
                      className="mt-1.5 flex items-center justify-between w-full bg-black/5 dark:bg-white/5 border border-dashed border-black/10 dark:border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:border-black/20 dark:hover:border-white/20 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {imagePreview ? (
                          <img src={imagePreview} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        ) : imageUrl ? (
                          <img src={imageUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-orange-500/10" />
                        )}
                        <span className="text-xs text-gray-500 dark:text-white/40 truncate">
                          {imageFile?.name || "Tap to replace image"}
                        </span>
                      </div>
                    </label>
                    <input id="edit-token-image" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={onFile} className="sr-only" />
                  </div>

                  <Field label="Description">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition resize-none"
                    />
                  </Field>

                  {[
                    ["Website", website, setWebsite, "https://"],
                    ["X / Twitter", twitter, setTwitter, "https://x.com/"],
                    ["Telegram", telegram, setTelegram, "https://t.me/"],
                    ["Instagram", instagram, setInstagram, "https://instagram.com/"],
                    ["GitHub", github, setGithub, "https://github.com/"],
                    ["YouTube", youtube, setYoutube, "https://youtube.com/"],
                    ["TikTok", tiktok, setTiktok, "https://tiktok.com/@"],
                  ].map(([label, value, setter, placeholder]) => (
                    <Field key={label as string} label={label as string}>
                      <input
                        type="url"
                        value={value as string}
                        onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                        placeholder={placeholder as string}
                        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-400/50 focus:ring-1 focus:ring-orange-400/25 transition"
                      />
                    </Field>
                  ))}
                </fieldset>

                {error && (
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{error}</div>
                )}
                {done && (
                  <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-xs text-green-500 flex items-center gap-2">
                    <Check className="w-4 h-4" /> Saved. Indexers may take a few minutes to refresh.
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!isCreator || submitting}
                    className="flex-1 bg-orange-500 hover:bg-orange-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? <><Spinner size={16} className="text-white" /> Saving…</> : "Save changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/token/${params.mint}`)}
                    disabled={submitting}
                    className="px-4 py-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-700 dark:text-white/70 hover:text-gray-900 dark:hover:text-white text-sm transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>

                {token.metadata_uri && (
                  <a
                    href={token.metadata_uri}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-700 dark:hover:text-white transition"
                  >
                    View raw metadata <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </>
            )}
          </div>
        </PageTransition>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-white/40">{label}</label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
