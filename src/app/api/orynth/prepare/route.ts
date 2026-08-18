import { NextRequest, NextResponse } from "next/server";
import {
  orynthCanSign,
  orynthConfigured,
  orynthPrepare,
  orynthSignAsPoolCreator,
  type OrynthPrepareBody,
} from "@/lib/orynth";
import { notifyEvent } from "@/lib/notify";

export const dynamic = "force-dynamic";

/**
 * POST /api/orynth/prepare
 * Builds Orynth launch tx and partially signs as poolCreator (if secret configured).
 * Client still signs as payer.
 */
export async function POST(req: NextRequest) {
  if (!orynthConfigured()) {
    return NextResponse.json({ error: "Orynth not configured" }, { status: 503 });
  }
  if (!orynthCanSign()) {
    return NextResponse.json(
      {
        error:
          "Pool creator signing key not configured. Set ORYNTH_POOL_CREATOR_SECRET_KEY on the server.",
      },
      { status: 503 },
    );
  }

  try {
    const body = (await req.json()) as {
      payerWalletAddress?: string;
      name?: string;
      symbol?: string;
      description?: string;
      imageUrl?: string;
      websiteUrl?: string;
      twitter?: string;
      telegram?: string;
      externalId?: string;
      creatorUsername?: string;
      creatorDisplayName?: string;
    };

    const payer = body.payerWalletAddress?.trim();
    const name = body.name?.trim();
    const symbol = body.symbol?.trim().toUpperCase();
    const description = body.description?.trim() || `${name} on sol.new`;
    const imageUrl = body.imageUrl?.trim();

    if (!payer || !name || !symbol || !imageUrl) {
      return NextResponse.json(
        { error: "payerWalletAddress, name, symbol, imageUrl required" },
        { status: 400 },
      );
    }
    if (symbol.length > 12) {
      return NextResponse.json({ error: "Symbol too long (max 12)" }, { status: 400 });
    }

    const externalId =
      body.externalId?.trim() ||
      `solnew-${payer.slice(0, 8)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const prepareBody: OrynthPrepareBody = {
      externalId,
      payerWalletAddress: payer,
      source: {
        platform: "sol.new",
        url: "https://sol.new/token",
        id: externalId,
        type: "launch",
        title: `${name} ($${symbol})`,
      },
      creator: {
        platform: "sol.new",
        platformUserId: payer,
        username: body.creatorUsername?.trim() || payer.slice(0, 8),
        displayName: body.creatorDisplayName?.trim() || body.creatorUsername?.trim(),
        profileUrl: `https://sol.new/address/${payer}`,
      },
      name,
      symbol,
      description,
      imageUrl,
      websiteUrl: body.websiteUrl?.trim() || "https://sol.new",
      twitter: body.twitter?.trim(),
      telegram: body.telegram?.trim(),
    };

    const prepared = await orynthPrepare(prepareBody);
    const launch = prepared.launch || prepared;
    const launchId =
      (launch as { id?: string }).id || prepared.id;
    const preparedTxHex =
      (launch as { preparedTxHex?: string }).preparedTxHex ||
      prepared.preparedTxHex;

    if (!launchId || !preparedTxHex) {
      return NextResponse.json(
        { error: "Orynth prepare returned no transaction", raw: prepared },
        { status: 502 },
      );
    }

    const { signedTxHex, poolCreator } =
      await orynthSignAsPoolCreator(preparedTxHex);

    notifyEvent(
      {
        kind: "orynth_launch_prepared",
        emoji: "🚀",
        title: "Orynth launch prepared",
        fields: {
          name,
          symbol,
          launchId,
          payer,
          mint: (launch as { mintAddress?: string }).mintAddress || "",
        },
      },
      { req },
    );

    return NextResponse.json({
      ok: true,
      launchId,
      externalId,
      // hex with poolCreator signature; client adds payer
      preparedTxHex: signedTxHex,
      mintAddress: (launch as { mintAddress?: string }).mintAddress || null,
      poolAddress: (launch as { poolAddress?: string }).poolAddress || null,
      feeConfig: (launch as { feeConfig?: unknown }).feeConfig || null,
      poolCreator,
      requiredSigners: ["payer", "poolCreator"],
    });
  } catch (e) {
    console.error("orynth/prepare", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
