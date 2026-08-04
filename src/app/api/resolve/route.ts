import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

function rpcUrl() {
  return mainnetRpcUrl();
}

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
  // Bonfida SNS expects bare name without .sol
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

/**
 * GET /api/resolve?name=
 * - base58 pubkey passthrough
 * - name.sol → Bonfida SNS
 * - name.sns / name.bonk / name.skr / any AllDomains TLD → ANS
 */
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
    return NextResponse.json(
      { ok: false, error: "Use name.sol, name.sns, name.bonk, name.skr, …" },
      { status: 400 }
    );
  }
  const tld = parts[parts.length - 1];
  if (!/^[a-z0-9]+$/i.test(tld) || tld.length > 32) {
    return NextResponse.json({ ok: false, error: "Invalid domain" }, { status: 400 });
  }

  try {
    const connection = new Connection(rpcUrl(), "confirmed");
    let owner: string | null = null;
    let kind: "sol" | "sns" | "ans" = "ans";

    if (tld === "sol") {
      // Bonfida Solana Name Service (.sol)
      owner = await resolveSol(connection, lower);
      kind = "sol";
      // Fallback: some .sol names also live on AllDomains
      if (!owner) {
        owner = await resolveAns(connection, lower);
        if (owner) kind = "ans";
      }
    } else if (tld === "sns") {
      // Explicit .sns — AllDomains TLD (and alias brand for SNS-style names)
      owner = await resolveAns(connection, lower);
      kind = owner ? "sns" : "sns";
    } else {
      // Any other TLD: try AllDomains / ANS (.bonk, .skr, .abc, …)
      owner = await resolveAns(connection, lower);
      kind = "ans";
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
