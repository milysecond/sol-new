import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import {
  createTransakWidgetUrl,
  transakConfigured,
  transakEnv,
  type TransakAsset,
} from "@/lib/transak";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function clientIp(req: NextRequest): string | undefined {
  const cf = req.headers.get("cf-connecting-ip")?.trim();
  if (cf) return cf;
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;
}

/** GET — is Transak configured? */
export async function GET() {
  return NextResponse.json(
    {
      ok: transakConfigured(),
      configured: transakConfigured(),
      env: transakEnv(),
    },
    { headers: noStore },
  );
}

/**
 * POST { wallet, asset?: "SOL"|"USDC", fiatAmount?, fiatCurrency?, countryCode? }
 * Returns a Transak widget URL locked to the Solana wallet.
 */
export async function POST(req: NextRequest) {
  if (!transakConfigured()) {
    return NextResponse.json({ error: "Transak not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    wallet?: string;
    asset?: string;
    fiatAmount?: number | string;
    fiatCurrency?: string;
    countryCode?: string;
  };

  const wallet = body.wallet?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid Solana wallet" }, { status: 400 });
  }

  const asset: TransakAsset =
    body.asset?.toUpperCase() === "USDC" ? "USDC" : "SOL";

  let fiatAmount: number | undefined;
  if (body.fiatAmount != null && body.fiatAmount !== "") {
    const n = Number(body.fiatAmount);
    if (!Number.isFinite(n) || n < 5 || n > 50_000) {
      return NextResponse.json({ error: "Amount must be between 5 and 50000" }, { status: 400 });
    }
    fiatAmount = n;
  }

  const origin =
    req.headers.get("origin") ||
    (req.headers.get("x-forwarded-host")
      ? `https://${req.headers.get("x-forwarded-host")}`
      : "https://sol.new");

  try {
    const { widgetUrl, mode } = await createTransakWidgetUrl({
      wallet,
      asset,
      fiatAmount,
      fiatCurrency: body.fiatCurrency?.trim().toUpperCase() || "AUD",
      countryCode:
        body.countryCode?.trim().toUpperCase() ||
        ((body.fiatCurrency?.trim().toUpperCase() || "AUD") === "AUD" ? "AU" : undefined),
      redirectURL: `${origin}/get?transak=done`,
      userIp: clientIp(req),
    });

    return NextResponse.json({
      ok: true,
      widgetUrl,
      mode,
      env: transakEnv(),
      asset,
      wallet,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create Transak widget";
    console.error("[transak/widget]", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
