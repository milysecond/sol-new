// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";

function heliusRpc() {
  return mainnetRpcUrl();
}

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name")?.toLowerCase().trim();
  if (!name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  if (!/^[a-z0-9-]{1,63}$/.test(name)) {
    return NextResponse.json({ available: false, error: "Invalid domain name — use letters, numbers, hyphens only" });
  }

  try {
    const { getDomainKeySync, getDomainPriceFromName } = await import("@bonfida/spl-name-service");
    const connection = new Connection(heliusRpc(), "confirmed");

    const { pubkey } = getDomainKeySync(name);
    const account = await connection.getAccountInfo(pubkey);
    const available = account === null;
    const priceUsd = getDomainPriceFromName(name);

    return NextResponse.json({ ok: true, available, name, priceUsd, domainKey: pubkey.toBase58() });
  } catch (e) {
    console.error("id/check error", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
