"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Search, ExternalLink, ShieldCheck, ShieldAlert,
  ShieldX, Copy, Check, Coins, Activity, Code2, AlertTriangle,
  Lock, Unlock, FileCode, ImageIcon, CalendarDays, ArrowUpRight,
  Wallet as WalletIcon, Landmark, LineChart, Layers, Sprout, Gift, Vote,
} from "lucide-react";
import { Spinner } from "@/components/spinner";
import { Navbar } from "@/components/navbar";
import { useWallet } from "@/lib/wallet-context";
import { analytics } from "@/lib/analytics";
import { PortfolioDefiPanel } from "@/components/portfolio-defi-panel";

// ── Formatting ────────────────────────────────────────────────────────────────

const short = (s: string) => (s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);
const fmtUsd = (n: number | null | undefined) => {
  if (n == null || isNaN(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};
const fmtPnl = (n: number | null | undefined) => (n == null ? "—" : `${n >= 0 ? "+" : ""}${fmtUsd(n).replace("-", "")}`);
const pretty = (s: string) => s.replace(/[_-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fmtDate = (iso: string | null) => {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

// ── Shared UI ─────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded text-gray-400 hover:text-gray-700 dark:hover:text-white/70 transition"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function Field({ label, value, url, mono, icon: Icon }: {
  label: string; value: string | null | undefined; url?: string; mono?: boolean; icon?: React.ElementType;
}) {
  if (!value) return null;
  const inner = (
    <span className={`text-sm text-gray-900 dark:text-white break-all ${mono ? "font-mono text-xs" : ""}`}>
      {value}
    </span>
  );
  return (
    <div className="flex items-start gap-2 py-2.5 border-b border-black/5 dark:border-white/5 last:border-0">
      <div className="w-36 shrink-0 flex items-center gap-1.5 text-xs text-gray-500 dark:text-white/40 pt-0.5">
        {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
        {label}
      </div>
      <div className="flex-1 flex items-start gap-1 min-w-0">
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-purple-500 dark:hover:text-purple-400 transition inline-flex items-center gap-1">
            {inner}
            <ArrowUpRight className="w-3 h-3 shrink-0 opacity-50" />
          </a>
        ) : inner}
        {mono && value && <CopyButton text={value} />}
      </div>
    </div>
  );
}

function Badge({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-500">
      <AlertTriangle className="w-3 h-3" /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-500">
      <ShieldCheck className="w-3 h-3" /> {no}
    </span>
  );
}

// ── Program View ──────────────────────────────────────────────────────────────

type ProgramData = {
  type: "program";
  address: string;
  upgradeable: boolean;
  upgradeAuthority: string | null;
  deploySlot: number | null;
  programwatchUrl: string;
  solscanUrl: string;
  explorerUrl: string;
  programwatchData: any;
};

function ProgramView({ data }: { data: ProgramData }) {
  const pw = data.programwatchData;
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center shrink-0">
          <Code2 className="w-6 h-6 text-purple-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-bold">{pw?.name ?? "Solana Program"}</h2>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-500/10 text-purple-500">Program</span>
          </div>
          <p className="font-mono text-xs text-gray-500 dark:text-white/40 mt-0.5 flex items-center gap-1">
            {data.address} <CopyButton text={data.address} />
          </p>
        </div>
      </div>

      {/* Upgrade status */}
      <div className="flex items-center gap-3 flex-wrap">
        {data.upgradeable ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-500 border border-amber-400/20">
            <Unlock className="w-3.5 h-3.5" /> Upgradeable
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-400/20">
            <Lock className="w-3.5 h-3.5" /> Immutable
          </span>
        )}
        {pw?.verified && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-sky-500/10 text-sky-500 border border-sky-400/20">
            <ShieldCheck className="w-3.5 h-3.5" /> Verified Source
          </span>
        )}
      </div>

      {/* Info fields */}
      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-1">
        <Field label="Address" value={data.address} mono icon={Code2} />
        {data.upgradeable && (
          <Field
            label="Upgrade Authority"
            value={data.upgradeAuthority ?? "No authority (immutable)"}
            mono={!!data.upgradeAuthority}
            url={data.upgradeAuthority ? `https://solscan.io/account/${data.upgradeAuthority}` : undefined}
            icon={ShieldAlert}
          />
        )}
        {data.deploySlot && (
          <Field label="Last Deploy Slot" value={data.deploySlot.toLocaleString()} icon={CalendarDays} />
        )}
        {pw?.description && <Field label="Description" value={pw.description} />}
        {pw?.github && <Field label="GitHub" value={pw.github} url={pw.github} />}
      </div>

      {/* Programwatch history */}
      {pw?.upgrades?.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider mb-2">Upgrade History</h3>
          <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
            {pw.upgrades.slice(0, 5).map((u: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="text-gray-500 dark:text-white/40 text-xs w-24 shrink-0">
                  {fmtDate(u.timestamp) ?? u.slot ?? "—"}
                </span>
                <span className="flex-1 truncate font-mono text-xs">{u.authority ?? u.signer ?? "—"}</span>
                {u.signature && (
                  <a href={`https://solscan.io/tx/${u.signature}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 hover:text-purple-500" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External links */}
      <div className="flex items-center gap-2 flex-wrap">
        <a href={data.programwatchUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <Activity className="w-3.5 h-3.5" /> Programwatch
        </a>
        <a href={data.solscanUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <ExternalLink className="w-3.5 h-3.5" /> Solscan
        </a>
        <a href={data.explorerUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <ExternalLink className="w-3.5 h-3.5" /> Explorer
        </a>
      </div>
    </div>
  );
}

// ── Token View ────────────────────────────────────────────────────────────────

type Risk = { name: string; level: string; description: string };

type TokenData = {
  type: "token";
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  supply: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  mintable: boolean;
  freezable: boolean;
  mutable: boolean;
  updateAuthority: string | null;
  metadataUri: string | null;
  imageUrl: string | null;
  description: string | null;
  score: number | null;
  risks: Risk[];
  rugged: boolean;
  createdAt: string | null;
  topHolders: any[];
  rugcheckUrl: string;
  solscanUrl: string;
  jupiterUrl: string;
  dexscreenerUrl: string;
};

const RISK_COLOR: Record<string, string> = {
  danger: "text-rose-500 bg-rose-500/10 border-rose-400/20",
  warn: "text-amber-500 bg-amber-500/10 border-amber-400/20",
  info: "text-sky-500 bg-sky-500/10 border-sky-400/20",
};

const RISK_ICON: Record<string, React.ElementType> = {
  danger: ShieldX,
  warn: ShieldAlert,
  info: ShieldCheck,
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color =
    score >= 80 ? "bg-emerald-500/10 text-emerald-500 border-emerald-400/20"
    : score >= 50 ? "bg-amber-500/10 text-amber-500 border-amber-400/20"
    : "bg-rose-500/10 text-rose-500 border-rose-400/20";
  const label = score >= 80 ? "Good" : score >= 50 ? "Caution" : "Risk";
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${color}`}>
      {score}/100 · {label}
    </span>
  );
}

function TokenView({ data }: { data: TokenData }) {
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-14 h-14 rounded-xl shrink-0 overflow-hidden bg-black/5 dark:bg-white/5 flex items-center justify-center">
          {data.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Coins className="w-6 h-6 text-gray-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{data.name}</h2>
            <span className="text-sm text-gray-400 dark:text-white/40 font-mono">${data.symbol}</span>
          </div>
          <p className="font-mono text-xs text-gray-500 dark:text-white/40 mt-0.5 flex items-center gap-1">
            {short(data.address)} <CopyButton text={data.address} />
          </p>
          {data.description && (
            <p className="text-xs text-gray-500 dark:text-white/50 mt-1 line-clamp-2">{data.description}</p>
          )}
        </div>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <ScoreBadge score={data.score} />
        <Badge ok={data.mintable} yes="Mintable" no="Fixed Supply" />
        <Badge ok={data.freezable} yes="Freeze Authority" no="No Freeze" />
        <Badge ok={data.mutable} yes="Mutable Metadata" no="Immutable Metadata" />
        {data.rugged && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-600/10 text-rose-600 border border-rose-500/20">
            <ShieldX className="w-3 h-3" /> Flagged as Rug
          </span>
        )}
      </div>

      {/* Key fields */}
      <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-4 py-1">
        <Field label="Supply" value={data.supply} icon={Coins} />
        <Field label="Decimals" value={String(data.decimals)} icon={Coins} />
        <Field
          label="Mint Authority"
          value={data.mintAuthority ?? "None (fixed)"}
          mono={!!data.mintAuthority}
          url={data.mintAuthority ? `https://solscan.io/account/${data.mintAuthority}` : undefined}
          icon={data.mintable ? Unlock : Lock}
        />
        <Field
          label="Freeze Authority"
          value={data.freezeAuthority ?? "None"}
          mono={!!data.freezeAuthority}
          url={data.freezeAuthority ? `https://solscan.io/account/${data.freezeAuthority}` : undefined}
          icon={Lock}
        />
        <Field
          label="Update Authority"
          value={data.updateAuthority ?? "None"}
          mono={!!data.updateAuthority}
          url={data.updateAuthority ? `https://solscan.io/account/${data.updateAuthority}` : undefined}
          icon={ShieldAlert}
        />
        <Field
          label="Metadata URI"
          value={data.metadataUri}
          url={data.metadataUri ?? undefined}
          mono
          icon={FileCode}
        />
        <Field
          label="Image URI"
          value={data.imageUrl}
          url={data.imageUrl ?? undefined}
          mono
          icon={ImageIcon}
        />
        <Field
          label="Created"
          value={fmtDate(data.createdAt)}
          icon={CalendarDays}
        />
      </div>

      {/* Risks */}
      {data.risks.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider">Risk Factors</h3>
          {data.risks.map((r, i) => {
            const Icon = RISK_ICON[r.level] ?? ShieldAlert;
            const col = RISK_COLOR[r.level] ?? RISK_COLOR.info;
            return (
              <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${col}`}>
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">{r.name}</p>
                  {r.description && <p className="opacity-80 mt-0.5">{r.description}</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Top holders */}
      {data.topHolders.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-gray-500 dark:text-white/40 uppercase tracking-wider">Top Holders</h3>
          <div className="rounded-2xl border border-black/10 dark:border-white/10 divide-y divide-black/5 dark:divide-white/5 overflow-hidden">
            {data.topHolders.map((h: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                <span className="w-5 text-gray-400 dark:text-white/30">{i + 1}</span>
                <a href={`https://solscan.io/account/${h.address}`} target="_blank" rel="noopener noreferrer"
                  className="flex-1 font-mono text-gray-600 dark:text-white/60 hover:text-purple-500 dark:hover:text-purple-400 truncate">
                  {h.address}
                </a>
                <span className="text-gray-500 dark:text-white/40 tabular-nums">{h.pct ? `${h.pct.toFixed(2)}%` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External links */}
      <div className="flex items-center gap-2 flex-wrap">
        <a href={data.rugcheckUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <ShieldCheck className="w-3.5 h-3.5" /> RugCheck
        </a>
        <a href={data.jupiterUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <ExternalLink className="w-3.5 h-3.5" /> Jupiter
        </a>
        <a href={data.dexscreenerUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <LineChart className="w-3.5 h-3.5" /> DexScreener
        </a>
        <a href={data.solscanUrl} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/10 text-xs hover:bg-black/5 dark:hover:bg-white/5 transition">
          <ExternalLink className="w-3.5 h-3.5" /> Solscan
        </a>
      </div>
    </div>
  );
}

// ── Wallet View ───────────────────────────────────────────────────────────────

function WalletView({
  address,
}: {
  address: string;
  sol?: number;
  usdc?: number | null;
}) {
  return <PortfolioDefiPanel address={address} compact />;
}

// ── Main scan result ──────────────────────────────────────────────────────────

type ScanResult =
  | ({ type: "program" } & ProgramData)
  | ({ type: "token" } & TokenData)
  | {
      type: "wallet";
      address: string;
      sol?: number;
      usdc?: number | null;
      balances?: { sol: number; usdc: number | null };
    };

// ── Page ──────────────────────────────────────────────────────────────────────

function ScanInner() {
  const { publicKey } = useWallet();
  const params = useSearchParams();
  const router = useRouter();

  const [input, setInput] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async (address: string) => {
    const a = address.trim();
    if (!a) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/scan?address=${encodeURIComponent(a)}`);
      const json = (await res.json()) as ScanResult & { error?: string };
      if (!res.ok || json.error) throw new Error((json as any).error || "Scan failed");
      setResult(json);
    } catch (e: any) {
      setError(e.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const q = params.get("address") ?? params.get("wallet");
    if (q) { setInput(q); scan(q); }
    else if (publicKey) setInput(publicKey);
  }, [params, publicKey, scan]);

  const submit = (e: React.SyntheticEvent) => {
    e.preventDefault();
    const a = input.trim();
    if (!a) return;
    router.push(`/address/${encodeURIComponent(a)}`);
    scan(a);
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-6 sm:px-6 sm:py-10 sm:items-center">
        <div className="w-full sm:max-w-2xl space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 text-purple-500 dark:text-purple-400">
              <Search size={22} />
              <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">Scan</h1>
            </div>
            <p className="text-gray-500 dark:text-white/40 text-sm">
              Paste any Solana address — wallet, token, or program.{" "}
              <span className="hidden sm:inline text-gray-400 dark:text-white/30">
                sol.new/address/…
              </span>
            </p>
          </div>

          <form onSubmit={submit} className="flex gap-2">
            <div className="flex-1 flex items-center gap-2 bg-black/[0.03] dark:bg-white/[0.03] border border-black/10 dark:border-white/10 rounded-xl px-3 focus-within:border-purple-400/50 transition">
              <Search size={16} className="text-gray-400 dark:text-white/30 shrink-0" />
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Wallet, token mint, or program address"
                spellCheck={false}
                className="flex-1 bg-transparent py-3 text-sm font-mono outline-none placeholder:text-gray-400 dark:placeholder:text-white/25"
              />
              {input && (
                <button type="button" onClick={() => setInput("")} className="text-gray-400 hover:text-gray-600 dark:hover:text-white/60 text-lg leading-none">×</button>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="px-4 rounded-xl bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-400/50 text-sm font-medium hover:bg-purple-500/30 transition disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
            >
              {loading ? <Spinner size={20} /> : <Search size={15} />}
              <span className="hidden sm:inline">Scan</span>
            </button>
          </form>

          {publicKey && !result && !loading && (
            <button
              onClick={() => {
                setInput(publicKey);
                router.push(`/address/${encodeURIComponent(publicKey)}`);
                scan(publicKey);
              }}
              className="mx-auto block text-xs text-purple-500 dark:text-purple-400 hover:underline"
            >
              Scan my connected wallet →
            </button>
          )}

          {error && (
            <div className="text-center bg-rose-500/10 border border-rose-400/30 text-rose-600 dark:text-rose-300 rounded-xl px-4 py-3 text-sm">
              {error}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-10 text-gray-400 dark:text-white/30">
              <Spinner size={32} className="w-8 h-8 text-purple-500" />
              <span className="text-sm">Scanning address…</span>
            </div>
          )}

          {result && (
            <div className="bg-black/[0.02] dark:bg-white/[0.02] border border-black/10 dark:border-white/10 rounded-2xl p-4 sm:p-6">
              {result.type === "program" && <ProgramView data={result as ProgramData} />}
              {result.type === "token" && <TokenView data={result as TokenData} />}
              {result.type === "wallet" && (
                <WalletView
                  address={result.address}
                  sol={result.sol ?? result.balances?.sol}
                  usdc={result.usdc ?? result.balances?.usdc}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-black" />}>
      <ScanInner />
    </Suspense>
  );
}
