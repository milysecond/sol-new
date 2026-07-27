import Link from "next/link";
import { redirect } from "next/navigation";
import { initDb, getShortLink, incrementShortLinkClicks } from "@/lib/db";
import { isTrustedShortLinkHost, normalizeCode } from "@/lib/short-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Short link landing:
 * - Trusted sol.new destinations: immediate redirect
 * - External destinations: interstitial until user confirms (?go=1)
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
  const code = normalizeCode(raw || "");

  if (!code || code.length > 32) {
    redirect("/link?e=invalid");
  }

  await initDb();
  const link = await getShortLink(code);
  if (!link) {
    redirect(`/link?e=missing&code=${encodeURIComponent(code)}`);
  }
  if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
    redirect(`/link?e=expired&code=${encodeURIComponent(code)}`);
  }

  let hostname = "";
  try {
    hostname = new URL(link.targetUrl).hostname;
  } catch {
    redirect("/link?e=invalid");
  }

  const trusted = isTrustedShortLinkHost(hostname);
  const confirmed = go === "1";

  if (trusted || confirmed) {
    incrementShortLinkClicks(code).catch(() => {});
    redirect(link.targetUrl);
  }

  // External: count preview as soft engagement only when they continue
  let displayHost = hostname;
  try {
    displayHost = new URL(link.targetUrl).host;
  } catch {
    /* keep */
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-500">sol.new short link</p>
        <h1 className="text-2xl font-bold tracking-tight">You are leaving sol.new</h1>
        <p className="text-sm text-gray-500 dark:text-white/50">
          This short link points to an external site. Only continue if you trust the destination.
        </p>
        {link.title && (
          <p className="text-sm font-medium text-gray-700 dark:text-white/80">{link.title}</p>
        )}
        <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl px-4 py-3 text-left">
          <p className="text-[10px] uppercase text-gray-400 dark:text-white/30 mb-1">Destination</p>
          <p className="font-mono text-sm break-all text-sky-600 dark:text-sky-400">{displayHost}</p>
          <p className="font-mono text-xs text-gray-500 dark:text-white/40 break-all mt-1">{link.targetUrl}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link
            href={`/l/${code}?go=1`}
            className="w-full bg-sky-500 hover:bg-sky-400 text-white font-semibold rounded-xl px-4 py-3.5 transition text-center"
          >
            Continue to external site
          </Link>
          <Link
            href="/link"
            className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-gray-600 dark:text-white/60 rounded-xl px-4 py-3 transition text-center text-sm"
          >
            Cancel
          </Link>
        </div>
        <p className="text-[11px] text-gray-400 dark:text-white/30">
          Short code <span className="font-mono">/l/{code}</span>
        </p>
      </div>
    </div>
  );
}
