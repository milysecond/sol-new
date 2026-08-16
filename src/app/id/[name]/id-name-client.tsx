"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Search,
  Wallet,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { PageTransition } from "@/components/page-transition";
import { Spinner } from "@/components/spinner";
import { toast } from "@/lib/toast";
import {
  NAME_HINT,
  SUPPORTED_TLDS,
  looksLikeDomain,
  looksLikePubkey,
  supportedDomainTld,
} from "@/lib/resolve-name";
import { IdNameShare } from "@/components/id-name-share";

type ResolveOk = {
  ok: true;
  owner: string;
  kind: string;
  domain?: string;
  tld?: string;
  resolvedAs?: string;
  input: string;
};

type ResolveErr = { ok: false; error?: string };

const TRY_TLDS = ["sol", "sns", "skr", "bonk"] as const;

function shortAddr(a: string, n = 4): string {
  if (!a || a.length < 10) return a || "—";
  return `${a.slice(0, n)}…${a.slice(-n)}`;
}

function kindLabel(kind?: string, tld?: string): string {
  if (tld === "sol" || kind === "sol") return "SNS · .sol";
  if (tld === "sns" || kind === "sns") return "SNS · .sns";
  if (tld === "skr") return "ADNS · .skr";
  if (tld === "bonk") return "ADNS · .bonk";
  if (kind === "ans") return "ADNS";
  if (kind === "pubkey") return "Wallet";
  return kind || "Name";
}

async function resolveOne(name: string): Promise<ResolveOk | ResolveErr> {
  const res = await fetch(`/api/resolve?name=${encodeURIComponent(name)}`, {
    cache: "no-store",
  });
  const data = (await res.json()) as ResolveOk | ResolveErr;
  if (!res.ok || !data.ok) {
    return { ok: false, error: (data as ResolveErr).error || `HTTP ${res.status}` };
  }
  return data as ResolveOk;
}

/** Bare handle → try .sol / .sns / .skr / .bonk in order */
async function resolveSmart(raw: string): Promise<ResolveOk | ResolveErr> {
  const input = raw.trim();
  if (!input) return { ok: false, error: "Enter a name" };

  if (looksLikePubkey(input) && !looksLikeDomain(input)) {
    return resolveOne(input);
  }

  if (looksLikeDomain(input)) {
    if (!supportedDomainTld(input)) {
      return {
        ok: false,
        error: `Supported: ${SUPPORTED_TLDS.map((t) => `.${t}`).join(" · ")}`,
      };
    }
    return resolveOne(input.toLowerCase());
  }

  // bare name
  const bare = input.toLowerCase().replace(/^\@/, "");
  for (const tld of TRY_TLDS) {
    const r = await resolveOne(`${bare}.${tld}`);
    if (r.ok) return r;
  }
  return {
    ok: false,
    error: `${bare} not found on .sol · .sns · .skr · .bonk`,
  };
}

export function IdNameClient({ name }: { name: string }) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<ResolveOk | ResolveErr | null>(null);
  const [query, setQuery] = useState(name);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setResult(null);
    setQuery(name);
    resolveSmart(name)
      .then((r) => {
        if (!cancelled) setResult(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [name]);

  const displayDomain = useMemo(() => {
    if (!result || !result.ok) return name;
    return result.resolvedAs || result.domain || name;
  }, [result, name]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const path = q.includes("/") ? q : `/id/${encodeURIComponent(q)}`;
    window.location.href = path.startsWith("/id/") ? path : `/id/${encodeURIComponent(q)}`;
  };

  const copyOwner = async (owner: string) => {
    try {
      await navigator.clipboard.writeText(owner);
      toast.success("Address copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col pb-20 sm:pb-0">
      <Navbar />
      <main className="flex-1 flex flex-col items-center px-4 py-8 sm:py-12">
        <PageTransition>
          <div className="w-full max-w-lg space-y-6">
            <div className="text-center space-y-2">
              <Search size={28} className="mx-auto text-purple-400" />
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Solana name
              </h1>
              <p className="text-sm text-gray-500 dark:text-white/50">
                SNS · ADNS · SKR — {NAME_HINT}
              </p>
            </div>

            <form onSubmit={onSearch} className="relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="metasal.sol · name.skr · name.bonk"
                className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl px-5 py-4 pr-24 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-purple-400/50 transition text-base"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-sm font-semibold px-4 py-2"
              >
                Go
              </button>
            </form>

            {loading && (
              <div className="flex items-center justify-center gap-2 py-10 text-gray-500 dark:text-white/40 text-sm">
                <Spinner size={20} /> Resolving…
              </div>
            )}

            {!loading && result && !result.ok && (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/5 p-5 space-y-3">
                <p className="font-semibold text-red-400">Not found</p>
                <p className="text-sm text-gray-600 dark:text-white/60 break-all">
                  {result.error || "Could not resolve"}
                </p>
                <Link
                  href="/id"
                  className="inline-flex items-center gap-1.5 text-sm text-purple-400 hover:text-purple-300"
                >
                  Register a .sol <ArrowRight size={14} />
                </Link>
              </div>
            )}

            {!loading && result?.ok && (
              <div className="rounded-2xl border border-purple-400/30 bg-purple-500/5 p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CheckCircle2 size={18} className="text-green-400 shrink-0" />
                      <span className="font-semibold text-xl truncate">
                        {displayDomain}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-white/40 mt-1 uppercase tracking-wider">
                      {kindLabel(result.kind, result.tld)}
                      {result.resolvedAs ? ` · via ${result.resolvedAs}` : ""}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-white/40">
                    Owner
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs sm:text-sm font-mono break-all flex-1">
                      {result.owner}
                    </code>
                    <button
                      type="button"
                      onClick={() => copyOwner(result.owner)}
                      className="shrink-0 p-2 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 text-gray-500"
                      aria-label="Copy address"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-white/40 font-mono">
                    {shortAddr(result.owner, 6)}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/portfolio/${encodeURIComponent(displayDomain)}`}
                    className="flex items-center justify-center gap-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-semibold px-4 py-3 text-sm transition"
                  >
                    <Wallet size={16} /> Portfolio
                  </Link>
                  <Link
                    href={`/address/${encodeURIComponent(result.owner)}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-black/10 dark:border-white/15 hover:border-purple-400/50 px-4 py-3 text-sm font-medium transition"
                  >
                    Address <ExternalLink size={14} />
                  </Link>
                  <Link
                    href={`/wallet/send?to=${encodeURIComponent(displayDomain)}`}
                    className="flex items-center justify-center gap-2 rounded-xl border border-black/10 dark:border-white/15 hover:border-purple-400/50 px-4 py-3 text-sm font-medium transition sm:col-span-2"
                  >
                    Send to {displayDomain} <ArrowRight size={14} />
                  </Link>
                </div>

                <IdNameShare
                  domain={displayDomain}
                  owner={result.owner}
                  kindLabel={kindLabel(result.kind, result.tld)}
                />

                <p className="text-center text-[11px] text-gray-500 dark:text-white/40">
                  <Link href="/id" className="text-purple-400 hover:underline">
                    Register .sol
                  </Link>
                  {" · "}
                  <a
                    href={`/address/${result.owner}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    Solscan
                  </a>
                </p>
              </div>
            )}

            <div className="flex flex-wrap justify-center gap-2 text-[11px] text-gray-500 dark:text-white/40">
              {SUPPORTED_TLDS.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-black/10 dark:border-white/10 px-2.5 py-1 font-mono"
                >
                  .{t}
                </span>
              ))}
            </div>
          </div>
        </PageTransition>
      </main>
    </div>
  );
}
