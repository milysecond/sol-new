import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import { initDb, getTokenByMint, getMetadata, updateMetadata } from "@/lib/db";
import { notifyEvent } from "@/lib/notify";

// Fields the user is allowed to edit. Name and symbol are locked on-chain
// for tokens minted via DBC (immutable update authority), so we refuse them.
const EDITABLE_KEYS = new Set([
  "description",
  "image",
  "website",
  "twitter",
  "telegram",
  "instagram",
  "github",
  "youtube",
  "tiktok",
]);

const MAX_AGE_MS = 5 * 60 * 1000;

// Reads the current metadata JSON for this token straight from Turso so the
// edit page doesn't need to hit the public /metadata/{id}.json URL (which can
// fail if the stored URI is unreachable from the browser, e.g. mismatched
// host between dev and prod).
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await ctx.params;
    await initDb();
    const tokenRow = await getTokenByMint(mint);
    if (!tokenRow) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    const token = tokenRow as unknown as { wallet: string; metadata_uri: string | null };
    if (!token.metadata_uri) {
      return NextResponse.json({ wallet: token.wallet, metadata: null });
    }
    const idMatch = token.metadata_uri.match(/\/metadata\/([a-f0-9]{16})\.json$/);
    if (!idMatch) {
      return NextResponse.json({ wallet: token.wallet, metadata: null, hostedExternally: true });
    }
    const raw = await getMetadata(idMatch[1]);
    return NextResponse.json({
      wallet: token.wallet,
      metadata: raw ? JSON.parse(raw) : null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ mint: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  try {
    const { mint } = await ctx.params;
    const body = await req.json();
    const { signer, signature, nonce, updates } = body as {
      signer?: string;
      signature?: string;
      nonce?: number;
      updates?: Record<string, unknown>;
    };

    if (typeof signer !== "string" || typeof signature !== "string" || typeof nonce !== "number" || !updates || typeof updates !== "object") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired — try again" }, { status: 400 });
    }

    await initDb();
    const tokenRow = await getTokenByMint(mint);
    if (!tokenRow) return NextResponse.json({ error: "Token not found" }, { status: 404 });
    const token = tokenRow as unknown as { wallet: string; metadata_uri: string | null };

    if (token.wallet !== signer) {
      return NextResponse.json({ error: "Only the creator wallet can edit this token" }, { status: 403 });
    }

    const message = `sol.new:update-metadata:${mint}:${nonce}`;
    const ok = ed25519.verify(bs58.decode(signature), new TextEncoder().encode(message), bs58.decode(signer));
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    if (!token.metadata_uri) {
      return NextResponse.json({ error: "This token doesn't have editable metadata" }, { status: 400 });
    }
    const idMatch = token.metadata_uri.match(/\/metadata\/([a-f0-9]{16})\.json$/);
    if (!idMatch) {
      return NextResponse.json({ error: "Metadata isn't hosted on sol.new — can't edit" }, { status: 400 });
    }
    const metadataId = idMatch[1];

    const currentRaw = await getMetadata(metadataId);
    if (!currentRaw) {
      return NextResponse.json({ error: "Metadata row missing" }, { status: 404 });
    }
    const current = JSON.parse(currentRaw) as Record<string, unknown>;

    // Apply edits — only allowed keys, only string values, with sane bounds.
    const next = { ...current };
    for (const [k, v] of Object.entries(updates)) {
      if (!EDITABLE_KEYS.has(k)) continue;
      if (v === null || v === "") {
        delete (next as Record<string, unknown>)[k];
        continue;
      }
      if (typeof v !== "string" || v.length > 500) continue;
      (next as Record<string, unknown>)[k] = v;
    }

    const nextJson = JSON.stringify(next);
    if (nextJson.length > 16 * 1024) {
      return NextResponse.json({ error: "Metadata too large (max 16KB)" }, { status: 413 });
    }
    await updateMetadata(metadataId, nextJson);

    notifyEvent({
      kind: "metadata_update",
      emoji: "✏️",
      title: "Token metadata updated",
      fields: { mint, signer, ip },
    }, { req });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
