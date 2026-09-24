import { NextRequest, NextResponse } from "next/server";

const ORIGIN = "https://zk.sol.new";
const ALLOW = new Set(["GET", "POST", "HEAD"]);

function safeParts(parts: string[]): string | null {
  if (!parts.length || parts.length > 12) return null;
  for (const p of parts) {
    if (!p || p === "." || p === ".." || p.includes(":") || p.includes("\\") || p.length > 120) {
      return null;
    }
    if (!/^[A-Za-z0-9._\-+=%@]+$/.test(p)) return null;
  }
  return parts.join("/");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  if (!ALLOW.has(req.method)) {
    return NextResponse.json({ error: "method" }, { status: 405 });
  }
  const { path } = await ctx.params;
  const joined = safeParts(path || []);
  if (!joined) return NextResponse.json({ error: "bad path" }, { status: 400 });

  const top = new Set(["config", "deposit", "withdraw", "deposit/spl", "withdraw/spl", "relayer", "balance"]);
  const dest = top.has(joined) || joined.startsWith("balance/")
    ? `${ORIGIN}/v1/${joined}`
    : `${ORIGIN}/v1/indexer/${joined}`;
  const target = new URL(dest);
  req.nextUrl.searchParams.forEach((v, k) => {
    if (k.length <= 40 && v.length <= 200) target.searchParams.set(k, v);
  });

  const headers: Record<string, string> = {
    Accept: req.headers.get("accept") || "application/json",
    "User-Agent": "sol.new",
  };
  const ct = req.headers.get("content-type");
  if (ct) headers["Content-Type"] = ct;

  const init: RequestInit = { method: req.method, headers };
  if (req.method === "POST") {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 2_000_000) {
      return NextResponse.json({ error: "body too large" }, { status: 413 });
    }
    init.body = buf;
  }

  const res = await fetch(target, init);
  const out = await res.arrayBuffer();
  return new NextResponse(out, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export const GET = proxy;
export const POST = proxy;
export const HEAD = proxy;
