import { NextResponse } from "next/server";
import {
  checkSprBody,
  forwardWithFailover,
  isAllowedOrigin,
  ringEndpoints,
  sprUpstreamUrl,
} from "@/lib/ring/proxy";

export const dynamic = "force-dynamic";

/**
 * Privacy indexer (Photon) for /ring: `POST /api/ring/spr/<method>` →
 * `{named host}/v1/spr/<method>`. The SDK's `indexerUrl` points here, so the
 * browser only ever sees sol.new. Responses carry encrypted state only.
 */
export async function POST(req: Request, ctx: { params: Promise<{ method: string }> }) {
  if (!isAllowedOrigin(req.headers.get("origin"), req.url)) {
    return NextResponse.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  const { method } = await ctx.params;
  const endpoints = ringEndpoints();
  if (endpoints.length === 0) {
    return NextResponse.json({ error: "Ring isn't configured on this deployment yet." }, { status: 503 });
  }
  const text = await req.text();
  const check = checkSprBody(text, method);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: check.status });
  const out = await forwardWithFailover({ endpoints, url: (e) => sprUpstreamUrl(e, method), body: text });
  return new Response(out.body, {
    status: out.status,
    headers: { "content-type": out.contentType, "cache-control": "no-store" },
  });
}
