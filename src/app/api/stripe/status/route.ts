import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envVar(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (v) return v;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require("@opennextjs/cloudflare") as {
      getCloudflareContext: (opts?: { async?: boolean }) => { env?: Record<string, unknown> };
    };
    const ctx = getCloudflareContext();
    const x = ctx?.env?.[name];
    if (typeof x === "string" && x.trim()) return x.trim();
  } catch {
    /* ignore */
  }
  return undefined;
}

/** GET — lightweight Stripe readiness for /sub UI */
export async function GET() {
  const key = envVar("STRIPE_SECRET_KEY");
  if (!key) {
    return NextResponse.json({
      configured: false,
      charges_enabled: false,
      card_payments: "unknown",
    });
  }

  try {
    const res = await fetch("https://api.stripe.com/v1/account", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const d = (await res.json()) as {
      charges_enabled?: boolean;
      payouts_enabled?: boolean;
      capabilities?: Record<string, string>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return NextResponse.json({
        configured: true,
        error: d.error?.message || `status ${res.status}`,
        charges_enabled: false,
      });
    }
    return NextResponse.json({
      configured: true,
      charges_enabled: Boolean(d.charges_enabled),
      payouts_enabled: Boolean(d.payouts_enabled),
      card_payments: d.capabilities?.card_payments || "unknown",
      link_payments: d.capabilities?.link_payments || "unknown",
      klarna_payments: d.capabilities?.klarna_payments || "unknown",
    });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      error: e instanceof Error ? e.message : "status fetch failed",
      charges_enabled: false,
    });
  }
}
