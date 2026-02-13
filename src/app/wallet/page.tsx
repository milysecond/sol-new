"use client";

import { fastIpfsUrl } from "@/lib/ipfs";
import { useEffect, useState, useCallback, useRef } from "react";
import { Image as ImageIcon, Coins, Download, CreditCard, Copy, Check, Droplets, ExternalLink } from "lucide-react";
import { Wallet } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { ConnectGate } from "@/components/connect-gate";
import { useWallet } from "@/lib/wallet-context";
import { useNetwork } from "@/lib/network";
import { AnimatedIcon } from "@/components/animated-icon";
import QRCode from "qrcode";

interface Token {
  id: number; name: string; symbol: string; image_url: string | null;
  metadata_uri: string | null; mint_address: string | null; created_at: string;
}
interface Nft {
  id: number; name: string; description: string | null; image_url: string | null;
  metadata_uri: string | null; mint_address: string | null; created_at: string;
}

type Tab = "get" | "pay" | "nfts" | "tokens";

// Solana Pay helpers
const USDC_DEVNET = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const USDC_MAINNET = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PAY_TOKENS = ["SOL", "USDC"];

function buildSolanaPayUrl(recipient: string, amount: string, token: string, label: string, network: string) {
  const base = `solana:${recipient}`;
  const params = new URLSearchParams();
  if (amount) params.set("amount", amount);
  if (label) params.set("label", label);
  if (token === "USDC") params.set("spl-token", network === "devnet" ? USDC_DEVNET : USDC_MAINNET);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export default function WalletPage() {
  const { publicKey, balance, refreshBalance } = useWallet();
  const { network } = useNetwork();
  const [tab, setTab] = useState<Tab>("get");
  const [tokens, setTokens] = useState<Token[]>([]);
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [loading, setLoading] = useState(false);

  const clusterParam = network === "devnet" ? "?cluster=devnet" : "";

  useEffect(() => {
    if (!publicKey) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/token?wallet=${publicKey}`).then((r) => r.json()),
      fetch(`/api/nft?wallet=${publicKey}`).then((r) => r.json()),
    ])
      .then(([tokenData, nftData]) => {
        setTokens(tokenData.tokens || []);
        setNfts(nftData.nfts || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [publicKey]);

  const tabs: { id: Tab; label: string; icon: typeof Download }[] = [
    { id: "get", label: "Get", icon: Download },
    { id: "pay", label: "Pay", icon: CreditCard },
    { id: "nfts", label: "NFTs", icon: ImageIcon },
    { id: "tokens", label: "Tokens", icon: Coins },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-6 py-12">
        <ConnectGate action="view your wallet">
          <div className="max-w-2xl w-full space-y-6">
            {/* Header */}
            <div className="text-center space-y-2">
              <AnimatedIcon icon={Wallet} size={40} className="text-purple-400" />
              <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
              {balance !== null && (
                <p className="text-purple-400 font-mono text-lg">{balance.toFixed(4)} SOL</p>
              )}
              <p className="text-white/40 text-sm font-mono">
                {publicKey?.slice(0, 8)}...{publicKey?.slice(-8)}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 justify-center">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`flex-1 max-w-[100px] flex flex-col items-center gap-1 px-3 py-2.5 rounded-xl text-xs transition cursor-pointer active:scale-95 ${
                    tab === t.id
                      ? "bg-purple-500/20 text-purple-300 border border-purple-400/50"
                      : "bg-white/5 text-white/50 border border-white/10 active:text-white"
                  }`}
                >
                  <t.icon size={18} />
                  <span>{t.label}{t.id === "nfts" && nfts.length > 0 ? ` ${nfts.length}` : ""}{t.id === "tokens" && tokens.length > 0 ? ` ${tokens.length}` : ""}</span>
                </button>
              ))}
            </div>

            {/* Tab content */}
            {tab === "get" && <GetTab publicKey={publicKey!} network={network} refreshBalance={refreshBalance} />}
            {tab === "pay" && <PayTab publicKey={publicKey!} network={network} />}
            {tab === "nfts" && (
              loading ? <div className="text-center text-white/30 py-12">Loading...</div> :
              nfts.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-white/30">No NFTs yet</p>
                  <a href="/nft" className="text-purple-400 hover:text-purple-300 text-sm transition">Mint your first NFT →</a>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  {nfts.map((nft) => (
                    <div key={nft.id} className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden hover:border-purple-400/30 transition">
                      {nft.image_url && <img src={fastIpfsUrl(nft.image_url) || ""} alt={nft.name} className="w-full aspect-square object-cover" />}
                      <div className="p-4 space-y-2">
                        <p className="font-semibold">{nft.name}</p>
                        {nft.description && <p className="text-white/40 text-sm line-clamp-2">{nft.description}</p>}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-white/20">{new Date(nft.created_at + "Z").toLocaleDateString()}</span>
                          {nft.mint_address && <a href={`https://solscan.io/token/${nft.mint_address}${clusterParam}`} target="_blank" className="text-xs text-purple-400 hover:text-purple-300">View ↗</a>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
            {tab === "tokens" && (
              loading ? <div className="text-center text-white/30 py-12">Loading...</div> :
              tokens.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <p className="text-white/30">No tokens yet</p>
                  <a href="/token" className="text-purple-400 hover:text-purple-300 text-sm transition">Launch your first token →</a>
                </div>
              ) : (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <div key={token.id} className="flex items-center gap-4 bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 hover:border-purple-400/30 transition">
                      {token.image_url ? (
                        <img src={fastIpfsUrl(token.image_url) || ""} alt={token.name} className="w-10 h-10 rounded-lg object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center"><Coins size={20} className="text-purple-400" /></div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{token.name}</p>
                        <p className="text-white/40 text-xs font-mono">${token.symbol}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs text-white/20">{new Date(token.created_at + "Z").toLocaleDateString()}</span>
                        {token.mint_address && <a href={`https://solscan.io/token/${token.mint_address}${clusterParam}`} target="_blank" className="block text-xs text-purple-400 hover:text-purple-300">View ↗</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </ConnectGate>
      </main>
    </div>
  );
}

/* ── Get Tab ── */
function GetTab({ publicKey, network, refreshBalance }: { publicKey: string; network: string; refreshBalance: () => Promise<void> }) {
  const [copied, setCopied] = useState(false);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropDone, setAirdropDone] = useState(false);

  const copyAddress = useCallback(() => {
    navigator.clipboard.writeText(publicKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  const handleAirdrop = useCallback(async () => {
    if (network !== "devnet") return;
    setAirdropping(true);
    setAirdropDone(false);
    try {
      const res = await fetch("/api/airdrop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: publicKey }) });
      const data = await res.json();
      if (data.ok) {
        await new Promise((r) => setTimeout(r, 2000));
        await refreshBalance();
        setAirdropDone(true);
        setTimeout(() => setAirdropDone(false), 3000);
      }
    } catch {} finally { setAirdropping(false); }
  }, [publicKey, network, refreshBalance]);

  return (
    <div className="space-y-4">
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
        <p className="text-xs text-white/40 uppercase tracking-wider">Your address</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-sm font-mono text-purple-300 break-all">{publicKey}</code>
          <button onClick={copyAddress} className="shrink-0 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition cursor-pointer">
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} className="text-white/50" />}
          </button>
        </div>
        {copied && <p className="text-xs text-green-400">Copied!</p>}
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex flex-col items-center gap-3">
        <p className="text-xs text-white/40 uppercase tracking-wider">Scan to send</p>
        <div className="bg-white rounded-xl p-4">
          <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=solana:${publicKey}`} alt="QR" width={200} height={200} />
        </div>
      </div>

      {network === "devnet" && (
        <button onClick={handleAirdrop} disabled={airdropping} className="w-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-300 font-semibold rounded-xl px-4 py-3 transition cursor-pointer disabled:opacity-50">
          <Droplets size={14} className="inline mr-1" />
          {airdropping ? "Sending..." : airdropDone ? "✓ 0.1 SOL sent!" : "Airdrop 0.1 SOL"}
        </button>
      )}

      {network === "mainnet" && (
        <BuySection publicKey={publicKey} />
      )}

      <a href={`https://solscan.io/account/${publicKey}${network === "devnet" ? "?cluster=devnet" : ""}`} target="_blank" className="block w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition text-center text-sm">
        View on Solscan ↗
      </a>
    </div>
  );
}

/* ── Pay Tab ── */
function PayTab({ publicKey, network }: { publicKey: string; network: string }) {
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [selected, setSelected] = useState("SOL");
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleCreate = () => {
    if (!amount) return;
    setPayUrl(buildSolanaPayUrl(publicKey, amount, selected, label, network));
  };

  useEffect(() => {
    if (!payUrl || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, payUrl, { width: 256, margin: 2, color: { dark: "#ffffffee", light: "#00000000" } });
  }, [payUrl]);

  const copyLink = () => {
    if (!payUrl) return;
    navigator.clipboard.writeText(payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (payUrl) {
    return (
      <div className="space-y-4">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col items-center space-y-4">
          <canvas ref={canvasRef} className="rounded-xl" />
          <p className="text-white font-semibold text-lg">{amount} {selected}</p>
          {label && <p className="text-white/40 text-sm">{label}</p>}
          <div onClick={copyLink} className="w-full bg-black/50 rounded-lg px-4 py-3 font-mono text-xs text-white/50 break-all cursor-pointer hover:text-white/70 transition">{payUrl}</div>
          <button onClick={copyLink} className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer">{copied ? "Copied! ✓" : "Copy link"}</button>
        </div>
        <button onClick={() => { setPayUrl(null); setAmount(""); setLabel(""); setCopied(false); }} className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer">Create another →</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-white/50 text-sm">Create a Solana Pay link anyone can pay with.</p>
      <div className="relative">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-mono">{selected === "SOL" ? "◎" : "$"}</span>
        <input type="text" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="w-full bg-white/5 border border-white/10 rounded-xl pl-8 pr-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition font-mono text-2xl" />
      </div>
      <input type="text" placeholder="What's it for? (optional)" value={label} onChange={(e) => setLabel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 focus:ring-1 focus:ring-purple-400/25 transition" />
      <div className="flex gap-2">
        {PAY_TOKENS.map((token) => (
          <button key={token} onClick={() => setSelected(token)} className={`flex-1 border rounded-xl px-4 py-2.5 text-sm transition cursor-pointer ${selected === token ? "bg-purple-500/20 border-purple-400/50 text-purple-300" : "bg-white/5 border-white/10 text-white/60 hover:text-white hover:border-white/20"}`}>{token}</button>
        ))}
      </div>
      <button onClick={handleCreate} disabled={!amount} className="w-full bg-purple-500 hover:bg-purple-400 disabled:bg-white/10 disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed">Create {selected} link →</button>
    </div>
  );
}

/* ── Buy Section ── */
function BuySection({ publicKey }: { publicKey: string }) {
  const [step, setStep] = useState<"form" | "paying" | "done">("form");
  const [amount, setAmount] = useState("5");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Listen for Coinbase postMessage events
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (!e.origin.includes("coinbase.com")) return;
      let data;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (!data?.eventName) return;
      console.log("Coinbase event:", data.eventName, data.data);
      if (data.eventName === "onramp_api.polling_success") {
        setStep("done");
      }
      if (data.eventName?.includes("error")) {
        setError(data.data?.errorMessage || "Something went wrong");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleBuy = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/onramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: publicKey, email, phoneNumber: phone, amount }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setIframeUrl(data.url);
      setOrderId(data.orderId);
      setStep("paying");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create order");
    } finally { setLoading(false); }
  }, [publicKey, email, phone, amount]);

  if (step === "done") {
    return (
      <div className="space-y-4 text-center">
        <div className="text-4xl">✅</div>
        <h3 className="text-xl font-bold text-green-400">SOL purchased!</h3>
        <p className="text-white/50 text-sm">Your SOL is on its way to your wallet.</p>
        <button onClick={() => { setStep("form"); setIframeUrl(null); }} className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold rounded-xl px-4 py-3 transition cursor-pointer">
          Buy more
        </button>
      </div>
    );
  }

  if (step === "paying" && iframeUrl) {
    return (
      <div className="space-y-3">
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <iframe
            src={iframeUrl}
            className="w-full border-0"
            style={{ height: 500 }}
            allow="payment;camera"
            title="Apple Pay"
          />
        </div>
        {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        <button onClick={() => { setStep("form"); setIframeUrl(null); setError(null); }} className="w-full bg-white/5 border border-white/10 text-white/60 rounded-xl px-4 py-3 hover:text-white transition cursor-pointer text-sm">
          ← Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-white/40 uppercase tracking-wider text-center">Buy SOL — Apple Pay</p>

      {/* Amount presets */}
      <div className="flex gap-2">
        {["5", "10", "25", "50"].map((v) => (
          <button key={v} onClick={() => setAmount(v)} className={`flex-1 border rounded-xl px-3 py-2.5 text-sm transition cursor-pointer ${amount === v ? "bg-purple-500/20 border-purple-400/50 text-purple-300" : "bg-white/5 border-white/10 text-white/60"}`}>
            ${v}
          </button>
        ))}
      </div>

      <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition" />
      <input type="tel" placeholder="Phone (+1XXXXXXXXXX)" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition" />

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}

      <button
        onClick={handleBuy}
        disabled={loading || !email || !phone}
        className="w-full bg-black border-2 border-white rounded-xl px-4 py-3.5 font-semibold transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        {loading ? "Creating order..." : <><span className="text-lg"></span> Pay with Apple Pay</>}
      </button>

      <p className="text-xs text-white/30 text-center">No KYC · No account needed · Powered by Coinbase</p>
    </div>
  );
}
