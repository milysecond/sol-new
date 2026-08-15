import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  initDb,
  upsertBridgeCustomer,
  getBridgeCustomerByWallet,
} from "@/lib/db";
import {
  bridgeConfigured,
  createKycLink,
  getKycLink,
  isBridgeCustomerReady,
} from "@/lib/bridge";
import { notifyEvent } from "@/lib/notify";
import { resendConfigured, sendEmail, SITE_URL } from "@/lib/resend";

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

const noStore = { "Cache-Control": "no-store" };

function customerReady(c: { kycStatus?: string | null; tosStatus?: string | null }) {
  return isBridgeCustomerReady(c.kycStatus, c.tosStatus);
}

async function emailOnboardingLinks(opts: {
  email: string;
  tosUrl?: string | null;
  kycUrl?: string | null;
}) {
  if (!resendConfigured()) return { sent: false as const, reason: "resend_unconfigured" };
  const tos = opts.tosUrl?.trim();
  const kyc = opts.kycUrl?.trim();
  if (!tos && !kyc) return { sent: false as const, reason: "no_links" };

  const steps: string[] = [];
  if (tos) {
    steps.push(
      `<li style="margin-bottom:10px"><strong>1. Accept Bridge terms</strong><br/><a href="${tos}">${tos}</a></li>`,
    );
  }
  if (kyc) {
    const n = tos ? "2" : "1";
    steps.push(
      `<li style="margin-bottom:10px"><strong>${n}. Verify your identity</strong><br/><a href="${kyc}">${kyc}</a></li>`,
    );
  }

  try {
    await sendEmail({
      to: opts.email,
      subject: "Complete verification to get USDC on sol.new",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.5;color:#111">
          <p>You started Get USDC on <a href="${SITE_URL}/get">sol.new/get</a>.</p>
          <p>Bridge requires two steps (you do both; nothing to do in a dashboard):</p>
          <ol style="padding-left:18px">${steps.join("")}</ol>
          <p>When both are done, return to <a href="${SITE_URL}/get">${SITE_URL}/get</a> and tap <strong>Refresh status</strong>, then create your deposit. We will email bank deposit instructions.</p>
          <p style="color:#666;font-size:12px">If a link expired, start again from sol.new/get with the same email.</p>
        </div>
      `,
      text: [
        "Complete verification to get USDC on sol.new",
        tos ? `1. Accept Bridge terms: ${tos}` : "",
        kyc ? `${tos ? "2" : "1"}. Verify identity: ${kyc}` : "",
        `Then return to ${SITE_URL}/get`,
      ]
        .filter(Boolean)
        .join("\n"),
      tags: [
        { name: "kind", value: "bridge_kyc_onboarding" },
      ],
    });
    return { sent: true as const };
  } catch (e) {
    console.error("[bridge/kyc] onboarding email failed", e);
    return { sent: false as const, reason: "send_failed" };
  }
}

/** GET ?wallet= optional — Bridge configured flag + optional customer for wallet. */
export async function GET(req: NextRequest) {
  const configured = bridgeConfigured();
  if (!configured) {
    return NextResponse.json(
      { ok: false, error: "Bridge not configured", configured: false },
      { headers: noStore },
    );
  }

  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  if (!wallet) {
    return NextResponse.json({ ok: true, configured: true, customer: null }, { headers: noStore });
  }

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json(
      { error: "Invalid wallet", configured: true },
      { status: 400, headers: noStore },
    );
  }

  await initDb();
  const row = await getBridgeCustomerByWallet(wallet);
  if (!row) {
    return NextResponse.json({ ok: true, configured: true, customer: null }, { headers: noStore });
  }

  // Refresh KYC + ToS status from Bridge when we have a link id
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
        return NextResponse.json(
          {
            ok: true,
            configured: true,
            customer: fresh,
            ready: fresh ? customerReady(fresh) : false,
          },
          { headers: noStore },
        );
      }
    } catch {
      /* use cached */
    }
  }

  return NextResponse.json(
    {
      ok: true,
      configured: true,
      customer: row,
      ready: customerReady(row),
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, email, fullName? }
 * Starts Bridge hosted KYC + ToS. Returns both URLs. Emails the user the links.
 * Customer must open tos_link (Bridge terms) AND kyc_link (Persona) themselves.
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

  // Fully ready (KYC + ToS approved)
  const existing = await getBridgeCustomerByWallet(wallet);
  if (existing?.customerId && customerReady(existing)) {
    return NextResponse.json({
      ok: true,
      alreadyApproved: true,
      ready: true,
      customer: existing,
    });
  }

  // Reuse open onboarding links instead of spinning a new KYC link every click
  if (
    existing?.kycLinkId &&
    (existing.tosUrl || existing.kycUrl) &&
    existing.email === email &&
    !customerReady(existing)
  ) {
    // Refresh remote status first
    try {
      const remote = await getKycLink(existing.kycLinkId);
      if (remote.ok && remote.data) {
        const d = remote.data as Record<string, unknown>;
        await upsertBridgeCustomer({
          wallet,
          email,
          customerId: (d.customer_id as string) || existing.customerId,
          kycLinkId: existing.kycLinkId,
          kycStatus: (d.kyc_status as string) || existing.kycStatus,
          tosStatus: (d.tos_status as string) || existing.tosStatus,
          kycUrl: (d.kyc_link as string) || existing.kycUrl,
          tosUrl: (d.tos_link as string) || existing.tosUrl,
        });
      }
    } catch {
      /* keep cached urls */
    }
    const fresh = await getBridgeCustomerByWallet(wallet);
    if (fresh && customerReady(fresh)) {
      return NextResponse.json({
        ok: true,
        alreadyApproved: true,
        ready: true,
        customer: fresh,
      });
    }
    const mail = await emailOnboardingLinks({
      email,
      tosUrl: fresh?.tosUrl || existing.tosUrl,
      kycUrl: fresh?.kycUrl || existing.kycUrl,
    });
    return NextResponse.json({
      ok: true,
      resumed: true,
      ready: false,
      customer: fresh || existing,
      kycUrl: fresh?.kycUrl || existing.kycUrl,
      tosUrl: fresh?.tosUrl || existing.tosUrl,
      emailSent: mail.sent,
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
      { status: res.status >= 400 ? res.status : 502 },
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
  }, { req }).catch(() => {});

  const mail = await emailOnboardingLinks({
    email,
    tosUrl: (d.tos_link as string) || null,
    kycUrl: (d.kyc_link as string) || null,
  });

  const customer = await getBridgeCustomerByWallet(wallet);
  return NextResponse.json({
    ok: true,
    ready: customer ? customerReady(customer) : false,
    customer,
    kycUrl: d.kyc_link,
    tosUrl: d.tos_link,
    emailSent: mail.sent,
    nextSteps: [
      "Open Accept Bridge terms and complete that page first",
      "Then open Verify identity and finish Persona KYC",
      "Return here and refresh status",
    ],
  });
}
