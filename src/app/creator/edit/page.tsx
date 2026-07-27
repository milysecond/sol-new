"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { uploadImage } from "@/lib/api";

export default function EditCreatorProfile() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/creator/profile?wallet=${publicKey}`)
      .then((r) => r.json())
      .then((raw) => {
        const d = raw as { profile?: { bio: string | null; twitter: string | null; website: string | null; avatar_url: string | null } };
        if (d.profile) {
          setBio(d.profile.bio ?? "");
          setTwitter(d.profile.twitter ?? "");
          setWebsite(d.profile.website ?? "");
          if (d.profile.avatar_url) setAvatarPreview(d.profile.avatar_url);
        }
      })
      .catch(() => {});
  }, [publicKey]);

  const save = async () => {
    if (!publicKey) return;
    setSaving(true);
    setError(null);
    try {
      const { keypair } = await getPasskeyKeypair();
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const up = await uploadImage(avatarFile);
        avatarUrl = up.url;
      }

      const nonce = Date.now();
      const message = `sol.new:profile:${publicKey}:${nonce}`;
      const { ed25519 } = await import("@noble/curves/ed25519");
      const bs58 = (await import("bs58")).default;
      const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
      const signature = bs58.encode(sigBytes);

      const r = await fetch("/api/creator/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, bio: bio || null, avatarUrl: avatarUrl ?? null, twitter: twitter || null, website: website || null, signature, nonce }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? "Save failed");
      router.push(`/creator/${publicKey}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:px-6">
        <ConnectGate action="edit your profile">
          <div className="w-full max-w-md space-y-4">
            <h1 className="text-xl font-bold">Edit profile</h1>

            {/* Avatar */}
            <label className="flex items-center gap-4 cursor-pointer group">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-purple-400/40 text-xs">Photo</div>
                )}
              </div>
              <span className="text-sm text-purple-400 group-hover:text-purple-300 transition">Change photo</span>
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" onChange={(e) => {
                const f = e.target.files?.[0]; if (f) { setAvatarFile(f); setAvatarPreview(URL.createObjectURL(f)); }
              }} />
            </label>

            <textarea
              placeholder="Bio (optional)"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              maxLength={280}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition resize-none text-sm"
            />
            <input type="text" placeholder="X / Twitter (optional)" value={twitter} onChange={(e) => setTwitter(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-sm" />
            <input type="url" placeholder="Website (optional)" value={website} onChange={(e) => setWebsite(e.target.value)} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-sm" />

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={save}
              disabled={saving}
              className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {saving ? <><Spinner size={16} /> Saving…</> : "Save profile"}
            </button>
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}
