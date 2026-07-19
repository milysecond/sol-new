import { NextRequest, NextResponse } from "next/server";
import { initDb, saveWallet, upsertWalletEmail } from "@/lib/db";
import {
  isValidWalletPubkey,
  magicLinkConfigured,
  verifyMagicLink,
} from "@/lib/magic-link";
import { parseEmail } from "@/lib/resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST — mark email↔wallet verified after client proves passkey ownership.
 * Body: { token, wallet, credentialId? }
 * wallet must match the token and the passkey-derived address on the client.
 */
export async function POST(request: NextRequest) {
  if (!magicLinkConfigured()) {
    return NextResponse.json(
      { error: "Magic links not configured" },
      { status: 503 }
    );
  }

  let body: {
    token?: string;
    wallet?: string;
    credentialId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.token || typeof body.token !== "string") {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }
  if (!body.wallet || !isValidWalletPubkey(body.wallet)) {
    return NextResponse.json({ error: "wallet required" }, { status: 400 });
  }

  const claims = await verifyMagicLink(body.token);
  if (!claims) {
    return NextResponse.json(
      { error: "Invalid or expired link" },
      { status: 400 }
    );
  }
  if (claims.wallet !== body.wallet) {
    return NextResponse.json(
      { error: "Passkey wallet does not match this link." },
      { status: 403 }
    );
  }

  const email = parseEmail(claims.email);
  if (!email) {
    return NextResponse.json({ error: "Invalid email in token" }, { status: 400 });
  }

  const credentialId =
    (typeof body.credentialId === "string" && body.credentialId) ||
    claims.credentialId ||
    undefined;

  await initDb();
  await saveWallet(body.wallet, credentialId);
  await upsertWalletEmail({
    email,
    wallet: body.wallet,
    credentialId,
    verified: true,
  });

  return NextResponse.json({
    ok: true,
    email,
    wallet: body.wallet,
    verified: true,
  });
}
