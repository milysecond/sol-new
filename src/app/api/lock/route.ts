import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { rpcUrlFor } from "@/lib/rpc-server";
import {
  ESCROW_DISC_B58,
  JUP_LOCK_PROGRAM,
  parseVestingEscrow,
} from "@/lib/jup-lock";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "";
  const network = req.nextUrl.searchParams.get("network") === "devnet" ? "devnet" : "mainnet";
  let owner: PublicKey;
  try {
    owner = new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400 });
  }

  const connection = new Connection(rpcUrlFor(network), "confirmed");
  const disc = { memcmp: { offset: 0, bytes: ESCROW_DISC_B58 } };

  try {
    const [asRecipient, asCreator] = await Promise.all([
      connection.getProgramAccounts(JUP_LOCK_PROGRAM, {
        filters: [disc, { memcmp: { offset: 8, bytes: owner.toBase58() } }],
      }),
      connection.getProgramAccounts(JUP_LOCK_PROGRAM, {
        filters: [disc, { memcmp: { offset: 72, bytes: owner.toBase58() } }],
      }),
    ]);

    const seen = new Set<string>();
    const locks = [];
    for (const acc of [...asRecipient, ...asCreator]) {
      const key = acc.pubkey.toBase58();
      if (seen.has(key)) continue;
      seen.add(key);
      const parsed = parseVestingEscrow(acc.pubkey, Buffer.from(acc.account.data));
      if (parsed) locks.push(parsed);
    }
    locks.sort((a, b) => b.cliffTime - a.cliffTime);
    return NextResponse.json({ ok: true, locks, network });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
