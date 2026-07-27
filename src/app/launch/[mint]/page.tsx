"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { getPasskeyKeypair } from "@/lib/passkey-wallet";
import { Connection, Transaction } from "@solana/web3.js";
import { ExternalLink, Copy, CheckCheck, ArrowLeft, MessageSquare, Vote, TrendingUp, GraduationCap } from "lucide-react";
import { StarTokenButton } from "@/components/star-token-button";

type TokenData = {
  mint: string;
  name: string | null;
  symbol: string | null;
  description: string | null;
  imageUrl: string | null;
  twitter: string | null;
  telegram: string | null;
  website: string | null;
  creator: string | null;
  createdAt: string | null;
  complete: boolean;
  progress: number;
  priceUsd: number | null;
  marketCapUsd: number | null;
  volume24h: number | null;
  pairAddress: string | null;
  bondingCurve: {
    realSolReserves: string | null;
    tokenTotalSupply: string | null;
    complete: boolean;
  } | null;
};

type Comment = { id: string; wallet: string; body: string; created_at: string };
type Proposal = { id: string; creator: string; title: string; description: string | null; status: string; expires_at: string | null; created_at: string; votes: { yes: number; no: number; total: number } };

function shortenKey(k: string) {
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
function formatUsd(n: number | null) {
  if (n === null) return "—";
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60 transition cursor-pointer"
    >
      {copied ? <CheckCheck size={13} /> : <Copy size={13} />}
    </button>
  );
}

function BuyWidget({ mint, symbol, rpc, publicKey }: { mint: string; symbol: string | null; rpc: string; publicKey: string | null }) {
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("0.1");
  const [status, setStatus] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const execute = async () => {
    if (!publicKey) return;
    setError(null);
    setStatus("busy");
    try {
      const { keypair } = await getPasskeyKeypair();
      const solAmount = side === "buy" ? Number(amount) * 1e9 : Number(amount);
      const res = await fetch("/api/launch/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, side, amount: Math.round(solAmount), slippage: 500, wallet: publicKey }),
      });
      const data = await res.json() as { ok?: boolean; tx?: string; blockhash?: string; lastValidBlockHeight?: number; error?: string };
      if (!data.ok || !data.tx) throw new Error(data.error ?? "Failed to build transaction");

      const tx = Transaction.from(Buffer.from(data.tx, "base64"));
      tx.partialSign(keypair);
      const conn = new Connection(rpc, "confirmed");
      const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
      await conn.confirmTransaction({ signature: sig, blockhash: data.blockhash!, lastValidBlockHeight: data.lastValidBlockHeight! }, "confirmed");
      setStatus("done");
      setTimeout(() => setStatus("idle"), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  return (
    <div className="border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex gap-1 bg-black/5 dark:bg-white/5 rounded-lg p-1">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSide(s)}
            className={`flex-1 py-1.5 rounded-md text-sm font-medium transition cursor-pointer ${side === s ? (s === "buy" ? "bg-green-500 text-white" : "bg-red-500 text-white") : "text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60"}`}
          >
            {s === "buy" ? "Buy" : "Sell"}
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-gray-500 dark:text-white/40">
          {side === "buy" ? "SOL amount" : `${symbol ?? "Token"} amount`}
        </label>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-gray-900 dark:text-white font-mono text-sm focus:outline-none focus:border-purple-400/50 transition"
          />
        </div>
        {side === "buy" && (
          <div className="flex gap-1">
            {["0.1", "0.5", "1"].map((v) => (
              <button key={v} onClick={() => setAmount(v)} className="text-xs px-2 py-1 bg-black/5 dark:bg-white/5 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 cursor-pointer transition">{v} SOL</button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {publicKey ? (
        <button
          onClick={execute}
          disabled={status === "busy"}
          className={`w-full py-3 rounded-xl font-semibold text-sm transition cursor-pointer disabled:opacity-50 ${side === "buy" ? "bg-green-500 hover:bg-green-400 text-white" : "bg-red-500 hover:bg-red-400 text-white"}`}
        >
          {status === "busy" ? <span className="flex items-center justify-center gap-2"><Spinner size={14} /> Processing…</span>
           : status === "done" ? "✓ Done!"
           : side === "buy" ? `Buy ${symbol ?? ""}` : `Sell ${symbol ?? ""}`}
        </button>
      ) : (
        <p className="text-center text-sm text-gray-400 dark:text-white/30">Connect wallet to trade</p>
      )}
    </div>
  );
}

function CommentsSection({ mint, publicKey }: { mint: string; publicKey: string | null }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/comments/${mint}`);
    const d = await r.json() as { comments?: Comment[] };
    setComments(d.comments ?? []);
  }, [mint]);

  useEffect(() => { load(); }, [load]);

  const post = async () => {
    if (!publicKey || !body.trim()) return;
    setPosting(true);
    try {
      const { keypair } = await getPasskeyKeypair();
      const nonce = Date.now();
      const message = `sol.new:comment:${mint}:${nonce}`;
      const { ed25519 } = await import("@noble/curves/ed25519");
      const bs58 = (await import("bs58")).default;
      const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
      const signature = bs58.encode(sigBytes);

      await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, wallet: publicKey, body: body.trim(), signature, nonce }),
      });
      setBody("");
      await load();
    } catch {
      // best effort
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="space-y-3">
      {publicKey && (
        <div className="flex gap-2">
          <input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add a comment…"
            maxLength={500}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); post(); }}}
            className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition"
          />
          <button onClick={post} disabled={posting || !body.trim()} className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white text-sm rounded-xl transition cursor-pointer disabled:opacity-50">
            {posting ? <Spinner size={14} /> : "Post"}
          </button>
        </div>
      )}
      {comments.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-white/30 py-4">No comments yet</p>
      ) : (
        comments.map((c) => (
          <div key={c.id} className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-400 text-xs font-mono shrink-0">{c.wallet.slice(0, 2)}</div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs font-mono text-gray-500 dark:text-white/40">{shortenKey(c.wallet)}</span>
                <span className="text-[10px] text-gray-400 dark:text-white/20">{new Date(c.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm text-gray-700 dark:text-white/80 mt-0.5">{c.body}</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ProposalsSection({ mint, publicKey }: { mint: string; publicKey: string | null }) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/proposals/${mint}`);
    const d = await r.json() as { proposals?: Proposal[] };
    setProposals(d.proposals ?? []);
  }, [mint]);

  useEffect(() => { load(); }, [load]);

  const createProposal = async () => {
    if (!publicKey || !title.trim()) return;
    setSubmitting(true);
    try {
      const { keypair } = await getPasskeyKeypair();
      const nonce = Date.now();
      const message = `sol.new:proposal:${mint}:${nonce}`;
      const { ed25519 } = await import("@noble/curves/ed25519");
      const bs58 = (await import("bs58")).default;
      const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
      const signature = bs58.encode(sigBytes);

      await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mint, creator: publicKey, title: title.trim(), description: desc.trim() || null, durationDays: 7, signature, nonce }),
      });
      setTitle(""); setDesc(""); setShowCreate(false);
      await load();
    } catch {
      // best effort
    } finally {
      setSubmitting(false);
    }
  };

  const vote = async (proposalId: string, choice: "yes" | "no") => {
    if (!publicKey) return;
    try {
      const { keypair } = await getPasskeyKeypair();
      const nonce = Date.now();
      const message = `sol.new:vote:${proposalId}:${choice}:${nonce}`;
      const { ed25519 } = await import("@noble/curves/ed25519");
      const bs58 = (await import("bs58")).default;
      const sigBytes = ed25519.sign(new TextEncoder().encode(message), keypair.secretKey.slice(0, 32));
      const signature = bs58.encode(sigBytes);
      await fetch("/api/votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, wallet: publicKey, choice, signature, nonce }),
      });
      await load();
    } catch {
      // best effort
    }
  };

  return (
    <div className="space-y-3">
      {publicKey && (
        <button onClick={() => setShowCreate(!showCreate)} className="text-sm text-purple-400 hover:text-purple-300 transition cursor-pointer">
          + New proposal
        </button>
      )}
      {showCreate && (
        <div className="border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Proposal title" maxLength={200} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description (optional)" rows={2} className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition resize-none" />
          <button onClick={createProposal} disabled={submitting || !title.trim()} className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-white text-sm rounded-xl transition cursor-pointer disabled:opacity-50">
            {submitting ? <Spinner size={14} /> : "Create"}
          </button>
        </div>
      )}
      {proposals.length === 0 ? (
        <p className="text-center text-sm text-gray-400 dark:text-white/30 py-4">No proposals yet</p>
      ) : (
        proposals.map((p) => (
          <div key={p.id} className="border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-2">
            <h4 className="font-medium text-sm text-gray-900 dark:text-white">{p.title}</h4>
            {p.description && <p className="text-xs text-gray-500 dark:text-white/40">{p.description}</p>}
            <div className="flex items-center gap-3">
              <span className="text-xs text-green-500">✓ {p.votes.yes} yes</span>
              <span className="text-xs text-red-400">✗ {p.votes.no} no</span>
              {publicKey && p.status === "open" && (
                <>
                  <button onClick={() => vote(p.id, "yes")} className="text-xs px-2 py-1 bg-green-500/10 border border-green-500/20 text-green-500 rounded-lg hover:bg-green-500/20 transition cursor-pointer">Vote Yes</button>
                  <button onClick={() => vote(p.id, "no")} className="text-xs px-2 py-1 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg hover:bg-red-500/20 transition cursor-pointer">Vote No</button>
                </>
              )}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default function LaunchTokenPage() {
  const params = useParams();
  const mint = params.mint as string;
  const [token, setToken] = useState<TokenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"comments" | "proposals">("comments");
  const { publicKey } = useWallet();
  const { rpc } = useNetwork();

  useEffect(() => {
    fetch(`/api/launch/token/${mint}`)
      .then((r) => r.json())
      .then((d) => setToken(d as TokenData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [mint]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col pb-20 sm:pb-0">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Spinner size={28} className="text-purple-400" />
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex flex-col pb-20 sm:pb-0">
        <Navbar />
        <div className="flex-1 flex items-center justify-center text-gray-400">Token not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6 max-w-4xl mx-auto w-full">
        {/* Back */}
        <Link href="/launch" className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 transition mb-4">
          <ArrowLeft size={14} /> Launch
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: info + chart placeholder */}
          <div className="lg:col-span-2 space-y-4">
            {/* Token header */}
            <div className="flex gap-4">
              {token.imageUrl && (
                <img src={token.imageUrl} alt={token.name ?? ""} className="w-16 h-16 rounded-xl object-cover shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h1 className="text-xl font-bold">{token.name ?? "Unknown"}</h1>
                      <span className="font-mono text-gray-500 dark:text-white/40">${token.symbol ?? "???"}</span>
                    </div>
                    {token.description && <p className="text-sm text-gray-600 dark:text-white/60 mt-1 line-clamp-2">{token.description}</p>}
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-white/40">
                      <span className="flex items-center gap-1">
                        {mint.slice(0, 8)}… <CopyButton text={mint} />
                      </span>
                      {token.creator && <span>by {shortenKey(token.creator)}</span>}
                    </div>
                  </div>
                  <StarTokenButton
                    mint={mint}
                    name={token.name}
                    symbol={token.symbol}
                    imageUrl={token.imageUrl}
                    size="sm"
                  />
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Market Cap", value: formatUsd(token.marketCapUsd) },
                { label: "Price", value: token.priceUsd ? `$${token.priceUsd.toExponential(2)}` : "—" },
                { label: "Volume 24h", value: formatUsd(token.volume24h) },
              ].map(({ label, value }) => (
                <div key={label} className="border border-black/10 dark:border-white/10 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-white/40">{label}</p>
                  <p className="text-sm font-mono font-semibold mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Bonding curve progress */}
            {!token.complete && (
              <div className="border border-black/10 dark:border-white/10 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Bonding curve</span>
                  <span className="text-sm font-mono text-purple-400">{token.progress}%</span>
                </div>
                <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full transition-all" style={{ width: `${token.progress}%` }} />
                </div>
                <p className="text-xs text-gray-400 dark:text-white/30 mt-1.5">Graduates to Raydium at 100%</p>
              </div>
            )}
            {token.complete && (
              <div className="border border-green-500/20 bg-green-500/5 rounded-xl p-4 text-center">
                <p className="text-green-500 font-medium flex items-center justify-center gap-1.5"><GraduationCap className="w-4 h-4" /> Graduated to Raydium</p>
              </div>
            )}

            {/* External links */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: "pump.fun", href: `https://pump.fun/coin/${mint}` },
                { label: "DexScreener", href: `https://dexscreener.com/solana/${mint}` },
                { label: "Solscan", href: `https://solscan.io/token/${mint}` },
                ...(token.twitter ? [{ label: "X", href: token.twitter }] : []),
                ...(token.telegram ? [{ label: "Telegram", href: token.telegram }] : []),
                ...(token.website ? [{ label: "Website", href: token.website }] : []),
              ].map(({ label, href }) => (
                <a key={label} href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border border-black/10 dark:border-white/10 rounded-lg text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60 transition">
                  {label} <ExternalLink size={10} />
                </a>
              ))}
            </div>

            {/* Comments / Proposals tabs */}
            <div className="border border-black/10 dark:border-white/10 rounded-xl overflow-hidden">
              <div className="flex border-b border-black/10 dark:border-white/10">
                {([["comments", "Comments", MessageSquare], ["proposals", "Proposals", Vote]] as const).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-4 py-3 text-sm font-medium transition cursor-pointer ${activeTab === key ? "bg-black/5 dark:bg-white/5 text-gray-900 dark:text-white" : "text-gray-500 dark:text-white/40 hover:text-gray-700 dark:hover:text-white/60"}`}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
              <div className="p-4">
                {activeTab === "comments" ? (
                  <CommentsSection mint={mint} publicKey={publicKey} />
                ) : (
                  <ProposalsSection mint={mint} publicKey={publicKey} />
                )}
              </div>
            </div>
          </div>

          {/* Right: Buy/sell widget */}
          <div className="space-y-4">
            <BuyWidget mint={mint} symbol={token.symbol} rpc={rpc} publicKey={publicKey} />

            <div className="border border-black/10 dark:border-white/10 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium mb-1">
                <TrendingUp size={14} className="text-purple-400" /> Token info
              </div>
              {[
                { label: "Supply", value: token.bondingCurve?.tokenTotalSupply ? `${(Number(token.bondingCurve.tokenTotalSupply) / 1e6).toFixed(0)}M` : "1B" },
                { label: "Created", value: token.createdAt ? new Date(token.createdAt).toLocaleDateString() : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-white/40">{label}</span>
                  <span className="font-mono">{value}</span>
                </div>
              ))}
            </div>

            <a
              href="https://metadao.fi"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-green-500/5 hover:bg-green-500/10 border border-green-400/20 hover:border-green-400/40 text-green-500 dark:text-green-400 rounded-xl px-4 py-2.5 transition text-sm font-medium"
            >
              <ExternalLink size={14} /> Govern on MetaDAO
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
