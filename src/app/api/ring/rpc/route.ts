import { NextResponse } from "next/server";
import { checkRpcBody, forwardWithFailover, isAllowedOrigin, ringEndpoints } from "@/lib/ring/proxy";

export const dynamic = "force-dynamic";

/**
 * Solana JSON-RPC for /ring through the Helius named-host pool (Worker secret
 * HELIUS_SPR_RPC_URLS). Allow-listed methods only; hosts never reach the browser.
 */
export async function POST(req: Request) {
  if (!isAllowedOrigin(req.headers.get("origin"), req.url)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const endpoints = ringEndpoints();
  if (endpoints.length === 0) {
    return NextResponse.json({ error: "Ring isn't configured on this deployment yet." }, { status: 503 });
  }
  const text = await req.text();
  const check = checkRpcBody(text);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  const out = await forwardWithFailover({ endpoints, url: (e) => e, body: text });
  return new Response(out.body, {
    status: out.status,
    headers: { "content-type": out.contentType, "cache-control": "no-store" },
  });
}
