import { NextRequest, NextResponse } from "next/server";
import {
  initDb,
  createShortLink,
  getShortLink,
  shortLinkCodeExists,
  getWalletShortLinks,
} from "@/lib/db";
import {
  isValidCustomCode,
  normalizeCode,
  normalizeTargetUrl,
  randomShortCode,
  absoluteShortUrl,
} from "@/lib/short-link";

export const runtime = "nodejs";

function originFrom(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "sol.new";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/** Create a short link. Body: { url, code?, title?, wallet? } */
export async function POST(req: NextRequest) {
  try {
    await initDb();
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      code?: string;
      title?: string;
      wallet?: string;
    };

    const target = normalizeTargetUrl(body.url || "");
    if (!target.ok) {
      return NextResponse.json({ ok: false, error: target.error }, { status: 400 });
    }

    const title = body.title?.trim().slice(0, 120) || null;
    const wallet = body.wallet?.trim().slice(0, 64) || null;

    let code: string;
    if (body.code?.trim()) {
      code = normalizeCode(body.code);
      if (!isValidCustomCode(code)) {
        return NextResponse.json(
          {
            ok: false,
            error: "Custom code: 2–32 chars, letters/numbers/_/-, not reserved",
          },
          { status: 400 }
        );
      }
      if (await shortLinkCodeExists(code)) {
        return NextResponse.json({ ok: false, error: "That short code is taken" }, { status: 409 });
      }
    } else {
      // retry a few times on collision
      code = randomShortCode(7);
      for (let i = 0; i < 6 && (await shortLinkCodeExists(code)); i++) {
        code = randomShortCode(7 + (i > 2 ? 1 : 0));
      }
      if (await shortLinkCodeExists(code)) {
        return NextResponse.json({ ok: false, error: "Could not allocate a code. Try again." }, { status: 500 });
      }
    }

    const saved = await createShortLink({
      code,
      targetUrl: target.url,
      title,
      wallet,
    });
    if (!saved) {
      return NextResponse.json({ ok: false, error: "Could not save link" }, { status: 500 });
    }

    const origin = originFrom(req);
    const shortUrl = absoluteShortUrl(code, origin);
    return NextResponse.json({
      ok: true,
      code,
      shortUrl,
      path: `/l/${code}`,
      targetUrl: target.url,
      title,
    });
  } catch (e) {
    console.error("link POST", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}

/** Lookup a code (?code=) or list links for a wallet (?wallet=). */
export async function GET(req: NextRequest) {
  try {
    await initDb();
    const code = req.nextUrl.searchParams.get("code")?.trim();
    const wallet = req.nextUrl.searchParams.get("wallet")?.trim();

    if (code) {
      const link = await getShortLink(normalizeCode(code));
      if (!link) {
        return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
      }
      if (link.expiresAt && Date.parse(link.expiresAt) < Date.now()) {
        return NextResponse.json({ ok: false, error: "Link expired" }, { status: 410 });
      }
      const origin = originFrom(req);
      return NextResponse.json({
        ok: true,
        ...link,
        shortUrl: absoluteShortUrl(link.code, origin),
      });
    }

    if (wallet) {
      const links = await getWalletShortLinks(wallet, 50);
      const origin = originFrom(req);
      return NextResponse.json({
        ok: true,
        links: links.map((l) => ({
          ...l,
          shortUrl: absoluteShortUrl(l.code, origin),
        })),
      });
    }

    return NextResponse.json({ ok: false, error: "Pass ?code= or ?wallet=" }, { status: 400 });
  } catch (e) {
    console.error("link GET", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}
