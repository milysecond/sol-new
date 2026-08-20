import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set(["memes.sol.new", "www.memes.sol.new"]);

/**
 * Same-origin proxy for meme blank images.
 * memes.sol.new serves templates without CORS, so crossOrigin=anonymous
 * breaks <img> + canvas on sol.new. Proxying keeps canvas untainted.
 */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) {
    return NextResponse.json({ error: "url required" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (target.protocol !== "https:" || !ALLOWED_HOSTS.has(target.hostname)) {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  // Only template/static image paths
  if (
    !target.pathname.startsWith("/templates/") &&
    !target.pathname.startsWith("/api/blank")
  ) {
    return NextResponse.json({ error: "path not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        Accept: "image/*,*/*",
        // Some blank endpoints check origin/referer
        Referer: "https://memes.sol.new/",
        Origin: "https://memes.sol.new",
      },
      // CF Workers: no caching of failures
      cache: "force-cache",
    });

    if (!upstream.ok) {
      return NextResponse.json(
        { error: "upstream failed", status: upstream.status },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = await upstream.arrayBuffer();

    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "proxy failed" },
      { status: 502 },
    );
  }
}
