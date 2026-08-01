import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Calendar, ExternalLink, Link2, MousePointerClick, ShieldAlert } from "lucide-react";
import { initDb, getShortLink, incrementShortLinkClicks } from "@/lib/db";
import {
  absoluteShortUrl,
  describeShortLinkDestination,
  formatShortLinkCreated,
  isTrustedShortLinkHost,
  normalizeCode,
  shortLinkDisplayTitle,
  shortPath,
} from "@/lib/short-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function loadLink(rawCode: string) {
  const code = normalizeCode(rawCode || "");
  if (!code || code.length > 32) return { code, link: null as null, invalid: true as const };

  await initDb();
  const link = await getShortLink(code);
  if (!link) return { code, link: null, invalid: false as const };
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    return { code, link: null, expired: true as const, invalid: false as const };
  }
  return { code, link, invalid: false as const };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code: raw } = await params;
  const { code, link } = await loadLink(raw);

  if (!link) {
    return {
      title: `Short link ${shortPath(code || "…")} — sol.new`,
      description: "sol.new short link. Create free short URLs for Solana tools and the open web.",
    };
  }

  const dest = describeShortLinkDestination(link.targetUrl);
  const title = shortLinkDisplayTitle(link.title, dest);
  const description = [
    dest.summary,
    dest.host ? `Destination: ${dest.host}.` : null,
    link.clicks > 0 ? `${link.clicks.toLocaleString()} opens.` : null,
    "Shared via sol.new short links.",
  ]
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);

  const url = absoluteShortUrl(code);
  return {
    title: `${title} — sol.new${shortPath(code)}`,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: "sol.new",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      creator: "@soldotnew",
    },
  };
}

/**
 * Short link landing:
 * - Trusted sol.new destinations: immediate redirect
 * - External destinations: informative interstitial until user confirms (?go=1)
 */
export default async function ShortLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ go?: string }>;
}) {
  const { code: raw } = await params;
  const { go } = await searchParams;
  const loaded = await loadLink(raw);

  if (loaded.invalid) redirect("/link?e=invalid");
  if ("expired" in loaded && loaded.expired) {
    redirect(`/link?e=expired&code=${encodeURIComponent(loaded.code)}`);
  }
  if (!loaded.link) {
    redirect(`/link?e=missing&code=${encodeURIComponent(loaded.code)}`);
  }

  const { code, link } = loaded;
  const dest = describeShortLinkDestination(link.targetUrl);
  const trusted = isTrustedShortLinkHost(dest.hostname);
  const confirmed = go === "1";

  if (trusted || confirmed) {
    incrementShortLinkClicks(code).catch(() => {});
    redirect(link.targetUrl);
  }

  const displayTitle = shortLinkDisplayTitle(link.title, dest);
  const createdLabel = formatShortLinkCreated(link.createdAt);
  const KindIcon = dest.kind === "Calendar" ? Calendar : Link2;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="text-center space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-sky-500">
            sol.new short link
          </p>
          <div className="inline-flex items-center justify-center gap-2 rounded-full border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] px-3 py-1 text-[11px] font-medium text-gray-600 dark:text-white/60">
            <KindIcon className="w-3.5 h-3.5 text-sky-500" aria-hidden />
            {dest.kind}
            <span className="text-black/20 dark:text-white/20">·</span>
            <span className="font-mono">{shortPath(code)}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
            {displayTitle}
          </h1>
          <p className="text-sm text-gray-500 dark:text-white/50 text-pretty">{dest.summary}</p>
        </div>

        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.02] dark:bg-white/[0.03] overflow-hidden">
          <div className="flex items-start gap-3 px-4 py-4 border-b border-black/5 dark:border-white/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={dest.faviconUrl}
              alt=""
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl bg-white dark:bg-white/10 border border-black/10 dark:border-white/10 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 text-left flex-1">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/30 mb-0.5">
                Destination
              </p>
              <p className="font-semibold text-sm truncate">{dest.siteName}</p>
              <p className="font-mono text-xs text-sky-600 dark:text-sky-400 break-all">{dest.host}</p>
            </div>
            <ExternalLink className="w-4 h-4 text-gray-400 dark:text-white/30 shrink-0 mt-1" aria-hidden />
          </div>

          <div className="px-4 py-3 text-left space-y-2">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/30 mb-1">
                Full URL
              </p>
              <p className="font-mono text-[11px] leading-relaxed text-gray-600 dark:text-white/55 break-all">
                {link.targetUrl}
              </p>
            </div>
            {link.title?.trim() && (
              <div>
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/30 mb-1">
                  Label
                </p>
                <p className="text-sm text-gray-800 dark:text-white/80">{link.title.trim()}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-px bg-black/5 dark:bg-white/10 border-t border-black/5 dark:border-white/5">
            <div className="bg-white dark:bg-black px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/30 flex items-center gap-1">
                <MousePointerClick className="w-3 h-3" aria-hidden />
                Opens
              </p>
              <p className="text-lg font-semibold tabular-nums mt-0.5">
                {link.clicks.toLocaleString()}
              </p>
            </div>
            <div className="bg-white dark:bg-black px-4 py-3 text-left">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-white/30">
                Created
              </p>
              <p className="text-lg font-semibold mt-0.5">{createdLabel ?? "—"}</p>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-left">
          <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" aria-hidden />
          <p className="text-xs text-amber-900/80 dark:text-amber-100/70 leading-relaxed">
            You are leaving sol.new. sol.new does not control{" "}
            <span className="font-medium">{dest.siteName}</span>. Only continue if you trust this
            destination.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href={`${shortPath(code)}?go=1`}
            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl px-4 py-3.5 transition text-center inline-flex items-center justify-center gap-2"
          >
            {dest.continueLabel}
            <ExternalLink className="w-4 h-4 opacity-90" aria-hidden />
          </Link>
          <Link
            href="/link"
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 transition text-center text-sm"
          >
            Cancel
          </Link>
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-white/30">
          Make your own free short links at{" "}
          <Link href="/link" className="text-sky-500 hover:text-sky-400 font-medium">
            sol.new/link
          </Link>
        </p>
      </div>
    </div>
  );
}
