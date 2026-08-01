"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { uploadImage } from "@/lib/api";
import { normalizeUsername, usernameError, displayUsername } from "@/lib/username";
import { Check, Loader2, X } from "lucide-react";

function EditInner() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const search = useSearchParams();
  const prefillU = search.get("u") || "";

  const [bio, setBio] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");
  const [username, setUsername] = useState("");
  const [savedUsername, setSavedUsername] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userMsg, setUserMsg] = useState<string | null>(null);
  const [userAvail, setUserAvail] = useState<boolean | null>(null);
  const [checkingUser, setCheckingUser] = useState(false);

  useEffect(() => {
    if (!publicKey) return;
    fetch(`/api/creator/profile?wallet=${publicKey}`)
      .then((r) => r.json())
      .then((raw) => {
        const d = raw as {
          profile?: {
            bio: string | null;
            twitter: string | null;
            website: string | null;
            avatar_url: string | null;
            username: string | null;
          };
        };
        if (d.profile) {
          setBio(d.profile.bio ?? "");
          setTwitter(d.profile.twitter ?? "");
          setWebsite(d.profile.website ?? "");
          if (d.profile.avatar_url) setAvatarPreview(d.profile.avatar_url);
          const u = d.profile.username ?? "";
          setSavedUsername(u || null);
          setUsername(u || prefillU);
        } else if (prefillU) {
          setUsername(prefillU);
        }
      })
      .catch(() => {
        if (prefillU) setUsername(prefillU);
      });
  }, [publicKey, prefillU]);

  // Debounced availability
  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u || u === savedUsername) {
      setUserAvail(u === savedUsername ? true : null);
      setUserMsg(null);
      return;
    }
    const err = usernameError(u);
    if (err) {
      setUserAvail(false);
      setUserMsg(err);
      return;
    }
    setCheckingUser(true);
    const t = setTimeout(() => {
      const q = publicKey
        ? `/api/creator/profile?check=${encodeURIComponent(u)}&wallet=${publicKey}`
        : `/api/creator/profile?check=${encodeURIComponent(u)}`;
      fetch(q)
        .then((r) => r.json())
        .then((raw) => {
          const d = raw as { available?: boolean; error?: string };
          setUserAvail(Boolean(d.available));
          setUserMsg(d.available ? "Available" : d.error || "Taken");
        })
        .catch(() => {
          setUserAvail(null);
          setUserMsg(null);
        })
        .finally(() => setCheckingUser(false));
    }, 350);
    return () => clearTimeout(t);
  }, [username, savedUsername, publicKey]);

  const signMessage = async (message: string) => {
    const { keypair } = await getPasskeyKeypair();
    const { ed25519 } = await import("@noble/curves/ed25519");
    const bs58 = (await import("bs58")).default;
    const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
    return bs58.encode(sigBytes);
  };

  const saveUsername = useCallback(async () => {
    if (!publicKey) return;
    const u = normalizeUsername(username);
    const err = usernameError(u);
    if (err) {
      setUserMsg(err);
      return;
    }
    setSavingUser(true);
    setError(null);
    try {
      const nonce = Date.now();
      const message = `sol.new:username:${publicKey}:${u}:${nonce}`;
      const signature = await signMessage(message);
      const r = await fetch("/api/creator/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: publicKey, username: u, signature, nonce }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; profile?: { username?: string } };
      if (!r.ok || !d.ok) throw new Error(d.error || "Could not claim username");
      setSavedUsername(d.profile?.username || u);
      setUserMsg("Username saved");
      setUserAvail(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingUser(false);
    }
  }, [publicKey, username]);

  const save = async () => {
    if (!publicKey) return;
    setSaving(true);
    setError(null);
    try {
      let avatarUrl: string | undefined;
      if (avatarFile) {
        const up = await uploadImage(avatarFile);
        avatarUrl = up.url;
      }

      const nonce = Date.now();
      const message = `sol.new:profile:${publicKey}:${nonce}`;
      const signature = await signMessage(message);

      const r = await fetch("/api/creator/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet: publicKey,
          bio: bio || null,
          avatarUrl: avatarUrl ?? null,
          twitter: twitter || null,
          website: website || null,
          signature,
          nonce,
        }),
      });
      if (!r.ok) throw new Error(((await r.json()) as { error?: string }).error ?? "Save failed");

      // If username changed and available, claim it too
      const u = normalizeUsername(username);
      if (u && u !== savedUsername && !usernameError(u)) {
        await saveUsername();
      }

      router.push(u ? `/u/${u}` : `/creator/${publicKey}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <h1 className="text-xl font-bold">Edit profile</h1>

      <label className="flex items-center gap-4 cursor-pointer group">
        <div className="w-16 h-16 rounded-full bg-purple-500/10 overflow-hidden">
          {avatarPreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-purple-400/40 text-xs">Photo</div>
          )}
        </div>
        <span className="text-sm text-purple-400 group-hover:text-purple-300 transition">Change photo</span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) {
              setAvatarFile(f);
              setAvatarPreview(URL.createObjectURL(f));
            }
          }}
        />
      </label>

      {/* Username */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-500 dark:text-white/45">Username</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-white/30 font-mono text-sm">
            @
          </span>
          <input
            type="text"
            placeholder="yourname"
            value={username}
            maxLength={20}
            onChange={(e) =>
              setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))
            }
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-8 pr-10 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-sm font-mono"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            {checkingUser ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : userAvail === true ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : userAvail === false ? (
              <X className="w-4 h-4 text-red-400" />
            ) : null}
          </span>
        </div>
        <p
          className={`text-xs ${
            userAvail === false
              ? "text-red-400"
              : userAvail === true
                ? "text-emerald-500"
                : "text-gray-400 dark:text-white/35"
          }`}
        >
          {userMsg || "3–20 chars · letters, numbers, _ · public at sol.new/u/name"}
        </p>
        {username && normalizeUsername(username) !== savedUsername && userAvail && (
          <button
            type="button"
            onClick={() => void saveUsername()}
            disabled={savingUser || !userAvail}
            className="text-xs font-medium text-purple-500 hover:text-purple-400 disabled:opacity-40"
          >
            {savingUser ? "Claiming…" : `Claim ${displayUsername(username)}`}
          </button>
        )}
        {savedUsername && (
          <p className="text-xs text-gray-500 dark:text-white/40">
            Current:{" "}
            <a className="text-purple-500 hover:underline font-mono" href={`/u/${savedUsername}`}>
              {displayUsername(savedUsername)}
            </a>
          </p>
        )}
      </div>

      <textarea
        placeholder="Bio (optional)"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        maxLength={280}
        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition resize-none text-sm"
      />
      <input
        type="text"
        placeholder="X / Twitter (optional)"
        value={twitter}
        onChange={(e) => setTwitter(e.target.value)}
        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-sm"
      />
      <input
        type="url"
        placeholder="Website (optional)"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-sm"
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={() => void save()}
        disabled={saving}
        className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer flex items-center justify-center gap-2"
      >
        {saving ? (
          <>
            <Spinner size={16} /> Saving…
          </>
        ) : (
          "Save profile"
        )}
      </button>
    </div>
  );
}

export default function EditCreatorProfile() {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:px-6">
        <ConnectGate action="edit your profile">
          <Suspense fallback={<div className="text-gray-400 py-8">Loading…</div>}>
            <EditInner />
          </Suspense>
        </ConnectGate>
      </main>
    </div>
  );
}
