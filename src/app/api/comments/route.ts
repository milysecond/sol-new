import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, saveComment } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const { mint, wallet: signer, body, signature, nonce } = await req.json() as {
      mint?: string; wallet?: string; body?: string; signature?: string; nonce?: number;
    };

    if (!mint || !signer || !body || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (body.length > 500) {
      return NextResponse.json({ error: "Comment too long (max 500 chars)" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const message = `sol.new:comment:${mint}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(signer));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    await initDb().catch(() => {});
    const id = randomId();
    await saveComment({ id, mint, wallet: signer, body });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
