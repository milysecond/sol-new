import { NextResponse } from "next/server";
import { initDb, getImageRef } from "@/lib/db";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> }
) {
  const { file } = await ctx.params;
  const dot = file.lastIndexOf(".");
  if (dot < 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const id = file.slice(0, dot);
  if (!/^[a-f0-9]{16}$/.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await initDb();
  const ref = await getImageRef(id);
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const upstream = await fetch(ref.url);
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "Upstream fetch failed" }, { status: 502 });
  }

  const headers = new Headers();
  headers.set("content-type", ref.contentType);
  headers.set("cache-control", "public, max-age=31536000, immutable");
  headers.set("access-control-allow-origin", "*");
  const len = upstream.headers.get("content-length");
  if (len) headers.set("content-length", len);

  return new NextResponse(upstream.body, { status: 200, headers });
}
