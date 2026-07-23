import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  luloConfigured,
  luloGenerateDeposit,
  luloGenerateWithdraw,
  luloGetAccount,
  luloGetRates,
  USDC_MINT,
} from "@/lib/lulo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

/** GET ?wallet= — rates + position if Lulo key configured */
export async function GET(req: NextRequest) {
  if (!luloConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        configured: false,
        error: "Earn is not available",
        mint: USDC_MINT,
      },
      { headers: noStore },
    );
  }

  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  let account: unknown = null;
  if (wallet) {
    try {
      new PublicKey(wallet);
      const acc = await luloGetAccount(wallet);
      account = acc.data;
    } catch {
      /* ignore bad wallet / account miss */
    }
  }

  let rates: unknown = null;
  try {
    const r = await luloGetRates();
    if (r.ok) rates = r.data;
  } catch {
    /* optional */
  }

  return NextResponse.json(
    { ok: true, configured: true, mint: USDC_MINT, rates, account },
    { headers: noStore },
  );
}

/**
 * POST { action: "deposit"|"withdraw", wallet, amount }
 * Returns transaction payload from Lulo for client passkey signing.
 */
export async function POST(req: NextRequest) {
  if (!luloConfigured()) {
    return NextResponse.json(
      { error: "Earn is not available", configured: false },
      { status: 503, headers: noStore },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    wallet?: string;
    amount?: string | number;
  };

  const wallet = body.wallet?.trim() || "";
  const amount = body.amount;
  const action = body.action === "withdraw" ? "withdraw" : "deposit";

  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400, headers: noStore });
  }
  if (amount == null || Number(amount) <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400, headers: noStore });
  }

  try {
    const res =
      action === "withdraw"
        ? await luloGenerateWithdraw({ owner: wallet, amount })
        : await luloGenerateDeposit({ owner: wallet, amount });

    if (!res.ok) {
      return NextResponse.json(
        {
          error: (res.data as { message?: string })?.message || `${action} failed`,
          details: res.data,
        },
        { status: res.status >= 400 ? res.status : 502, headers: noStore },
      );
    }

    return NextResponse.json(
      { ok: true, action, ...normalizeTxPayload(res.data) },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/earn/lulo]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Earn request failed" },
      { status: 502, headers: noStore },
    );
  }
}

/** Normalize various Lulo response shapes into serializable txs for the client. */
function normalizeTxPayload(data: unknown): {
  transactions: string[];
  raw: unknown;
} {
  const d = data as Record<string, unknown>;
  const txs: string[] = [];

  const push = (v: unknown) => {
    if (typeof v === "string" && v.length > 20) txs.push(v);
    else if (Array.isArray(v)) v.forEach(push);
    else if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      if (typeof o.transaction === "string") txs.push(o.transaction);
      if (typeof o.serializedTransaction === "string") txs.push(o.serializedTransaction);
      if (typeof o.base64 === "string") txs.push(o.base64);
    }
  };

  push(d.transaction);
  push(d.transactions);
  push(d.serializedTransaction);
  push(d.data);

  return { transactions: txs, raw: data };
}
