import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import {
  initDb,
  upsertCreatorProfile,
  getCreatorProfile,
  getCreatorByUsername,
  getFollowerCount,
  getWalletTokens,
  setWalletUsername,
  isUsernameTaken,
} from "@/lib/db";
import { isValidUsername, normalizeUsername, usernameError } from "@/lib/username";

const MAX_AGE_MS = 5 * 60 * 1000;

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");
  const username = req.nextUrl.searchParams.get("username");
  const check = req.nextUrl.searchParams.get("check");

  await initDb().catch(() => {});

  // Availability check: ?check=name
  if (check != null) {
    const u = normalizeUsername(check);
    const err = usernameError(u);
    if (err) return NextResponse.json({ available: false, username: u, error: err });
    const except = req.nextUrl.searchParams.get("wallet") || undefined;
    const taken = await isUsernameTaken(u, except || undefined);
    return NextResponse.json({ available: !taken, username: u });
  }

  if (username) {
    const u = normalizeUsername(username);
    const profile = await getCreatorByUsername(u);
    if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const w = String(profile.wallet);
    const [followers, tokens] = await Promise.all([getFollowerCount(w), getWalletTokens(w)]);
    return NextResponse.json({ profile, followers, tokens: tokens.rows });
  }

  if (!wallet) return NextResponse.json({ error: "Missing wallet or username" }, { status: 400 });
  const [profile, followers, tokens] = await Promise.all([
    getCreatorProfile(wallet),
    getFollowerCount(wallet),
    getWalletTokens(wallet),
  ]);
  return NextResponse.json({ profile, followers, tokens: tokens.rows });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      wallet?: string;
      bio?: string;
      avatarUrl?: string;
      twitter?: string;
      website?: string;
      username?: string | null;
      signature?: string;
      nonce?: number;
    };
    const { wallet: signer, bio, avatarUrl, twitter, website, signature, nonce } = body;

    if (!signer || !signature || typeof nonce !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (Math.abs(Date.now() - nonce) > MAX_AGE_MS) {
      return NextResponse.json({ error: "Signature expired" }, { status: 400 });
    }

    // Username claims use a dedicated message so clients can sign only username changes
    const hasUsernameField = Object.prototype.hasOwnProperty.call(body, "username");
    const message = hasUsernameField
      ? `sol.new:username:${signer}:${normalizeUsername(String(body.username ?? ""))}:${nonce}`
      : `sol.new:profile:${signer}:${nonce}`;

    const ok = ed25519.verify(
      bs58.decode(signature),
      new TextEncoder().encode(message),
      bs58.decode(signer)
    );
    if (!ok) return NextResponse.json({ error: "Bad signature" }, { status: 401 });

    await initDb().catch(() => {});

    if (hasUsernameField) {
      const raw = body.username;
      if (raw === null || raw === "") {
        const cleared = await setWalletUsername(signer, null);
        if (!cleared.ok) return NextResponse.json({ error: cleared.error }, { status: 400 });
      } else {
        const u = normalizeUsername(String(raw));
        const err = usernameError(u);
        if (err) return NextResponse.json({ error: err }, { status: 400 });
        if (!isValidUsername(u)) return NextResponse.json({ error: "Invalid username" }, { status: 400 });
        const taken = await isUsernameTaken(u, signer);
        if (taken) return NextResponse.json({ error: "That username is taken" }, { status: 409 });
        const set = await setWalletUsername(signer, u);
        if (!set.ok) return NextResponse.json({ error: set.error }, { status: 409 });
      }
      const profile = await getCreatorProfile(signer);
      return NextResponse.json({ ok: true, profile });
    }

    await upsertCreatorProfile({
      wallet: signer,
      bio: bio ?? null,
      avatarUrl: avatarUrl ?? null,
      twitter: twitter ?? null,
      website: website ?? null,
    });

    const profile = await getCreatorProfile(signer);
    return NextResponse.json({ ok: true, profile });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
