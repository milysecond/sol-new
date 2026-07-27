import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, followCreator, unfollowCreator, isFollowing } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const { follower, creator, action, signature, nonce } = await req.json() as {
      follower?: string; creator?: string; action?: "follow" | "unfollow"; signature?: string; nonce?: number;
    };

    if (!follower || !creator || !action || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const message = `sol.new:${action}:${creator}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(follower));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    await initDb().catch(() => {});
    if (action === "follow") {
      await followCreator(follower, creator);
    } else {
      await unfollowCreator(follower, creator);
    }

    const following = await isFollowing(follower, creator);
    return NextResponse.json({ ok: true, following });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
