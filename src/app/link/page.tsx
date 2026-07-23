"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link2, Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { AnimatedIcon } from "@/components/animated-icon";
import { useWallet } from "@/lib/wallet-context";
import { absoluteShortUrl } from "@/lib/short-link";

type Created = {
  code: string;
  shortUrl: string;
  targetUrl: string;
  title: string | null;
};

type HistoryEntry = {
  code: string;
  shortUrl: string;
  targetUrl: string;
  title?: string | null;
  createdAt: string;
};

const HISTORY_KEY = "sol.new.shortLinks";

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(entry: HistoryEntry) {
  const list = loadHistory().filter((e) => e.code !== entry.code);
  list.unshift(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 40)));
}

const ERROR_COPY: Record<string, string> = {
  missing: "That short link was not found.",
  expired: "That short link has expired.",
  invalid: "Invalid short link.",
  error: "Something went wrong resolving the link.",
};

export default function LinkPage() {
  return (
    <Suspense fallback={<LinkShell />}>
      <LinkPageInner />
    </Suspense>
  );
}

function LinkShell({ children }: { children?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col">
      <Navbar />
      <main className="flex-1 flex flex-col px-4 py-4 sm:px-6 sm:py-8 sm:items-center">
        {children ?? (
          <div className="w-full sm:max-w-lg text-center text-gray-400 py-16">Loading…</div>
        )}
      </main>
    </div>
  );
}

function LinkPageInner() {
  const search = useSearchParams();
  const { publicKey } = useWallet();
  const [url, setUrl] = useState("");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const banner = search.get("e");

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    if (banner && ERROR_COPY[banner]) {
      setError(ERROR_COPY[banner] + (search.get("code") ? ` (${search.get("code")})` : ""));
    }
  }, [banner, search]);

  const create = useCallback(async () => {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      const res = await fetch("/api/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          code: custom.trim() || undefined,
          title: title.trim() || undefined,
          wallet: publicKey || undefined,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        code?: string;
        shortUrl?: string;
        targetUrl?: string;
        title?: string | null;
      };
      if (!res.ok || !data.ok || !data.code || !data.shortUrl || !data.targetUrl) {
        throw new Error(data.error || "Could not create link");
      }
      const entry: Created = {
        code: data.code,
        shortUrl: data.shortUrl,
        targetUrl: data.targetUrl,
        title: data.title ?? null,
      };
      setCreated(entry);
      saveHistory({
        ...entry,
        createdAt: new Date().toISOString(),
      });
      setHistory(loadHistory());
      setUrl("");
      setCustom("");
      setTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [url, custom, title, publicKey]);

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <LinkShell>
        <div className="w-full sm:max-w-lg space-y-8">
          <div className="text-center space-y-3">
            <AnimatedIcon icon={Link2} size={40} className="text-sky-400" />
            <h1 className="text-3xl font-bold tracking-tight">Short links</h1>
            <p className="text-gray-500 dark:text-white/50">
              Turn any URL into <span className="font-mono text-sky-500">sol.new/l/…</span>. Free,
              stored on Turso.
            </p>
          </div>

          <div className="space-y-3">
            <input
              type="url"
              placeholder="https://…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && url && !busy) void create();
              }}
              disabled={busy}
              className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3.5 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-white/30 focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition font-mono text-sm disabled:opacity-50"
            />
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-white/30 font-mono">
                  /l/
                </span>
                <input
                  type="text"
                  placeholder="custom (optional)"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32))}
                  disabled={busy}
                  className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm font-mono focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition disabled:opacity-50"
                />
              </div>
              <input
                type="text"
                placeholder="Label (optional)"
                value={title}
                maxLength={80}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                className="flex-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-sky-400/50 focus:ring-1 focus:ring-sky-400/25 transition disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-500 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              onClick={() => void create()}
              disabled={!url.trim() || busy}
              className="w-full bg-sky-500 hover:bg-sky-400 disabled:bg-black/10 dark:disabled:bg-white/10 disabled:text-gray-400 dark:disabled:text-white/30 text-white font-semibold rounded-xl px-4 py-3.5 transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Creating…
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4" /> Create short link
                </>
              )}
            </button>
            <p className="text-center text-xs text-gray-400 dark:text-white/30">
              {publicKey
                ? "Linked to your connected wallet for later lookup."
                : "No wallet required. Connect to attach links to your wallet."}
            </p>
          </div>

          {created && (
            <div className="bg-sky-500/10 border border-sky-400/30 rounded-2xl p-5 space-y-3">
              <p className="text-xs font-medium text-sky-600 dark:text-sky-400 uppercase tracking-wide">
                Your short link
              </p>
              <p className="font-mono text-lg font-semibold break-all text-sky-700 dark:text-sky-300">
                {created.shortUrl}
              </p>
              <p className="text-xs text-gray-500 dark:text-white/40 truncate" title={created.targetUrl}>
                → {created.targetUrl}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => void copy(created.shortUrl)}
                  className="flex-1 bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl px-4 py-2.5 transition cursor-pointer flex items-center justify-center gap-1.5 text-sm"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" /> Copy
                    </>
                  )}
                </button>
                <a
                  href={created.shortUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10 rounded-xl px-4 py-2.5 transition hover:bg-black/10 dark:hover:bg-white/15 flex items-center"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-600 dark:text-white/60">
                Recent on this device
              </h2>
              {history.map((h) => (
                <div
                  key={h.code}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono font-medium truncate">
                      {h.shortUrl || absoluteShortUrl(h.code)}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-white/30 truncate">
                      {h.title ? `${h.title} · ` : ""}
                      {h.targetUrl}
                    </p>
                  </div>
                  <button
                    onClick={() => void copy(h.shortUrl || absoluteShortUrl(h.code))}
                    className="text-xs text-gray-500 dark:text-white/50 hover:text-sky-500 transition cursor-pointer flex items-center gap-1"
                  >
                    <Copy size={12} /> Copy
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
    </LinkShell>
  );
}
