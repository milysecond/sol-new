import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { mainnetRpcUrl } from "@/lib/rpc-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export type BurnAccount = {
  pubkey: string;
  mint: string;
  amount: string;
  decimals: number;
  uiAmount: number;
  program: "spl" | "token2022";
  empty: boolean;
  rentLamports: number;
  rentSol: number;
};

/** GET ?wallet= — empty + non-empty token accounts for reclaim / burn UI */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.trim() || "";
  try {
    new PublicKey(wallet);
  } catch {
    return NextResponse.json({ error: "Invalid wallet" }, { status: 400, headers: noStore });
  }

  try {
    const conn = new Connection(mainnetRpcUrl(), "confirmed");
    const owner = new PublicKey(wallet);

    const [spl, t22] = await Promise.all([
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_PROGRAM_ID }),
      conn.getParsedTokenAccountsByOwner(owner, { programId: TOKEN_2022_PROGRAM_ID }),
    ]);

    const accounts: BurnAccount[] = [];

    for (const { pubkey, account } of [...spl.value, ...t22.value]) {
      const parsed = account.data.parsed as {
        info?: {
          mint?: string;
          tokenAmount?: { amount?: string; decimals?: number; uiAmount?: number | null };
        };
      };
      const info = parsed?.info;
      if (!info?.mint || !info.tokenAmount) continue;
      const amount = info.tokenAmount.amount || "0";
      const decimals = info.tokenAmount.decimals ?? 0;
      const uiAmount = info.tokenAmount.uiAmount ?? Number(amount) / 10 ** decimals;
      const empty = amount === "0";
      const rentLamports = account.lamports;
      const isT22 = account.owner.equals(TOKEN_2022_PROGRAM_ID);

      accounts.push({
        pubkey: pubkey.toBase58(),
        mint: info.mint,
        amount,
        decimals,
        uiAmount,
        program: isT22 ? "token2022" : "spl",
        empty,
        rentLamports,
        rentSol: rentLamports / LAMPORTS_PER_SOL,
      });
    }

    accounts.sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? -1 : 1;
      return b.rentLamports - a.rentLamports;
    });

    const empty = accounts.filter((a) => a.empty);
    const reclaimableLamports = empty.reduce((s, a) => s + a.rentLamports, 0);

    return NextResponse.json(
      {
        ok: true,
        accounts,
        emptyCount: empty.length,
        totalCount: accounts.length,
        reclaimableSol: reclaimableLamports / LAMPORTS_PER_SOL,
      },
      { headers: noStore },
    );
  } catch (e) {
    console.error("[api/burn/scan]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Scan failed" },
      { status: 502, headers: noStore },
    );
  }
}
