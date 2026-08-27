"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Coins,
  ExternalLink,
  Landmark,
  Layers,
  Wallet as WalletIcon,
} from "lucide-react";
import { Spinner } from "@/components/spinner";
import Link from "next/link";
import { useHideBalances } from "@/lib/privacy";
import { useWallet } from "@/lib/wallet-context";
import { TokenIcon } from "@/components/token-meta";

export type PortfolioApi = {
  ok?: boolean;
  wallet: string;
  sol: number;
  usdc: number;
  tokens: {
    mint: string;
    uiAmount: number;
    decimals: number;
    priceUsd: number | null;
    valueUsd: number | null;
    symbol?: string | null;
    name?: string | null;
    logoUri?: string | null;
  }[];
  positions: {
    type?: string;
    label?: string;
    name?: string;
    platformId?: string;
    value?: number | null;
    data?: unknown;
  }[];
  stakedJup: { stakedAmount?: number; unstaking?: unknown[] } | null;
  totals: {
    tokensUsd: number;
    positionsUsd: number;
    stakedJupUsd: number;
    netWorthUsd: number;
  };
  error?: string;
};

const short = (s: string) => (s.length > 16 ? `${s.slice(0, 6)}…${s.slice(-6)}` : s);

function looksLikeMint(sym?: string | null) {
  if (!sym) return true;
  return sym.includes("…") || sym.includes("...") || sym.length > 20;
}

function Card({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.03] px-3.5 py-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-white/40">
        {label}
      </p>
      <p className="text-lg sm:text-xl font-bold tabular-nums tracking-tight mt-0.5">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-gray-400 dark:text-white/30 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

function positionTitle(p: PortfolioApi["positions"][number]) {
  return p.name || p.label || p.type || p.platformId || "Position";
}

async function clientEnrichToken(mint: string): Promise<{
  symbol?: string;
  name?: string;
  icon?: string;
  usdPrice?: number;
}> {
  try {
    const r = await fetch(`/api/swap/search?q=${encodeURIComponent(mint)}`, {
      cache: "no-store",
    });
    if (r.ok) {
      const j = (await r.json()) as {
        tokens?: {
          id?: string;
          symbol?: string;
          name?: string;
          icon?: string;
          usdPrice?: number;
        }[];
      };
      const hit = (j.tokens || []).find(
        (t) => t.id === mint || t.id?.toLowerCase() === mint.toLowerCase(),
      );
      if (hit) {
        return {
          symbol: hit.symbol,
          name: hit.name,
          icon: hit.icon,
          usdPrice: hit.usdPrice,
        };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch(`/api/token/${encodeURIComponent(mint)}`, {
      cache: "no-store",
    });
    if (r.ok) {
      const j = (await r.json()) as {
        token?: { symbol?: string; name?: string; image_url?: string | null };
      };
      if (j.token) {
        return {
          symbol: j.token.symbol,
          name: j.token.name,
          icon: j.token.image_url || undefined,
        };
      }
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function PortfolioDefiPanel({
  address,
  compact,
}: {
  address: string;
  /** Tighter layout for /address scan embed */
  compact?: boolean;
}) {
  const { publicKey } = useWallet();
  const [data, setData] = useState<PortfolioApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [hideBalances] = useHideBalances();

  const fmtUsd = (n: number | null | undefined) => {
    if (hideBalances) return "$••••";
    if (n == null || !Number.isFinite(n)) return "—";
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "";
    if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(2)}K`;
    return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  };

  const fmtAmt = (n: number) =>
    hideBalances
      ? "••••"
      : n.toLocaleString(undefined, {
          maximumFractionDigits: n >= 1 ? 4 : 6,
        });
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"tokens" | "defi">("tokens");

  const isSelf = Boolean(publicKey && publicKey === address);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetch(`/api/portfolio?wallet=${encodeURIComponent(address)}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as PortfolioApi;
        if (!r.ok || j.ok === false) throw new Error(j.error || "Failed to load");
        return j;
      })
      .then(async (j) => {
        // Client-side meta fill when API still returns bare mints
        const tokens = [...(j.tokens || [])];
        const need = tokens.filter((t) => !t.logoUri || looksLikeMint(t.symbol));
        if (need.length) {
          await Promise.all(
            need.slice(0, 16).map(async (t) => {
              const m = await clientEnrichToken(t.mint);
              if (m.symbol) t.symbol = m.symbol;
              if (m.name) t.name = m.name;
              if (m.icon) t.logoUri = m.icon;
              if (t.priceUsd == null && m.usdPrice != null) {
                t.priceUsd = m.usdPrice;
                t.valueUsd = t.uiAmount * m.usdPrice;
              }
            }),
          );
          // recompute tokensUsd / net worth if we got prices
          const tokensUsd = tokens.reduce((a, t) => a + (t.valueUsd ?? 0), 0);
          j = {
            ...j,
            tokens,
            totals: {
              ...j.totals,
              tokensUsd: tokensUsd || j.totals.tokensUsd,
              netWorthUsd:
                (tokensUsd || j.totals.tokensUsd) +
                (j.totals.positionsUsd || 0) +
                (j.totals.stakedJupUsd || 0),
            },
          };
        }
        if (!cancelled) setData(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const positions = data?.positions || [];
  const tokens = data?.tokens || [];

  const grouped = useMemo(() => {
    const m = new Map<string, PortfolioApi["positions"]>();
    for (const p of positions) {
      const key = p.platformId || p.label || "other";
      const list = m.get(key) || [];
      list.push(p);
      m.set(key, list);
    }
    return [...m.entries()];
  }, [positions]);

  return (
    <div className={compact ? "space-y-4" : "space-y-5"}>
      {!isSelf && !compact && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 flex flex-wrap items-center gap-2">
          <span>Looking up another wallet — not your connected passkey.</span>
          {publicKey && (
            <Link
              href={`/portfolio/${encodeURIComponent(publicKey)}`}
              className="font-semibold underline underline-offset-2"
            >
              My portfolio →
            </Link>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <WalletIcon className="w-4 h-4 text-purple-500" />
        <span className="font-mono text-xs text-gray-500 dark:text-white/45">
          {short(address)}
        </span>
        {isSelf && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-purple-500/15 text-purple-600 dark:text-purple-300">
            You
          </span>
        )}
        <Link
          href={`/address/${encodeURIComponent(address)}`}
          className="text-xs text-purple-600 dark:text-purple-400 inline-flex items-center gap-0.5"
        >
          sol.new <ExternalLink className="w-3 h-3" />
        </Link>
        {!compact && (
          <Link
            href={`/address/${encodeURIComponent(address)}`}
            className="text-xs text-gray-500 hover:text-purple-500 ml-auto"
          >
            Open scan →
          </Link>
        )}
        {compact && (
          <Link
            href={`/portfolio/${encodeURIComponent(address)}`}
            className="text-xs text-purple-600 dark:text-purple-400 ml-auto"
          >
            Full portfolio →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <Card
          label="SOL"
          value={data ? `${fmtAmt(data.sol)} SOL` : loading ? "…" : "—"}
          sub="Native"
        />
        <Card
          label="USDC"
          value={data ? fmtUsd(data.usdc) : loading ? "…" : "—"}
          sub="Spot"
        />
        <Card
          label="Net worth"
          value={data ? fmtUsd(data.totals.netWorthUsd) : loading ? "…" : "—"}
          sub="Tokens + DeFi"
        />
        <Card
          label="DeFi"
          value={data ? fmtUsd(data.totals.positionsUsd) : loading ? "…" : "—"}
          sub={
            data?.stakedJup?.stakedAmount
              ? `+ ${fmtAmt(data.stakedJup.stakedAmount)} staked JUP`
              : "Jupiter positions"
          }
        />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
          <Spinner size={16} className="w-4 h-4 text-purple-500" />
          Loading balances…
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10">
            <button
              type="button"
              onClick={() => setTab("tokens")}
              className={`min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer ${
                tab === "tokens"
                  ? "bg-white dark:bg-white/10 shadow-sm"
                  : "text-gray-500 dark:text-white/45"
              }`}
            >
              <Coins className="w-3.5 h-3.5 inline mr-1" />
              Tokens ({tokens.length + (data.sol > 0 ? 1 : 0)})
            </button>
            <button
              type="button"
              onClick={() => setTab("defi")}
              className={`min-h-[44px] rounded-xl text-sm font-semibold cursor-pointer ${
                tab === "defi"
                  ? "bg-white dark:bg-white/10 shadow-sm"
                  : "text-gray-500 dark:text-white/45"
              }`}
            >
              <Landmark className="w-3.5 h-3.5 inline mr-1" />
              DeFi ({positions.length})
            </button>
          </div>

          {tab === "tokens" ? (
            tokens.length === 0 && data.sol <= 0 ? (
              <p className="text-center text-sm text-gray-400 py-8">No token balances</p>
            ) : (
              <div className="space-y-2">
                {data.sol > 0 && (
                  <div className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-3.5 py-2.5">
                    <TokenIcon
                      token={{ symbol: "SOL", icon: "/solanaLogoMark.svg" }}
                      size={36}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">SOL</p>
                      <p className="text-xs text-gray-500 tabular-nums">
                        {fmtAmt(data.sol)}
                      </p>
                    </div>
                    <p className="text-sm font-semibold tabular-nums text-gray-400">—</p>
                  </div>
                )}
                {tokens.map((t) => {
                  const label = !looksLikeMint(t.symbol)
                    ? t.symbol!
                    : t.name && !looksLikeMint(t.name)
                      ? t.name
                      : short(t.mint);
                  return (
                    <div
                      key={t.mint}
                      className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.02] px-3.5 py-2.5"
                    >
                      <TokenIcon
                        token={{
                          symbol: label,
                          icon: t.logoUri || undefined,
                        }}
                        size={36}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        <p className="text-xs text-gray-500 tabular-nums truncate">
                          {fmtAmt(t.uiAmount)}
                          {t.name && t.name !== label ? ` · ${t.name}` : ""}
                          {t.priceUsd != null ? ` · ${fmtUsd(t.priceUsd)}` : ""}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">
                          {fmtUsd(t.valueUsd)}
                        </p>
                        <Link
                          href={`/token/${t.mint}`}
                          className="text-[11px] text-purple-600 dark:text-purple-400"
                        >
                          Token
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : positions.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Layers className="w-8 h-8 mx-auto text-gray-300 dark:text-white/20" />
              <p className="text-sm text-gray-400">No Jupiter DeFi positions</p>
              <p className="text-xs text-gray-400 dark:text-white/30 max-w-xs mx-auto">
                Lend, DCA, limit orders, perps, and staked JUP show here when active.
              </p>
              <Link href="/loan" className="text-sm text-purple-600 dark:text-purple-400">
                Open /loan →
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {data.stakedJup && Number(data.stakedJup.stakedAmount || 0) > 0 && (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-3">
                  <p className="text-xs uppercase text-amber-700 dark:text-amber-300">
                    Staked JUP
                  </p>
                  <p className="text-lg font-bold tabular-nums">
                    {fmtAmt(Number(data.stakedJup.stakedAmount))}
                  </p>
                </div>
              )}
              {grouped.map(([platform, items]) => (
                <div key={platform} className="space-y-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-white/40 px-0.5">
                    {platform}
                  </p>
                  {items.map((p, i) => (
                    <div
                      key={`${platform}-${i}`}
                      className="flex items-center gap-3 rounded-xl border border-black/10 dark:border-white/10 px-3.5 py-3"
                    >
                      <div className="w-9 h-9 rounded-lg bg-lime-500/15 flex items-center justify-center shrink-0">
                        <Landmark className="w-4 h-4 text-lime-600 dark:text-lime-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{positionTitle(p)}</p>
                        <p className="text-xs text-gray-500 dark:text-white/40">
                          {[p.label, p.type].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {fmtUsd(typeof p.value === "number" ? p.value : null)}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
