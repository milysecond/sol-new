"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/navbar";
import { Spinner } from "@/components/spinner";
import {
  Activity,
  CalendarDays,
  Gift,
  Users,
  Coins,
  Image as ImageIcon,
  CreditCard,
  Link2,
  Dices,
  Trophy,
  ShieldCheck,
  Award,
  RefreshCw,
} from "lucide-react";

type TractionDay = {
  day: string;
  signups: number;
  tokens: number;
  nfts: number;
  gifts: number;
  giftClaims: number;
  creditsTx: number;
  creditsCents: number;
  shortLinks: number;
  draws: number;
  raffleEntries: number;
  multisigs: number;
  poapClaims: number;
};

type Report = {
  timezone: "UTC";
  generatedAt: string;
  days: number;
  totals: {
    signups: number;
    tokens: number;
    nfts: number;
    gifts: number;
    giftClaims: number;
    creditsTx: number;
    creditsCents: number;
    shortLinks: number;
    draws: number;
    raffleEntries: number;
    multisigs: number;
    poapClaims: number;
    walletsAllTime: number;
    tokensAllTime: number;
    nftsAllTime: number;
  };
  today: TractionDay | null;
  series: TractionDay[];
};

function fmtDay(day: string): string {
  try {
    const [y, m, d] = day.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(dt);
  } catch {
    return day;
  }
}

function isTodayUtc(day: string): boolean {
  return day === new Date().toISOString().slice(0, 10);
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Users;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] p-4 space-y-1">
      <div className="flex items-center gap-2 text-gray-500 dark:text-white/45 text-xs font-medium">
        <Icon size={14} className={accent || "text-purple-500"} />
        {label}
      </div>
      <p className="text-2xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-gray-400 dark:text-white/30">{sub}</p>
      )}
    </div>
  );
}

function dayTotal(r: TractionDay): number {
  return (
    r.signups +
    r.tokens +
    r.nfts +
    r.gifts +
    r.giftClaims +
    r.creditsTx +
    r.shortLinks +
    r.draws +
    r.raffleEntries +
    r.multisigs +
    r.poapClaims
  );
}

export default function TractionPage() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/traction?days=${d}`, { cache: "no-store" });
      const j = (await res.json()) as Report & { error?: string };
      if (!res.ok) throw new Error(j.error || "Failed to load");
      setReport(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const maxBar = useMemo(() => {
    if (!report?.series?.length) return 1;
    return Math.max(1, ...report.series.map((r) => r.signups));
  }, [report]);

  const utcNow = useMemo(
    () =>
      new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
        hour12: false,
      }).format(new Date()) + " UTC",
    // refresh label when report reloads
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [report?.generatedAt],
  );

  return (
    <div className="min-h-dvh bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 py-8 sm:px-6 space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 text-purple-500 dark:text-purple-400">
            <Activity size={22} />
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              Traction
            </h1>
          </div>
          <p className="text-sm text-gray-500 dark:text-white/45 max-w-2xl leading-relaxed">
            Daily product activity on sol.new. All days are{" "}
            <strong className="font-semibold text-gray-800 dark:text-white/80">
              UTC (UTC+0)
            </strong>
            — a day is 00:00–23:59:59 UTC.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
            <CalendarDays size={14} />
            <span>Clock now: {utcNow}</span>
            {report?.generatedAt && (
              <span className="text-gray-300 dark:text-white/20">·</span>
            )}
            {report?.generatedAt && (
              <span>
                Report: {new Date(report.generatedAt).toISOString().replace(".000Z", "Z")}
              </span>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition cursor-pointer ${
                days === d
                  ? "bg-purple-600 text-white border-purple-600"
                  : "border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5"
              }`}
            >
              {d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load(days)}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer disabled:opacity-40"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {loading && !report && (
          <div className="flex items-center gap-2 text-gray-400 py-16 justify-center">
            <Spinner size={22} /> Loading traction…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 text-rose-600 dark:text-rose-300 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {report && (
          <>
            {/* All-time */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                All-time
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <MetricCard
                  label="Wallets"
                  value={report.totals.walletsAllTime.toLocaleString()}
                  icon={Users}
                />
                <MetricCard
                  label="Tokens"
                  value={report.totals.tokensAllTime.toLocaleString()}
                  icon={Coins}
                />
                <MetricCard
                  label="NFTs"
                  value={report.totals.nftsAllTime.toLocaleString()}
                  icon={ImageIcon}
                />
              </div>
            </section>

            {/* Today UTC */}
            {report.today && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                  Today (UTC) · {report.today.day}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  <MetricCard
                    label="Signups"
                    value={report.today.signups}
                    icon={Users}
                    accent="text-emerald-500"
                  />
                  <MetricCard label="Tokens launched" value={report.today.tokens} icon={Coins} />
                  <MetricCard label="NFTs" value={report.today.nfts} icon={ImageIcon} />
                  <MetricCard label="Gifts created" value={report.today.gifts} icon={Gift} />
                  <MetricCard
                    label="Gifts claimed"
                    value={report.today.giftClaims}
                    icon={Gift}
                    accent="text-amber-500"
                  />
                  <MetricCard
                    label="Credits packs"
                    value={report.today.creditsTx}
                    sub={
                      report.today.creditsCents
                        ? `A$${(report.today.creditsCents / 100).toFixed(2)}`
                        : undefined
                    }
                    icon={CreditCard}
                  />
                  <MetricCard label="Short links" value={report.today.shortLinks} icon={Link2} />
                  <MetricCard label="Draws" value={report.today.draws} icon={Dices} />
                  <MetricCard
                    label="Raffle entries"
                    value={report.today.raffleEntries}
                    icon={Trophy}
                  />
                  <MetricCard label="Multisigs" value={report.today.multisigs} icon={ShieldCheck} />
                  <MetricCard label="POAP claims" value={report.today.poapClaims} icon={Award} />
                </div>
              </section>
            )}

            {/* Window totals */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                Last {report.days} days (UTC)
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Signups" value={report.totals.signups} icon={Users} />
                <MetricCard label="Tokens" value={report.totals.tokens} icon={Coins} />
                <MetricCard label="Gifts" value={report.totals.gifts} icon={Gift} />
                <MetricCard
                  label="Credits revenue"
                  value={`A$${(report.totals.creditsCents / 100).toFixed(0)}`}
                  sub={`${report.totals.creditsTx} checkout(s)`}
                  icon={CreditCard}
                />
              </div>
            </section>

            {/* Signup sparkline bars */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                Daily signups
              </h2>
              <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 overflow-x-auto">
                <div className="flex items-end gap-1 min-h-[120px] min-w-[480px]">
                  {[...report.series].reverse().map((r) => {
                    const h = Math.round((r.signups / maxBar) * 100);
                    return (
                      <div
                        key={r.day}
                        className="flex-1 flex flex-col items-center gap-1 group"
                        title={`${r.day} UTC · ${r.signups} signups`}
                      >
                        <span className="text-[9px] tabular-nums text-gray-400 opacity-0 group-hover:opacity-100">
                          {r.signups || ""}
                        </span>
                        <div
                          className={`w-full rounded-t-sm min-h-[2px] ${
                            isTodayUtc(r.day)
                              ? "bg-purple-500"
                              : "bg-purple-500/40 dark:bg-purple-400/35"
                          }`}
                          style={{ height: `${Math.max(2, h)}%` }}
                        />
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-gray-400 mt-2">
                  Hover a bar for count · purple = today UTC
                </p>
              </div>
            </section>

            {/* Daily table */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                Daily breakdown (UTC)
              </h2>
              <div className="rounded-2xl border border-black/10 dark:border-white/10 overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm min-w-[720px]">
                  <thead>
                    <tr className="border-b border-black/10 dark:border-white/10 text-gray-500 dark:text-white/40">
                      <th className="px-3 py-2.5 font-medium">Day (UTC)</th>
                      <th className="px-2 py-2.5 font-medium text-right">Signups</th>
                      <th className="px-2 py-2.5 font-medium text-right">Tokens</th>
                      <th className="px-2 py-2.5 font-medium text-right">NFTs</th>
                      <th className="px-2 py-2.5 font-medium text-right">Gifts</th>
                      <th className="px-2 py-2.5 font-medium text-right">Claims</th>
                      <th className="px-2 py-2.5 font-medium text-right">Credits</th>
                      <th className="px-2 py-2.5 font-medium text-right">Links</th>
                      <th className="px-2 py-2.5 font-medium text-right">Draws</th>
                      <th className="px-2 py-2.5 font-medium text-right">Raffle</th>
                      <th className="px-2 py-2.5 font-medium text-right">MS</th>
                      <th className="px-2 py-2.5 font-medium text-right">POAP</th>
                      <th className="px-2 py-2.5 font-medium text-right">Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.series.map((r) => (
                      <tr
                        key={r.day}
                        className={`border-b border-black/5 dark:border-white/5 ${
                          isTodayUtc(r.day)
                            ? "bg-purple-500/10"
                            : "hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                        }`}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className="font-mono text-[11px] text-gray-400 mr-2">
                            {r.day}
                          </span>
                          <span className="text-gray-800 dark:text-white/80">
                            {fmtDay(r.day)}
                          </span>
                          {isTodayUtc(r.day) && (
                            <span className="ml-1.5 text-[10px] font-semibold text-purple-500">
                              TODAY
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums font-semibold">
                          {r.signups || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.tokens || "·"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.nfts || "·"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.gifts || "·"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.giftClaims || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.creditsTx
                            ? `${r.creditsTx}${r.creditsCents ? ` (A$${(r.creditsCents / 100).toFixed(0)})` : ""}`
                            : "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.shortLinks || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{r.draws || "·"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.raffleEntries || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.multisigs || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          {r.poapClaims || "·"}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-gray-400">
                          {dayTotal(r) || "·"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-400 dark:text-white/30">
                Signups = new wallets · Gifts = claim links created · Claims = gifts claimed ·
                Credits = positive credit ledger entries · MS = multisigs · Days use{" "}
                <code className="text-[10px]">date(created_at)</code> in UTC.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
