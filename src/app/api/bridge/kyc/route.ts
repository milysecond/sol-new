import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  initDb,
  upsertBridgeCustomer,
  getBridgeCustomerByWallet,
} from "@/lib/db";
import { bridgeConfigured, createKycLink, getKycLink } from "@/lib/bridge";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recentIPs = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const ts = (recentIPs.get(ip) || []).filter((t) => now - t < 60_000);
  if (ts.length >= 8) return true;
  ts.push(now);
  recentIPs.set(ip, ts);
  return false;
}

/** GET ?wallet= — stored Bridge customer / KYC status for a wallet. */
export async function GET(req: NextRequest) {
  if (!bridgeConfigured()) {
    return NextResponse.json({ ok: false, error: "Bridge not configured", configured: false });
  }
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  await initDb();
  const row = await getBridgeCustomerByWallet(wallet);
  if (!row) {
    return NextResponse.json({ ok: true, configured: true, customer: null });
  }

  // Refresh KYC status from Bridge when we have a link id
  if (row.kycLinkId) {
    try {
      const remote = await getKycLink(row.kycLinkId);
      if (remote.ok && remote.data) {
        const d = remote.data as Record<string, unknown>;
        await upsertBridgeCustomer({
          wallet,
          email: row.email,
          customerId: (d.customer_id as string) || row.customerId,
          kycLinkId: row.kycLinkId,
          kycStatus: (d.kyc_status as string) || row.kycStatus,
          tosStatus: (d.tos_status as string) || row.tosStatus,
          kycUrl: (d.kyc_link as string) || row.kycUrl,
          tosUrl: (d.tos_link as string) || row.tosUrl,
        });
        const fresh = await getBridgeCustomerByWallet(wallet);
        return NextResponse.json({ ok: true, configured: true, customer: fresh });
      }
    } catch {
      /* use cached */
    }
  }

  return NextResponse.json({ ok: true, configured: true, customer: row });
}

/**
 * POST { wallet, email, fullName? }
 * Starts Bridge hosted KYC + ToS. Returns URLs to complete onboarding.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!bridgeConfigured()) {
    return NextResponse.json({ error: "Bridge not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    email?: string;
    fullName?: string;
  };

  const wallet = body.wallet?.trim() || "";
  const email = body.email?.trim().toLowerCase() || "";
  if (!wallet || !email) {
    return NextResponse.json({ error: "wallet and email required" }, { status: 400 });
  }
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const origin =
    req.headers.get("origin") ||
    (req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : "https://sol.new");
  const redirectUri = `${origin}/get?bridge=kyc_done`;

  await initDb();

  // Reuse existing approved customer
  const existing = await getBridgeCustomerByWallet(wallet);
  if (existing?.kycStatus === "approved" && existing.customerId) {
    return NextResponse.json({
      ok: true,
      alreadyApproved: true,
      customer: existing,
    });
  }

  const idem = `kyc-${wallet}-${email}`.slice(0, 64);
  const res = await createKycLink({
    email,
    fullName: body.fullName?.trim() || undefined,
    redirectUri,
    idempotencyKey: idem,
  });

  if (!res.ok) {
    console.error("[bridge/kyc]", res.status, res.data);
    return NextResponse.json(
      { error: (res.data as { message?: string })?.message || "Bridge KYC failed", details: res.data },
      { status: res.status >= 400 ? res.status : 502 }
    );
  }

  const d = res.data as Record<string, unknown>;
  await upsertBridgeCustomer({
    wallet,
    email,
    customerId: (d.customer_id as string) || null,
    kycLinkId: (d.id as string) || null,
    kycStatus: (d.kyc_status as string) || "not_started",
    tosStatus: (d.tos_status as string) || "pending",
    kycUrl: (d.kyc_link as string) || null,
    tosUrl: (d.tos_link as string) || null,
  });

  notifyEvent({
    kind: "bridge_kyc_started",
    title: "Bridge KYC started",
    fields: { wallet, email, customerId: d.customer_id as string },
  }).catch(() => {});

  const customer = await getBridgeCustomerByWallet(wallet);
  return NextResponse.json({
    ok: true,
    customer,
    kycUrl: d.kyc_link,
    tosUrl: d.tos_link,
  });
}
