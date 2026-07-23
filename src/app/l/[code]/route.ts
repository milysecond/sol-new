import { NextRequest, NextResponse } from "next/server";
import { initDb, getShortLink, incrementShortLinkClicks } from "@/lib/db";
import { normalizeCode } from "@/lib/short-link";

export const runtime = "nodejs";

/**
 * Public short-link redirect: sol.new/l/{code} → target URL.
 * 302 so targets stay mutable; clicks counted best-effort.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ code: string }> }
) {
  const { code: raw } = await ctx.params;
  const code = normalizeCode(raw || "");

  if (!code || code.length > 32) {
    return NextResponse.redirect(new URL("/link?e=invalid", req.url), 302);
  }

  try {
    await initDb();
    const link = await getShortLink(code);
    if (!link) {
      return NextResponse.redirect(new URL(`/link?e=missing&code=${encodeURIComponent(code)}`, req.url), 302);
    }
    if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
      return NextResponse.redirect(new URL(`/link?e=expired&code=${encodeURIComponent(code)}`, req.url), 302);
    }

    // fire-and-forget click count (do not block redirect on failure)
    incrementShortLinkClicks(code).catch(() => {});

    return NextResponse.redirect(link.targetUrl, 302);
  } catch (e) {
    console.error("short link redirect", e);
    return NextResponse.redirect(new URL("/link?e=error", req.url), 302);
  }
}
