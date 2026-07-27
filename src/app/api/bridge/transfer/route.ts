import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  initDb,
  getBridgeCustomerByWallet,
  saveBridgeTransfer,
  getBridgeTransfer,
  getWalletBridgeTransfers,
} from "@/lib/db";
import {
  bridgeConfigured,
  createUsdcOnrampTransfer,
  getTransfer,
  isBridgeCustomerReady,
} from "@/lib/bridge";
import { notifyEvent } from "@/lib/notify";
import { resendConfigured, sendEmail, SITE_URL } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DepositInstructions = {
  bank_name?: string;
  bank_routing_number?: string;
  bank_account_number?: string;
  bank_beneficiary_name?: string;
  deposit_message?: string;
  amount?: string;
  currency?: string;
  payment_rail?: string;
};

async function emailDepositInstructions(opts: {
  email: string;
  wallet: string;
  transferId: string;
  deposit: DepositInstructions | null;
  amount?: string | null;
}) {
  if (!resendConfigured() || !opts.deposit) {
    return { sent: false as const };
  }
  const d = opts.deposit;
  const rows = [
    d.bank_name ? ["Bank", d.bank_name] : null,
    d.bank_routing_number ? ["Routing", d.bank_routing_number] : null,
    d.bank_account_number ? ["Account", d.bank_account_number] : null,
    d.bank_beneficiary_name ? ["Beneficiary", d.bank_beneficiary_name] : null,
    d.deposit_message ? ["Memo (required)", d.deposit_message] : null,
    opts.amount ? ["Amount", `$${opts.amount} USD`] : ["Amount", "Flexible (send any amount)"],
    d.payment_rail ? ["Rail", d.payment_rail] : null,
  ].filter(Boolean) as [string, string][];

  const htmlRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${k}</td><td style="padding:6px 0;font-family:ui-monospace,monospace;word-break:break-all">${v}</td></tr>`,
    )
    .join("");

  try {
    await sendEmail({
      to: opts.email,
      subject: "Your USDC deposit instructions (sol.new)",
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.5;color:#111">
          <p>Send a USD bank deposit with the details below. Bridge will mint USDC to your Solana wallet:</p>
          <p style="font-family:ui-monospace,monospace;font-size:12px;word-break:break-all;background:#f5f5f5;padding:10px;border-radius:8px">${opts.wallet}</p>
          <table style="border-collapse:collapse;margin:16px 0">${htmlRows}</table>
          <p style="color:#b45309"><strong>The memo must match exactly</strong> or funds may not credit.</p>
          <p>Track status at <a href="${SITE_URL}/get">${SITE_URL}/get</a>. Transfer id: <code>${opts.transferId}</code></p>
        </div>
      `,
      text: [
        "Your USDC deposit instructions (sol.new)",
        `Wallet: ${opts.wallet}`,
        ...rows.map(([k, v]) => `${k}: ${v}`),
        "Memo must match exactly.",
        `Transfer: ${opts.transferId}`,
        SITE_URL + "/get",
      ].join("\n"),
      tags: [{ name: "kind", value: "bridge_deposit_instructions" }],
    });
    return { sent: true as const };
  } catch (e) {
    console.error("[bridge/transfer] deposit email failed", e);
    return { sent: false as const };
  }
}

/** GET ?id=transfer_… or ?wallet= */
export async function GET(req: NextRequest) {
  if (!bridgeConfigured()) {
    return NextResponse.json({ ok: false, configured: false });
  }
  await initDb();
  const id = req.nextUrl.searchParams.get("id")?.trim();
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim();

  if (id) {
    const remote = await getTransfer(id);
    if (remote.ok && remote.data) {
      const d = remote.data as Record<string, unknown>;
      const state = String(d.state || "");
      const onBehalf = String(d.on_behalf_of || "");
      const local = await getBridgeTransfer(id);
      if (local) {
        await saveBridgeTransfer({
          transferId: id,
          wallet: String((local as { wallet?: string }).wallet || ""),
          customerId: onBehalf,
          amount: d.amount != null ? String(d.amount) : null,
          state,
          depositJson: d.source_deposit_instructions
            ? JSON.stringify(d.source_deposit_instructions)
            : null,
        });
      }
      return NextResponse.json({ ok: true, transfer: remote.data });
    }
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  if (wallet) {
    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
    }
    const rows = await getWalletBridgeTransfers(wallet, 20);
    return NextResponse.json({ ok: true, transfers: rows });
  }

  return NextResponse.json({ error: "Pass id= or wallet=" }, { status: 400 });
}

/**
 * POST { wallet, amount? }
 * Creates Bridge transfer: USD ACH/wire deposit → USDC on Solana to wallet.
 * Requires approved Bridge customer (KYC + ToS). Emails deposit instructions.
 */
export async function POST(req: NextRequest) {
  if (!bridgeConfigured()) {
    return NextResponse.json({ error: "Bridge not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    amount?: number | string;
    flexible?: boolean;
  };

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  await initDb();
  const customer = await getBridgeCustomerByWallet(wallet);
  if (!customer?.customerId) {
    return NextResponse.json(
      { error: "Complete Bridge verification first (terms + KYC)", needKyc: true },
      { status: 400 },
    );
  }

  const tosOk = customer.tosStatus === "approved";
  const kycOk = customer.kycStatus === "approved";
  if (!isBridgeCustomerReady(customer.kycStatus, customer.tosStatus)) {
    const missing: string[] = [];
    if (!tosOk) missing.push("Bridge terms of service");
    if (!kycOk) missing.push("identity verification (KYC)");
    return NextResponse.json(
      {
        error: `Still needed: ${missing.join(" and ")}. Open the links on /get and complete them yourself (not the Bridge admin dashboard).`,
        needKyc: true,
        needTos: !tosOk,
        kycStatus: customer.kycStatus,
        tosStatus: customer.tosStatus,
        kycUrl: customer.kycUrl,
        tosUrl: customer.tosUrl,
      },
      { status: 400 },
    );
  }

  const flexible = body.flexible !== false && (body.amount == null || body.amount === "");
  let amountUsd: string | undefined;
  if (!flexible) {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n < 1 || n > 50_000) {
      return NextResponse.json({ error: "Amount must be between 1 and 50000 USD" }, { status: 400 });
    }
    amountUsd = n.toFixed(2);
  }

  const idem = `onramp-${wallet}-${amountUsd || "flex"}-${Date.now()}`.slice(0, 64);
  const res = await createUsdcOnrampTransfer({
    customerId: customer.customerId,
    solanaAddress: wallet,
    amountUsd,
    flexible,
    clientReferenceId: wallet.slice(0, 32),
    idempotencyKey: idem,
  });

  if (!res.ok) {
    console.error("[bridge/transfer]", res.status, res.data);
    return NextResponse.json(
      {
        error: (res.data as { message?: string })?.message || "Could not create transfer",
        details: res.data,
      },
      { status: res.status >= 400 ? res.status : 502 },
    );
  }

  const d = res.data as Record<string, unknown>;
  const transferId = String(d.id || "");
  const deposit = (d.source_deposit_instructions as DepositInstructions | null) || null;

  if (transferId) {
    await saveBridgeTransfer({
      transferId,
      wallet,
      customerId: customer.customerId,
      amount: d.amount != null ? String(d.amount) : amountUsd || null,
      state: String(d.state || "awaiting_funds"),
      depositJson: deposit ? JSON.stringify(deposit) : null,
    });
  }

  const mail = await emailDepositInstructions({
    email: customer.email,
    wallet,
    transferId,
    deposit,
    amount: d.amount != null ? String(d.amount) : amountUsd || null,
  });

  notifyEvent({
    kind: "bridge_transfer_created",
    title: "Bridge USDC onramp created",
    fields: {
      wallet,
      transferId,
      amount: amountUsd || "flexible",
      state: String(d.state || ""),
      emailSent: mail.sent ? "yes" : "no",
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    transfer: d,
    depositInstructions: deposit || null,
    emailSent: mail.sent,
    emailedTo: mail.sent ? customer.email : null,
  });
}
