import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, upsertCreatorProfile, getCreatorProfile, getFollowerCount, getWalletTokens } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  if (!wallet) return NextResponse.json({ error: "Missing wallet" }, { status: 400 });
  await initDb().catch(() => {});
  const [profile, followers, tokens] = await Promise.all([
    getCreatorProfile(wallet),
    getFollowerCount(wallet),
    getWalletTokens(wallet),
  ]);
  return NextResponse.json({ profile, followers, tokens: tokens.rows });
}

export async function POST(req: NextRequest) {
  try {
    const { wallet: signer, bio, avatarUrl, twitter, website, signature, nonce } = await req.json() as {
      wallet?: string; bio?: string; avatarUrl?: string; twitter?: string; website?: string; signature?: string; nonce?: number;
    };

    if (!signer || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const message = `sol.new:profile:${signer}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(signer));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    await initDb().catch(() => {});
    await upsertCreatorProfile({ wallet: signer, bio: bio ?? null, avatarUrl: avatarUrl ?? null, twitter: twitter ?? null, website: website ?? null });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
