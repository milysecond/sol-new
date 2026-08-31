import { NextRequest, NextResponse } from "next/server";
import {
  jupStudioConfigured,
  studioCreateTx,
  studioMemeCreateBody,
} from "@/lib/jup-studio";

export async function GET() {
  return NextResponse.json({
    configured: jupStudioConfigured(),
    preset: "meme",
    quote: "USDC",
    initialMarketCap: 16000,
    migrationMarketCap: 69000,
  });
}

export async function POST(req: NextRequest) {
  try {
    if (!jupStudioConfigured()) {
      return NextResponse.json({ error: "Jupiter Studio API key not set" }, { status: 503 });
    }
    const body = (await req.json()) as {
      creator?: string;
      tokenName?: string;
      tokenSymbol?: string;
      tokenImageContentType?: string;
    };
    const creator = body.creator?.trim();
    const tokenName = body.tokenName?.trim();
    const tokenSymbol = body.tokenSymbol?.trim();
    const tokenImageContentType = body.tokenImageContentType?.trim() || "image/png";
    if (!creator || !tokenName || !tokenSymbol) {
      return NextResponse.json({ error: "Missing creator, tokenName, or tokenSymbol" }, { status: 400 });
    }
    const data = await studioCreateTx(
      studioMemeCreateBody({ creator, tokenName, tokenSymbol, tokenImageContentType }),
    );
    if (!data.transaction || !data.mint) {
      return NextResponse.json(
        { error: String(data.errorMessage || data.error || "Studio did not return a transaction") },
        { status: 502 },
      );
    }
    return NextResponse.json({
      ok: true,
      transaction: data.transaction,
      mint: data.mint,
      imagePresignedUrl: data.imagePresignedUrl,
      metadataPresignedUrl: data.metadataPresignedUrl,
      imageUrl: data.imageUrl,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
