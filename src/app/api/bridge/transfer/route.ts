import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  initDb,
  getBridgeCustomerByWallet,
  saveBridgeTransfer,
  getBridgeTransfer,
  getWalletBridgeTransfers,
} from "@/lib/db";
import { bridgeConfigured, createUsdcOnrampTransfer, getTransfer } from "@/lib/bridge";
import { notifyEvent } from "@/lib/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
 * Requires approved Bridge customer (KYC).
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
      { error: "Complete Bridge KYC first", needKyc: true },
      { status: 400 }
    );
  }
  if (customer.kycStatus !== "approved") {
    return NextResponse.json(
      {
        error: `KYC not approved yet (status: ${customer.kycStatus || "unknown"})`,
        needKyc: true,
        kycStatus: customer.kycStatus,
        kycUrl: customer.kycUrl,
        tosUrl: customer.tosUrl,
      },
      { status: 400 }
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
      { status: res.status >= 400 ? res.status : 502 }
    );
  }

  const d = res.data as Record<string, unknown>;
  const transferId = String(d.id || "");
  const deposit = d.source_deposit_instructions;

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

  notifyEvent({
    kind: "bridge_transfer_created",
    title: "Bridge USDC onramp created",
    fields: {
      wallet,
      transferId,
      amount: amountUsd || "flexible",
      state: String(d.state || ""),
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    transfer: d,
    depositInstructions: deposit || null,
  });
}
