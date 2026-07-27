import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, saveVote } from "@/lib/db";

const MAX_AGE_MS = 5 * 60 * 1000;

function randomId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export async function POST(req: NextRequest) {
  try {
    const { proposalId, wallet, choice, signature, nonce } = await req.json() as {
      proposalId?: string; wallet?: string; choice?: string; signature?: string; nonce?: number;
    };

    if (!proposalId || !wallet || !choice || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (choice !== "yes" && choice !== "no") {
      return NextResponse.json({ error: "choice must be yes or no" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    const message = `sol.new:vote:${proposalId}:${choice}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(wallet));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    await initDb().catch(() => {});
    const id = randomId();
    await saveVote({ id, proposalId, wallet, choice });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
