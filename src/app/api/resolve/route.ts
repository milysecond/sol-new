import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

/** Product-supported name TLDs */
const SUPPORTED = new Set(["sol", "bonk", "sns", "skr"]);

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

/** Bonfida Solana Name Service (.sol) */
async function resolveBonfidaSol(connection: Connection, bareOrFull: string): Promise<string | null> {
  const bare = bareOrFull.replace(/\.sol$/i, "").replace(/\.sns$/i, "");
  if (!bare) return null;
  const { resolve } = await import("@bonfida/spl-name-service");
  try {
    const pk = await resolve(connection, bare);
    return pk.toBase58();
  } catch {
    return null;
  }
}

/** AllDomains / ANS (.bonk, .skr, .sns if registered, …) */
async function resolveAns(connection: Connection, fullDomain: string): Promise<string | null> {
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
 * Supported: .sol (Bonfida), .bonk/.skr (AllDomains), .sns (ANS if live, else Bonfida alias of .sol)
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
      { ok: false, error: "Use name.sol, name.bonk, name.sns, or name.skr" },
      { status: 400 }
    );
  }
  const tld = parts[parts.length - 1];
  if (!SUPPORTED.has(tld)) {
    return NextResponse.json(
      { ok: false, error: "Supported names: .sol, .bonk, .sns, .skr" },
      { status: 400 }
    );
  }

  try {
    const connection = new Connection(rpcUrl(), "confirmed");
    let owner: string | null = null;
    let kind: "sol" | "sns" | "ans" = "ans";
    let resolvedAs: string | undefined;

    if (tld === "sol") {
      owner = await resolveBonfidaSol(connection, lower);
      kind = "sol";
      if (!owner) {
        owner = await resolveAns(connection, lower);
        if (owner) kind = "ans";
      }
    } else if (tld === "sns") {
      // Prefer native AllDomains .sns if/when registered
      owner = await resolveAns(connection, lower);
      if (owner) {
        kind = "sns";
      } else {
        // SNS brand alias → Bonfida .sol (name.sns ≡ name.sol)
        owner = await resolveBonfidaSol(connection, lower);
        if (owner) {
          kind = "sns";
          resolvedAs = `${parts.slice(0, -1).join(".")}.sol`;
        }
      }
    } else {
      // .bonk / .skr
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
      ...(resolvedAs ? { resolvedAs } : {}),
      input: raw,
    });
  } catch (e) {
    console.error("resolve error", e);
    return NextResponse.json({ ok: false, error: "Resolution failed" }, { status: 500 });
  }
}
