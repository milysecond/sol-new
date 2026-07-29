"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { ExternalLink, Edit2 } from "lucide-react";

type Profile = {
  wallet: string;
  bio: string | null;
  avatar_url: string | null;
  twitter: string | null;
  website: string | null;
  username?: string | null;
};
type TokenRow = { mint_address: string | null; name: string; symbol: string; image_url: string | null; created_at: string };

export default function CreatorPage() {
  const params = useParams();
  const creatorWallet = params.wallet as string;
  const { publicKey } = useWallet();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [followers, setFollowers] = useState(0);
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/creator/profile?wallet=${creatorWallet}`)
      .then((r) => r.json())
      .then((d) => {
        const data = d as { profile?: Profile; followers?: number; tokens?: TokenRow[] };
        setProfile(data.profile ?? null);
        setFollowers(data.followers ?? 0);
        setTokens((data.tokens ?? []).filter((t) => t.mint_address));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [creatorWallet]);

  const toggleFollow = async () => {
    if (!publicKey) return;
    setFollowBusy(true);
    try {
      const { keypair } = await getPasskeyKeypair();
      const action = following ? "unfollow" : "follow";
      const nonce = Date.now();
      const message = `sol.new:${action}:${creatorWallet}:${nonce}`;
      const { ed25519 } = await import("@noble/curves/ed25519");
      const bs58 = (await import("bs58")).default;
      const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
      const signature = bs58.encode(sigBytes);

      const r = await fetch("/api/creator/follow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ follower: publicKey, creator: creatorWallet, action, signature, nonce }),
      });
      const d = await r.json() as { following?: boolean };
      setFollowing(d.following ?? false);
      setFollowers((f) => f + (following ? -1 : 1));
    } catch {
      // best effort
    } finally {
      setFollowBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col pb-20 sm:pb-0">
        <Navbar />
        <div className="flex-1 flex items-center justify-center"><Spinner size={28} className="text-purple-400" /></div>
      </div>
    );
  }

  const isOwnProfile = publicKey === creatorWallet;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 px-4 py-6 sm:px-6 max-w-2xl mx-auto w-full">
        {/* Profile header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-2xl font-bold shrink-0">
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full rounded-full object-cover" />
            ) : (
              creatorWallet.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            {profile?.username ? (
              <p className="font-semibold text-lg tracking-tight">
                <Link href={`/u/${profile.username}`} className="text-purple-500 hover:text-purple-400">
                  @{profile.username}
                </Link>
              </p>
            ) : null}
            <p className="font-mono text-sm text-gray-500 dark:text-white/40 truncate">{creatorWallet}</p>
            {profile?.bio && <p className="text-sm text-gray-700 dark:text-white/70 mt-1">{profile.bio}</p>}
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-500 dark:text-white/40"><strong className="text-gray-900 dark:text-white">{followers}</strong> followers</span>
              <span className="text-sm text-gray-500 dark:text-white/40"><strong className="text-gray-900 dark:text-white">{tokens.length}</strong> tokens</span>
            </div>
            {profile?.twitter && (
              <a href={profile.twitter} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/50 mt-1.5">
                X <ExternalLink size={10} />
              </a>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {isOwnProfile ? (
              <Link href="/creator/edit" className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-black/10 dark:border-white/10 rounded-xl text-gray-600 dark:text-white/60 hover:text-gray-900 dark:hover:text-white transition">
                <Edit2 size={13} /> Edit
              </Link>
            ) : publicKey ? (
              <button
                onClick={toggleFollow}
                disabled={followBusy}
                className={`px-4 py-2 text-sm rounded-xl font-medium transition cursor-pointer disabled:opacity-50 ${following ? "bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60" : "bg-purple-500 hover:bg-purple-400 text-white"}`}
              >
                {following ? "Following" : "Follow"}
              </button>
            ) : null}
          </div>
        </div>

        {/* Tokens */}
        <h2 className="font-semibold text-sm mb-3 text-gray-500 dark:text-white/40 uppercase tracking-wide">Tokens launched</h2>
        {tokens.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-white/30 text-center py-8">No tokens yet</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tokens.map((t) => (
              <Link
                key={t.mint_address}
                href={`/launch/${t.mint_address}`}
                className="flex gap-3 p-3 border border-black/10 dark:border-white/10 rounded-xl hover:border-purple-400/30 transition"
              >
                {t.image_url ? (
                  <img src={t.image_url} alt={t.name} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-purple-500/10 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{t.name}</p>
                  <p className="text-xs font-mono text-gray-500 dark:text-white/40">${t.symbol}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
