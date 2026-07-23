import { NextRequest, NextResponse } from "next/server";
import { initDb, listShortLinks, deleteShortLink } from "@/lib/db";
import { absoluteShortUrl, normalizeCode } from "@/lib/short-link";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function auth(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  return secret && secret === process.env.ADMIN_SECRET;
}

function originFrom(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "sol.new";
  const proto = req.headers.get("x-forwarded-proto") || "https";
  return `${proto}://${host}`;
}

/** List recent short links (admin). */
export async function GET(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const origin = originFrom(req);
  const links = await listShortLinks(200);
  return NextResponse.json({
    links: links.map((l) => ({
      ...l,
      shortUrl: absoluteShortUrl(l.code, origin),
    })),
  });
}

/** Delete a short link. Body: { code } */
export async function DELETE(req: NextRequest) {
  if (!auth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await initDb();
  const body = (await req.json().catch(() => ({}))) as { code?: string };
  const code = body.code ? normalizeCode(body.code) : "";
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  const ok = await deleteShortLink(code);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, code });
}
