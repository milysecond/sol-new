import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, saveProposal } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const { mint, creator, title, description, durationDays = 7, signature, nonce } = await req.json() as {
      mint?: string; creator?: string; title?: string; description?: string; durationDays?: number; signature?: string; nonce?: number;
    };

    if (!mint || !creator || !title || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (title.length > 200) return NextResponse.json({ error: "Title too long" }, { status: 400 });
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const message = `sol.new:proposal:${mint}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(creator));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    const days = Math.max(1, Math.min(30, durationDays));
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString().replace("T", " ").slice(0, 19);

    await initDb().catch(() => {});
    const id = randomId();
    await saveProposal({ id, mint, creator, title, description: description ?? null, expiresAt });

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
