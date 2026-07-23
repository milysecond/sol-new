import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

export const runtime = "nodejs";

function rpcUrl() {
  const k = process.env.HELIUS_API_KEY;
  if (k) return `https://mainnet.helius-rpc.com/?api-key=${k}`;
  return process.env.NEXT_PUBLIC_RPC_URL || "https://api.mainnet-beta.solana.com";
}

const SUPPORTED = new Set(["sol", "bonk", "skr"]);

/** ANS NameRecordHeader: disc(8) + parent(32) + owner(32) + class(32) + ... */
function parseAnsOwner(data: Buffer): PublicKey | null {
  if (data.length < 72) return null;
  try {
    const owner = new PublicKey(data.subarray(40, 72));
    if (owner.equals(PublicKey.default)) return null;
    return owner;
  } catch {
    return null;
  }
}

async function resolveSol(connection: Connection, name: string): Promise<string | null> {
  // Bonfida expects bare name without .sol
  const bare = name.replace(/\.sol$/i, "");
  const { resolve } = await import("@bonfida/spl-name-service");
  try {
    const pk = await resolve(connection, bare);
    return pk.toBase58();
  } catch {
    return null;
  }
}

async function resolveAns(connection: Connection, fullDomain: string): Promise<string | null> {
  // getDomainKey works; NameRecordHeader borsh deserialize is broken vs borsh@0.7,
  // so we read the owner field manually at offset 40.
  const { getDomainKey } = await import("@onsol/tldparser");
  try {
    const { pubkey } = await getDomainKey(fullDomain.toLowerCase());
    const info = await connection.getAccountInfo(pubkey, "confirmed");
    if (!info?.data) return null;
    const owner = parseAnsOwner(Buffer.from(info.data));
    return owner?.toBase58() ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("name")?.trim() ?? "";
  if (!raw) {
    return NextResponse.json({ ok: false, error: "Missing name" }, { status: 400 });
  }

  // Pass-through pubkey
  try {
    if (!raw.includes(".")) {
      const pk = new PublicKey(raw);
      return NextResponse.json({ ok: true, owner: pk.toBase58(), kind: "pubkey", input: raw });
    }
  } catch {
    /* not a pubkey */
  }

  const lower = raw.toLowerCase();
  const parts = lower.split(".");
  if (parts.length < 2) {
    return NextResponse.json({ ok: false, error: "Use name.sol, name.bonk, or name.skr" }, { status: 400 });
  }
  const tld = parts[parts.length - 1];
  if (!SUPPORTED.has(tld)) {
    return NextResponse.json(
      { ok: false, error: "Supported names: .sol, .bonk, .skr" },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(rpcUrl(), "confirmed");
    let owner: string | null = null;
    let kind: "sol" | "ans" = tld === "sol" ? "sol" : "ans";

    if (tld === "sol") {
      owner = await resolveSol(connection, lower);
    } else {
      owner = await resolveAns(connection, lower);
    }

    if (!owner) {
      return NextResponse.json(
        { ok: false, error: `${lower} is not registered or has no owner` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      owner,
      kind,
      domain: lower,
      tld,
      input: raw,
    });
  } catch (e) {
    console.error("resolve error", e);
    return NextResponse.json({ ok: false, error: "Resolution failed" }, { status: 500 });
  }
}
